import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";
import { getArchiveExpiry, isRecordStatus, isRecordType, isSensitivity, validateKnowledgePayload } from "@/lib/knowledge/policy";

export const runtime = "nodejs";
const MAX_BODY_BYTES = 40_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
async function ownerAndDb() {
  const owner = await getOwnerSession();
  if (!owner.user) return { error: fail("Owner authentication required.", 401) } as const;
  const supabase = await createClient();
  return { owner: owner.user, supabase } as const;
}

export async function GET(request: Request) {
  let context: Awaited<ReturnType<typeof ownerAndDb>>;
  try { context = await ownerAndDb(); } catch { return fail("Private archive is not configured.", 503); }
  if ("error" in context) return context.error;
  const url = new URL(request.url);
  const type = url.searchParams.get("type");
  const status = url.searchParams.get("status") ?? "active";
  if (type && !isRecordType(type)) return fail("Invalid archive record type.", 400);
  if (!isRecordStatus(status)) return fail("Invalid archive status.", 400);

  let query = context.supabase.from("knowledge_records")
    .select("id, record_type, status, sensitivity, expires_at, created_at, updated_at, payload_ciphertext")
    .eq("owner_id", context.owner.id).eq("status", status)
    .order("updated_at", { ascending: false }).limit(100);
  if (type) query = query.eq("record_type", type);
  const { data, error } = await query;
  if (error) return fail("Could not load the private archive. Apply the knowledge archive migration if it is pending.", 503);
  try {
    const now = Date.now();
    const records = (data ?? []).map(row => ({
      id: row.id, type: row.record_type, status: row.status, sensitivity: row.sensitivity,
      expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at,
      expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() <= now),
      payload: JSON.parse(decryptPrivateData(row.payload_ciphertext))
    }));
    return NextResponse.json({ records }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Archive data could not be decrypted. Check the FRIDAY encryption key.", 503);
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send application/json.", 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return fail("Request is too large.", 413);
  let raw: string;
  try {
    raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) return fail("Request is too large.", 413);
  } catch { return fail("Could not read request body.", 400); }
  let input: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Send a JSON object.", 400);
    input = parsed as Record<string, unknown>;
  } catch { return fail("Send valid JSON.", 400); }

  if (!isRecordType(input.type) || !validateKnowledgePayload(input.payload)) return fail("Provide a valid knowledge or decision record.", 400);
  const sensitivity = input.sensitivity === undefined ? "internal" : input.sensitivity;
  if (!isSensitivity(sensitivity)) return fail("Choose routine, internal or restricted sensitivity.", 400);
  const expiresAt = getArchiveExpiry(input.expiresInDays);
  if (expiresAt === undefined) return fail("Expiry must be never or between 1 and 3,650 days.", 400);
  let ciphertext: string;
  try { ciphertext = encryptPrivateData(JSON.stringify(input.payload)); }
  catch { return fail("FRIDAY private-data encryption is not configured.", 503); }

  let context: Awaited<ReturnType<typeof ownerAndDb>>;
  try { context = await ownerAndDb(); } catch { return fail("Private archive is not configured.", 503); }
  if ("error" in context) return context.error;
  const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (rateError) return fail("NEXUS request protection is unavailable.", 503);
  if (!allowed) return fail("Too many archive changes. Try again shortly.", 429);
  const { data, error } = await context.supabase.from("knowledge_records").insert({
    owner_id: context.owner.id, record_type: input.type, sensitivity, expires_at: expiresAt, payload_ciphertext: ciphertext
  }).select("id, record_type, status, sensitivity, expires_at, created_at").single();
  if (error || !data) return fail("Could not save archive record. Check database setup.", 503);
  return NextResponse.json({ record: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function PATCH(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send application/json.", 415);
  let input: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_048) return fail("Request is too large.", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Send a JSON object.", 400);
    input = parsed as Record<string, unknown>;
  } catch { return fail("Send valid JSON.", 400); }
  if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id) || !isRecordStatus(input.status) || input.status === "active") {
    return fail("Provide a valid record ID and choose superseded or archived.", 400);
  }
  let context: Awaited<ReturnType<typeof ownerAndDb>>;
  try { context = await ownerAndDb(); } catch { return fail("Private archive is not configured.", 503); }
  if ("error" in context) return context.error;
  const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (rateError) return fail("NEXUS request protection is unavailable.", 503);
  if (!allowed) return fail("Too many archive changes. Try again shortly.", 429);
  const { data, error } = await context.supabase.from("knowledge_records").update({ status: input.status })
    .eq("id", input.id).eq("owner_id", context.owner.id).select("id, status").maybeSingle();
  if (error) return fail("Could not update archive record.", 503);
  if (!data) return fail("Archive record not found.", 404);
  return NextResponse.json({ record: data }, { headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send application/json.", 415);
  let input: { id?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_024) return fail("Request is too large.", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Send a JSON object.", 400);
    input = parsed as typeof input;
  } catch { return fail("Send valid JSON.", 400); }
  if (typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) return fail("A valid record ID is required.", 400);
  let context: Awaited<ReturnType<typeof ownerAndDb>>;
  try { context = await ownerAndDb(); } catch { return fail("Private archive is not configured.", 503); }
  if ("error" in context) return context.error;
  const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (rateError) return fail("NEXUS request protection is unavailable.", 503);
  if (!allowed) return fail("Too many archive changes. Try again shortly.", 429);
  const { data, error } = await context.supabase.from("knowledge_records").delete()
    .eq("id", input.id).eq("owner_id", context.owner.id).select("id").maybeSingle();
  if (error) return fail("Could not delete archive record.", 503);
  if (!data) return fail("Archive record not found.", 404);
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
