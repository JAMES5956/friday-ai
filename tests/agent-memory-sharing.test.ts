import { describe, expect, it } from "vitest";
import { canShareMemory, isUnexpired } from "../lib/agents/memory-sharing";

describe("owner-controlled agent memory sharing", () => {
  it("allows a non-restricted memory to be shared between registered specialists", () => {
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
  it("keeps FRIDAY and NEXUS outside ordinary specialist sharing", () => {
    expect(canShareMemory("friday", "forge", "routine")).toBe(false);
    expect(canShareMemory("oracle", "friday", "routine")).toBe(false);
    expect(canShareMemory("nexus", "oracle", "routine")).toBe(false);
    expect(canShareMemory("oracle", "nexus", "routine")).toBe(false);
  });
});

describe("memory expiry", () => {
  it("treats null expiry as permanent until deleted", () => {
    expect(isUnexpired(null, 1000)).toBe(true);
  });
  it("rejects expired and malformed expiry timestamps", () => {
    expect(isUnexpired("2026-01-01T00:00:00.000Z", Date.parse("2026-01-02T00:00:00.000Z"))).toBe(false);
    expect(isUnexpired("not-a-date", 1000)).toBe(false);
  });
  it("accepts a future expiry", () => {
    expect(isUnexpired("2026-01-02T00:00:00.000Z", Date.parse("2026-01-01T00:00:00.000Z"))).toBe(true);
  });
});
