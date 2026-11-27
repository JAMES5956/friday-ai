import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { specialistAgents } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function getOwnerAndDatabase() {
  const owner = await getOwnerSession({ requireMfa: true });
  if (!owner.user) return { response: fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401) };
  const supabase = await createClient();
  return { owner, supabase };
}

export async function GET() {
  try {
    const context = await getOwnerAndDatabase();
    if ("response" in context) return context.response;
    const { data, error } = await context.supabase
      .from("agent_workspaces")
      .select("agent_id, display_name, created_at, updated_at")
      .eq("owner_id", context.owner.user.id)
      .order("created_at", { ascending: true });
    if (error) {
      return fail(
        "AGENT_STORAGE_UNAVAILABLE",
        "Agent workspace storage is unavailable. Apply migration 0003_agent_workspaces.sql.",
        503
      );
    }
    const workspaces = data ?? [];
    return NextResponse.json({
      agents: specialistAgents.map(agent => ({
        ...agent,
        workspace: workspaces.find(workspace => workspace.agent_id === agent.id) ?? null
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("AGENT_SERVICE_UNAVAILABLE", "Agent services are not configured.", 503);
  }
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }

  let payload: unknown;
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2048) {
      return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    }
    payload = JSON.parse(raw);
  } catch {
    return fail("INVALID_JSON", "Send a valid JSON object.", 400);
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
  }
  const agentId = (payload as { agentId?: unknown }).agentId;
  if (typeof agentId !== "string" || !specialistAgents.some(agent => agent.id === agentId)) {
    return fail("INVALID_AGENT", "Choose an agent from the registered directory.", 400);
  }

  try {
    const context = await getOwnerAndDatabase();
    if ("response" in context) return context.response;
    const agent = specialistAgents.find(item => item.id === agentId);
    if (!agent) return fail("INVALID_AGENT", "Agent is not registered.", 400);

    const { data, error } = await context.supabase
      .from("agent_workspaces")
      .upsert({
        owner_id: context.owner.user.id,
        agent_id: agent.id,
        display_name: agent.name
      }, { onConflict: "owner_id,agent_id" })
      .select("agent_id, display_name, created_at, updated_at")
      .single();

    if (error || !data) {
      return fail(
        "AGENT_STORAGE_UNAVAILABLE",
        "Could not create the workspace. Confirm migration 0003_agent_workspaces.sql has been applied.",
        503
      );
    }

    return NextResponse.json({
      workspace: data,
      executionEnabled: false,
      message: "Workspace created. This agent is not independently executable yet."
    }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("AGENT_SERVICE_UNAVAILABLE", "Agent services are not configured.", 503);
  }
}
