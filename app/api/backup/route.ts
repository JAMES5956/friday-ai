import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createBackupSignature, decryptPrivateData, encryptPrivateData, verifyBackupSignature } from "@/lib/security/encryption";
import { BACKUP_TABLES, getBackupReadiness, inspectBackupTables, type BackupTables } from "@/lib/security/backup-integrity";

export const runtime = "nodejs";
const TABLES = BACKUP_TABLES;
const MAX_ROWS_PER_TABLE = 5000;
const MAX_BACKUP_BYTES = 20 * 1024 * 1024;

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function ownerContext() {
  const owner = await getOwnerSession();
  if (!owner.user) return { response: fail("Owner authentication required.", 401) } as const;
  const supabase = await createClient();
  return { owner: owner.user, supabase } as const;
}


export async function GET() {
  try {
    const context = await ownerContext();
    if ("response" in context) return context.response;
    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 5 });
    if (rateError) return fail("NEXUS rate protection is unavailable.", 503);
    if (!allowed) return fail("Too many backup operations. Wait before trying again.", 429);
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

    const integrityReport = inspectBackupTables(context.owner.id, tables);
    if (integrityReport.tampered || integrityReport.unreadable) {
      return NextResponse.json({
        error: "Backup was blocked because NEXUS found tampered or unreadable encrypted records. Resolve those records before exporting.",
        integrityReport
      }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    const createdAt = new Date().toISOString();
    const payload = {
      format: "friday-ai-owner-backup",
      version: 1,
      ownerId: context.owner.id,
      createdAt,
      counts,
      integrityReport,
      tables
    };
    const ciphertext = encryptPrivateData(JSON.stringify(payload));
    const unsignedEnvelope = {
      format: "friday-ai-owner-backup",
      version: 1,
      ownerId: context.owner.id,
      createdAt,
      ciphertext
    };
    const signature = createBackupSignature(context.owner.id, JSON.stringify(unsignedEnvelope));
    const backup = { ...unsignedEnvelope, signature };
    const { error: auditError } = await context.supabase.from("security_audit_events").insert({
      user_id: context.owner.id, event_type: "owner_backup_exported", severity: "info",
      details: { recordCount: Object.values(counts).reduce((sum, count) => sum + count, 0), legacyUnsealed: integrityReport.legacyUnsealed }
    });
    if (auditError) return fail("Backup export was stopped because NEXUS could not record its audit event.", 503);
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
    const { data: allowed, error: rateError } = await context.supabase.rpc("consume_rate_limit", { p_limit: 5 });
    if (rateError) return fail("NEXUS rate protection is unavailable.", 503);
    if (!allowed) return fail("Too many backup operations. Wait before trying again.", 429);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return fail("Send an application/json backup file.", 415);
    const declaredLength = Number(request.headers.get("content-length") ?? 0);
    if (declaredLength > MAX_BACKUP_BYTES) return fail("Backup file exceeds the 20 MB verification limit.", 413);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) return fail("Backup file exceeds the 20 MB verification limit.", 413);

    let input: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Backup file must contain a JSON object.", 400);
      input = parsed as Record<string, unknown>;
    } catch { return fail("Backup file is not valid JSON.", 400); }

    if (input.format !== "friday-ai-owner-backup" || input.version !== 1 || input.ownerId !== context.owner.id ||
        typeof input.createdAt !== "string" || typeof input.signature !== "string" || typeof input.ciphertext !== "string") {
      return fail("Backup format, version or owner does not match this FRIDAY account.", 400);
    }
    const unsignedEnvelope = {
      format: input.format,
      version: input.version,
      ownerId: input.ownerId,
      createdAt: input.createdAt,
      ciphertext: input.ciphertext
    };
    if (!verifyBackupSignature(context.owner.id, JSON.stringify(unsignedEnvelope), input.signature)) {
      return fail("Backup signature is invalid. The file may have been altered or signed with a different encryption key.", 409);
    }

    let payload: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(decryptPrivateData(input.ciphertext));
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fail("Backup payload is invalid.", 400);
      payload = parsed as Record<string, unknown>;
    } catch {
      return fail("Backup payload could not be decrypted. Check the matching FRIDAY encryption key.", 409);
    }
    if (payload.format !== input.format || payload.version !== input.version ||
        payload.ownerId !== context.owner.id || payload.createdAt !== input.createdAt ||
        !payload.tables || typeof payload.tables !== "object" || Array.isArray(payload.tables) ||
        !payload.counts || typeof payload.counts !== "object" || Array.isArray(payload.counts)) {
      return fail("Decrypted backup payload does not match its signed envelope.", 409);
    }

    const tables = payload.tables as BackupTables;
    const counts = payload.counts as Record<string, unknown>;
    for (const [table] of TABLES) {
      if (!Array.isArray(tables[table]) || tables[table].length > MAX_ROWS_PER_TABLE || counts[table] !== tables[table].length) {
        return fail("Backup table structure or row counts are invalid.", 400);
      }
    }
    const actualReport = inspectBackupTables(context.owner.id, tables);
    const readiness = getBackupReadiness(actualReport);
    const { error: auditError } = await context.supabase.from("security_audit_events").insert({
      user_id: context.owner.id, event_type: "owner_backup_verified",
      severity: readiness === "blocked" ? "critical" : readiness === "review_required" ? "warning" : "info",
      details: { readiness, integrityVerified: actualReport.integrityVerified, legacyUnsealed: actualReport.legacyUnsealed, tampered: actualReport.tampered, unreadable: actualReport.unreadable }
    });
    if (auditError) return fail("Backup verification was stopped because NEXUS could not record its audit event.", 503);
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
