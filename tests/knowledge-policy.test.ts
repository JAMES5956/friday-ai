import { describe, expect, it } from "vitest";
import { getArchiveExpiry, isRecordStatus, isRecordType, isSensitivity, validateKnowledgePayload } from "../lib/knowledge/policy";

describe("knowledge archive policy", () => {
  it("accepts only supported record types, statuses and sensitivities", () => {
    expect(isRecordType("knowledge")).toBe(true);
    expect(isRecordType("decision")).toBe(true);
    expect(isRecordType("secret")).toBe(false);
    expect(isRecordStatus("superseded")).toBe(true);
    expect(isRecordStatus("deleted")).toBe(false);
    expect(isSensitivity("restricted")).toBe(true);
    expect(isSensitivity("public")).toBe(false);
  });

  it("validates encrypted record payload shape and bounds", () => {
    expect(validateKnowledgePayload({ title: "Decision", body: "Proceed after review.", rationale: "Risk is acceptable.", confidence: 0.8 })).toBe(true);
    expect(validateKnowledgePayload({ title: "", body: "Missing title" })).toBe(false);
    expect(validateKnowledgePayload({ title: "Bad confidence", body: "Body", confidence: 2 })).toBe(false);
    expect(validateKnowledgePayload({ title: "Bad source", body: "Body", sources: [{ label: "Source", url: 42 }] })).toBe(false);
    expect(validateKnowledgePayload({ title: "Unsafe source", body: "Body", sources: [{ label: "Source", url: "javascript:alert(1)" }] })).toBe(false);
    expect(validateKnowledgePayload({ title: "Safe source", body: "Body", sources: [{ label: "Source", url: "https://example.com/report" }] })).toBe(true);
  });

  it("supports never-expire and bounded retention", () => {
    expect(getArchiveExpiry("never")).toBeNull();
    expect(getArchiveExpiry(30)).toBeTypeOf("string");
    expect(getArchiveExpiry(0)).toBeUndefined();
    expect(getArchiveExpiry(3651)).toBeUndefined();
  });
});
