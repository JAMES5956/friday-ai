import { describe, expect, it } from "vitest";
import { getMemoryExpiry, isMemoryAvailableToModel, isMemorySensitivity } from "../lib/memory/policy";

describe("memory sensitivity policy", () => {
  it("accepts only the three supported sensitivity levels", () => {
    expect(isMemorySensitivity("routine")).toBe(true);
    expect(isMemorySensitivity("internal")).toBe(true);
    expect(isMemorySensitivity("restricted")).toBe(true);
    expect(isMemorySensitivity("secret")).toBe(false);
    expect(isMemorySensitivity(null)).toBe(false);
  });

  it("never makes restricted memories available to AI models", () => {
    expect(isMemoryAvailableToModel("restricted", null)).toBe(false);
    expect(isMemoryAvailableToModel("internal", null)).toBe(true);
    expect(isMemoryAvailableToModel("routine", null)).toBe(true);
  });

  it("excludes expired or malformed-expiry memories from model context", () => {
    const now = Date.UTC(2026, 0, 1);
    expect(isMemoryAvailableToModel("internal", new Date(now + 1000).toISOString(), now)).toBe(true);
    expect(isMemoryAvailableToModel("internal", new Date(now - 1000).toISOString(), now)).toBe(false);
    expect(isMemoryAvailableToModel("internal", "not-a-date", now)).toBe(false);
  });
});

describe("memory retention policy", () => {
  it("supports indefinite owner-controlled retention", () => {
    expect(getMemoryExpiry(undefined, 0)).toBeNull();
    expect(getMemoryExpiry(null, 0)).toBeNull();
  });

  it("calculates an explicit expiry", () => {
    expect(getMemoryExpiry(30, 0)).toBe(new Date(30 * 86_400_000).toISOString());
  });

  it("rejects invalid expiry periods", () => {
    for (const value of [0, -1, 1.5, 3651, "30"]) {
      expect(getMemoryExpiry(value, 0)).toBeUndefined();
    }
  });
});
