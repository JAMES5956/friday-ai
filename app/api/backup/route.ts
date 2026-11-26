import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import {
  createBackupSignature,
  decryptPrivateData,
  verifyBackupSignature,
  verifyMemoryIntegrityDigest
} from "@/lib/security/encryption";

export const runtime = "nodejs";
const MAX_ROWS_PER_TABLE = 5000;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;
const TABLES = [
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

type BackupTables = Record<string, Record<string, unknown>[]>;
type IntegrityReport = {
  integrityVerified: number;
  authenticatedEncrypted: number;
  legacyUnsealed: number;
  tampered: number;
  unreadable: number;
  issues: Array<{ table: string; code: "integrity_mismatch" | "ciphertext_unreadable" | "owner_mismatch" | "duplicate_id" }>;
};

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function ownerContext() {
  const owner = await getOwnerSession();
  if (!owner.user) return { response: fail("Owner authentication required.", 401) } as const;
  const supabase = await createClient();
  return { owner: owner.user, supabase } as const;
}

function inspectTables(ownerId: string, tables: BackupTables): IntegrityReport {
  const report: IntegrityReport = {
    integrityVerified: 0, authenticatedEncrypted: 0, legacyUnsealed: 0,
    tampered: 0, unreadable: 0, issues: []
  };
  const addIssue = (table: string, code: IntegrityReport["issues"][number]["code"]) => report.issues.push({ table, code });
  const decrypt = (table: string, row: Record<string, unknown>, field: string) => {
    const value = row[field];
    if (typeof value !== "string" || !value) return;
    try { decryptPrivateData(value); report.authenticatedEncrypted++; }
    catch { report.unreadable++; addIssue(table, "ciphertext_unreadable"); }
  };
  const inspectSigned = (table: string, rows: Record<string, unknown>[], ciphertextField: string, recordType: string, digestField = "integrity_digest", versionField = "integrity_version") => {
    for (const row of rows) {
      const id = row.id;
      const ciphertext = row[ciphertextField];
      if (typeof id !== "string" || typeof ciphertext !== "string") {
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

  for (const [table, ownerColumn] of TABLES) {
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

  for (const row of tables.messages ?? []) decrypt("messages", row, "content");
  for (const row of tables.agent_tasks ?? []) {
    decrypt("agent_tasks", row, "task_ciphertext");
    decrypt("agent_tasks", row, "result_ciphertext");
  }
  for (const row of tables.agent_task_events ?? []) decrypt("agent_task_events", row, "details_ciphertext");

  return report;
}

function reportReadiness(report: IntegrityReport) {
  if (report.tampered || report.unreadable) return "blocked";
  if (report.legacyUnsealed) return "review_required";
  return "ready";
}

export async function GET() {
  try {
    const context = await ownerContext();
    if ("response" in context) return context.response;
    const tables: BackupTables = {};
    const counts: Record<string, number> = {};

    const results = await Promise.all(TABLES.map(async ([table, ownerColumn]) => {
      const { data, error } = await context.supabase.from(table).select("*")
        .eq(ownerColumn, context.owner.id).limit(MAX_ROWS_PER_TABLE + 1);
      return { table, data, error };
    }));

    for (const result of results) {
      if (result.error) return fail("Backup could not read every owner data table. Check database migrations and permissions.", 503);
      if ((result.data ?? []).length > MAX_ROWS_PER_TABLE) return fail("A data table exceeds the safe export limit. Use paginated backup support before exporting.", 413);
      tables[result.table] = (result.data ?? []) as Record<string, unknown>[];
      counts[result.table] = tables[result.table].length;
    }

    const integrityReport = inspectTables(context.owner.id, tables);
    if (integrityReport.tampered || integrityReport.unreadable) {
      return NextResponse.json({
        error: "Backup was blocked because NEXUS found tampered or unreadable encrypted records. Resolve those records before exporting.",
        integrityReport
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    const unsigned = {
      format: "friday-ai-owner-backup",
      version: 1,
      ownerId: context.owner.id,
      createdAt: new Date().toISOString(),
      counts,
      integrityReport,
      tables
    };
    const signature = createBackupSignature(context.owner.id, JSON.stringify(unsigned));
    const backup = { ...unsigned, signature };
    const body = JSON.stringify(backup);
    if (new TextEncoder().encode(body).byteLength > MAX_BACKUP_BYTES) return fail("Backup exceeds the safe export size limit.", 413);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="friday-owner-backup.json"',
        "Cache-Control": "no-store"
      }
    });
  } catch {
    return fail("Backup service is not configured. Check owner authentication, database access and the encryption key.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const context = await ownerContext();
    if ("response" in context) return context.response;
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send an application/json backup file.", 415);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) return fail("Backup file exceeds the 20 MB verification limit.", 413);

    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Backup file must contain a JSON object.", 400);
      input = parsed as Record<string, unknown>;
    } catch { return fail("Backup file is not valid JSON.", 400); }

    if (input.format !== "friday-ai-owner-backup" || input.version !== 1 || input.ownerId !== context.owner.id ||
        typeof input.createdAt !== "string" || typeof input.signature !== "string" ||
        !input.tables || typeof input.tables !== "object" || Array.isArray(input.tables) ||
        !input.counts || typeof input.counts !== "object" || Array.isArray(input.counts)) {
      return fail("Backup format, version or owner does not match this FRIDAY account.", 400);
    }

    const tables = input.tables as BackupTables;
    const counts = input.counts as Record<string, unknown>;
    for (const [table] of TABLES) {
      if (!Array.isArray(tables[table]) || tables[table].length > MAX_ROWS_PER_TABLE || counts[table] !== tables[table].length) {
        return fail("Backup table structure or row counts are invalid.", 400);
      }
    }
    const unsigned = {
      format: input.format,
      version: input.version,
      ownerId: input.ownerId,
      createdAt: input.createdAt,
      counts,
      integrityReport: input.integrityReport,
      tables
    };
    if (!verifyBackupSignature(context.owner.id, JSON.stringify(unsigned), input.signature)) {
      return fail("Backup signature is invalid. The file may have been altered or signed with a different encryption key.", 409);
    }

    const actualReport = inspectTables(context.owner.id, tables);
    const readiness = reportReadiness(actualReport);
    return NextResponse.json({
      valid: actualReport.tampered === 0 && actualReport.unreadable === 0,
      readiness,
      createdAt: input.createdAt,
      counts,
      integrityReport: actualReport,
      restorePerformed: false,
      message: readiness === "blocked"
        ? "Recovery is blocked: NEXUS found tampered, unreadable or cross-owner records."
        : readiness === "review_required"
          ? "Backup signature is valid. Review legacy unsigned records before attempting recovery."
          : "Backup signature and encrypted records passed verification. This was a dry run; no database rows were changed."
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("Backup verification could not be completed.", 503);
  }
}
