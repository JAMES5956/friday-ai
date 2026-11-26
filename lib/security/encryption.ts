import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const PREFIX = "friday:v1:";

function getEncryptionKey() {
  const encoded = process.env.FRIDAY_DATA_ENCRYPTION_KEY;
  if (!encoded) throw new Error("FRIDAY_DATA_ENCRYPTION_KEY is not configured.");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("FRIDAY_DATA_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.");
  }
  return key;
}

export function createMemoryIntegrityDigest(ownerId: string, memoryId: string, ciphertext: string, recordType = "memory") {
  const key = getEncryptionKey();
  const integrityKey = createHmac("sha256", key).update("friday:memory-integrity:v1").digest();
  return createHmac("sha256", integrityKey)
    .update(recordType === "memory" ? ownerId : recordType + "\\0" + ownerId).update("\\0")
    .update(memoryId).update("\\0")
    .update(ciphertext)
    .digest("hex");
}

export function verifyMemoryIntegrityDigest(ownerId: string, memoryId: string, ciphertext: string, digest: string, recordType = "memory") {
  if (!/^[a-f0-9]{64}$/.test(digest)) return false;
  const expected = Buffer.from(createMemoryIntegrityDigest(ownerId, memoryId, ciphertext, recordType), "hex");
  const actual = Buffer.from(digest, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createBackupSignature(ownerId: string, canonicalPayload: string) {
  const key = getEncryptionKey();
  const backupKey = createHmac("sha256", key).update("friday:backup-signature:v1").digest();
  return createHmac("sha256", backupKey)
    .update(ownerId).update("\\0")
    .update(canonicalPayload)
    .digest("hex");
}

export function verifyBackupSignature(ownerId: string, canonicalPayload: string, signature: string) {
  if (!/^[a-f0-9]{64}$/.test(signature)) return false;
  const expected = Buffer.from(createBackupSignature(ownerId, canonicalPayload), "hex");
  const actual = Buffer.from(signature, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
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
  if (!value.startsWith(PREFIX)) {
    throw new Error("Stored private data is not encrypted with a supported FRIDAY format.");
  }
  const key = getEncryptionKey();
  const encodedPayload = value.slice(PREFIX.length);
  const payload = Buffer.from(encodedPayload, "base64");
  if (payload.toString("base64") !== encodedPayload) {
    throw new Error("Encrypted data has an invalid encoding.");
  }
  if (payload.length < 29) throw new Error("Encrypted data is incomplete.");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}
