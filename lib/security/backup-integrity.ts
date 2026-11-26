import { decryptPrivateData, verifyMemoryIntegrityDigest } from "./encryption";

export type BackupTables = Record<string, Record<string, unknown>[]>;
export type IntegrityReport = {
  integrityVerified: number;
  authenticatedEncrypted: number;
  legacyUnsealed: number;
  tampered: number;
  unreadable: number;
  issues: Array<{ table: string; code: "integrity_mismatch" | "ciphertext_unreadable" | "owner_mismatch" | "duplicate_id" }>;
};

export const BACKUP_TABLES = [
  ["friday_profiles", "user_id"],
  ["conversations", "user_id"],
  ["messages", "user_id"],
  ["memories", "user_id"],
  ["security_audit_events", "user_id"],
  ["agent_workspaces", "owner_id"],
  ["agent_memories", "owner_id"],
  ["agent_memory_grants", "owner_id"],
  ["agent_tasks", "owner_id"],
  ["agent_task_events", "owner_id"],
  ["knowledge_records", "owner_id"],
  ["project_records", "owner_id"]
] as const;

export function inspectBackupTables(ownerId: string, tables: BackupTables): IntegrityReport {
  const report: IntegrityReport = {
    integrityVerified: 0, authenticatedEncrypted: 0, legacyUnsealed: 0,
    tampered: 0, unreadable: 0, issues: []
  };
  const addIssue = (table: string, code: IntegrityReport["issues"][number]["code"]) =>
    report.issues.push({ table, code });
  const decrypt = (table: string, row: Record<string, unknown>, field: string) => {
    const value = row[field];
    if (typeof value !== "string" || !value) return;
    try { decryptPrivateData(value); report.authenticatedEncrypted++; }
    catch { report.unreadable++; addIssue(table, "ciphertext_unreadable"); }
  };
  const inspectSigned = (
    table: string, rows: Record<string, unknown>[], ciphertextField: string,
    recordType: string, digestField = "integrity_digest", versionField = "integrity_version"
  ) => {
    for (const row of rows) {
      const id = row.id;
      const ciphertext = row[ciphertextField];
      if (typeof id !== "string" || typeof ciphertext !== "string" || !ciphertext) {
        report.unreadable++; addIssue(table, "ciphertext_unreadable"); continue;
      }
      const hasIntegrity = row[digestField] != null || row[versionField] != null;
      if (hasIntegrity) {
        if (row[versionField] !== 1 || typeof row[digestField] !== "string" ||
            !verifyMemoryIntegrityDigest(ownerId, id, ciphertext, row[digestField], recordType)) {
          report.tampered++; addIssue(table, "integrity_mismatch"); continue;
        }
        report.integrityVerified++;
      } else {
        report.legacyUnsealed++;
      }
      decrypt(table, row, ciphertextField);
    }
  };

  for (const [table, ownerColumn] of BACKUP_TABLES) {
    const rows = tables[table] ?? [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (row[ownerColumn] !== ownerId) { addIssue(table, "owner_mismatch"); report.tampered++; }
      if (typeof row.id === "string") {
        if (seen.has(row.id)) { addIssue(table, "duplicate_id"); report.tampered++; }
        seen.add(row.id);
      }
    }
  }

  inspectSigned("memories", tables.memories ?? [], "content", "memory");
  inspectSigned("agent_memories", tables.agent_memories ?? [], "content_ciphertext", "agent_memory");
  inspectSigned("knowledge_records", tables.knowledge_records ?? [], "payload_ciphertext", "knowledge");
  inspectSigned("project_records", tables.project_records ?? [], "payload_ciphertext", "project");
  inspectSigned("messages", tables.messages ?? [], "content", "message");
  inspectSigned("agent_tasks", tables.agent_tasks ?? [], "task_ciphertext", "agent_task",
    "task_integrity_digest", "task_integrity_version");
  for (const row of tables.agent_tasks ?? []) {
    if (row.result_ciphertext == null) continue;
    inspectSigned("agent_tasks", [row], "result_ciphertext", "agent_task_result",
      "result_integrity_digest", "result_integrity_version");
  }
  for (const row of tables.agent_task_events ?? []) {
    if (row.details_ciphertext == null) continue;
    inspectSigned("agent_task_events", [row], "details_ciphertext", "agent_task_event",
      "details_integrity_digest", "details_integrity_version");
  }
  return report;
}

export function getBackupReadiness(report: IntegrityReport): "blocked" | "review_required" | "ready" {
  if (report.tampered || report.unreadable) return "blocked";
  if (report.legacyUnsealed) return "review_required";
  return "ready";
}

export function validateBackupStructure(
  tables: unknown,
  counts: unknown,
  maxRowsPerTable: number
): { valid: true; tables: BackupTables; counts: Record<string, unknown> } | { valid: false; reason: string } {
  if (!tables || typeof tables !== "object" || Array.isArray(tables) ||
      !counts || typeof counts !== "object" || Array.isArray(counts)) {
    return { valid: false, reason: "tables_and_counts_must_be_objects" };
  }
  const tableData = tables as Record<string, unknown>;
  const countData = counts as Record<string, unknown>;
  const expected = BACKUP_TABLES.map(([name]) => name);
  if (Object.keys(tableData).length !== expected.length ||
      expected.some(name => !Object.prototype.hasOwnProperty.call(tableData, name)) ||
      Object.keys(tableData).some(name => !expected.includes(name as typeof expected[number]))) {
    return { valid: false, reason: "unexpected_or_missing_tables" };
  }
  if (Object.keys(countData).length !== expected.length ||
      expected.some(name => !Object.prototype.hasOwnProperty.call(countData, name)) ||
      Object.keys(countData).some(name => !expected.includes(name as typeof expected[number]))) {
    return { valid: false, reason: "unexpected_or_missing_counts" };
  }
  for (const name of expected) {
    const rows = tableData[name];
    if (!Array.isArray(rows) || rows.length > maxRowsPerTable || countData[name] !== rows.length) {
      return { valid: false, reason: "invalid_table_rows_or_count" };
    }
    if (rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return { valid: false, reason: "invalid_row_shape" };
    }
  }
  return { valid: true, tables: tableData as BackupTables, counts: countData };
}
