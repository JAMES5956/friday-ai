import { beforeEach, describe, expect, it, vi } from "vitest";
import { BACKUP_TABLES } from "../lib/security/backup-integrity";
import { createBackupSignature, encryptPrivateData } from "../lib/security/encryption";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerSession: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient
}));

vi.mock("@/lib/auth/owner", () => ({
  getOwnerSession: mocks.getOwnerSession
}));

import { POST } from "../app/api/backup/route";

const OWNER_ID = "owner-test";
const TEST_KEY = Buffer.alloc(32, 17).toString("base64");

function makeBackup() {
  const tables = Object.fromEntries(BACKUP_TABLES.map(([name]) => [name, []]));
  const counts = Object.fromEntries(BACKUP_TABLES.map(([name]) => [name, 0]));
  const createdAt = "2026-11-26T12:00:00.000Z";
  const ciphertext = encryptPrivateData(JSON.stringify({
    format: "friday-ai-owner-backup",
    version: 1,
    ownerId: OWNER_ID,
    createdAt,
    counts,
    tables
  }));
  const unsignedEnvelope = {
    format: "friday-ai-owner-backup",
    version: 1,
    ownerId: OWNER_ID,
    createdAt,
    ciphertext
  };
  return {
    ...unsignedEnvelope,
    signature: createBackupSignature(OWNER_ID, JSON.stringify(unsignedEnvelope))
  };
}

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/backup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("NEXUS backup recovery route safety", () => {
  const from = vi.fn();
  const insert = vi.fn();

  beforeEach(() => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = TEST_KEY;
    vi.clearAllMocks();
    insert.mockResolvedValue({ error: null });
    from.mockImplementation((table: string) => ({
      insert: (...args: unknown[]) => {
        insert(table, ...args);
        return Promise.resolve({ error: null });
      }
    }));
    mocks.getOwnerSession.mockResolvedValue({ user: { id: OWNER_ID } });
    mocks.createClient.mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      from
    });
  });

  it("verifies a valid backup as a dry run and writes only its security audit event", async () => {
    const response = await POST(makeRequest(makeBackup()));
    if (!response) throw new Error("Backup route returned no response.");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.valid).toBe(true);
    expect(body.restorePerformed).toBe(false);
    expect(body.message).toContain("dry run");
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("security_audit_events");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(insert).toHaveBeenCalledWith("security_audit_events", expect.objectContaining({
      user_id: OWNER_ID,
      event_type: "owner_backup_verified"
    }));
  });

  it("rejects a modified signature before any database write", async () => {
    const backup = makeBackup();
    backup.signature = "0".repeat(64);
    const response = await POST(makeRequest(backup));
    if (!response) throw new Error("Backup route returned no response.");

    expect(response.status).toBe(409);
    expect(from).not.toHaveBeenCalled();
    expect(insert).not.toHaveBeenCalled();
  });

  it("fails closed when the verification audit event cannot be recorded", async () => {
    insert.mockRejectedValueOnce(new Error("audit unavailable"));
    from.mockImplementationOnce(() => ({
      insert: () => Promise.resolve({ error: { message: "audit unavailable" } })
    }));

    const response = await POST(makeRequest(makeBackup()));
    if (!response) throw new Error("Backup route returned no response.");

    expect(response.status).toBe(503);
    expect(from).toHaveBeenCalledWith("security_audit_events");
    await expect(bodyOf(response)).resolves.toMatchObject({
      error: expect.stringContaining("audit")
    });
  });
});

async function bodyOf(response: Response) {
  return response.json();
}
