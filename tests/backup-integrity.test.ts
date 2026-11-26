import { afterEach, describe, expect, it } from "vitest";
import { createBackupSignature, verifyBackupSignature } from "../lib/security/encryption";

const originalKey = process.env.FRIDAY_DATA_ENCRYPTION_KEY;
afterEach(() => {
  if (originalKey === undefined) delete process.env.FRIDAY_DATA_ENCRYPTION_KEY;
  else process.env.FRIDAY_DATA_ENCRYPTION_KEY = originalKey;
});

describe("NEXUS backup signatures", () => {
  it("verifies a backup signature bound to the owner and canonical payload", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const payload = JSON.stringify({ format: "friday-ai-owner-backup", version: 1, tables: { memories: [] } });
    const signature = createBackupSignature("owner-a", payload);
    expect(verifyBackupSignature("owner-a", payload, signature)).toBe(true);
  });

  it("rejects changed backup content, a different owner and malformed signatures", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 11).toString("base64");
    const payload = JSON.stringify({ format: "friday-ai-owner-backup", version: 1 });
    const signature = createBackupSignature("owner-a", payload);
    expect(verifyBackupSignature("owner-a", payload + " ", signature)).toBe(false);
    expect(verifyBackupSignature("owner-b", payload, signature)).toBe(false);
    expect(verifyBackupSignature("owner-a", payload, "invalid")).toBe(false);
  });
});
