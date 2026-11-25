import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const PREFIX = "friday:v1:";

function getEncryptionKey() {
  const encoded = process.env.FRIDAY_DATA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FRIDAY_DATA_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("FRIDAY_DATA_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
  }
  return key;
}

export function encryptPrivateData(plainText: string) {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plainText, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptPrivateData(value: string) {
  if (!value.startsWith(PREFIX)) return value;
  const key = getEncryptionKey();
  const payload = Buffer.from(value.slice(PREFIX.length), "base64");
  if (payload.length < 29) throw new Error("Encrypted data is incomplete.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
