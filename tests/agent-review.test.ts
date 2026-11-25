import { describe, expect, it } from "vitest";
import { buildSpecialistReviewPrompt } from "../lib/agents/review";

describe("FRIDAY specialist result review", () => {
  it("includes specialist identity, task and result", () => {
    const prompt = buildSpecialistReviewPrompt("ORACLE", "Research competitors", "Found three relevant competitors.");
    expect(prompt).toContain("ORACLE");
    expect(prompt).toContain("Research competitors");
    expect(prompt).toContain("Found three relevant competitors.");
    expect(prompt).toContain("untrusted analysis");
  });
  it("keeps the assistant message within the API message limit", () => {
    expect(buildSpecialistReviewPrompt("FORGE", "Review code", "x".repeat(10000)).length).toBeLessThanOrEqual(4000);
  });
});
