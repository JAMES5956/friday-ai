import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createMemoryIntegrityDigest, verifyMemoryIntegrityDigest, encryptPrivateData, decryptPrivateData } from "@/lib/security/encryption";
import { randomUUID } from "node:crypto";
import { evaluateTaskForApproval } from "@/lib/security/nexus";
import { specialistAgents, type SpecialistAgentId } from "@/lib/agents/registry";
import { resolveAgentModelConfig } from "@/lib/agents/runtime";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    const owner = await getOwnerSession();
    if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
    const supabase = await createClient();
    const { data, error } = await supabase.from("agent_tasks")
      .select("id, assigned_agent_id, created_by_agent_id, title, status, task_ciphertext, result_ciphertext, task_integrity_digest, task_integrity_version, result_integrity_digest, result_integrity_version, requires_owner_approval, owner_approved_at, created_at, updated_at")
      .eq("owner_id", owner.user.id).order("created_at", { ascending: false }).limit(50);
    if (error) return fail("TASK_STORAGE_UNAVAILABLE", "Task storage is unavailable. Apply migrations 0003 and 0004.", 503);
    const tasks = (data ?? []).map(task => {
      let description = "";
      let result: string | null = null;
      const taskIntegrity = task.task_integrity_digest
        ? task.task_integrity_version === 1 && verifyMemoryIntegrityDigest(owner.user!.id, task.id, task.task_ciphertext, task.task_integrity_digest, "agent_task")
        : null;
      try { if (taskIntegrity === false) throw new Error("Task integrity mismatch"); description = decryptPrivateData(task.task_ciphertext); }
      catch { description = "[Task details failed integrity verification or decryption]"; }
      if (task.result_ciphertext) {
        const resultIntegrity = task.result_integrity_digest
          ? task.result_integrity_version === 1 && verifyMemoryIntegrityDigest(owner.user!.id, task.id, task.result_ciphertext, task.result_integrity_digest, "agent_task_result")
          : null;
        try { if (resultIntegrity === false) throw new Error("Task result integrity mismatch"); result = decryptPrivateData(task.result_ciphertext); }
        catch { result = "[Task result failed integrity verification or decryption]"; }
      }
      const { task_ciphertext: _task, result_ciphertext: _result, task_integrity_digest: _td, task_integrity_version: _tv, result_integrity_digest: _rd, result_integrity_version: _rv, ...safe } = task;
      return { ...safe, description, result, integrityStatus: taskIntegrity === null ? "legacy_unsealed" : taskIntegrity ? "verified" : "tampered" };
    });
    return NextResponse.json({ tasks, executionEnabled: true, configuredAgents: specialistAgents.filter(agent => agent.id !== "friday" && agent.id !== "nexus" && resolveAgentModelConfig(agent.id)).map(agent => agent.id) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("TASK_SERVICE_UNAVAILABLE", "Task services are not configured.", 503);
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }
  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16384) return fail("REQUEST_TOO_LARGE", "Task request is too large.", 413);
    payload = JSON.parse(raw);
  } catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
  const input = payload as { agentId?: unknown; title?: unknown; description?: unknown };
  if (typeof input.agentId !== "string" || !specialistAgents.some(agent => agent.id === input.agentId && agent.id !== "friday" && agent.id !== "nexus")) return fail("INVALID_AGENT", "Choose an executable registered specialist. FRIDAY and NEXUS cannot be assigned ordinary tasks.", 400);
  if (typeof input.title !== "string" || !input.title.trim() || input.title.trim().length > 160) return fail("INVALID_TITLE", "Task title must be 1–160 characters.", 400);
  if (typeof input.description !== "string" || !input.description.trim() || input.description.length > 10000) return fail("INVALID_DESCRIPTION", "Task description must be 1–10,000 characters.", 400);

  try {
    const owner = await getOwnerSession();
    if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
    const supabase = await createClient();
    const { data: withinLimit, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 10 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!withinLimit) return fail("RATE_LIMITED", "Too many task submissions. Wait before trying again.", 429);
    const decision = evaluateTaskForApproval(input.title, input.description);
    const status = decision.requiresApproval ? "awaiting_approval" : "queued";
    const taskId = randomUUID();
    const taskCiphertext = encryptPrivateData(input.description.trim());
    const { data, error } = await supabase.from("agent_tasks").insert({
      id: taskId, owner_id: owner.user.id,
      assigned_agent_id: input.agentId,
      created_by_agent_id: "friday",
      title: input.title.trim(),
      status,
      task_ciphertext: taskCiphertext,
      task_integrity_digest: createMemoryIntegrityDigest(owner.user.id, taskId, taskCiphertext, "agent_task"),
      task_integrity_version: 1,
      requires_owner_approval: decision.requiresApproval
    }).select("id, assigned_agent_id, title, status, requires_owner_approval, created_at").single();
    if (error || !data) return fail("TASK_CREATE_FAILED", "Could not save this task. Confirm migrations 0003 and 0004 are applied and encryption is configured.", 503);

    const eventType = decision.requiresApproval ? "owner_approval_required" : "task_queued";
    const eventId = randomUUID();
    const eventCiphertext = encryptPrivateData(JSON.stringify({ assignedAgentId: input.agentId, approvalRequired: decision.requiresApproval }));
    const { error: eventError } = await supabase.from("agent_task_events").insert({
      id: eventId, owner_id: owner.user.id, task_id: data.id, actor_agent_id: "friday", event_type: eventType,
      details_ciphertext: eventCiphertext,
      details_integrity_digest: createMemoryIntegrityDigest(owner.user.id, eventId, eventCiphertext, "agent_task_event"),
      details_integrity_version: 1
    });
    if (eventError) {
      await supabase.from("agent_tasks").delete().eq("id", data.id).eq("owner_id", owner.user.id);
      return fail("TASK_AUDIT_FAILED", "Task was not retained because its audit event could not be recorded.", 503);
    }
    return NextResponse.json({ task: data, executionEnabled: true, modelConfigured: Boolean(resolveAgentModelConfig(input.agentId as SpecialistAgentId)), message: decision.requiresApproval
      ? "Task saved and held for your approval. Approve it, then choose Run specialist when ready."
      : resolveAgentModelConfig(input.agentId as SpecialistAgentId) ? "Task queued. Choose Run specialist when you are ready." : "Task queued. Configure this specialist’s dedicated model before running it." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("TASK_SERVICE_UNAVAILABLE", "Task services or encryption are not configured.", 503);
  }
}
