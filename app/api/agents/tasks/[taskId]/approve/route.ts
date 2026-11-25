import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";

export const dynamic = "force-dynamic";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await context.params;
  if (!UUID.test(taskId)) return fail("INVALID_TASK", "Task identifier is invalid.", 400);
  try {
    const owner = await getOwnerSession();
    if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
    const supabase = await createClient();
    const { data: withinLimit, error: rateError } = await supabase.rpc("consume_rate_limit", { p_limit: 10 });
    if (rateError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
    if (!withinLimit) return fail("RATE_LIMITED", "Too many approval attempts. Wait before trying again.", 429);
    const { data, error } = await supabase.from("agent_tasks")
      .update({ status: "queued", owner_approved_at: new Date().toISOString(), owner_approved_by: owner.user.id })
      .eq("id", taskId).eq("owner_id", owner.user.id).eq("status", "awaiting_approval")
      .select("id, assigned_agent_id, title, status, owner_approved_at").maybeSingle();
    if (error) return fail("APPROVAL_UNAVAILABLE", "Could not update the approval state. Apply migration 0004.", 503);
    if (!data) return fail("TASK_NOT_PENDING", "This task is not awaiting approval or does not exist.", 409);
    const { error: auditError } = await supabase.from("agent_task_events").insert({
      owner_id: owner.user.id, task_id: taskId, actor_agent_id: "friday", event_type: "owner_approved",
      details_ciphertext: null
    });
    if (auditError) {
      await supabase.from("agent_tasks").update({ status: "awaiting_approval", owner_approved_at: null, owner_approved_by: null })
        .eq("id", taskId).eq("owner_id", owner.user.id);
      return fail("APPROVAL_AUDIT_FAILED", "Approval was rolled back because its audit event could not be recorded.", 503);
    }
    return NextResponse.json({ task: data, executionEnabled: true, message: "Owner approval recorded. The task is queued; choose Run specialist when ready." }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("APPROVAL_UNAVAILABLE", "Approval service is not configured.", 503);
  }
}
