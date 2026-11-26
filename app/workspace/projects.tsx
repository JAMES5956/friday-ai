"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { FolderKanban, Plus, RefreshCw, Save, ShieldCheck } from "lucide-react";
import { specialistAgents } from "@/lib/agents/registry";
import { projectProgress, type ProjectPayload, type ProjectStatus } from "@/lib/projects/policy";
import styles from "./projects.module.css";

type ProjectRecord = { id: string; createdAt: string; updatedAt: string; integrityStatus: "verified" | "legacy_unsealed"; payload: ProjectPayload };
const emptyPayload = (): ProjectPayload => ({
  title: "", purpose: "", status: "planning", priority: "normal", ownerAgentId: "friday",
  startDate: new Date().toISOString().slice(0, 10), targetDate: null,
  milestones: [], tasks: [], progressUpdates: [], blockers: []
});
const uid = () => crypto.randomUUID();

export default function ProjectsPanel() {
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [draft, setDraft] = useState<ProjectPayload>(emptyPayload);
  const [milestoneLines, setMilestoneLines] = useState("");
  const [taskLines, setTaskLines] = useState("");
  const [progressDraft, setProgressDraft] = useState<Record<string, string>>({});
  const [selectedForContext, setSelectedForContext] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState("");

  const loadProjects = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/projects", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setProjects([]); setNotice(payload.error?.message ?? "Project storage is not available. Apply migration 0008."); }
      else { setProjects(payload.projects ?? []); setNotice(""); }
    } catch { setNotice("Could not reach Project Continuity."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void loadProjects(); }, [loadProjects]);

  const activeProjects = useMemo(() => projects.filter(project => project.payload.status !== "archived"), [projects]);
  useEffect(() => {
    const clear = () => setSelectedForContext([]);
    window.addEventListener("friday:project-context-cleared", clear);
    return () => window.removeEventListener("friday:project-context-cleared", clear);
  }, []);
  function toggleProjectContext(id: string, checked: boolean) {
    const next = checked ? (selectedForContext.includes(id) || selectedForContext.length >= 3 ? selectedForContext : [...selectedForContext, id]) : selectedForContext.filter(item => item !== id);
    setSelectedForContext(next);
    window.dispatchEvent(new CustomEvent("friday:project-context", { detail: next }));
  }

  function parseMilestones(value: string): ProjectPayload["milestones"] {
    return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const [titlePart, datePart] = line.split("|").map(part => part.trim());
      const dueDate = datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
      return { id: uid(), title: titlePart.slice(0, 180), dueDate, status: "pending" as const, tasks: [] };
    });
  }
  function parseTasks(value: string): ProjectPayload["tasks"] {
    return value.split("\n").map(line => line.trim()).filter(Boolean).map(line => {
      const [titlePart, datePart] = line.split("|").map(part => part.trim());
      const dueDate = datePart && /^\d{4}-\d{2}-\d{2}$/.test(datePart) ? datePart : null;
      return { id: uid(), title: titlePart.slice(0, 180), dueDate, status: "pending" as const };
    });
  }

  async function createProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !draft.title.trim() || !draft.purpose.trim()) return;
    setBusy(true); setNotice("");
    const payload: ProjectPayload = {
      ...draft,
      milestones: parseMilestones(milestoneLines),
      tasks: parseTasks(taskLines)
    };
    try {
      const response = await fetch("/api/projects", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload })
      });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error?.message ?? "Could not save project."); return; }
      setDraft(emptyPayload()); setMilestoneLines(""); setTaskLines("");
      setNotice("Project saved to your encrypted continuity workspace.");
      await loadProjects();
    } catch { setNotice("Could not reach the project service."); }
    finally { setBusy(false); }
  }

  async function updateProject(project: ProjectRecord, payload: ProjectPayload): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/projects", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: project.id, payload })
      });
      const result = await response.json();
      if (!response.ok) { setNotice(result.error?.message ?? "Could not update project."); return false; }
      setProjects(current => current.map(item => item.id === project.id ? { ...item, ...result.project } : item));
      if (payload.status === "archived") {
        const next = selectedForContext.filter(id => id !== project.id);
        setSelectedForContext(next);
        window.dispatchEvent(new CustomEvent("friday:project-context", { detail: next }));
      }
      setNotice("Project continuity record updated.");
      return true;
    } catch { setNotice("Could not reach the project service."); return false; }
    finally { setBusy(false); }
  }

  async function addProgress(project: ProjectRecord) {
    const body = (progressDraft[project.id] ?? "").trim();
    if (!body || busy) return;
    const next: ProjectPayload = {
      ...project.payload,
      progressUpdates: [{ id: uid(), body, createdAt: new Date().toISOString(), agentId: "friday" }, ...project.payload.progressUpdates].slice(0, 100)
    };
    if (await updateProject(project, next)) {
      setProgressDraft(current => ({ ...current, [project.id]: "" }));
    }
  }

  return <section className={styles.panel}>
    <div className={styles.heading}>
      <div className={styles.headingTitle}><FolderKanban /><div><h2>Project Continuity</h2><p>Keep objectives, owners, milestones, tasks, decisions and progress connected</p></div></div>
      <button type="button" onClick={() => void loadProjects()} aria-label="Refresh projects"><RefreshCw size={15} /></button>
    </div>
    <form className={styles.form} onSubmit={createProject}>
      <h3><Plus size={16} /> Create project</h3>
      <label>Project title<input value={draft.title} maxLength={160} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} placeholder="Project name" required /></label>
      <label>Purpose and expected outcome<textarea value={draft.purpose} maxLength={5000} rows={3} onChange={event => setDraft(current => ({ ...current, purpose: event.target.value }))} placeholder="What is this project intended to achieve?" required /></label>
      <div className={styles.grid}>
        <label>Project owner<select value={draft.ownerAgentId} onChange={event => setDraft(current => ({ ...current, ownerAgentId: event.target.value }))}><option value="friday">FRIDAY — central coordination</option>{specialistAgents.filter(agent => agent.id !== "friday" && agent.id !== "nexus").map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
        <label>Priority<select value={draft.priority} onChange={event => setDraft(current => ({ ...current, priority: event.target.value as ProjectPayload["priority"] }))}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></label>
        <label>Start date<input type="date" value={draft.startDate ?? ""} onChange={event => setDraft(current => ({ ...current, startDate: event.target.value || null }))} /></label>
        <label>Target date<input type="date" value={draft.targetDate ?? ""} onChange={event => setDraft(current => ({ ...current, targetDate: event.target.value || null }))} /></label>
      </div>
      <label>Milestones (one per line: <code>Milestone title | YYYY-MM-DD</code>)<textarea rows={3} value={milestoneLines} onChange={event => setMilestoneLines(event.target.value)} placeholder={"Research and requirements | 2026-12-10\nPrototype complete | 2027-01-15"} /></label>
      <label>Tasks (one per line: <code>Task title | YYYY-MM-DD</code>)<textarea rows={3} value={taskLines} onChange={event => setTaskLines(event.target.value)} placeholder={"Review requirements | 2026-12-05\nPrepare initial design | 2026-12-12"} /></label>
      <button className={styles.primary} type="submit" disabled={busy || !draft.title.trim() || !draft.purpose.trim()}><Save size={15} /> {busy ? "Saving..." : "Save project"}</button>
    </form>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <div className={styles.list}>
      {loading ? <p className={styles.empty}>Loading project records…</p> : activeProjects.length === 0 ? <p className={styles.empty}>No active projects yet. Create one above to establish its continuity record.</p> : activeProjects.map(project => {
        const progress = projectProgress(project.payload);
        return <article className={styles.card} key={project.id}>
          <div className={styles.cardTop}><div><span className={styles.priority}>{project.payload.priority} priority</span><h3>{project.payload.title}</h3></div><select aria-label={"Status for " + project.payload.title} value={project.payload.status} disabled={busy} onChange={event => void updateProject(project, { ...project.payload, status: event.target.value as ProjectStatus })}><option value="planning">Planning</option><option value="active">Active</option><option value="on_hold">On hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div>
          <p className={styles.purpose}>{project.payload.purpose}</p>
          {project.integrityStatus === "legacy_unsealed" && <button type="button" className={styles.sealLegacy} disabled={busy} onClick={() => { if (window.confirm("I have reviewed this project. Re-encrypt and seal this project record?")) void updateProject(project, project.payload); }}>I reviewed this project — seal it</button>}
          <label className={styles.contextChoice}><input type="checkbox" checked={selectedForContext.includes(project.id)} disabled={project.integrityStatus !== "verified" || (!selectedForContext.includes(project.id) && selectedForContext.length >= 3)} onChange={event => toggleProjectContext(project.id, event.target.checked)} /> {project.integrityStatus === "verified" ? "Include in next FRIDAY message" : "Legacy record — review and seal before sharing"}</label>
          <div className={styles.meta}><span>Owner: {project.payload.ownerAgentId.toUpperCase()}</span><span>{project.payload.targetDate ? "Target: " + project.payload.targetDate : "No target date"}</span><span>Updated {new Date(project.updatedAt).toLocaleDateString()}</span></div>
          <div className={styles.progressLabel}><strong>{progress}% complete</strong><span>{project.payload.milestones.filter(item => item.status === "completed").length} / {project.payload.milestones.length} milestones · {project.payload.tasks.filter(item => item.status === "completed").length} / {project.payload.tasks.length} tasks</span></div>
          <div className={styles.progressTrack}><span style={{ width: progress + "%" }} /></div>
          {project.payload.milestones.length > 0 && <div className={styles.sublist}><strong>Milestones</strong>{project.payload.milestones.map(item => <div key={item.id}><span>{item.title}</span><small>{item.dueDate ?? "No date"} · {item.status.replaceAll("_", " ")}</small><select aria-label={"Milestone status " + item.title} value={item.status} disabled={busy} onChange={event => void updateProject(project, { ...project.payload, milestones: project.payload.milestones.map(m => m.id === item.id ? { ...m, status: event.target.value as typeof m.status } : m) })}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option></select></div>)}</div>}
          {project.payload.tasks.length > 0 && <div className={styles.sublist}><strong>Tasks</strong>{project.payload.tasks.map(item => <div key={item.id}><span>{item.title}</span><small>{item.dueDate ?? "No date"}</small><select aria-label={"Task status " + item.title} value={item.status} disabled={busy} onChange={event => void updateProject(project, { ...project.payload, tasks: project.payload.tasks.map(task => task.id === item.id ? { ...task, status: event.target.value as typeof task.status } : task) })}><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="blocked">Blocked</option></select></div>)}</div>}
          {project.payload.blockers.length > 0 && <div className={styles.blockers}><strong>Blockers</strong><ul>{project.payload.blockers.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
          <div className={styles.progressForm}><label htmlFor={"progress-" + project.id}>Progress update</label><textarea id={"progress-" + project.id} rows={2} value={progressDraft[project.id] ?? ""} onChange={event => setProgressDraft(current => ({ ...current, [project.id]: event.target.value }))} placeholder="Record a decision, milestone, blocker or progress update…" /><button type="button" disabled={busy || !(progressDraft[project.id] ?? "").trim()} onClick={() => void addProgress(project)}><Save size={14} /> Add update</button></div>
          {project.payload.progressUpdates.length > 0 && <div className={styles.updates}><strong>Recent updates</strong>{project.payload.progressUpdates.slice(0, 5).map(update => <p key={update.id}>{update.body}<small>{new Date(update.createdAt).toLocaleString()} · {update.agentId.toUpperCase()}</small></p>)}</div>}
        </article>;
      })}
    </div>
    <p className={styles.safety}><ShieldCheck size={15} /> Project details are encrypted before database storage and visible only to the authorised owner. Creating a project does not automatically assign tasks, contact anyone or authorise external actions. Project content is not sent to FRIDAY unless explicitly selected in a future context-sharing control.</p>
  </section>;
}
