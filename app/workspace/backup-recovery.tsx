"use client";

import { useState, type ChangeEvent } from "react";
import { Download, FileCheck2, ShieldCheck, UploadCloud } from "lucide-react";

type RecoveryReport = {
  valid: boolean;
  readiness: "ready" | "review_required" | "blocked";
  createdAt: string;
  counts: Record<string, number>;
  integrityReport: {
    integrityVerified: number;
    authenticatedEncrypted: number;
    legacyUnsealed: number;
    tampered: number;
    unreadable: number;
    issues: Array<{ table: string; code: string }>;
  };
  restorePerformed: false;
  message: string;
};

export default function BackupRecoveryPanel() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [fileName, setFileName] = useState("");

  async function createBackup() {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/backup", { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json();
        setStatus(payload.error ?? "NEXUS could not create a backup.");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "friday-owner-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setStatus("Encrypted owner backup created. Store the file separately from this device and keep your encryption key safe.");
    } catch { setStatus("Could not reach the backup service."); }
    finally { setBusy(false); }
  }

  async function verifyBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setReport(null); setStatus("");
    if (file.size > 20 * 1024 * 1024) { setStatus("Choose a backup file smaller than 20 MB."); return; }
    setBusy(true);
    try {
      const parsed: unknown = JSON.parse(await file.text());
      const response = await fetch("/api/backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed)
      });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error ?? "Backup verification failed."); return; }
      setReport(payload as RecoveryReport);
      setStatus(payload.message ?? "Backup verification completed.");
    } catch { setStatus("The selected file is not a valid FRIDAY backup or could not be verified."); }
    finally { setBusy(false); event.target.value = ""; }
  }

  const integrity = report?.integrityReport;
  return <section className="nexus-backup-panel">
    <div className="workspace-section-heading">
      <div><ShieldCheck /><div><h2>NEXUS backup & recovery</h2><p>Owner-controlled encrypted snapshots and non-destructive recovery checks</p></div></div>
    </div>
    <div className="nexus-backup-actions">
      <button type="button" onClick={() => void createBackup()} disabled={busy}><Download size={15} /> Create encrypted backup</button>
      <label className="nexus-backup-upload"><UploadCloud size={15} /> Verify backup file<input type="file" accept=".json,application/json" onChange={event => void verifyBackup(event)} disabled={busy} /></label>
    </div>
    {fileName ? <p className="nexus-backup-note">Selected file: {fileName}</p> : null}
    {report && integrity ? <>
      <div className="nexus-backup-stats">
        <div><strong>{Object.values(report.counts).reduce((sum, count) => sum + count, 0)}</strong><span>Records</span></div>
        <div><strong>{integrity.integrityVerified}</strong><span>Signed records</span></div>
        <div><strong>{integrity.legacyUnsealed}</strong><span>Legacy review</span></div>
        <div><strong>{integrity.tampered + integrity.unreadable}</strong><span>Issues</span></div>
      </div>
      <p className={"nexus-backup-readiness " + report.readiness}>
        <FileCheck2 size={14} /> {report.readiness.replaceAll("_", " ")} · Backup date {new Date(report.createdAt).toLocaleString()}
      </p>
      {integrity.issues.length > 0 && <ul className="nexus-backup-issues">{integrity.issues.slice(0, 8).map((issue, index) => <li key={index}>{issue.table}: {issue.code.replaceAll("_", " ")}</li>)}</ul>}
      <p className="nexus-backup-note">Recovery check only. No database rows were restored, replaced or deleted.</p>
    </> : null}
    {status ? <p className="nexus-backup-note" role="status">{status}</p> : null}
    <p className="nexus-backup-note">Backups contain encrypted data plus required database metadata. Keep the matching FRIDAY_DATA_ENCRYPTION_KEY in a separate secure location. This is a portable owner backup, not an automatic off-site backup service. Restore is intentionally disabled until a separately tested, owner-approved recovery workflow is ready.</p>
  </section>;
}
