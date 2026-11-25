import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { encryptPrivateData, decryptPrivateData } from "@/lib/security/encryption";
import { specialistAgents } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TYPES = ["working", "project", "reference", "preference"] as const;
const SENSITIVITIES = ["routine", "internal", "restricted"] as const;
function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function context(agentId: string) {
  const agent = specialistAgents.find(item => item.id === agentId);
  if (!agent) return { response: fail("INVALID_AGENT", "Choose a registered agent.", 400) };
  const owner = await getOwnerSession();
  if (!owner.user) return { response: fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401) };
  const supabase = await createClient();
  return { agent, owner, supabase };
}
export async function GET(_request: Request, route: { params: Promise<{ agentId: string }> }) {
  try {
    const { agentId } = await route.params;
    const ctx = await context(agentId);
    if ("response" in ctx) return ctx.response;
    const { data, error } = await ctx.supabase.from("agent_memories")
      .select("id, memory_type, sensitivity, content_ciphertext, source_agent_id, expires_at, created_at, updated_at")
      .eq("owner_id", ctx.owner.user.id).eq("agent_id", agentId)
      .order("updated_at", { ascending: false }).limit(100);
    if (error) return fail("AGENT_MEMORY_UNAVAILABLE", "Could not load this specialist's private memory. Apply migration 0003.", 503);
    try {
      const memories = (data ?? []).map(row => ({ id: row.id, memoryType: row.memory_type, sensitivity: row.sensitivity,
        content: decryptPrivateData(row.content_ciphertext), sourceAgentId: row.source_agent_id,
        expiresAt: row.expires_at, createdAt: row.created_at, updatedAt: row.updated_at }));
      return NextResponse.json({ memories }, { headers: { "Cache-Control": "no-store" } });
    } catch { return fail("PRIVATE_DATA_UNREADABLE", "Specialist memory could not be decrypted. Check the encryption key.", 503); }
  } catch { return fail("AGENT_MEMORY_UNAVAILABLE", "Specialist memory service is not configured.", 503); }
}
export async function POST(request: Request, route: { params: Promise<{ agentId: string }> }) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  let payload: unknown;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 12000) return fail("REQUEST_TOO_LARGE", "Memory entry is too large.", 413); payload = JSON.parse(raw); }
  catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
  const input = payload as { content?: unknown; memoryType?: unknown; sensitivity?: unknown; expiresInDays?: unknown };
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 10000) return fail("INVALID_CONTENT", "Memory content must be 1–10,000 characters.", 400);
  const memoryType = input.memoryType ?? "working";
  const sensitivity = input.sensitivity ?? "internal";
  if (typeof memoryType !== "string" || !TYPES.includes(memoryType as typeof TYPES[number])) return fail("INVALID_MEMORY_TYPE", "Choose a supported memory type.", 400);
  if (typeof sensitivity !== "string" || !SENSITIVITIES.includes(sensitivity as typeof SENSITIVITIES[number])) return fail("INVALID_SENSITIVITY", "Choose a supported sensitivity level.", 400);
  if (input.expiresInDays !== undefined && input.expiresInDays !== null && (typeof input.expiresInDays !== "number" || !Number.isInteger(input.expiresInDays) || input.expiresInDays < 1 || input.expiresInDays > 3650)) return fail("INVALID_EXPIRY", "Expiry must be between 1 and 3,650 days.", 400);
  try {
    const ctx = await context((await route.params).agentId);
    if ("response" in ctx) return ctx.response;
    const { agent, owner, supabase } = ctx;
    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 30 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many memory changes. Wait before trying again.", 429);
    const expiresAt = typeof input.expiresInDays === "number" ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString() : null;
    const { data, error } = await supabase.from("agent_memories").insert({
      owner_id: owner.user.id, agent_id: agent.id, memory_type: memoryType, sensitivity,
      content_ciphertext: encryptPrivateData(input.content.trim()), source_agent_id: "friday", expires_at: expiresAt
    }).select("id, memory_type, sensitivity, created_at, expires_at").single();
    if (error || !data) return fail("AGENT_MEMORY_SAVE_FAILED", "Could not save this encrypted memory.", 503);
    const { error: auditError } = await supabase.from("security_audit_events").insert({
      user_id: owner.user.id, event_type: "agent_memory_created", severity: "info",
      details: { agentId: agent.id, memoryType, sensitivity }
    });
    if (auditError) {
      await supabase.from("agent_memories").delete().eq("id", data.id).eq("owner_id", owner.user.id);
      return fail("AGENT_MEMORY_AUDIT_FAILED", "Memory was not retained because its audit event could not be recorded.", 503);
    }
    return NextResponse.json({ memory: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return fail("AGENT_MEMORY_UNAVAILABLE", "Specialist memory service or encryption is not configured.", 503); }
}
export async function DELETE(request: Request, route: { params: Promise<{ agentId: string }> }) {
  let payload: { id?: unknown };
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 1024) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413); payload = JSON.parse(raw) as typeof payload; }
  catch { return fail("INVALID_JSON", "Send a valid JSON object.", 400); }
  if (typeof payload.id !== "string" || !UUID.test(payload.id)) return fail("INVALID_MEMORY", "Memory identifier is invalid.", 400);
  try {
    const { agent, owner, supabase } = await context((await route.params).agentId);
    if (!agent || !owner || !supabase) return fail("INVALID_AGENT", "Choose a registered agent.", 400);
    const { data: allowed, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 30 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many memory changes. Wait before trying again.", 429);
    const { data, error } = await supabase.from("agent_memories").delete().eq("id", payload.id)
      .eq("owner_id", owner.user.id).eq("agent_id", agent.id).select("id").maybeSingle();
    if (error) return fail("AGENT_MEMORY_DELETE_FAILED", "Could not delete this memory.", 503);
    if (!data) return fail("MEMORY_NOT_FOUND", "Memory was not found.", 404);
    await supabase.from("security_audit_events").insert({
      user_id: owner.user.id, event_type: "agent_memory_deleted", severity: "info", details: { agentId: agent.id }
    });
    return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("AGENT_MEMORY_UNAVAILABLE", "Specialist memory service is not configured.", 503); }
}
