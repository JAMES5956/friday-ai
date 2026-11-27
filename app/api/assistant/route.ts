import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { generateAssistantReply } from "@/lib/ai/provider";
import { buildConversation } from "@/lib/ai/orchestrator";
import { evaluateRequestForApproval } from "@/lib/security/nexus";
import { createMemoryIntegrityDigest, decryptPrivateData, encryptPrivateData, verifyMemoryIntegrityDigest } from "@/lib/security/encryption";
import { recommendSpecialist } from "@/lib/agents/router";
import { isMemoryAvailableToModel } from "@/lib/memory/policy";
import { validateProjectPayload } from "@/lib/projects/policy";

const MAX_BODY_BYTES = 16_384;
const MAX_MESSAGE_LENGTH = 4_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}


export async function GET(request: Request) {
  let owner;
  try { owner = await getOwnerSession({ requireMfa: true }); }
  catch { return fail("AUTH_NOT_CONFIGURED", "Owner authentication is not configured.", 503); }
  if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try { supabase = await createClient(); }
  catch { return fail("DATABASE_NOT_CONFIGURED", "Private database access is not configured.", 503); }

  const url = new URL(request.url);
  const requestedId = url.searchParams.get("conversationId");
  if (requestedId && !UUID_PATTERN.test(requestedId)) {
    return fail("INVALID_CONVERSATION", "Conversation identifier is invalid.", 400);
  }

  if (!requestedId) {
    const { data, error } = await supabase.from("conversations")
      .select("id, title, updated_at")
      .eq("user_id", owner.user.id)
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load conversations.", 503);
    return NextResponse.json({ conversations: data ?? [], providerConfigured: Boolean(process.env.AI_BASE_URL && process.env.AI_API_KEY && (process.env.AI_MODEL || process.env.AI_FAST_MODEL || process.env.AI_REASONING_MODEL)) }, { headers: { "Cache-Control": "no-store" } });
  }

  const { data: conversation, error: conversationError } = await supabase.from("conversations")
    .select("id, title, updated_at")
    .eq("id", requestedId)
    .eq("user_id", owner.user.id)
    .maybeSingle();
  if (conversationError || !conversation) return fail("CONVERSATION_NOT_FOUND", "Conversation was not found.", 404);

  const { data: rows, error } = await supabase.from("messages")
    .select("id, role, content, integrity_digest, integrity_version, created_at")
    .eq("conversation_id", requestedId)
    .eq("user_id", owner.user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load conversation history.", 503);

  try {
    const messages = (rows ?? []).slice().reverse().map(row => {
      if (row.integrity_digest !== null && (row.integrity_version !== 1 ||
          !verifyMemoryIntegrityDigest(owner.user!.id, row.id, row.content, row.integrity_digest, "message"))) throw new Error("Message integrity mismatch");
      return { role: row.role as "user" | "assistant", content: decryptPrivateData(row.content), createdAt: row.created_at };
    });
    return NextResponse.json({ conversation, messages }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("PRIVATE_DATA_UNREADABLE", "Conversation history could not be verified or decrypted. Older unsigned messages must be reviewed before this conversation can continue.", 503);
  }
}


export async function DELETE(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_024) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
  let payload: { conversationId?: unknown };
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 1_024) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
    payload = parsed as typeof payload;
  } catch { return fail("INVALID_JSON", "Send valid JSON.", 400); }
  if (typeof payload.conversationId !== "string" || !UUID_PATTERN.test(payload.conversationId)) return fail("INVALID_CONVERSATION", "Conversation identifier is invalid.", 400);

  let owner;
  try { owner = await getOwnerSession({ requireMfa: true }); }
  catch { return fail("AUTH_NOT_CONFIGURED", "Owner authentication is not configured.", 503); }
  if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);
  let supabase: Awaited<ReturnType<typeof createClient>>;
  try { supabase = await createClient(); }
  catch { return fail("DATABASE_NOT_CONFIGURED", "Private database access is not configured.", 503); }

  const { data: withinLimit, error: rateLimitError } = await supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (rateLimitError) return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is unavailable.", 503);
  if (!withinLimit) return fail("RATE_LIMITED", "Too many requests. Wait before trying again.", 429);

  const { data, error } = await supabase.from("conversations").delete()
    .eq("id", payload.conversationId).eq("user_id", owner.user.id).select("id").maybeSingle();
  if (error) return fail("CONVERSATION_DELETE_FAILED", "Could not delete this conversation.", 503);
  if (!data) return fail("CONVERSATION_NOT_FOUND", "Conversation was not found.", 404);
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
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

  let payload: { message?: unknown; conversationId?: unknown; includeMemory?: unknown; knowledgeRecordIds?: unknown; projectRecordIds?: unknown };
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
  if (payload.knowledgeRecordIds !== undefined && (!Array.isArray(payload.knowledgeRecordIds) || payload.knowledgeRecordIds.length > 5 || payload.knowledgeRecordIds.some(id => typeof id !== "string" || !UUID_PATTERN.test(id)) || new Set(payload.knowledgeRecordIds).size !== payload.knowledgeRecordIds.length)) {
    return fail("INVALID_KNOWLEDGE_SELECTION", "Select up to five valid, unique archive records.", 400);
  }

  if (payload.projectRecordIds !== undefined && (!Array.isArray(payload.projectRecordIds) || payload.projectRecordIds.length > 3 || payload.projectRecordIds.some(id => typeof id !== "string" || !UUID_PATTERN.test(id)) || new Set(payload.projectRecordIds).size !== payload.projectRecordIds.length)) {
    return fail("INVALID_PROJECT_SELECTION", "Select up to three valid, unique projects.", 400);
  }

  let owner;
  try {
    owner = await getOwnerSession({ requireMfa: true });
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
    const { error: auditError } = await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "rate_limiter_unavailable",
      severity: "critical",
      details: { source: "assistant_api" }
    });
    if (auditError) console.error("NEXUS could not record the rate-limiter failure event.");
    return fail("SECURITY_LIMITER_UNAVAILABLE", "NEXUS request protection is not configured. Apply the security migration.", 503);
  }
  if (!withinLimit) {
    const { error: auditError } = await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "assistant_rate_limited",
      severity: "warning",
      details: { source: "assistant_api" }
    });
    if (auditError) console.error("NEXUS could not record a rate-limit event.");
    return fail("RATE_LIMITED", "Too many requests. Wait a minute before trying again.", 429);
  }

  const nexusDecision = evaluateRequestForApproval(payload.message);
  if (!nexusDecision.allowed) {
    // Never allow a sensitive request through because audit storage failed.
    const { error: auditError } = await supabase.from("security_audit_events").insert({
      user_id: owner.user.id,
      event_type: "assistant_request_blocked",
      severity: "warning",
      details: { reason: nexusDecision.reason }
    });
    if (auditError) {
      console.error("NEXUS blocked a sensitive request but could not persist its audit event.");
      return fail(
        "NEXUS_AUDIT_UNAVAILABLE",
        "This request remains blocked because its security event could not be recorded. Try again later.",
        503
      );
    }
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
    .select("id, role, content, integrity_digest, integrity_version")
    .eq("conversation_id", conversationId)
    .eq("user_id", owner.user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (historyError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load conversation history.", 503);

  const userMessage = { role: "user" as const, content: payload.message.trim() };
  let savedMemories: string[] = [];
  if (payload.includeMemory === true) {
    const { data: memoryRows, error: memoryError } = await supabase
      .from("memories")
      .select("id, content, sensitivity, expires_at, integrity_digest, integrity_version")
      .eq("user_id", owner.user.id)
      .eq("retained", true)
      .order("updated_at", { ascending: false })
      .limit(25);
    if (memoryError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not load saved memory.", 503);
    const retainedRows = memoryRows ?? [];
    const integrityFailure = retainedRows.some(row =>
      row.integrity_digest !== null &&
      (row.integrity_version !== 1 || !verifyMemoryIntegrityDigest(owner.user.id, row.id, row.content, row.integrity_digest))
    );
    if (integrityFailure) return fail("MEMORY_INTEGRITY_FAILED", "NEXUS detected a saved-memory integrity mismatch. Memory context has been blocked; review the integrity centre.", 503);
    try {
      savedMemories = retainedRows
        .filter(row => row.integrity_version === 1 && row.integrity_digest && isMemoryAvailableToModel(row.sensitivity, row.expires_at))
        .map(row => decryptPrivateData(row.content));
    } catch {
      return fail("PRIVATE_DATA_UNREADABLE", "Saved memory could not be decrypted. Check the encryption key.", 503);
    }
  }

  let selectedKnowledge: string[] = [];
  const selectedIds = (payload.knowledgeRecordIds ?? []) as string[];
  if (selectedIds.length) {
    const { data: knowledgeRows, error: knowledgeError } = await supabase.from("knowledge_records")
      .select("id, sensitivity, expires_at, payload_ciphertext, integrity_digest, integrity_version")
      .eq("owner_id", owner.user.id)
      .eq("status", "active")
      .in("sensitivity", ["routine", "internal"])
      .in("id", selectedIds);
    if (knowledgeError) return fail("KNOWLEDGE_STORE_UNAVAILABLE", "Could not load selected archive records.", 503);
    const eligibleRows = (knowledgeRows ?? []).filter(row => !row.expires_at || new Date(row.expires_at).getTime() > Date.now());
    if (eligibleRows.length !== selectedIds.length) {
      return fail("KNOWLEDGE_SELECTION_UNAVAILABLE", "One or more selected records are expired, restricted, archived or unavailable.", 400);
    }
    try {
      selectedKnowledge = eligibleRows.map(row => {
        if (row.integrity_version !== 1 || typeof row.integrity_digest !== "string" ||
            !verifyMemoryIntegrityDigest(owner.user.id, row.id, row.payload_ciphertext, row.integrity_digest, "knowledge")) {
          throw new Error("Knowledge archive integrity mismatch");
        }
        const decoded = JSON.parse(decryptPrivateData(row.payload_ciphertext));
        if (!decoded || typeof decoded.title !== "string" || typeof decoded.body !== "string") throw new Error("Invalid archive payload");
        return JSON.stringify({ title: decoded.title, body: decoded.body, rationale: decoded.rationale, project: decoded.project });
      });
      if (selectedKnowledge.join("").length > 12_000) {
        return fail("KNOWLEDGE_CONTEXT_TOO_LARGE", "The selected archive context is too large. Choose fewer or shorter records.", 413);
      }
    } catch {
      return fail("PRIVATE_DATA_UNREADABLE", "Selected archive records could not be decrypted. Check the encryption key.", 503);
    }
  }

  let selectedProjects: string[] = [];
  const selectedProjectIds = (payload.projectRecordIds ?? []) as string[];
  if (selectedProjectIds.length) {
    const { data: projectRows, error: projectError } = await supabase.from("project_records")
      .select("id, payload_ciphertext, integrity_digest, integrity_version").eq("owner_id", owner.user.id).in("id", selectedProjectIds);
    if (projectError) return fail("PROJECT_STORE_UNAVAILABLE", "Could not load selected project context. Apply migration 0008 if it is pending.", 503);
    if ((projectRows ?? []).length !== selectedProjectIds.length) return fail("PROJECT_SELECTION_UNAVAILABLE", "One or more selected projects are unavailable.", 400);
    if ((projectRows ?? []).some(row => row.integrity_version !== 1 || !row.integrity_digest)) {
      return fail("PROJECT_SELECTION_UNAVAILABLE", "A selected project is legacy and must be reviewed and sealed before it can enter FRIDAY context.", 409);
    }
    try {
      selectedProjects = (projectRows ?? []).map(row => {
        if (!verifyMemoryIntegrityDigest(owner.user.id, row.id, row.payload_ciphertext, row.integrity_digest!, "project")) {
          throw new Error("Project integrity mismatch");
        }
        const project = JSON.parse(decryptPrivateData(row.payload_ciphertext));
        if (!validateProjectPayload(project) || project.status === "archived") throw new Error("Unavailable project");
        return JSON.stringify({ title: project.title, purpose: project.purpose, status: project.status, priority: project.priority, milestones: project.milestones, tasks: project.tasks, progressUpdates: Array.isArray(project.progressUpdates) ? project.progressUpdates.slice(0, 5) : [], blockers: project.blockers });
      });
      if (selectedProjects.join("").length > 10_000) return fail("PROJECT_CONTEXT_TOO_LARGE", "Selected project context is too large. Choose fewer or shorter projects.", 413);
    } catch { return fail("PRIVATE_DATA_UNREADABLE", "Selected project records could not be decrypted or validated.", 503); }
  }

  let providerMessages;
  try {
    providerMessages = buildConversation([
      ...(history ?? []).slice().reverse().map(item => ({
        role: item.role as "user" | "assistant",
        content: (() => {
          if (item.integrity_digest === null && item.integrity_version === null) throw new Error("Legacy conversation message requires review");
          if (item.integrity_version !== 1 || typeof item.integrity_digest !== "string" ||
              !verifyMemoryIntegrityDigest(owner.user!.id, item.id, item.content, item.integrity_digest, "message")) throw new Error("Message integrity mismatch");
          return decryptPrivateData(item.content);
        })()
      })),
      userMessage
    ], savedMemories, selectedKnowledge, selectedProjects);
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

  const userMessageId = randomUUID();
  const userCiphertext = encryptPrivateData(userMessage.content);
  const { error: saveUserError } = await supabase.from("messages").insert({
    id: userMessageId, conversation_id: conversationId, user_id: owner.user.id, role: "user",
    content: userCiphertext, integrity_digest: createMemoryIntegrityDigest(owner.user.id, userMessageId, userCiphertext, "message"), integrity_version: 1
  });
  if (saveUserError) return fail("MEMORY_STORE_UNAVAILABLE", "Could not save your message.", 503);

  const assistantMessageId = randomUUID();
  const assistantCiphertext = encryptPrivateData(generated.content);
  const { error: saveAssistantError } = await supabase.from("messages").insert({
    id: assistantMessageId, conversation_id: conversationId, user_id: owner.user.id, role: "assistant",
    content: assistantCiphertext, integrity_digest: createMemoryIntegrityDigest(owner.user.id, assistantMessageId, assistantCiphertext, "message"), integrity_version: 1
  });
  if (saveAssistantError) return fail("MEMORY_STORE_UNAVAILABLE", "The reply was generated but could not be saved.", 503);

  const { error: timestampError } = await supabase.from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", owner.user.id);
  if (timestampError) console.error("FRIDAY could not refresh the conversation timestamp.");

  return NextResponse.json(
    { conversationId, reply: generated.content, modelTier: generated.modelTier, specialistRecommendation: recommendSpecialist(userMessage.content) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
