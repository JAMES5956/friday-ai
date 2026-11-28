import { createPublicKey, verify } from "node:crypto";

export type DeviceProofMessageInput = {
  challengeId: string;
  ownerId: string;
  deviceId: string;
  nonce: string;
  expiresAt: string;
};

export function buildDeviceProofMessage(input: DeviceProofMessageInput): string {
  return [
    "FRIDAY_DEVICE_PROOF_V1",
    input.challengeId,
    input.ownerId,
    input.deviceId,
    input.nonce,
    input.expiresAt
  ].join("\n");
}

/**
 * Device keys are Ed25519 SubjectPublicKeyInfo DER values encoded as standard Base64.
 * Private keys must remain in device-controlled secure storage and are never uploaded.
 */
export function isValidEd25519PublicKey(publicKeyBase64: string): boolean {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(publicKeyBase64)) return false;
    const publicKeyDer = Buffer.from(publicKeyBase64, "base64");
    if (publicKeyDer.toString("base64") !== publicKeyBase64) return false;
    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    return publicKey.asymmetricKeyType === "ed25519";
  } catch {
    return false;
  }
}

export function verifyDeviceProof(publicKeyBase64: string, message: string, signatureBase64Url: string): boolean {
  try {
    if (!isValidEd25519PublicKey(publicKeyBase64)) return false;
    if (!/^[A-Za-z0-9_-]{86}$/.test(signatureBase64Url)) return false;

    const publicKeyDer = Buffer.from(publicKeyBase64, "base64");
    const signature = Buffer.from(signatureBase64Url, "base64url");
    if (signature.length !== 64 || signature.toString("base64url") !== signatureBase64Url) return false;

    const publicKey = createPublicKey({ key: publicKeyDer, format: "der", type: "spki" });
    return verify(null, Buffer.from(message, "utf8"), publicKey, signature);
  } catch {
    return false;
  }
}
