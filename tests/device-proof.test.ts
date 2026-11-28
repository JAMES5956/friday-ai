import { describe, expect, it } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { buildDeviceProofMessage, verifyDeviceProof } from "@/lib/security/device-proof";

describe("NEXUS device proof-of-possession", () => {
  it("verifies an Ed25519 signature over the owner-bound challenge", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ed25519");
    const publicKeyBase64 = publicKey.export({ type: "spki", format: "der" }).toString("base64");
    const input = {
      challengeId: "123e4567-e89b-42d3-a456-426614174000",
      ownerId: "owner-1",
      deviceId: "device-id-12345678",
      nonce: "a".repeat(43),
      expiresAt: "2026-11-28T13:00:00.000Z"
    };
    const message = buildDeviceProofMessage(input);
    const signature = sign(null, Buffer.from(message, "utf8"), privateKey).toString("base64url");

    expect(verifyDeviceProof(publicKeyBase64, message, signature)).toBe(true);
    expect(verifyDeviceProof(publicKeyBase64, message + "\nchanged", signature)).toBe(false);
  });

  it("rejects malformed keys and signatures", () => {
    expect(verifyDeviceProof("not-a-key", "message", "x".repeat(86))).toBe(false);
    expect(verifyDeviceProof("AAAA", "message", "x".repeat(86))).toBe(false);
    expect(verifyDeviceProof("AAAA", "message", "short")).toBe(false);
  });
});
