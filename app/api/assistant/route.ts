import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { generateAssistantReply } from "@/lib/ai/provider";
import { buildConversation } from "@/lib/ai/orchestrator";
import { evaluateRequestForApproval } from "@/lib/security/nexus";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";

const MAX_BODY_BYTES = 16_384;
const MAX_MESSAGE_LENGTH = 4_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_BODY_BYTES) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);

  let raw: string;
  try {
    raw = await request.text();
  } catch {
    return fail("INVALID_BODY", "Could not read request body.", 400);
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_BODY_BYTES) {
    return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
  }

  let payload: { message?: unknown; conversationId?: unknown; includeMemory?: unknown };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
    }
    payload = parsed as typeof payload;
  } catch {
    return fail("INVALID_JSON", "Send valid JSON.", 400);
  }

  if (typeof payload.message !== "string" || !payload.message.trim()) {
    return fail("MESSAGE_REQUIRED", "Add a message first.", 400);
  }
  if (payload.message.length > MAX_MESSAGE_LENGTH) {
    return fail("MESSAGE_TOO_LONG", "Messages must be 4,000 characters or fewer.", 413);
  }
  if (payload.conversationId !== undefined &&
      (typeof payload.conversationId !== "string" || !UUID_PATTERN.test(payload.conversationId))) {
    return fail("INVALID_CONVERSATION", "Conversation identifier is invalid.", 400);
  }
  if (payload.includeMemory !== undefined && typeof payload.includeMemory !== "boolean") {
    return fail("INVALID_MEMORY_OPTION", "includeMemory must be true or false.", 400);
  }

  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    return fail("AUTH_NOT_CONFIGURED", "Owner authentication is not configured.", 503);
  }
  if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return fail("DATABASE_NOT_CONFIGURED", "Private database access is not configured.", 503);
  }

  try {
    encryptPrivateData("configuration-check");
  } catch {
    return fail("PRIVATE_STORAGE_NOT_CONFIGURED", "Private storage is not configured with a valid encryption key.", 503);
  }
  const { data: withinLimit, error: rateLimitError } = await supabase.rpc(
    "consume_rate_limit",
    { p_limit: 15 }
  );
  if (rateLimitError) {
    await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "rate_limiter_unavailable",
      severity: "critical",
      details: { source: "assistant_api" }
    });
    return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is not configured. Apply the security migration.", 503);
  }
  if (!withinLimit) {
    await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "assistant_rate_limited",
      severity: "warning",
      details: { source: "assistant_api" }
    });
    return fail("RATE_LIMITED", "Too many requests. Wait a minute before trying again.", 429);
  }

  const nexusDecision = evaluateRequestForApproval(payload.message);
  if (!nexusDecision.allowed) {
    // The block remains effective even if audit storage is temporarily unavailable.
    await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "assistant_request_blocked",
      severity: "warning",
      details: { reason: nexusDecision.reason }
    });
    return NextResponse.json(
      {
        error: {
          code: "OWNER_APPROVAL_REQUIRED",
          message: "This request could have an external or irreversible effect. It needs a separate approval workflow before FRIDAY can act."
        },
        requiresApproval: true
      },
      { status: 409, headers: { "Cache-Control": "no-store" } }
    );
  }

  let conversationId = payload.conversationId as string | undefined;
  if (conversationId) {
    const { data, error } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", owner.user.id)
      .maybeSingle();
    if (error || !data) return fail("CONVERSATION_NOT_FOUND", "Conversation was not found.", 404);
  } else {
    const { data, error } = await supabase
      .from("conversations")
      .insert({ user_id: owner.user.id, title: "Private conversation" })
      .select("id")
      .single();
    if (error || !data) return fail("MEMORY_STORE_UNAVAILABLE", "Could not create a conversation. Check the database setup.", 503);
    conversationId = data.id;
  }

  const { data: history, error: historyError } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", owner.user.id)
    .order("created_at", { ascending: true })
    .limit(30);
  if (historyError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load conversation history.", 503);

  const userMessage = { role: "user" as const, content: payload.message.trim() };
  let savedMemories: string[] = [];
  if (payload.includeMemory === true) {
    const { data: memoryRows, error: memoryError } = await supabase
      .from("memories")
      .select("content")
      .eq("user_id", owner.user.id)
      .eq("retained", true)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (memoryError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load saved memory.", 503);
    try {
      savedMemories = (memoryRows ?? []).map(row => decryptPrivateData(row.content));
    } catch {
      return fail("PRIVATE_DATA_UNREADABLE", "Saved memory could not be decrypted. Check the encryption key.", 503);
    }
  }

  let providerMessages;
  try {
    providerMessages = buildConversation([
      ...(history ?? []).map(item => ({
        role: item.role as "user" | "assistant",
        content: decryptPrivateData(item.content)
      })),
      userMessage
    ], savedMemories);
  } catch {
    return fail("PRIVATE_DATA_UNREADABLE", "Conversation history could not be decrypted. Check the encryption key.", 503);
  }

  const generated = await generateAssistantReply(providerMessages);
  if (!generated.ok) {
    const status = generated.code === "AI_PROVIDER_NOT_CONFIGURED" ? 503 : 502;
    return fail(generated.code, generated.code === "AI_PROVIDER_NOT_CONFIGURED"
      ? "The AI model provider is not configured yet."
      : "The AI provider could not complete the request.", status);
  }

  const { error: saveUserError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: owner.user.id,
    role: "user",
    content: encryptPrivateData(userMessage.content)
  });
  if (saveUserError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not save your message.", 503);

  const { error: saveAssistantError } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    user_id: owner.user.id,
    role: "assistant",
    content: encryptPrivateData(generated.content)
  });
  if (saveAssistantError) return fail("MEMORY_STORE_UNAVAILABLE", "The reply was generated but could not be saved.", 503);

  return NextResponse.json(
    { conversationId, reply: generated.content },
    { headers: { "Cache-Control": "no-store" } }
  );
}
