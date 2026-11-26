import { afterEach, describe, expect, it, vi } from "vitest";
import {
  generateAssistantReply,
  getChatCompletionsUrl,
  type ChatMessage
} from "../lib/ai/provider";

const messages: ChatMessage[] = [
  { role: "system", content: "You are FRIDAY." },
  { role: "user", content: "Hello." }
];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("AI provider URL validation", () => {
  it("normalises a provider base URL", () => {
    expect(getChatCompletionsUrl("https://api.example.com/"))
      .toBe("https://api.example.com/v1/chat/completions");
  });

  it("does not duplicate an existing v1 path", () => {
    expect(getChatCompletionsUrl("https://api.example.com/v1/"))
      .toBe("https://api.example.com/v1/chat/completions");
  });

  it("allows HTTP only for local development", () => {
    expect(getChatCompletionsUrl("http://localhost:1234"))
      .toBe("http://localhost:1234/v1/chat/completions");
    expect(getChatCompletionsUrl("http://api.example.com")).toBeNull();
  });

  it("rejects credentials, query strings and fragments", () => {
    expect(getChatCompletionsUrl("https://user:pass@api.example.com")).toBeNull();
    expect(getChatCompletionsUrl("https://api.example.com?token=secret")).toBeNull();
    expect(getChatCompletionsUrl("https://api.example.com#fragment")).toBeNull();
  });
});

describe("AI provider response handling", () => {
  it("rejects invalid conversation payloads before making a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAssistantReply([]);
    expect(result).toEqual({ ok: false, code: "AI_PROVIDER_INVALID_REQUEST" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns a trimmed assistant response from a valid provider payload", async () => {
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: "  Hello, Boss.  " } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    ));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAssistantReply(messages);
    expect(result).toMatchObject({ ok: true, content: "Hello, Boss." });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a provider response larger than the configured limit", async () => {
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_MODEL", "test-model");
    const oversized = " ".repeat(1_048_577);
    const fetchMock = vi.fn().mockResolvedValue(new Response(oversized, {
      status: 200,
      headers: { "Content-Length": String(oversized.length) }
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await generateAssistantReply(messages);
    expect(result).toEqual({ ok: false, code: "AI_PROVIDER_INVALID_RESPONSE" });
  });
});
