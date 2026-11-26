import { resolveModelForTier, selectModelTier } from "./model-router";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

const MAX_MESSAGES = 40;
const MAX_INPUT_CHARACTERS = 128_000;
const MAX_RESPONSE_BYTES = 1_048_576;

export function getChatCompletionsUrl(baseUrl: string): string | null {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocalHttp = parsed.protocol === "http:" && localHosts.has(parsed.hostname);

  if (parsed.protocol !== "https:" && !isLocalHttp) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;

  return normalized.endsWith("/v1")
    ? normalized + "/chat/completions"
    : normalized + "/v1/chat/completions";
}

function validateMessages(messages: ChatMessage[]): boolean {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return false;
  }

  let totalCharacters = 0;
  for (const message of messages) {
    if (
      !message ||
      !["system", "user", "assistant"].includes(message.role) ||
      typeof message.content !== "string" ||
      message.content.length === 0
    ) {
      return false;
    }
    totalCharacters += message.content.length;
    if (totalCharacters > MAX_INPUT_CHARACTERS) return false;
  }

  return true;
}

async function readBoundedJson(response: Response): Promise<ProviderResponse | null> {
  const declaredLength = Number(response.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_RESPONSE_BYTES || !response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as ProviderResponse;
  } catch {
    return null;
  }
}

export async function generateAssistantReply(messages: ChatMessage[], timeoutMs = 45_000) {
  if (!validateMessages(messages)) {
    return { ok: false as const, code: "AI_PROVIDER_INVALID_REQUEST" };
  }

  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY?.trim();
  const requestedTier = selectModelTier(messages);
  const selected = resolveModelForTier(requestedTier);

  if (!baseUrl || !apiKey || !selected.model) {
    return { ok: false as const, code: "AI_PROVIDER_NOT_CONFIGURED" };
  }

  let endpoint: string | null;
  try {
    endpoint = getChatCompletionsUrl(baseUrl);
  } catch {
    endpoint = null;
  }
  if (!endpoint) return { ok: false as const, code: "AI_PROVIDER_URL_INVALID" };

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: selected.model,
        messages,
        temperature: selected.configuredTier === "reasoning" ? 0.3 : 0.4,
        max_tokens: selected.configuredTier === "reasoning" ? 2000 : 1200
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(Math.max(1_000, Math.min(timeoutMs, 45_000)))
    });
  } catch {
    return { ok: false as const, code: "AI_PROVIDER_UNREACHABLE" };
  }

  if (!response.ok) return { ok: false as const, code: "AI_PROVIDER_ERROR" };

  let payload: ProviderResponse | null;
  try {
    payload = await readBoundedJson(response);
  } catch {
    return { ok: false as const, code: "AI_PROVIDER_INVALID_RESPONSE" };
  }
  if (!payload) return { ok: false as const, code: "AI_PROVIDER_INVALID_RESPONSE" };

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false as const, code: "AI_PROVIDER_EMPTY_RESPONSE" };
  }

  return {
    ok: true as const,
    content: content.trim(),
    modelTier: selected.configuredTier
  };
}
