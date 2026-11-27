import { NextResponse } from "next/server";
import { verifyMemoryIntegrityDigest } from "@/lib/security/encryption";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { specialistAgents } from "@/lib/agents/registry";
import { canShareMemory, isUnexpired } from "@/lib/agents/memory-sharing";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}
async function context(agentId: string) {
  const agent = specialistAgents.find(item => item.id === agentId);
  if (!agent || agent.id === "friday" || agent.id === "nexus") return { response: fail("INVALID_AGENT", "FRIDAY and NEXUS cannot receive specialist memory grants.", 400) };
  const owner = await getOwnerSession({ requireMfa: true });
  if (!owner.user) return { response: fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401) };
  const supabase = await createClient();
  return { agent, owner, supabase };
}
export async function GET(_request: Request, route: { params: Promise<{ agentId: string }> }) {
  try {
    const ctx = await context((await route.params).agentId);
    if ("response" in ctx) return ctx.response;
    const { data, error } = await ctx.supabase.from("agent_memory_grants")
      .select("id, memory_id, from_agent_id, to_agent_id, approved_at, expires_at")
      .eq("owner_id", ctx.owner.user.id).eq("to_agent_id", ctx.agent.id).is("revoked_at", null)
      .order("approved_at", { ascending: false }).limit(100);
    if (error) return fail("MEMORY_GRANTS_UNAVAILABLE", "Could not load approved memory-sharing grants. Apply migration 0003.", 503);
    return NextResponse.json({ grants: (data ?? []).filter(grant => isUnexpired(grant.expires_at)) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("MEMORY_GRANTS_UNAVAILABLE", "Memory-sharing service is not configured.", 503); }
}
export async function POST(request: Request, route: { params: Promise<{ agentId: string }> }) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  let payload: unknown;
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 2048) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413); payload = JSON.parse(raw); }
  catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
  const input = payload as { memoryId?: unknown; expiresInDays?: unknown };
  if (typeof input.memoryId !== "string" || !UUID.test(input.memoryId)) return fail("INVALID_MEMORY", "Memory identifier is invalid.", 400);
  const days = input.expiresInDays ?? 30;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 365) return fail("INVALID_EXPIRY", "Sharing expiry must be between 1 and 365 days.", 400);
  try {
    const ctx = await context((await route.params).agentId);
    if ("response" in ctx) return ctx.response;
    const { data: allowed, error: rateError } = await ctx.supabase.rpc("consume_rate_limit", { p_limit: 20 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many sharing changes. Wait before trying again.", 429);
    const { data: memory, error: memoryError } = await ctx.supabase.from("agent_memories")
      .select("id, agent_id, sensitivity, expires_at, content_ciphertext, integrity_digest, integrity_version").eq("id", input.memoryId).eq("owner_id", ctx.owner.user.id).maybeSingle();
    if (memoryError) return fail("AGENT_MEMORY_UNAVAILABLE", "Could not verify the source memory.", 503);
    if (!memory || !isUnexpired(memory.expires_at)) return fail("MEMORY_NOT_FOUND", "Source memory was not found or has expired.", 404);
    if (memory.integrity_version !== 1 || !memory.integrity_digest ||
        !verifyMemoryIntegrityDigest(ctx.owner.user.id, memory.id, memory.content_ciphertext, memory.integrity_digest, "agent_memory")) {
      return fail("MEMORY_INTEGRITY_REQUIRED", "Only integrity-verified specialist memories can be shared. Review and replace legacy records first.", 409);
    }
    if (memory.agent_id === ctx.agent.id) return fail("INVALID_MEMORY_GRANT", "A specialist cannot share memory with itself.", 400);
    if (!canShareMemory(memory.agent_id, ctx.agent.id, memory.sensitivity)) return fail("INVALID_MEMORY_GRANT", "This memory cannot be shared with the selected specialist.", 403);
    const { data: existing, error: existingError } = await ctx.supabase.from("agent_memory_grants")
      .select("id, expires_at, approved_at").eq("owner_id", ctx.owner.user.id).eq("memory_id", memory.id)
      .eq("from_agent_id", memory.agent_id).eq("to_agent_id", ctx.agent.id).is("revoked_at", null).maybeSingle();
    if (existingError) return fail("MEMORY_GRANTS_UNAVAILABLE", "Could not check existing sharing permission.", 503);
    const expiresAt = new Date(Date.now() + days * 86400000).toISOString();
    if (existing && (isUnexpired(existing.expires_at))) {
      return NextResponse.json({ grant: existing, alreadyGranted: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (existing) {
      const { data: renewed, error: renewError } = await ctx.supabase.from("agent_memory_grants")
        .update({ expires_at: expiresAt, approved_at: new Date().toISOString() })
        .eq("id", existing.id).eq("owner_id", ctx.owner.user.id).is("revoked_at", null)
        .select("id, memory_id, from_agent_id, to_agent_id, approved_at, expires_at").single();
      if (renewError || !renewed) return fail("MEMORY_GRANT_RENEW_FAILED", "Could not renew this expired sharing permission.", 503);
      const { error: renewalAuditError } = await ctx.supabase.from("security_audit_events").insert({
        user_id: ctx.owner.user.id, event_type: "agent_memory_share_renewed", severity: "info",
        details: { fromAgentId: memory.agent_id, toAgentId: ctx.agent.id, expiresAt }
      });
      if (renewalAuditError) {
        await ctx.supabase.from("agent_memory_grants")
          .update({ expires_at: existing.expires_at, approved_at: existing.approved_at })
          .eq("id", renewed.id).eq("owner_id", ctx.owner.user.id).is("revoked_at", null);
        return fail("MEMORY_GRANT_AUDIT_FAILED", "The renewal was rolled back because its audit event could not be recorded.", 503);
      }
      return NextResponse.json({ grant: renewed, renewed: true }, { headers: { "Cache-Control": "no-store" } });
    }
    const { data, error } = await ctx.supabase.from("agent_memory_grants").insert({
      owner_id: ctx.owner.user.id, memory_id: memory.id, from_agent_id: memory.agent_id,
      to_agent_id: ctx.agent.id, expires_at: expiresAt
    }).select("id, memory_id, from_agent_id, to_agent_id, approved_at, expires_at").single();
    if (error || !data) return fail("MEMORY_GRANT_CREATE_FAILED", "Could not save this memory-sharing permission.", 503);
    const { error: auditError } = await ctx.supabase.from("security_audit_events").insert({
      user_id: ctx.owner.user.id, event_type: "agent_memory_shared", severity: "info",
      details: { fromAgentId: memory.agent_id, toAgentId: ctx.agent.id, expiresAt }
    });
    if (auditError) {
      await ctx.supabase.from("agent_memory_grants").delete().eq("id", data.id).eq("owner_id", ctx.owner.user.id);
      return fail("MEMORY_GRANT_AUDIT_FAILED", "Sharing was not enabled because its audit event could not be recorded.", 503);
    }
    return NextResponse.json({ grant: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return fail("MEMORY_GRANTS_UNAVAILABLE", "Memory-sharing service is not configured.", 503); }
}
export async function DELETE(request: Request, route: { params: Promise<{ agentId: string }> }) {
  let payload: { grantId?: unknown };
  try { const raw = await request.text(); if (new TextEncoder().encode(raw).byteLength > 1024) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413); payload = JSON.parse(raw) as typeof payload; }
  catch { return fail("INVALID_JSON", "Send a valid JSON object.", 400); }
  if (typeof payload.grantId !== "string" || !UUID.test(payload.grantId)) return fail("INVALID_GRANT", "Grant identifier is invalid.", 400);
  try {
    const ctx = await context((await route.params).agentId);
    if ("response" in ctx) return ctx.response;
    const { data: allowed, error: rateError } = await ctx.supabase.rpc("consume_rate_limit", { p_limit: 20 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!allowed) return fail("RATE_LIMITED", "Too many sharing changes. Wait before trying again.", 429);
    const { data, error } = await ctx.supabase.from("agent_memory_grants").update({ revoked_at: new Date().toISOString() })
      .eq("id", payload.grantId).eq("owner_id", ctx.owner.user.id).eq("to_agent_id", ctx.agent.id)
      .is("revoked_at", null).select("id, from_agent_id").maybeSingle();
    if (error) return fail("MEMORY_GRANT_REVOKE_FAILED", "Could not revoke this sharing permission.", 503);
    if (!data) return fail("GRANT_NOT_FOUND", "Active sharing permission was not found.", 404);
    const { error: auditError } = await ctx.supabase.from("security_audit_events").insert({
      user_id: ctx.owner.user.id, event_type: "agent_memory_share_revoked", severity: "info",
      details: { fromAgentId: data.from_agent_id, toAgentId: ctx.agent.id }
    });
    if (auditError) {
      await ctx.supabase.from("agent_memory_grants").update({ revoked_at: null }).eq("id", data.id).eq("owner_id", ctx.owner.user.id);
      return fail("MEMORY_GRANT_AUDIT_FAILED", "The revocation was rolled back because its audit event could not be recorded.", 503);
    }
    return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return fail("MEMORY_GRANTS_UNAVAILABLE", "Memory-sharing service is not configured.", 503); }
}
