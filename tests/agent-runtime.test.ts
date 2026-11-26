import { afterEach, describe, expect, it, vi } from "vitest";
import { executeAgentTask, resolveAgentModelConfig } from "../lib/agents/runtime";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("specialist model isolation", () => {
  it("requires a dedicated model for each specialist", () => {
    expect(resolveAgentModelConfig("oracle", { AI_BASE_URL: "https://api.example.com", AI_API_KEY: "secret", AI_MODEL: "general" })).toBeNull();
  });
  it("uses the exact specialist model configured for that agent", () => {
    expect(resolveAgentModelConfig("oracle", { AI_BASE_URL: "https://api.example.com/v1", AI_API_KEY: "secret", AI_ORACLE_MODEL: "research-model" })).toEqual({
      baseUrl: "https://api.example.com/v1", apiKey: "secret", model: "research-model"
    });
  });
  it("does not accept unsafe provider URLs", () => {
    expect(resolveAgentModelConfig("forge", { AI_BASE_URL: "http://example.com", AI_API_KEY: "secret", AI_FORGE_MODEL: "code-model" })).toBeNull();
  });
});


describe("specialist provider response handling", () => {
  const agent = { id: "forge" as const, name: "Forge", role: "software engineering" };

  it("returns a trimmed result from a valid provider response", async () => {
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_FORGE_MODEL", "code-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ choices: [{ message: { content: "  Tests passed.  " } }] }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    )));

    await expect(executeAgentTask(agent, "Review this function", [])).resolves.toEqual({
      ok: true, content: "Tests passed."
    });
  });

  it("rejects a response exceeding the byte limit from its content-length header", async () => {
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_FORGE_MODEL", "code-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", {
      status: 200, headers: { "Content-Length": "1048577" }
    })));

    await expect(executeAgentTask(agent, "Review this function", [])).resolves.toEqual({
      ok: false, code: "AGENT_PROVIDER_INVALID_RESPONSE"
    });
  });

  it("rejects a streamed response exceeding the byte limit without a content-length header", async () => {
    vi.stubEnv("AI_BASE_URL", "https://api.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");
    vi.stubEnv("AI_FORGE_MODEL", "code-model");
    const oversized = "x".repeat(1_048_577);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(oversized, { status: 200 })));

    await expect(executeAgentTask(agent, "Review this function", [])).resolves.toEqual({
      ok: false, code: "AGENT_PROVIDER_INVALID_RESPONSE"
    });
  });
});
