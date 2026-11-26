export const MEMORY_SENSITIVITIES = ["routine", "internal", "restricted"] as const;
export type MemorySensitivity = (typeof MEMORY_SENSITIVITIES)[number];

export function isMemorySensitivity(value: unknown): value is MemorySensitivity {
  return typeof value === "string" && MEMORY_SENSITIVITIES.includes(value as MemorySensitivity);
}

export function getMemoryExpiry(expiresInDays: unknown, now = Date.now()): string | null | undefined {
  if (expiresInDays === undefined || expiresInDays === null) return null;
  if (typeof expiresInDays !== "number" || !Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 3650) {
    return undefined;
  }
  return new Date(now + expiresInDays * 86_400_000).toISOString();
}

export function isMemoryAvailableToModel(
  sensitivity: unknown,
  expiresAt: string | null | undefined,
  now = Date.now()
): boolean {
  if (sensitivity !== "routine" && sensitivity !== "internal") return false;
  if (!expiresAt) return true;
  const expiry = Date.parse(expiresAt);
  return Number.isFinite(expiry) && expiry > now;
}
