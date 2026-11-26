"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react";

type MemoryIntegrityRecord = {
  id: string;
  category: string;
  updatedAt: string;
  status: "verified" | "authenticated" | "legacy_unsealed" | "tampered" | "unreadable";
  sealable: boolean;
};
type IntegrityReport = {
  scanned: number;
  counts: { verified: number; authenticated: number; legacy_unsealed: number; tampered: number; unreadable: number };
  records: MemoryIntegrityRecord[];
};

export default function MemoryIntegrityPanel() {
  const [report, setReport] = useState<IntegrityReport | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const scan = useCallback(async () => {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/memory/integrity", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error ?? "NEXUS could not verify memory integrity."); return; }
      setReport(payload.report);
      setSelected([]);
    } catch { setStatus("Could not reach the NEXUS memory-integrity service."); }
    finally { setBusy(false); }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  function toggle(id: string, checked: boolean) {
    setSelected(current => checked
      ? (current.length >= 25 || current.includes(id) ? current : [...current, id])
      : current.filter(item => item !== id));
  }

  async function sealReviewed() {
    if (!selected.length || busy) return;
    if (!window.confirm("I have reviewed these legacy memories in the memory panel. Re-encrypt and seal only these selected records?")) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/memory/integrity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "seal-reviewed", ids: selected, ownerConfirmed: true })
      });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error ?? "Could not seal the selected memories."); return; }
      setStatus("Sealed " + payload.sealed + " reviewed legacy memories. " + payload.skipped + " were skipped.");
      await scan();
    } catch { setStatus("Could not reach the NEXUS memory-integrity service."); }
    finally { setBusy(false); }
  }

  const counts = report?.counts;
  return <section className="nexus-memory-integrity">
    <div className="workspace-section-heading">
      <div><ShieldCheck /><div><h2>NEXUS memory integrity</h2><p>Personal saved memories · ciphertext authenticity and corruption checks</p></div></div>
      <button className="icon-button" type="button" onClick={() => void scan()} disabled={busy} aria-label="Run memory integrity scan"><RefreshCw size={15} /></button>
    </div>
    {!report && !status ? <p className="nexus-integrity-note">Preparing the first integrity scan…</p> : null}
    {counts ? <>
      <div className="nexus-integrity-stats">
        <div className="nexus-integrity-stat"><strong>{counts.verified}</strong><span>Signed</span></div>
        <div className="nexus-integrity-stat"><strong>{counts.authenticated}</strong><span>Encrypted</span></div>
        <div className="nexus-integrity-stat"><strong>{counts.legacy_unsealed}</strong><span>Legacy review</span></div>
        <div className="nexus-integrity-stat"><strong>{counts.tampered}</strong><span>Tampered</span></div>
        <div className="nexus-integrity-stat"><strong>{counts.unreadable}</strong><span>Unreadable</span></div>
      </div>
      <p className="nexus-integrity-note">Scanned {report.scanned} records across seven stores (up to 100 rows per store). Signed records have an owner-bound integrity digest; conversation and task ciphertext is checked using authenticated decryption. Legacy records are not yet signed. NEXUS never overwrites a tampered or unreadable record.</p>
      <div className="nexus-integrity-list">
        {report.records.map(record => <div className="nexus-integrity-row" key={record.id}>
          <label>
            {record.sealable ? <input type="checkbox" checked={selected.includes(record.id)} onChange={event => toggle(record.id, event.target.checked)} disabled={busy || (!selected.includes(record.id) && selected.length >= 25)} /> : <span aria-hidden="true">{(record.status === "verified" || record.status === "authenticated") ? <ShieldCheck size={15} /> : <ShieldAlert size={15} />}</span>}
            <span>{record.category}<small>Updated {new Date(record.updatedAt).toLocaleDateString()}</small></span>
          </label>
          <span className={"nexus-integrity-status " + record.status}>{record.status === "authenticated" ? "authenticated ciphertext" : record.status.replace("_", " ")}</span>
        </div>)}
        {report.records.length === 0 ? <p className="nexus-integrity-note">No protected records were found in the scanned stores.</p> : null}
      </div>
      <div className="nexus-integrity-actions">
        <button type="button" disabled={busy || selected.length === 0} onClick={() => void sealReviewed()}>Seal {selected.length} reviewed legacy memories</button>
        <button type="button" disabled={busy} onClick={() => void scan()}><Activity size={13} /> Run scan again</button>
      </div>
    </> : null}
    {status ? <p className="nexus-integrity-note" role="status">{status}</p> : null}
    <p className="nexus-integrity-note">Legacy specialist, archive and project records are reported for review but are not bulk-sealed here. Only explicitly selected personal memories can be sealed through this panel. Conversation history, specialist tasks and task-event payloads are checked for authenticated encryption. They are not yet protected by separate owner-and-record-bound integrity signatures.</p>
  </section>;
}
