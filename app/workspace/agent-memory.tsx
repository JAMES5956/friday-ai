"use client";

import { useCallback, useEffect, useState } from "react";
import { Brain, RefreshCw, Plus, Trash2, Share2, ShieldCheck } from "lucide-react";
import { specialistAgents } from "@/lib/agents/registry";

type AgentMemory = { id: string; memoryType: string; sensitivity: string; content: string; expiresAt: string | null; createdAt: string };
type MemoryGrant = { id: string; memory_id: string; from_agent_id: string; to_agent_id: string; expires_at: string };
const agents = specialistAgents.filter(agent => agent.id !== "friday");

export default function AgentMemoryPanel() {
  const [agentId, setAgentId] = useState("oracle");
  const [recipientId, setRecipientId] = useState("forge");
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [grants, setGrants] = useState<MemoryGrant[]>([]);
  const [draft, setDraft] = useState("");
  const [memoryType, setMemoryType] = useState("working");
  const [sensitivity, setSensitivity] = useState("internal");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  const loadMemories = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/" + agentId + "/memory", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setMemories(payload.memories ?? []);
      else setStatus(payload.error?.message ?? "Could not load agent memory.");
    } catch { setStatus("Could not reach the agent memory service."); }
  }, [agentId]);

  const loadGrants = useCallback(async () => {
    try {
      const response = await fetch("/api/agents/" + recipientId + "/memory/grants", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setGrants(payload.grants ?? []);
      else setStatus(payload.error?.message ?? "Could not load memory-sharing permissions.");
    } catch { setStatus("Could not reach the memory-sharing service."); }
  }, [recipientId]);

  useEffect(() => { void loadMemories(); }, [loadMemories]);
  useEffect(() => { void loadGrants(); }, [loadGrants]);

  async function saveMemory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.trim() || busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/" + agentId + "/memory", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: draft, memoryType, sensitivity }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not save memory."); return; }
      setDraft(""); setStatus("Private memory saved."); await loadMemories();
    } catch { setStatus("Could not reach the agent memory service."); }
    finally { setBusy(false); }
  }

  async function deleteMemory(id: string) {
    if (!window.confirm("Permanently delete this specialist memory?")) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/" + agentId + "/memory", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not delete memory."); return; }
      setStatus("Memory deleted. Any grants attached to it are removed automatically."); await loadMemories(); await loadGrants();
    } catch { setStatus("Could not reach the agent memory service."); }
    finally { setBusy(false); }
  }

  async function shareMemory(memory: AgentMemory) {
    if (memory.sensitivity === "restricted" || busy) return;
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/" + recipientId + "/memory/grants", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryId: memory.id, expiresInDays: 30 }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not share this memory."); return; }
      setStatus("Memory access granted to " + recipientId.toUpperCase() + " for 30 days."); await loadGrants();
    } catch { setStatus("Could not reach the memory-sharing service."); }
    finally { setBusy(false); }
  }

  async function revokeGrant(grantId: string) {
    setBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/" + recipientId + "/memory/grants", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grantId }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not revoke access."); return; }
      setStatus("Memory-sharing permission revoked."); await loadGrants();
    } catch { setStatus("Could not reach the memory-sharing service."); }
    finally { setBusy(false); }
  }

  const agentName = (id: string) => specialistAgents.find(agent => agent.id === id)?.name ?? id.toUpperCase();
  return <section className="agent-memory-panel">
    <div className="workspace-section-heading"><div><Brain /><div><h2>Specialist memory control</h2><p>Separate encrypted memory for each agent, with owner-managed sharing</p></div></div><button className="icon-button" type="button" onClick={() => { void loadMemories(); void loadGrants(); }} aria-label="Refresh agent memory"><RefreshCw size={15} /></button></div>
    <div className="agent-memory-controls">
      <label>Agent memory<select value={agentId} onChange={event => setAgentId(event.target.value)}>{agents.map(agent => <option key={agent.id} value={agent.id}>{agent.name} — {agent.role}</option>)}</select></label>
      <label>Share access with<select value={recipientId} onChange={event => setRecipientId(event.target.value)}>{specialistAgents.filter(agent => agent.id !== agentId).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
    </div>
    <form className="memory-form" onSubmit={saveMemory}>
      <textarea value={draft} onChange={event => setDraft(event.target.value)} maxLength={10000} rows={3} placeholder={"Add a private note for " + agentName(agentId) + "..."} />
      <div className="agent-memory-controls">
        <label>Memory type<select value={memoryType} onChange={event => setMemoryType(event.target.value)}><option value="working">Working</option><option value="project">Project</option><option value="reference">Reference</option><option value="preference">Preference</option></select></label>
        <label>Sensitivity<select value={sensitivity} onChange={event => setSensitivity(event.target.value)}><option value="routine">Routine</option><option value="internal">Internal</option><option value="restricted">Restricted (never shared)</option></select></label>
      </div>
      <button type="submit" disabled={busy || !draft.trim()}><Plus size={15} /> Save private memory</button>
    </form>
    <div className="agent-memory-list">
      {memories.length === 0 ? <p className="memory-empty">No saved memories for this agent yet.</p> : memories.map(memory => <article className="memory-item" key={memory.id}>
        <div className="memory-item-heading"><span>{memory.memoryType} · {memory.sensitivity}</span><button type="button" onClick={() => void deleteMemory(memory.id)} disabled={busy}><Trash2 size={13} /> Delete</button></div>
        <p>{memory.content}</p>
        <button type="button" onClick={() => void shareMemory(memory)} disabled={busy || memory.sensitivity === "restricted" || recipientId === agentId}><Share2 size={13} /> Share with {agentName(recipientId)} for 30 days</button>
      </article>)}
    </div>
    <div className="agent-memory-grants">
      <h3><ShieldCheck size={15} /> Active permissions for {agentName(recipientId)}</h3>
      {grants.length === 0 ? <p className="memory-empty">No active memory-sharing permissions.</p> : grants.map(grant => <article className="nexus-event" key={grant.id}>
        <strong>{agentName(grant.from_agent_id)} → {agentName(grant.to_agent_id)}</strong><time>Expires {new Date(grant.expires_at).toLocaleDateString()}</time>
        <button type="button" onClick={() => void revokeGrant(grant.id)} disabled={busy}>Revoke</button>
      </article>)}
    </div>
    {status && <p className="workspace-status" role="status">{status}</p>}
    <p className="task-safety-note">Only explicitly shared, non-restricted memories are passed to another specialist. Sharing expires after 30 days by default and can be revoked. All other agent memory remains separate.</p>
  </section>;
}
