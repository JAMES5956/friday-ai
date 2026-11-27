import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createMemoryIntegrityDigest, decryptPrivateData, encryptPrivateData, verifyMemoryIntegrityDigest } from "@/lib/security/encryption";
import { validateProjectPayload } from "@/lib/projects/policy";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 70_000;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function getContext() {
  const owner = await getOwnerSession({ requireMfa: true });
  if (!owner.user) return { error: fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401) } as const;
  const supabase = await createClient();
  return { owner: owner.user, supabase } as const;
}

export async function GET() {
  try {
    const context = await getContext();
    if ("error" in context) return context.error;
    const { data, error } = await context.supabase.from("project_records")
      .select("id, payload_ciphertext, integrity_digest, integrity_version, created_at, updated_at")
      .eq("owner_id", context.owner.id).order("updated_at", { ascending: false }).limit(50);
    if (error) return fail("PROJECT_STORE_UNAVAILABLE", "Project storage is unavailable. Apply migration 0008_project_continuity.sql.", 503);
    try {
      const projects = (data ?? []).map(row => {
        const hasIntegrity = row.integrity_digest !== null || row.integrity_version !== null;
        if (hasIntegrity && (row.integrity_version !== 1 || !row.integrity_digest ||
            !verifyMemoryIntegrityDigest(context.owner.id, row.id, row.payload_ciphertext, row.integrity_digest, "project"))) {
          throw new Error("Project integrity mismatch");
        }
        return {
          id: row.id, createdAt: row.created_at, updatedAt: row.updated_at,
          integrityStatus: hasIntegrity ? "verified" : "legacy_unsealed",
          payload: JSON.parse(decryptPrivateData(row.payload_ciphertext))
        };
      });
      return NextResponse.json({ projects }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return fail("PRIVATE_DATA_UNREADABLE", "A project record could not be decrypted. Check the FRIDAY encryption key.", 503);
    }
  } catch {
    return fail("PROJECT_SERVICE_UNAVAILABLE", "Project service is not configured.", 503);
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }
  let input: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return fail("REQUEST_TOO_LARGE", "Project data is too large.", 413);
    input = JSON.parse(raw);
  } catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (!input || typeof input !== "object" || Array.isArray(input) || !validateProjectPayload((input as Record<string, unknown>).payload)) {
    return fail("INVALID_PROJECT", "Provide a valid project, milestones, tasks and progress data.", 400);
  }
  try {
    const context = await getContext();
    if ("error" in context) return context.error;
    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 20 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many project changes. Try again shortly.", 429);
    const recordId = randomUUID();
    const ciphertext = encryptPrivateData(JSON.stringify((input as { payload: unknown }).payload));
    const integrityDigest = createMemoryIntegrityDigest(context.owner.id, recordId, ciphertext, "project");
    const { data, error } = await context.supabase.from("project_records").insert({
      id: recordId, owner_id: context.owner.id, payload_ciphertext: ciphertext,
      integrity_digest: integrityDigest, integrity_version: 1
    }).select("id, created_at, updated_at").single();
    if (error || !data) return fail("PROJECT_CREATE_FAILED", "Could not save the project. Confirm migration 0008 is available.", 503);
    return NextResponse.json({ project: { ...data, payload: (input as { payload: unknown }).payload } }, {
      status: 201, headers: { "Cache-Control": "no-store" }
    });
  } catch {
    return fail("PROJECT_SERVICE_UNAVAILABLE", "Project storage or encryption is not configured.", 503);
  }
}

export async function PATCH(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return fail("REQUEST_TOO_LARGE", "Project data is too large.", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("INVALID_JSON", "Send a JSON object.", 400);
    input = parsed as Record<string, unknown>;
  } catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (typeof input.id !== "string" || !UUID.test(input.id) || !validateProjectPayload(input.payload)) {
    return fail("INVALID_PROJECT", "Provide a valid project ID and complete project payload.", 400);
  }
  try {
    const context = await getContext();
    if ("error" in context) return context.error;
    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 20 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many project changes. Try again shortly.", 429);
    const ciphertext = encryptPrivateData(JSON.stringify(input.payload));
    const integrityDigest = createMemoryIntegrityDigest(context.owner.id, input.id, ciphertext, "project");
    const { data, error } = await context.supabase.from("project_records").update({
      payload_ciphertext: ciphertext, integrity_digest: integrityDigest, integrity_version: 1
    }).eq("id", input.id).eq("owner_id", context.owner.id).select("id, created_at, updated_at").maybeSingle();
    if (error) return fail("PROJECT_UPDATE_FAILED", "Could not update this project.", 503);
    if (!data) return fail("PROJECT_NOT_FOUND", "Project was not found.", 404);
    return NextResponse.json({ project: { ...data, payload: input.payload } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("PROJECT_SERVICE_UNAVAILABLE", "Project storage or encryption is not configured.", 503);
  }
}
