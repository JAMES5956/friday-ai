import { afterEach, describe, expect, it } from "vitest";
import {
  createBackupSignature, createMemoryIntegrityDigest, encryptPrivateData, verifyBackupSignature
} from "../lib/security/encryption";
import { getBackupReadiness, inspectBackupTables, type BackupTables } from "../lib/security/backup-integrity";

const originalKey = process.env.FRIDAY_DATA_ENCRYPTION_KEY;
const TEST_KEY = Buffer.alloc(32, 11).toString("base64");

afterEach(() => {
  if (originalKey === undefined) delete process.env.FRIDAY_DATA_ENCRYPTION_KEY;
  else process.env.FRIDAY_DATA_ENCRYPTION_KEY = originalKey;
});

function signedRow(ownerId: string, id: string, domain: string, ciphertextField: string, digestField = "integrity_digest", versionField = "integrity_version") {
  const ciphertext = encryptPrivateData("protected test record");
  return {
    id, owner_id: ownerId, user_id: ownerId, [ciphertextField]: ciphertext,
    [digestField]: createMemoryIntegrityDigest(ownerId, id, ciphertext, domain),
    [versionField]: 1
  };
}

describe("NEXUS backup signatures", () => {
  it("verifies a backup signature bound to the owner and canonical payload", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const payload = JSON.stringify({ format: "friday-ai-owner-backup", version: 1, tables: { memories: [] } });
    const signature = createBackupSignature("owner-a", payload);
    expect(verifyBackupSignature("owner-a", payload, signature)).toBe(true);
  });

  it("rejects changed backup content, a different owner and malformed signatures", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const payload = JSON.stringify({ format: "friday-ai-owner-backup", version: 1 });
    const signature = createBackupSignature("owner-a", payload);
    expect(verifyBackupSignature("owner-a", payload + " ", signature)).toBe(false);
    expect(verifyBackupSignature("owner-b", payload, signature)).toBe(false);
    expect(verifyBackupSignature("owner-a", payload, "invalid")).toBe(false);
  });

  it("requires valid record-bound signatures for every encrypted work store", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const records = [
      { id: "message-1", domain: "message" },
      { id: "task-1", domain: "agent_task" },
      { id: "task-1", domain: "agent_task_result" },
      { id: "event-1", domain: "agent_task_event" }
    ];
    for (const record of records) {
      const ciphertext = encryptPrivateData("protected test record");
      const digest = createMemoryIntegrityDigest("owner-a", record.id, ciphertext, record.domain);
      expect(digest).toMatch(/^[a-f0-9]{64}$/);
    }
  });
});

describe("NEXUS backup recovery inspection", () => {
  it("blocks cross-owner records before recovery", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const tables: BackupTables = {
      conversations: [{ id: "conversation-1", user_id: "owner-b" }]
    };
    const report = inspectBackupTables("owner-a", tables);
    expect(report.tampered).toBe(1);
    expect(report.issues).toContainEqual({ table: "conversations", code: "owner_mismatch" });
    expect(getBackupReadiness(report)).toBe("blocked");
  });

  it("blocks ciphertext changed after its record signature was created", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const row = signedRow("owner-a", "message-1", "message", "content");
    row.content = encryptPrivateData("different protected content");
    const report = inspectBackupTables("owner-a", { messages: [row] });
    expect(report.tampered).toBe(1);
    expect(report.issues).toContainEqual({ table: "messages", code: "integrity_mismatch" });
    expect(getBackupReadiness(report)).toBe("blocked");
  });

  it("classifies valid encrypted legacy unsigned records as review-required", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const report = inspectBackupTables("owner-a", {
      memories: [{ id: "memory-1", user_id: "owner-a", content: encryptPrivateData("legacy content") }]
    });
    expect(report.legacyUnsealed).toBe(1);
    expect(report.unreadable).toBe(0);
    expect(getBackupReadiness(report)).toBe("review_required");
  });

  it("rejects unsupported integrity versions and malformed digests", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const unsupported = signedRow("owner-a", "message-1", "message", "content");
    unsupported.integrity_version = 2;
    const malformed = signedRow("owner-a", "message-2", "message", "content");
    malformed.integrity_digest = "not-a-digest";
    const report = inspectBackupTables("owner-a", { messages: [unsupported, malformed] });
    expect(report.tampered).toBe(2);
    expect(getBackupReadiness(report)).toBe("blocked");
  });

  it("allows absent optional task results and event details without false failures", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const task = signedRow("owner-a", "task-1", "agent_task", "task_ciphertext",
      "task_integrity_digest", "task_integrity_version");
    task.result_ciphertext = null;
    const event = { id: "event-1", owner_id: "owner-a", details_ciphertext: null };
    const report = inspectBackupTables("owner-a", { agent_tasks: [task], agent_task_events: [event] });
    expect(report.tampered).toBe(0);
    expect(report.unreadable).toBe(0);
    expect(getBackupReadiness(report)).toBe("ready");
  });

  it("blocks duplicate record IDs within a table", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    const report = inspectBackupTables("owner-a", {
      conversations: [
        { id: "same-id", user_id: "owner-a" },
        { id: "same-id", user_id: "owner-a" }
      ]
    });
    expect(report.issues).toContainEqual({ table: "conversations", code: "duplicate_id" });
    expect(getBackupReadiness(report)).toBe("blocked");
  });
});
