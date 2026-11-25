import { describe, expect, it } from "vitest";
import { specialistAgents } from "../lib/agents/registry";

function canShareMemory(fromAgentId: string, toAgentId: string, sensitivity: string) {
  return specialistAgents.some(agent => agent.id === fromAgentId) &&
    specialistAgents.some(agent => agent.id === toAgentId) &&
    fromAgentId !== toAgentId && sensitivity !== "restricted";
}
describe("owner-controlled agent memory sharing", () => {
  it("allows a non-restricted memory to be shared between registered agents", () => {
    expect(canShareMemory("oracle", "forge", "internal")).toBe(true);
  });
  it("blocks restricted memories", () => {
    expect(canShareMemory("oracle", "forge", "restricted")).toBe(false);
  });
  it("blocks sharing to the same agent", () => {
    expect(canShareMemory("oracle", "oracle", "routine")).toBe(false);
  });
  it("blocks unregistered agent IDs", () => {
    expect(canShareMemory("unknown", "forge", "routine")).toBe(false);
  });
});
