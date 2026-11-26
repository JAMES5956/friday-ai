import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createMemoryIntegrityDigest, decryptPrivateData, encryptPrivateData, verifyMemoryIntegrityDigest } from "@/lib/security/encryption";
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
  const search = (url.searchParams.get("q") ?? "").trim().toLocaleLowerCase();
  if (type && !isRecordType(type)) return fail("Invalid archive record type.", 400);
  if (!isRecordStatus(status)) return fail("Invalid archive status.", 400);
  if (search.length > 120) return fail("Search query is too long.", 400);

  let query = context.supabase.from("knowledge_records")
    .select("id, record_type, status, sensitivity, expires_at, created_at, updated_at, payload_ciphertext, integrity_digest, integrity_version")
    .eq("owner_id", context.owner.id).eq("status", status)
    .order("updated_at", { ascending: false }).limit(100);
  if (type) query = query.eq("record_type", type);
  const { data, error } = await query;
  if (error) return fail("Could not load the private archive. Apply the knowledge archive migration if it is pending.", 503);
  try {
    const now = Date.now();
    const records = (data ?? []).map(row => {
      const hasIntegrity = row.integrity_digest !== null || row.integrity_version !== null;
      if (hasIntegrity && (row.integrity_version !== 1 || typeof row.integrity_digest !== "string" ||
          !verifyMemoryIntegrityDigest(context.owner.id, row.id, row.payload_ciphertext, row.integrity_digest, "knowledge"))) {
        throw new Error("Knowledge archive integrity mismatch");
      }
      return {
        id: row.id, type: row.record_type, status: row.status, sensitivity: row.sensitivity,
        expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at,
        expired: Boolean(row.expires_at && new Date(row.expires_at).getTime() <= now),
        integrityStatus: hasIntegrity ? "verified" : "legacy_unsealed",
        payload: JSON.parse(decryptPrivateData(row.payload_ciphertext))
      };
    });
    const filtered = search ? records.filter(record => {
      const payloadText = [record.payload.title, record.payload.body, record.payload.rationale, record.payload.project,
        ...(Array.isArray(record.payload.tags) ? record.payload.tags : []),
        ...(Array.isArray(record.payload.sources) ? record.payload.sources.map((source: { label?: string }) => source?.label ?? "") : [])]
        .filter(value => typeof value === "string").join(" ").toLocaleLowerCase();
      return payloadText.includes(search);
    }) : records;
    return NextResponse.json({ records: filtered, total: filtered.length }, { headers: { "Cache-Control": "no-store" } });
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
  const recordId = randomUUID();
  let integrityDigest: string;
  try { integrityDigest = createMemoryIntegrityDigest(context.owner.id, recordId, ciphertext, "knowledge"); }
  catch { return fail("FRIDAY archive integrity protection is not configured.", 503); }
  const { data, error } = await context.supabase.from("knowledge_records").insert({
    id: recordId, owner_id: context.owner.id, record_type: input.type, sensitivity,
    expires_at: expiresAt, payload_ciphertext: ciphertext, integrity_digest: integrityDigest, integrity_version: 1
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
  if (input.action === "seal-reviewed") {
    if (input.ownerConfirmed !== true || typeof input.id !== "string" || !UUID_PATTERN.test(input.id)) {
      return fail("Confirm review and provide a valid record ID.", 400);
    }
    let sealContext: Awaited<ReturnType<typeof ownerAndDb>>;
    try { sealContext = await ownerAndDb(); } catch { return fail("Private archive is not configured.", 503); }
    if ("error" in sealContext) return sealContext.error;
    const { data: allowed, error: rateError } = await sealContext.supabase.rpc("consume_rate_limit", { p_limit: 10 });
    if (rateError) return fail("NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("Too many integrity changes. Wait before trying again.", 429);
    const { data: legacy, error: readError } = await sealContext.supabase.from("knowledge_records")
      .select("id, payload_ciphertext, integrity_digest, integrity_version")
      .eq("id", input.id).eq("owner_id", sealContext.owner.id).maybeSingle();
    if (readError) return fail("Could not load the selected archive record.", 503);
    if (!legacy) return fail("Archive record not found.", 404);
    if (legacy.integrity_digest !== null || legacy.integrity_version !== null) return fail("This record is already sealed or requires security review.", 409);
    try {
      const decoded = JSON.parse(decryptPrivateData(legacy.payload_ciphertext));
      if (!validateKnowledgePayload(decoded)) return fail("Legacy archive payload failed validation and was not changed.", 409);
      const ciphertext = encryptPrivateData(JSON.stringify(decoded));
      const digest = createMemoryIntegrityDigest(sealContext.owner.id, legacy.id, ciphertext, "knowledge");
      const { data: sealed, error: sealError } = await sealContext.supabase.from("knowledge_records")
        .update({ payload_ciphertext: ciphertext, integrity_digest: digest, integrity_version: 1, integrity_sealed_at: new Date().toISOString() })
        .eq("id", legacy.id).eq("owner_id", sealContext.owner.id).eq("payload_ciphertext", legacy.payload_ciphertext)
        .is("integrity_digest", null).select("id").maybeSingle();
      if (sealError || !sealed) return fail("Could not safely seal this record; it may have changed. Refresh and review it again.", 409);
      await sealContext.supabase.from("security_audit_events").insert({
        user_id: sealContext.owner.id, event_type: "knowledge_integrity_legacy_sealed", severity: "info",
        details: { recordType: "knowledge" }
      });
      return NextResponse.json({ sealed: true }, { headers: { "Cache-Control": "no-store" } });
    } catch { return fail("Legacy archive record could not be decrypted. It was not changed.", 503); }
  }
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
