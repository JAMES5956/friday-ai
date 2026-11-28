import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync } from "node:crypto";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerSession: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerSession: mocks.getOwnerSession }));

import { POST } from "../app/api/devices/route";

const validPublicKey = generateKeyPairSync("ed25519").publicKey
  .export({ type: "spki", format: "der" }).toString("base64");

describe("NEXUS device registration API", () => {
  const insert = vi.fn();
  const single = vi.fn();
  const select = vi.fn();
  const from = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerSession.mockResolvedValue({ user: { id: "owner-test" } });
    single.mockResolvedValue({
      data: {
        id: "device-row",
        device_id: "device-id-12345678",
        device_name: "Boss phone",
        platform: "android",
        status: "active",
        created_at: "2026-11-27T00:00:00.000Z"
      },
      error: null
    });
    select.mockReturnValue({ single });
    insert.mockReturnValue({ select });
    from.mockReturnValue({ insert });
    mocks.createClient.mockResolvedValue({ from });
  });

  it("rejects a non-Ed25519 public key before inserting a device", async () => {
    const response = await POST(new Request("https://friday.test/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-id-12345678",
        deviceName: "Boss phone",
        platform: "android",
        publicKey: "p".repeat(48)
      })
    }));

    if (!response) throw new Error("Route returned no response.");
    expect(response.status).toBe(400);
    expect(insert).not.toHaveBeenCalled();
  });

  it("uses the database default for active status and requires MFA", async () => {
    const response = await POST(new Request("https://friday.test/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: "device-id-12345678",
        deviceName: "Boss phone",
        platform: "android",
        publicKey: validPublicKey
      })
    }));

    if (!response) throw new Error("Device route returned no response.");
    expect(response.status).toBe(201);
    expect(mocks.getOwnerSession).toHaveBeenCalledWith({ requireMfa: true });
    expect(from).toHaveBeenCalledWith("owner_devices");
    expect(insert).toHaveBeenCalledWith({
      owner_id: "owner-test",
      device_id: "device-id-12345678",
      device_name: "Boss phone",
      platform: "android",
      public_key: validPublicKey
    });
    expect(insert.mock.calls[0][0]).not.toHaveProperty("status");
  });
});
