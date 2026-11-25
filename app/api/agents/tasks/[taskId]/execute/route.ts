import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";
import { specialistAgents } from "@/lib/agents/registry";
import { executeAgentTask, resolveAgentModelConfig } from "@/lib/agents/runtime";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(_request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  if (!UUID.test(taskId)) return fail("INVALID_TASK", "Task identifier is invalid.", 400);
  try {
    const owner = await getOwnerSession();
    if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
    const supabase = await createClient();
    const { data: withinLimit, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 5 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!withinLimit) return fail("RATE_LIMITED", "Too many execution attempts. Wait before trying again.", 429);

    const { data: task, error: taskError } = await supabase.from("agent_tasks")
      .select("id, assigned_agent_id, title, status, task_ciphertext, requires_owner_approval, owner_approved_at")
      .eq("id", taskId).eq("owner_id", owner.user.id).maybeSingle();
    if (taskError || !task) return fail("TASK_NOT_FOUND", "Task was not found.", 404);
    if (task.status !== "queued" && task.status !== "failed") return fail("TASK_NOT_RUNNABLE", "Only queued or failed tasks can be run or retried.", 409);
    if (task.requires_owner_approval && !task.owner_approved_at) return fail("OWNER_APPROVAL_REQUIRED", "This task must be approved before execution.", 409);

    const agent = specialistAgents.find(item => item.id === task.assigned_agent_id);
    if (!agent || agent.id === "friday" || agent.id === "nexus") return fail("INVALID_AGENT", "This task is not assigned to an executable specialist.", 400);
    if (!resolveAgentModelConfig(agent.id)) return fail("AGENT_MODEL_NOT_CONFIGURED", `Configure AI_${agent.id.toUpperCase()}_MODEL and the shared provider credentials before running this specialist.`, 503);

    let taskDescription: string;
    try { taskDescription = decryptPrivateData(task.task_ciphertext); }
    catch { return fail("PRIVATE_DATA_UNREADABLE", "Task details could not be decrypted. Check the encryption key.", 503); }

    const { data: memoryRows, error: memoryError } = await supabase.from("agent_memories")
      .select("content_ciphertext, memory_type, sensitivity, expires_at")
      .eq("owner_id", owner.user.id).eq("agent_id", agent.id)
      .order("updated_at", { ascending: false }).limit(12);
    if (memoryError) return fail("AGENT_MEMORY_UNAVAILABLE", "The specialist's private memory could not be loaded.", 503);
    let memories: string[];
    try {
      const now = Date.now();
      memories = (memoryRows ?? []).filter(row => !row.expires_at || new Date(row.expires_at).getTime() > now)
        .map(row => decryptPrivateData(row.content_ciphertext));
    } catch { return fail("PRIVATE_DATA_UNREADABLE", "The specialist's private memory could not be decrypted.", 503); }

    const { data: claimed, error: claimError } = await supabase.from("agent_tasks")
      .update({ status: "in_progress" }).eq("id", taskId).eq("owner_id", owner.user.id).in("status", ["queued", "failed"])
      .select("id").maybeSingle();
    if (claimError) return fail("TASK_CLAIM_FAILED", "Could not safely claim this task for execution.", 503);
    if (!claimed) return fail("TASK_ALREADY_RUNNING", "Another request has already claimed this task.", 409);

    const { error: startAuditError } = await supabase.from("agent_task_events").insert({
      owner_id: owner.user.id, task_id: taskId, actor_agent_id: "friday", event_type: "task_started",
      details_ciphertext: encryptPrivateData(JSON.stringify({ assignedAgentId: agent.id }))
    });
    if (startAuditError) {
      await supabase.from("agent_tasks").update({ status: "queued" }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
      return fail("TASK_AUDIT_FAILED", "Task execution was stopped because its start event could not be recorded.", 503);
    }

    const result = await executeAgentTask(agent, taskDescription, memories);
    if (!result.ok) {
      await supabase.from("agent_tasks").update({ status: "failed" }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
      await supabase.from("agent_task_events").insert({
        owner_id: owner.user.id, task_id: taskId, actor_agent_id: agent.id, event_type: "task_execution_failed",
        details_ciphertext: encryptPrivateData(JSON.stringify({ code: result.code }))
      });
      return fail(result.code, "The specialist could not complete this task. Check its model configuration or provider and retry.", 502);
    }

    const { error: completeError } = await supabase.from("agent_tasks").update({
      status: "completed", result_ciphertext: encryptPrivateData(result.content)
    }).eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "in_progress");
    if (completeError) return fail("TASK_RESULT_SAVE_FAILED", "The specialist replied, but its result could not be saved.", 503);

    const { error: completeAuditError } = await supabase.from("agent_task_events").insert({
      owner_id: owner.user.id, task_id: taskId, actor_agent_id: agent.id, event_type: "task_completed",
      details_ciphertext: encryptPrivateData(JSON.stringify({ resultLength: result.content.length }))
    });
    if (completeAuditError) {
      await supabase.from("agent_tasks").update({ status: "failed", result_ciphertext: null }).eq("id", taskId).eq("owner_id", owner.user.id);
      return fail("TASK_AUDIT_FAILED", "The result was withheld because its completion event could not be recorded.", 503);
    }

    const { error: memorySaveError } = await supabase.from("agent_memories").insert({
      owner_id: owner.user.id, agent_id: agent.id, memory_type: "working",
      content_ciphertext: encryptPrivateData(`Completed task: ${task.title}\nResult summary: ${result.content.slice(0, 6000)}`),
      source_agent_id: agent.id, sensitivity: "internal"
    });
    return NextResponse.json({
      task: { id: taskId, assigned_agent_id: agent.id, status: "completed" },
      result: result.content, workingMemorySaved: !memorySaveError,
      message: memorySaveError ? "Task completed. Its result is saved, but the specialist's working memory could not be updated." : "Task completed and the specialist's private working memory was updated."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("TASK_EXECUTION_UNAVAILABLE", "Specialist execution is not configured.", 503);
  }
}
