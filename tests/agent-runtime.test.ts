import { describe, expect, it } from "vitest";
import { resolveAgentModelConfig } from "../lib/agents/runtime";

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
