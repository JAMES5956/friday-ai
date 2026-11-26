import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createMemoryIntegrityDigest, decryptPrivateData, encryptPrivateData, verifyMemoryIntegrityDigest } from "@/lib/security/encryption";
import { specialistAgents } from "@/lib/agents/registry";
import { executeAgentTask, resolveAgentModelConfig } from "@/lib/agents/runtime";
import { isUnexpired } from "@/lib/agents/memory-sharing";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  let recoveryOwnerId: string | null = null;
  let recoveryClient: Awaited<ReturnType<typeof createClient>> | null = null;
  let claimedByThisRequest = false;
  if (!UUID.test(taskId)) return fail("INVALID_TASK", "Task identifier is invalid.", 400);
  try {
    const owner = await getOwnerSession();
    if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
    const supabase = await createClient();
    recoveryClient = supabase;
    recoveryOwnerId = owner.user.id;
    const { data: withinLimit, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 5 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!withinLimit) return fail("RATE_LIMITED", "Too many execution attempts. Wait before trying again.", 429);

    const { data: task, error: taskError } = await supabase.from("agent_tasks")
      .select("id, assigned_agent_id, title, status, task_ciphertext, task_integrity_digest, task_integrity_version, requires_owner_approval, owner_approved_at")
      .eq("id", taskId).eq("owner_id", owner.user.id).maybeSingle();
    if (taskError || !task) return fail("TASK_NOT_FOUND", "Task was not found.", 404);
    if (task.status !== "queued" && task.status !== "failed") return fail("TASK_NOT_RUNNABLE", "Only queued or failed tasks can be run or retried.", 409);
    if (task.requires_owner_approval && !task.owner_approved_at) return fail("OWNER_APPROVAL_REQUIRED", "This task must be approved before execution.", 409);

    const agent = specialistAgents.find(item => item.id === task.assigned_agent_id);
    if (!agent || agent.id === "friday" || agent.id === "nexus") return fail("INVALID_AGENT", "This task is not assigned to an executable specialist.", 400);
    if (!resolveAgentModelConfig(agent.id)) return fail("AGENT_MODEL_NOT_CONFIGURED", `Configure AI_${agent.id.toUpperCase()}_MODEL and the shared provider credentials before running this specialist.`, 503);

    if (task.task_integrity_digest !== null &&
        (task.task_integrity_version !== 1 || !verifyMemoryIntegrityDigest(owner.user.id, task.id, task.task_ciphertext, task.task_integrity_digest, "agent_task"))) {
      return fail("TASK_INTEGRITY_FAILED", "NEXUS detected changed task content. Execution has been stopped.", 503);
    }
    let taskDescription: string;
    try { taskDescription = decryptPrivateData(task.task_ciphertext); }
    catch { return fail("PRIVATE_DATA_UNREADABLE", "Task details could not be decrypted. Check the encryption key.", 503); }

    const { data: memoryRows, error: memoryError } = await supabase.from("agent_memories")
      .select("id, content_ciphertext, memory_type, sensitivity, expires_at, integrity_digest, integrity_version")
      .eq("owner_id", owner.user.id).eq("agent_id", agent.id)
      .order("updated_at", { ascending: false }).limit(12);
    if (memoryError) return fail("AGENT_MEMORY_UNAVAILABLE", "The specialist's private memory could not be loaded.", 503);
    let memories: string[];
    try {
      const now = Date.now();
      const storedMemories = memoryRows ?? [];
      const integrityFailure = storedMemories.some(row => row.integrity_digest !== null &&
        (row.integrity_version !== 1 || !verifyMemoryIntegrityDigest(owner.user.id, row.id, row.content_ciphertext, row.integrity_digest, "agent_memory")));
      if (integrityFailure) return fail("AGENT_MEMORY_INTEGRITY_FAILED", "NEXUS detected a specialist-memory integrity mismatch. Execution has been stopped.", 503);
      memories = storedMemories.filter(row => row.integrity_version === 1 && row.integrity_digest &&
        row.sensitivity !== "restricted" && isUnexpired(row.expires_at, now))
        .map(row => decryptPrivateData(row.content_ciphertext));
    } catch { return fail("PRIVATE_DATA_UNREADABLE", "The specialist's private memory could not be decrypted.", 503); }

    const { data: grantRows, error: grantError } = await supabase.from("agent_memory_grants")
      .select("memory_id, from_agent_id, expires_at")
      .eq("owner_id", owner.user.id).eq("to_agent_id", agent.id).is("revoked_at", null).limit(50);
    if (grantError) return fail("MEMORY_GRANTS_UNAVAILABLE", "Approved cross-agent memory grants could not be loaded.", 503);
    const activeGrants = (grantRows ?? []).filter(grant => isUnexpired(grant.expires_at));
    if (activeGrants.length) {
      const { data: sharedRows, error: sharedError } = await supabase.from("agent_memories")
        .select("id, agent_id, content_ciphertext, sensitivity, expires_at, integrity_digest, integrity_version")
        .eq("owner_id", owner.user.id).in("id", activeGrants.map(grant => grant.memory_id));
      if (sharedError) return fail("SHARED_MEMORY_UNAVAILABLE", "Owner-approved shared memory could not be loaded.", 503);
      try {
        for (const grant of activeGrants) {
          const shared = (sharedRows ?? []).find(row => row.id === grant.memory_id && row.agent_id === grant.from_agent_id &&
            row.sensitivity !== "restricted" && isUnexpired(row.expires_at));
          if (shared && shared.integrity_digest !== null && shared.integrity_version !== 1) throw new Error("Shared memory integrity metadata invalid");
          if (shared && shared.integrity_version === 1 && shared.integrity_digest) {
            if (!verifyMemoryIntegrityDigest(owner.user.id, shared.id, shared.content_ciphertext, shared.integrity_digest, "agent_memory")) throw new Error("Shared memory integrity mismatch");
            memories.push("Owner-approved memory shared from " + grant.from_agent_id.toUpperCase() + ": " + decryptPrivateData(shared.content_ciphertext));
          }
        }
      } catch { return fail("PRIVATE_DATA_UNREADABLE", "Approved shared memory could not be decrypted.", 503); }
    }

    const { data: claimed, error: claimError } = await supabase.from("agent_tasks")
      .update({ status: "in_progress" }).eq("id", taskId).eq("owner_id", owner.user.id).in("status", ["queued", "failed"])
      .select("id").maybeSingle();
    if (claimError) return fail("TASK_CLAIM_FAILED", "Could not safely claim this task for execution.", 503);
    if (!claimed) return fail("TASK_ALREADY_RUNNING", "Another request has already claimed this task.", 409);
    claimedByThisRequest = true;

    const startEventId = randomUUID();
    const startEventCiphertext = encryptPrivateData(JSON.stringify({ assignedAgentId: agent.id }));
    const { error: startAuditError } = await supabase.from("agent_task_events").insert({
      id: startEventId, owner_id: owner.user.id, task_id: taskId, actor_agent_id: "friday", event_type: "task_started",
      details_ciphertext: startEventCiphertext,
      details_integrity_digest: createMemoryIntegrityDigest(owner.user.id, startEventId, startEventCiphertext, "agent_task_event"),
      details_integrity_version: 1
    });
    if (startAuditError) {
      await supabase.from("agent_tasks").update({ status: "queued" }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
      claimedByThisRequest = false;
      return fail("TASK_AUDIT_FAILED", "Task execution was stopped because its start event could not be recorded.", 503);
    }

    const result = await executeAgentTask(agent, taskDescription, memories);
    if (!result.ok) {
      await supabase.from("agent_tasks").update({ status: "failed" }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
      claimedByThisRequest = false;
      const failureEventId = randomUUID();
      const failureCiphertext = encryptPrivateData(JSON.stringify({ code: result.code }));
      await supabase.from("agent_task_events").insert({
        id: failureEventId, owner_id: owner.user.id, task_id: taskId, actor_agent_id: agent.id, event_type: "task_execution_failed",
        details_ciphertext: failureCiphertext,
        details_integrity_digest: createMemoryIntegrityDigest(owner.user.id, failureEventId, failureCiphertext, "agent_task_event"),
        details_integrity_version: 1
      });
      return fail(result.code, "The specialist could not complete this task. Check its model configuration or provider and retry.", 502);
    }

    const resultCiphertext = encryptPrivateData(result.content);
    const resultDigest = createMemoryIntegrityDigest(owner.user.id, taskId, resultCiphertext, "agent_task_result");
    const { error: completeError } = await supabase.from("agent_tasks").update({
      status: "completed", result_ciphertext: resultCiphertext,
      result_integrity_digest: resultDigest, result_integrity_version: 1
    }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
    if (completeError) {
      await supabase.from("agent_tasks").update({ status: "failed", result_ciphertext: null, result_integrity_digest: null, result_integrity_version: null }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
      claimedByThisRequest = false;
      return fail("TASK_RESULT_SAVE_FAILED", "The specialist replied, but its result could not be saved.", 503);
    }

    const completeEventId = randomUUID();
    const completeEventCiphertext = encryptPrivateData(JSON.stringify({ resultLength: result.content.length }));
    const { error: completeAuditError } = await supabase.from("agent_task_events").insert({
      id: completeEventId, owner_id: owner.user.id, task_id: taskId, actor_agent_id: agent.id, event_type: "task_completed",
      details_ciphertext: completeEventCiphertext,
      details_integrity_digest: createMemoryIntegrityDigest(owner.user.id, completeEventId, completeEventCiphertext, "agent_task_event"),
      details_integrity_version: 1
    });
    if (completeAuditError) {
      await supabase.from("agent_tasks").update({ status: "failed", result_ciphertext: null }).eq("id", taskId).eq("owner_id", owner.user.id);
      claimedByThisRequest = false;
      return fail("TASK_AUDIT_FAILED", "The result was withheld because its completion event could not be recorded.", 503);
    }

    const workingMemoryId = randomUUID();
    const workingMemoryCiphertext = encryptPrivateData(`Completed task: ${task.title}
Result summary: ${result.content.slice(0, 6000)}`);
    const workingMemoryDigest = createMemoryIntegrityDigest(owner.user.id, workingMemoryId, workingMemoryCiphertext, "agent_memory");
    const { error: memorySaveError } = await supabase.from("agent_memories").insert({
      id: workingMemoryId, owner_id: owner.user.id, agent_id: agent.id, memory_type: "working",
      content_ciphertext: workingMemoryCiphertext, integrity_digest: workingMemoryDigest, integrity_version: 1,
      source_agent_id: agent.id, sensitivity: "internal"
    });
    return NextResponse.json({
      task: { id: taskId, assigned_agent_id: agent.id, status: "completed" },
      result: result.content, workingMemorySaved: !memorySaveError,
      message: memorySaveError ? "Task completed. Its result is saved, but the specialist's working memory could not be updated." : "Task completed and the specialist's private working memory was updated."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // If an unexpected exception occurs after the task was claimed, do not leave it
    // permanently marked in_progress. Only recover a task still owned by this request.
    if (claimedByThisRequest && recoveryClient && recoveryOwnerId) {
      try {
        const { data: recovered } = await recoveryClient.from("agent_tasks")
          .update({ status: "failed", result_ciphertext: null })
          .eq("id", taskId).eq("owner_id", recoveryOwnerId).eq("status", "in_progress")
          .select("id").maybeSingle();
        if (recovered) {
          await recoveryClient.from("agent_task_events").insert({
            owner_id: recoveryOwnerId, task_id: taskId, actor_agent_id: "friday",
            event_type: "task_execution_interrupted", details_ciphertext: null
          });
        }
      } catch {
        // Preserve the generic API failure; recovery is best-effort if the database is down.
      }
    }
    return fail("TASK_EXECUTION_UNAVAILABLE", "Specialist execution failed unexpectedly. The task was marked failed when recovery was available, so you can retry it.", 503);
  }
}
