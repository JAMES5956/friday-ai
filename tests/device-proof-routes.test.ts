import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildDeviceProofMessage } from "@/lib/security/device-proof";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerSession: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerSession: mocks.getOwnerSession }));

import { POST as issueChallenge } from "@/app/api/devices/challenge/route";
import { POST as verifyDevice } from "@/app/api/devices/verify/route";

describe("NEXUS device proof API", () => {
  const ownerId = "owner-1";
  const deviceId = "device-id-12345678";
  const challengeId = "123e4567-e89b-42d3-a456-426614174000";
  const rpc = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getOwnerSession.mockResolvedValue({ user: { id: ownerId }, reason: null });
    mocks.createClient.mockResolvedValue({ rpc });
  });

  it("issues a short-lived challenge only after owner MFA", async () => {
    rpc.mockResolvedValue({ data: challengeId, error: null });

    const response = await issueChallenge(new Request("https://friday.test/api/devices/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId })
    }));

    expect(response.status).toBe(200);
    expect(mocks.getOwnerSession).toHaveBeenCalledWith({ requireMfa: true });
    expect(rpc).toHaveBeenCalledWith("issue_device_challenge", expect.objectContaining({
      p_device_id: deviceId,
      p_nonce: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/)
    }));
    const payload = await response.json();
    expect(payload.challengeId).toBe(challengeId);
    expect(payload.message).toContain("FRIDAY_DEVICE_PROOF_V1");
    expect(payload.expiresAt).toBeTruthy();
  });

  it("accepts a valid Ed25519 proof and consumes the challenge through the owner-bound RPC", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const expiresAt = "2026-11-28T13:00:00.000Z";
    const nonce = "a".repeat(43);
    const message = buildDeviceProofMessage({
      challengeId,
      ownerId,
      deviceId,
      nonce,
      expiresAt: String(Date.parse(expiresAt))
    });
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");

    rpc.mockResolvedValue({
      data: [{
        owner_id: ownerId,
        device_id: deviceId,
        nonce,
        expires_at: expiresAt,
        public_key: publicKeyBase64
      }],
      error: null
    });

    const response = await verifyDevice(new Request("https://friday.test/api/devices/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, signature })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ verified: true, deviceId });
    expect(mocks.getOwnerSession).toHaveBeenCalledWith({ requireMfa: true });
    expect(rpc).toHaveBeenCalledWith("consume_device_challenge", { p_challenge_id: challengeId });
  });

  it("rejects a signature from a different private key", async () => {
    const registered = generateKeyPairSync("ed25519");
    const attacker = generateKeyPairSync("ed25519");
    const publicKeyBase64 = registered.publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const signature = sign(null, Buffer.from("not-the-challenge", "utf8"), attacker.privateKey).toString("base64url");

    rpc.mockResolvedValue({
      data: [{
        owner_id: ownerId,
        device_id: deviceId,
        nonce: "a".repeat(43),
        expires_at: "2026-11-28T13:00:00.000Z",
        public_key: publicKeyBase64
      }],
      error: null
    });

    const response = await verifyDevice(new Request("https://friday.test/api/devices/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, signature })
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "DEVICE_PROOF_REJECTED" }
    });
  });

  it("rejects a consumed, expired or unavailable challenge", async () => {
    rpc.mockResolvedValue({ data: [], error: null });

    const response = await verifyDevice(new Request("https://friday.test/api/devices/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challengeId, signature: "a".repeat(86) })
    }));

    expect(response.status).toBe(401);
  });
});
