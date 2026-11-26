import { describe, expect, it } from "vitest";
import { recommendSpecialist } from "../lib/agents/router";
import { coreSpecialistAgents, specialistAgents } from "../lib/agents/registry";

describe("FRIDAY specialist directory", () => {
  it("contains exactly the eight approved core specialists", () => {
    expect(coreSpecialistAgents.map(agent => agent.id)).toEqual([
      "atlas", "oracle", "forge", "byte", "vantage", "sage", "pixel", "scout"
    ]);
  });

  it("keeps FRIDAY and NEXUS outside the eight-agent specialist group", () => {
    expect(specialistAgents.find(agent => agent.id === "friday")?.reportsTo).toBe("owner");
    expect(specialistAgents.find(agent => agent.id === "nexus")?.reportsTo).toBe("owner");
    expect(coreSpecialistAgents.some(agent => agent.id === "nexus" || agent.id === "friday")).toBe(false);
  });
});

describe("FRIDAY specialist recommendations", () => {
  it("routes software implementation and debugging to BYTE", () =>
    expect(recommendSpecialist("Help me debug this TypeScript API")).toMatchObject({ agentId: "byte" }));

  it("routes engineering and robotics work to FORGE", () =>
    expect(recommendSpecialist("Assess the feasibility of a robotics hardware prototype")).toMatchObject({ agentId: "forge" }));

  it("routes scholarship searches to SCOUT", () =>
    expect(recommendSpecialist("Find scholarship opportunities and grants")).toMatchObject({ agentId: "scout" }));

  it("routes financial and trading analysis to VANTAGE", () =>
    expect(recommendSpecialist("Prepare a cash flow forecast and trading risk analysis")).toMatchObject({ agentId: "vantage" }));

  it("routes research to ORACLE", () =>
    expect(recommendSpecialist("Research this topic and find sources")).toMatchObject({ agentId: "oracle" }));

  it("routes mathematics and science learning to SAGE", () =>
    expect(recommendSpecialist("Teach me calculus and physics")).toMatchObject({ agentId: "sage" }));

  it("routes creative scripts to PIXEL", () =>
    expect(recommendSpecialist("Write a creative video script")).toMatchObject({ agentId: "pixel" }));

  it("routes strategy and operations to ATLAS", () =>
    expect(recommendSpecialist("Create a long term strategic roadmap")).toMatchObject({ agentId: "atlas" }));

  it("does not guess on vague requests", () => {
    expect(recommendSpecialist("Hello Friday")).toBeNull();
    expect(recommendSpecialist("What do you think?")).toBeNull();
  });

  it("returns no recommendation on an ambiguous tie", () =>
    expect(recommendSpecialist("Create a business plan and financial analysis")).toBeNull());
});
