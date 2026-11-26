import { afterEach, describe, expect, it } from "vitest";
import { createMemoryIntegrityDigest, verifyMemoryIntegrityDigest } from "../lib/security/encryption";

const originalKey = process.env.FRIDAY_DATA_ENCRYPTION_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.FRIDAY_DATA_ENCRYPTION_KEY;
  else process.env.FRIDAY_DATA_ENCRYPTION_KEY = originalKey;
});

describe("NEXUS memory integrity signatures", () => {
  it("verifies a keyed digest bound to owner, memory ID and ciphertext", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const digest = createMemoryIntegrityDigest("owner-a", "memory-a", "friday:v1:example");
    expect(verifyMemoryIntegrityDigest("owner-a", "memory-a", "friday:v1:example", digest)).toBe(true);
  });

  it("rejects a changed ciphertext, owner, record ID or malformed digest", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const digest = createMemoryIntegrityDigest("owner-a", "memory-a", "ciphertext-a");
    expect(verifyMemoryIntegrityDigest("owner-a", "memory-a", "ciphertext-b", digest)).toBe(false);
    expect(verifyMemoryIntegrityDigest("owner-b", "memory-a", "ciphertext-a", digest)).toBe(false);
    expect(verifyMemoryIntegrityDigest("owner-a", "memory-b", "ciphertext-a", digest)).toBe(false);
    expect(verifyMemoryIntegrityDigest("owner-a", "memory-a", "ciphertext-a", "not-a-digest")).toBe(false);
  });

  it("uses domain-separated signatures for each encrypted record store", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const digest = createMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", "knowledge");
    expect(verifyMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", digest, "knowledge")).toBe(true);
    expect(verifyMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", digest, "project")).toBe(false);
    expect(verifyMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", digest, "agent_memory")).toBe(false);
  });

  it("keeps conversation, task, result and task-event signatures domain-separated", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 13).toString("base64");
    const domains = ["message", "agent_task", "agent_task_result", "agent_task_event"] as const;
    for (const domain of domains) {
      const digest = createMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", domain);
      expect(verifyMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", digest, domain)).toBe(true);
      for (const otherDomain of domains.filter(candidate => candidate !== domain)) {
        expect(verifyMemoryIntegrityDigest("owner-a", "record-a", "ciphertext-a", digest, otherDomain)).toBe(false);
      }
    }
  });

  it("fails closed when the encryption key is unavailable", () => {
    delete process.env.FRIDAY_DATA_ENCRYPTION_KEY;
    expect(() => createMemoryIntegrityDigest("owner", "memory", "ciphertext")).toThrow();
  });
});
