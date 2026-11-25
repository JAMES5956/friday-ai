"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, RefreshCw, ShieldCheck, Send } from "lucide-react";
import { specialistAgents } from "@/lib/agents/registry";

type Task = { id: string; assigned_agent_id: string; title: string; description: string; result?: string | null; status: string; created_at: string };

export default function TaskCenter() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [agentId, setAgentId] = useState("oracle");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const loadTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/tasks", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setTasks(payload.tasks ?? []);
      else setStatus(payload.error?.message ?? "Task queue unavailable. Apply migrations 0003 and 0004.");
    } catch { setStatus("Could not reach the task service."); }
  }, []);

  useEffect(() => { void loadTasks(); }, [loadTasks]);

  async function createTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !title.trim() || !description.trim()) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/tasks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, title, description }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not queue this task."); return; }
      setTitle(""); setDescription(""); setStatus(payload.message ?? "Task saved."); await loadTasks();
    } catch { setStatus("Could not reach the task service."); }
    finally { setBusy(false); }
  }

  async function runTask(taskId: string) {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/agents/tasks/${taskId}/execute`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not execute this task."); return; }
      setStatus(payload.message ?? "Specialist task completed."); await loadTasks();
    } catch { setStatus("Could not reach the specialist execution service."); }
    finally { setBusy(false); }
  }

  async function approveTask(taskId: string) {
    if (busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch(`/api/agents/tasks/${taskId}/approve`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not approve this task."); return; }
      setStatus(payload.message ?? "Approval recorded."); await loadTasks();
    } catch { setStatus("Could not reach the approval service."); }
    finally { setBusy(false); }
  }

  const agentName = (id: string) => specialistAgents.find(agent => agent.id === id)?.name ?? id.toUpperCase();
  return <section className="task-center">
    <div className="workspace-section-heading"><div><ClipboardList /><div><h2>Delegation & task control</h2><p>Assign work, review approvals and track the queue</p></div></div><button className="icon-button" type="button" onClick={() => void loadTasks()} aria-label="Refresh tasks"><RefreshCw size={15} /></button></div>
    <form className="task-form" onSubmit={createTask}>
      <label>Specialist<select value={agentId} onChange={event => setAgentId(event.target.value)}>{specialistAgents.filter(agent => agent.id !== "friday").map(agent => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role}</option>)}</select></label>
      <label>Task title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="e.g. Research a market opportunity" required /></label>
      <label>Task details<textarea value={description} onChange={event => setDescription(event.target.value)} maxLength={10000} rows={3} placeholder="Describe the work and expected outcome..." required /></label>
      <button type="submit" disabled={busy || !title.trim() || !description.trim()}><Send size={15} /> {busy ? "Saving..." : "Queue task"}</button>
    </form>
    {status && <p className="workspace-status" role="status">{status}</p>}
    <div className="task-list">{tasks.length === 0 ? <p className="memory-empty">No tasks yet. Create a task above to start the delegation queue.</p> : tasks.map(task => <article className="task-item" key={task.id}>
      <div className="task-item-top"><div><strong>{task.title}</strong><span>{agentName(task.assigned_agent_id)} · {new Date(task.created_at).toLocaleString()}</span></div><span className={`task-status ${task.status}`}>{task.status.replaceAll("_", " ")}</span></div>
      <p>{task.description}</p>{task.result && <div className="task-result"><strong>Specialist result</strong><p>{task.result}</p></div>}{task.status === "queued" && <button type="button" disabled={busy} onClick={() => void runTask(task.id)}><Send size={15} /> Run specialist</button>}{task.status === "failed" && <button type="button" disabled={busy} onClick={() => void runTask(task.id)}>Retry specialist</button>}{task.status === "awaiting_approval" && <button type="button" disabled={busy} onClick={() => void approveTask(task.id)}><ShieldCheck size={15} /> Approve task</button>}
    </article>)}</div>
    <p className="task-safety-note">Running a queued task invokes only its assigned specialist model and private working memory. Specialists cannot execute external actions. Sensitive tasks remain blocked until you approve them.</p>
  </section>;
}
