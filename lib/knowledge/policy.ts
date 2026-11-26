export const KNOWLEDGE_RECORD_TYPES = ["knowledge", "decision"] as const;
export const KNOWLEDGE_RECORD_STATUSES = ["active", "superseded", "archived"] as const;
export const KNOWLEDGE_SENSITIVITIES = ["routine", "internal", "restricted"] as const;

export type KnowledgeRecordType = typeof KNOWLEDGE_RECORD_TYPES[number];
export type KnowledgeRecordStatus = typeof KNOWLEDGE_RECORD_STATUSES[number];
export type KnowledgeSensitivity = typeof KNOWLEDGE_SENSITIVITIES[number];

export type KnowledgePayload = {
  title: string;
  body: string;
  rationale?: string;
  project?: string;
  agent?: string;
  tags?: string[];
  sources?: Array<{ label: string; url?: string; accessedAt?: string }>;
  confidence?: number;
};

export function isRecordType(value: unknown): value is KnowledgeRecordType {
  return typeof value === "string" && KNOWLEDGE_RECORD_TYPES.includes(value as KnowledgeRecordType);
}
export function isRecordStatus(value: unknown): value is KnowledgeRecordStatus {
  return typeof value === "string" && KNOWLEDGE_RECORD_STATUSES.includes(value as KnowledgeRecordStatus);
}
export function isSensitivity(value: unknown): value is KnowledgeSensitivity {
  return typeof value === "string" && KNOWLEDGE_SENSITIVITIES.includes(value as KnowledgeSensitivity);
}
function isSafeSourceUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch { return false; }
}

export function validateKnowledgePayload(value: unknown): value is KnowledgePayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (typeof item.title !== "string" || !item.title.trim() || item.title.length > 180) return false;
  if (typeof item.body !== "string" || !item.body.trim() || item.body.length > 30000) return false;
  if (item.rationale !== undefined && (typeof item.rationale !== "string" || item.rationale.length > 8000)) return false;
  if (item.project !== undefined && (typeof item.project !== "string" || item.project.length > 120)) return false;
  if (item.agent !== undefined && (typeof item.agent !== "string" || !/^[a-z][a-z0-9_-]{1,63}$/.test(item.agent))) return false;
  if (item.tags !== undefined && (!Array.isArray(item.tags) || item.tags.length > 20 || item.tags.some(tag => typeof tag !== "string" || tag.length > 40))) return false;
  if (item.sources !== undefined && (!Array.isArray(item.sources) || item.sources.length > 20 || item.sources.some(source => {
    if (!source || typeof source !== "object" || Array.isArray(source)) return true;
    const entry = source as Record<string, unknown>;
    return typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 160 ||
      (entry.url !== undefined && (typeof entry.url !== "string" || entry.url.length > 2048 || !isSafeSourceUrl(entry.url))) ||
      (entry.accessedAt !== undefined && (typeof entry.accessedAt !== "string" || entry.accessedAt.length > 40));
  }))) return false;
  if (item.confidence !== undefined && (typeof item.confidence !== "number" || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1)) return false;
  return true;
}

export function getArchiveExpiry(days: unknown): string | null | undefined {
  if (days === undefined || days === null || days === "never") return null;
  if (typeof days !== "number" || !Number.isInteger(days) || days < 1 || days > 3650) return undefined;
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
