"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Archive, BookOpen, CheckCircle2, RefreshCw, Save, ShieldCheck } from "lucide-react";

type ArchiveRecord = {
  id: string;
  type: "knowledge" | "decision";
  status: "active" | "superseded" | "archived";
  sensitivity: "routine" | "internal" | "restricted";
  expiresAt: string | null;
  expired: boolean;
  createdAt: string;
  updatedAt: string;
  payload: {
    title: string;
    body: string;
    rationale?: string;
    project?: string;
    agent?: string;
    tags?: string[];
    sources?: Array<{ label: string; url?: string; accessedAt?: string }>;
    confidence?: number;
  };
};

export default function KnowledgeArchive() {
  const [records, setRecords] = useState<ArchiveRecord[]>([]);
  const [type, setType] = useState<"knowledge" | "decision">("knowledge");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [rationale, setRationale] = useState("");
  const [project, setProject] = useState("");
  const [sourceLabel, setSourceLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sensitivity, setSensitivity] = useState<"routine" | "internal" | "restricted">("internal");
  const [retention, setRetention] = useState("never");
  const [filter, setFilter] = useState<"active" | "superseded" | "archived">("active");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/knowledge?status=" + filter, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.error ?? "Knowledge archive is unavailable. Database migrations may still be pending.");
        setRecords([]);
      } else {
        setRecords(payload.records ?? []);
        setNotice("");
      }
    } catch {
      setNotice("Could not reach the private knowledge archive.");
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { void loadRecords(); }, [loadRecords]);

  async function saveRecord(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim() || !body.trim() || busy) return;
    const sources = sourceLabel.trim() ? [{
      label: sourceLabel.trim(),
      ...(sourceUrl.trim() ? { url: sourceUrl.trim(), accessedAt: new Date().toISOString() } : {})
    }] : [];
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type, sensitivity,
          expiresInDays: retention === "never" ? null : Number(retention),
          payload: {
            title: title.trim(), body: body.trim(),
            ...(rationale.trim() ? { rationale: rationale.trim() } : {}),
            ...(project.trim() ? { project: project.trim() } : {}),
            ...(sources.length ? { sources } : {})
          }
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        setNotice(payload.error ?? "Could not save this record.");
        return;
      }
      setTitle(""); setBody(""); setRationale(""); setProject(""); setSourceLabel(""); setSourceUrl("");
      setFilter("active");
      setNotice(type === "decision" ? "Decision saved securely." : "Knowledge saved securely.");
      await loadRecords();
    } catch {
      setNotice("Could not reach the private archive.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(id: string, status: "superseded" | "archived") {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/knowledge", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status })
      });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error ?? "Could not update this record."); return; }
      await loadRecords();
    } catch {
      setNotice("Could not reach the private archive.");
    } finally { setBusy(false); }
  }

  async function deleteRecord(id: string) {
    if (busy || !window.confirm("Permanently delete this encrypted archive record? This cannot be undone.")) return;
    setBusy(true);
    try {
      const response = await fetch("/api/knowledge", {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const payload = await response.json();
      if (!response.ok) { setNotice(payload.error ?? "Could not delete this record."); return; }
      await loadRecords();
    } catch {
      setNotice("Could not reach the private archive.");
    } finally { setBusy(false); }
  }

  return (
    <section className="knowledge-archive">
      <div className="workspace-section-heading">
        <div><BookOpen /><div><h2>Knowledge & decision archive</h2><p>Encrypted project history, research and decisions</p></div></div>
        <button className="icon-button" type="button" onClick={() => void loadRecords()} aria-label="Refresh archive"><RefreshCw size={15} /></button>
      </div>
      <form className="knowledge-form" onSubmit={saveRecord}>
        <div className="knowledge-form-grid">
          <label>Record type<select value={type} onChange={event => setType(event.target.value as typeof type)}><option value="knowledge">Knowledge / research</option><option value="decision">Decision record</option></select></label>
          <label>Privacy<select value={sensitivity} onChange={event => setSensitivity(event.target.value as typeof sensitivity)}><option value="routine">Routine</option><option value="internal">Internal</option><option value="restricted">Restricted — owner only</option></select></label>
          <label>Retention<select value={retention} onChange={event => setRetention(event.target.value)}><option value="never">Keep until deleted</option><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
        </div>
        <label>Title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={180} placeholder={type === "decision" ? "What was decided?" : "What should FRIDAY retain?"} required /></label>
        <label>Details<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={30000} rows={3} placeholder="Record the finding, context or decision..." required /></label>
        {type === "decision" && <label>Reasoning / rationale<textarea value={rationale} onChange={event => setRationale(event.target.value)} maxLength={8000} rows={2} placeholder="Why was this decision made? What alternatives were considered?" /></label>}
        <div className="knowledge-form-grid">
          <label>Project (optional)<input value={project} onChange={event => setProject(event.target.value)} maxLength={120} placeholder="Project name" /></label>
          <label>Source label (optional)<input value={sourceLabel} onChange={event => setSourceLabel(event.target.value)} maxLength={160} placeholder="Report, article or document" /></label>
        </div>
        {sourceLabel.trim() && <label>Source URL (optional)<input type="url" value={sourceUrl} onChange={event => setSourceUrl(event.target.value)} maxLength={2048} placeholder="https://..." /></label>}
        <button type="submit" disabled={busy || !title.trim() || !body.trim()}><Save size={15} /> {busy ? "Saving..." : "Save encrypted record"}</button>
      </form>

      <div className="knowledge-archive-toolbar">
        <div className="knowledge-filter" role="group" aria-label="Archive status">
          {(["active", "superseded", "archived"] as const).map(value => <button type="button" key={value} className={filter === value ? "selected" : ""} onClick={() => setFilter(value)}>{value}</button>)}
        </div>
        <span>{records.length} record{records.length === 1 ? "" : "s"}</span>
      </div>
      <div className="knowledge-record-list">
        {loading ? <p className="memory-empty">Loading private archive…</p> : records.length === 0 ? <p className="memory-empty">No {filter} records yet.</p> : records.map(record => (
          <article className="knowledge-record" key={record.id}>
            <div className="knowledge-record-heading">
              <div><span className="knowledge-record-type">{record.type === "decision" ? "DECISION" : "KNOWLEDGE"} · {record.sensitivity.toUpperCase()}</span><h3>{record.payload.title}</h3></div>
              {record.expired && <span className="knowledge-expired">EXPIRED</span>}
            </div>
            <p>{record.payload.body}</p>
            {record.payload.rationale && <p className="knowledge-rationale"><strong>Rationale:</strong> {record.payload.rationale}</p>}
            <div className="knowledge-record-meta">
              {record.payload.project && <span>Project: {record.payload.project}</span>}
              {record.payload.sources?.map((source, index) => <span key={index}>Source: {source.label}{source.url ? " · " + source.url : ""}</span>)}
              <time>{new Date(record.createdAt).toLocaleString()}</time>
            </div>
            <div className="knowledge-record-actions">
              {filter === "active" && <><button type="button" disabled={busy} onClick={() => void changeStatus(record.id, "superseded")}>Mark superseded</button><button type="button" disabled={busy} onClick={() => void changeStatus(record.id, "archived")}><Archive size={13} /> Archive</button></>}
              {filter !== "archived" && <button type="button" disabled={busy} onClick={() => void deleteRecord(record.id)}>Delete permanently</button>}
              {filter === "archived" && <span><CheckCircle2 size={13} /> Archived</span>}
            </div>
          </article>
        ))}
      </div>
      {notice && <p className="workspace-status" role="status">{notice}</p>}
      <p className="knowledge-safety-note"><ShieldCheck size={14} /> Archive payloads are encrypted before storage. Restricted records are never intended for model context. FRIDAY does not automatically treat archived notes as verified facts.</p>
    </section>
  );
}
