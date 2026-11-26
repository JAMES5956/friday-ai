import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import {
  createMemoryIntegrityDigest,
  decryptPrivateData,
  encryptPrivateData,
  verifyMemoryIntegrityDigest
} from "@/lib/security/encryption";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SCAN = 100;
const MAX_SEAL = 25;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function ownerContext() {
  const owner = await getOwnerSession();
  if (!owner.user) return { response: fail("Owner authentication required.", 401) } as const;
  const supabase = await createClient();
  return { owner: owner.user, supabase } as const;
}

export async function GET() {
  try {
    const context = await ownerContext();
    if ("response" in context) return context.response;
    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 10 });
    if (rateError) return fail("NEXUS rate protection is unavailable. Apply the security migration.", 503);
    if (!allowed) return fail("Too many integrity scans. Wait before scanning again.", 429);

    const [personalResult, agentResult, archiveResult, projectResult] = await Promise.all([
      context.supabase.from("memories").select("id, category, content, integrity_digest, integrity_version, updated_at")
        .eq("user_id", context.owner.id).eq("retained", true).order("updated_at", { ascending: false }).limit(MAX_SCAN),
      context.supabase.from("agent_memories").select("id, agent_id, content_ciphertext, integrity_digest, integrity_version, updated_at")
        .eq("owner_id", context.owner.id).order("updated_at", { ascending: false }).limit(MAX_SCAN),
      context.supabase.from("knowledge_records").select("id, record_type, payload_ciphertext, integrity_digest, integrity_version, updated_at")
        .eq("owner_id", context.owner.id).order("updated_at", { ascending: false }).limit(MAX_SCAN),
      context.supabase.from("project_records").select("id, payload_ciphertext, integrity_digest, integrity_version, updated_at")
        .eq("owner_id", context.owner.id).order("updated_at", { ascending: false }).limit(MAX_SCAN)
    ]);
    if (personalResult.error || agentResult.error || archiveResult.error || projectResult.error) {
      return fail("NEXUS could not scan every protected store. Confirm migrations 0006–0009 are applied.", 503);
    }

    const records: Array<{id:string;category:string;updatedAt:string;status:"verified"|"legacy_unsealed"|"tampered"|"unreadable";sealable:boolean}> = [];
    const inspect = (rows: Array<Record<string, unknown>>, category: (row: Record<string, unknown>) => string,
      ciphertextField: string, domain: string, sealable = false) => {
      for (const row of rows) {
        let status: "verified"|"legacy_unsealed"|"tampered"|"unreadable";
        const ciphertext = row[ciphertextField];
        const hasDigest = row.integrity_digest !== null || row.integrity_version !== null;
        if (typeof row.id !== "string" || typeof ciphertext !== "string") status = "unreadable";
        else if (!hasDigest) {
          try { decryptPrivateData(ciphertext); status = "legacy_unsealed"; }
          catch { status = "unreadable"; }
        } else if (row.integrity_version !== 1 || typeof row.integrity_digest !== "string" ||
          !verifyMemoryIntegrityDigest(context.owner.id, row.id, ciphertext, row.integrity_digest, domain)) status = "tampered";
        else {
          try { decryptPrivateData(ciphertext); status = "verified"; }
          catch { status = "unreadable"; }
        }
        records.push({id: String(row.id), category: category(row), updatedAt: String(row.updated_at ?? ""),
          status, sealable: sealable && status === "legacy_unsealed"});
      }
    };
    inspect((personalResult.data ?? []) as unknown as Array<Record<string,unknown>>, row => "Personal memory · " + String(row.category ?? "General"), "content", "memory", true);
    inspect((agentResult.data ?? []) as unknown as Array<Record<string,unknown>>, row => "Specialist memory · " + String(row.agent_id ?? "Agent").toUpperCase(), "content_ciphertext", "agent_memory");
    inspect((archiveResult.data ?? []) as unknown as Array<Record<string,unknown>>, row => "Knowledge archive · " + String(row.record_type ?? "Record"), "payload_ciphertext", "knowledge");
    inspect((projectResult.data ?? []) as unknown as Array<Record<string,unknown>>, () => "Project record", "payload_ciphertext", "project");

    const counts = {
      verified: records.filter(item => item.status === "verified").length,
      legacy_unsealed: records.filter(item => item.status === "legacy_unsealed").length,
      tampered: records.filter(item => item.status === "tampered").length,
      unreadable: records.filter(item => item.status === "unreadable").length
    };
    return NextResponse.json({ report: { scanned: records.length, counts, records } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("NEXUS memory integrity is not configured.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const context = await ownerContext();
    if ("response" in context) return context.response;
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send application/json.", 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 4_096) return fail("Request is too large.", 413);
    let input: { action?: unknown; ids?: unknown; ownerConfirmed?: unknown };
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Send a JSON object.", 400);
      input = parsed as typeof input;
    } catch { return fail("Send valid JSON.", 400); }

    if (input.action !== "seal-reviewed" || input.ownerConfirmed !== true || !Array.isArray(input.ids) ||
        input.ids.length < 1 || input.ids.length > MAX_SEAL ||
        input.ids.some(id => typeof id !== "string" || !UUID.test(id)) ||
        new Set(input.ids).size !== input.ids.length) {
      return fail("Explicitly confirm and select between one and 25 unique legacy memory IDs.", 400);
    }

    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 10 });
    if (rateError) return fail("NEXUS rate protection is unavailable.", 503);
    if (!allowed) return fail("Too many integrity changes. Wait before trying again.", 429);

    const { data: rows, error } = await context.supabase.from("memories")
      .select("id, content, integrity_digest, integrity_version")
      .eq("user_id", context.owner.id).eq("retained", true).in("id", input.ids as string[]);
    if (error) return fail("Could not load selected legacy memories.", 503);
    if ((rows ?? []).length !== input.ids.length) return fail("One or more selected memories are unavailable.", 400);

    let sealed = 0;
    let skipped = 0;
    for (const row of rows ?? []) {
      if (row.integrity_digest !== null || row.integrity_version !== null) { skipped++; continue; }
      try {
        const plaintext = decryptPrivateData(row.content);
        const ciphertext = encryptPrivateData(plaintext);
        const digest = createMemoryIntegrityDigest(context.owner.id, row.id, ciphertext);
        const { data: updated, error: updateError } = await context.supabase.from("memories")
          .update({ content: ciphertext, integrity_digest: digest, integrity_version: 1, integrity_sealed_at: new Date().toISOString() })
          .eq("id", row.id).eq("user_id", context.owner.id).eq("content", row.content)
          .is("integrity_digest", null).select("id").maybeSingle();
        if (updateError || !updated) { skipped++; continue; }
        sealed++;
      } catch { skipped++; }
    }

    const { error: auditError } = await context.supabase.from("security_audit_events").insert({
      user_id: context.owner.id,
      event_type: "memory_integrity_legacy_sealed",
      severity: skipped ? "warning" : "info",
      details: { requested: input.ids.length, sealed, skipped }
    });
    if (auditError) console.error("NEXUS could not record the memory-integrity sealing audit event.");

    return NextResponse.json({ sealed, skipped }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("NEXUS could not seal the selected legacy memories.", 503);
  }
}
