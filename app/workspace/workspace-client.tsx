"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BrainCircuit, Send, ShieldCheck, Sparkles, Plus, RefreshCw } from "lucide-react";

type ChatItem = { role: "user" | "assistant"; content: string };
type MemoryItem = { id: string; category: string; content: string; created_at: string };

export default function WorkspaceClient() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [includeMemory, setIncludeMemory] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);

  async function loadMemories() {
    try {
      const response = await fetch("/api/memory", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setMemories(payload.memories ?? []);
      else setStatus(payload.error ?? "Memory service is not configured.");
    } catch {
      setStatus("Could not reach the memory service.");
    }
  }

  useEffect(() => { void loadMemories(); }, []);

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || sending) return;
    setMessages(previous => [...previous, { role: "user", content }]);
    setDraft("");
    setSending(true);
    setStatus("");
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content, conversationId, includeMemory })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error?.message ?? "FRIDAY could not complete the request.");
        return;
      }
      setConversationId(payload.conversationId);
      setMessages(previous => [...previous, { role: "assistant", content: payload.reply }]);
    } catch {
      setStatus("The FRIDAY service could not be reached.");
    } finally {
      setSending(false);
    }
  }

  async function deleteMemory(id: string) {
    const confirmed = window.confirm("Permanently delete this saved memory?");
    if (!confirmed) return;
    try {
      const response = await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error ?? "Could not delete memory.");
        return;
      }
      await loadMemories();
    } catch {
      setStatus("Could not reach the memory service.");
    }
  }

  async function saveMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = memoryDraft.trim();
    if (!content || memoryBusy) return;
    setMemoryBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, category: "owner_note" })
      });
      const payload = await response.json();
      if (!response.ok) {
        setStatus(payload.error ?? "Could not save this memory.");
        return;
      }
      setMemoryDraft("");
      await loadMemories();
    } catch {
      setStatus("Could not reach the memory service.");
    } finally {
      setMemoryBusy(false);
    }
  }

  return (
    <div className="workspace-content">
      <section className="workspace-chat">
        <div className="workspace-section-heading">
          <div><BrainCircuit /><div><h2>Talk to FRIDAY</h2><p>Private owner conversation</p></div></div>
          <span className="service-pill">PROVIDER CONFIG REQUIRED</span>
        </div>
        <div className="chat-transcript" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={24} />
              <h3>Ready when you are, Boss.</h3>
              <p>The conversation service is prepared. Connect an approved model provider to enable replies.</p>
            </div>
          )}
          {messages.map((item, index) => (
            <div className={`chat-message ${item.role}`} key={index}>
              <span>{item.role === "user" ? "BOSS" : "FRIDAY"}</span>
              <p>{item.content}</p>
            </div>
          ))}
          {sending && <div className="chat-message assistant"><span>FRIDAY</span><p>Thinking...</p></div>}
        </div>
        <label className="memory-context-toggle">
          <input type="checkbox" checked={includeMemory} onChange={event => setIncludeMemory(event.target.checked)} />
          Include my saved memories in this conversation
        </label>
        <form className="chat-composer" onSubmit={sendMessage}>
          <textarea value={draft} onChange={event => setDraft(event.target.value)} placeholder="Send a message to FRIDAY..." maxLength={4000} rows={2} />
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><Send size={17} /></button>
        </form>
        {status && <p className="workspace-status" role="status">{status}</p>}
        <p className="workspace-disclaimer">No external actions are executed from this chat. Sensitive actions require a separate approval workflow.</p>
      </section>

      <aside className="workspace-memory">
        <div className="workspace-section-heading">
          <div><ShieldCheck /><div><h2>Private memory</h2><p>Owner-controlled notes</p></div></div>
          <button className="icon-button" onClick={() => void loadMemories()} aria-label="Refresh memory"><RefreshCw size={15} /></button>
        </div>
        <form className="memory-form" onSubmit={saveMemory}>
          <textarea value={memoryDraft} onChange={event => setMemoryDraft(event.target.value)} placeholder="Add a fact or note for FRIDAY to retain..." rows={3} maxLength={10000} />
          <button type="submit" disabled={!memoryDraft.trim() || memoryBusy}><Plus size={15} /> Save memory</button>
        </form>
        <div className="memory-list">
          {memories.length === 0
            ? <p className="memory-empty">No saved notes yet. Database configuration is required.</p>
            : memories.map(memory => <article className="memory-item" key={memory.id}><div className="memory-item-heading"><span>{memory.category}</span><button type="button" onClick={() => void deleteMemory(memory.id)}>Delete</button></div><p>{memory.content}</p></article>)}
        </div>
      </aside>
    </div>
  );
}
