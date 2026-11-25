export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type ProviderResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
  error?: { message?: string };
};

function getChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, "");
  const parsed = new URL(normalized);
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const isLocalHttp = parsed.protocol === "http:" && localHosts.has(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalHttp) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) return null;

  return normalized.endsWith("/v1")
    ? `${normalized}/chat/completions`
    : `${normalized}/v1/chat/completions`;
}

export async function generateAssistantReply(messages: ChatMessage[]) {
  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;

  if (!baseUrl || !apiKey || !model) {
    return { ok: false as const, code: "AI_PROVIDER_NOT_CONFIGURED" };
  }

  let endpoint: string | null;
  try {
    endpoint = getChatCompletionsUrl(baseUrl);
  } catch {
    endpoint = null;
  }
  if (!endpoint) {
    return { ok: false as const, code: "AI_PROVIDER_URL_INVALID" };
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.4,
        max_tokens: 1200
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(45_000)
    });
  } catch {
    return { ok: false as const, code: "AI_PROVIDER_UNREACHABLE" };
  }

  if (!response.ok) {
    return { ok: false as const, code: "AI_PROVIDER_ERROR" };
  }

  let payload: ProviderResponse;
  try {
    payload = (await response.json()) as ProviderResponse;
  } catch {
    return { ok: false as const, code: "AI_PROVIDER_INVALID_RESPONSE" };
  }

  const content = payload.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    return { ok: false as const, code: "AI_PROVIDER_EMPTY_RESPONSE" };
  }

  return { ok: true as const, content: content.trim() };
}
