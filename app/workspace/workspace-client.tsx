"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BrainCircuit, Send, ShieldCheck, Sparkles, Plus, RefreshCw, Mic, Volume2 } from "lucide-react";

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};
type SpeechWindow = Window & {
  SpeechRecognition?: new () => SpeechRecognitionLike;
  webkitSpeechRecognition?: new () => SpeechRecognitionLike;
};

type ChatItem = { role: "user" | "assistant"; content: string };
type ConversationItem = { id: string; title: string; updated_at: string };\ntype MemoryItem = { id: string; category: string; content: string; created_at: string };
type SecurityEvent = { id: string; event_type: string; severity: string; created_at: string };

export default function WorkspaceClient() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();\n  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [includeMemory, setIncludeMemory] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [listening, setListening] = useState(false);

  function startVoiceInput() {
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Voice input is not supported by this browser. Try a current version of Chrome.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "en-KE";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setDraft(previous => previous ? previous + " " + transcript : transcript);
    };
    recognition.onerror = () => setStatus("Microphone input failed or permission was denied.");
    recognition.onend = () => setListening(false);
    setListening(true);
    try {
      recognition.start();
    } catch {
      setListening(false);
      setStatus("Could not start microphone input.");
    }
  }

  function speakLatestReply() {
    const latestReply = [...messages].reverse().find(item => item.role === "assistant");
    if (!latestReply || !("speechSynthesis" in window)) {
      setStatus("Speech output is not available in this browser yet.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(latestReply.content);
    utterance.lang = "en-KE";
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => voice.lang.toLowerCase() === "en-ke")
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith("en-gb"))
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith("en-us"));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1;
    utterance.pitch = 1.02;
    window.speechSynthesis.speak(utterance);
  }


  async function loadConversations(preferLatest = false) {
    try {
      const response = await fetch("/api/assistant", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not load conversation history."); return; }
      const items: ConversationItem[] = payload.conversations ?? [];
      setConversations(items);
      if (preferLatest && items[0]) await loadConversation(items[0].id);
    } catch { setStatus("Could not reach conversation history."); }
  }

  async function loadConversation(id: string) {
    try {
      const response = await fetch("/api/assistant?conversationId=" + encodeURIComponent(id), { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not load this conversation."); return; }
      setConversationId(id);
      setMessages((payload.messages ?? []).map((item: ChatItem) => ({ role: item.role, content: item.content })));
      setStatus("");
    } catch { setStatus("Could not reach conversation history."); }
  }

  function startNewConversation() {
    setConversationId(undefined);
    setMessages([]);
    setDraft("");
    setStatus("");
  }

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

  async function loadSecurityEvents() {
    try {
      const response = await fetch("/api/security/events", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok) setSecurityEvents(payload.events ?? []);
    } catch {
      // Keep the workspace usable if the audit feed is temporarily unavailable.
    }
  }

  useEffect(() => { void loadMemories(); void loadSecurityEvents(); void loadConversations(true); }, []);

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
      setMessages(previous => [...previous, { role: "assistant", content: payload.reply }]);\n      void loadConversations();
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
    <>
    <div className="workspace-content">
      <section className="workspace-chat">
        <div className="workspace-section-heading">
          <div><BrainCircuit /><div><h2>Talk to FRIDAY</h2><p>Private owner conversation</p></div></div>
          <span className="service-pill">PROVIDER CONFIG REQUIRED</span>
        </div>
        <div className="conversation-history" aria-label="Recent conversations">\n          <button type="button" className="new-conversation-button" onClick={startNewConversation}>+ New conversation</button>\n          {conversations.map(item => <button type="button" key={item.id} className={conversationId === item.id ? "conversation-item active" : "conversation-item"} onClick={() => void loadConversation(item.id)}>{item.title || "Private conversation"}<small>{new Date(item.updated_at).toLocaleDateString()}</small></button>)}\n        </div>\n        <div className="chat-transcript" aria-live="polite">
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
          <button type="button" onClick={startVoiceInput} disabled={listening} aria-label="Speak to FRIDAY"><Mic size={17} /></button>
          <button type="submit" disabled={!draft.trim() || sending} aria-label="Send message"><Send size={17} /></button>
        </form>
        <button type="button" className="speech-output-button" onClick={speakLatestReply}><Volume2 size={14} /> Speak latest FRIDAY reply</button>
        <p className="voice-note">{listening ? "Listening for your message. Tap the microphone permission prompt if shown." : "Voice input is push-to-talk only. No background listening is enabled."}</p>
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
    <section className="nexus-audit-panel">
      <div className="workspace-section-heading">
        <div><ShieldCheck /><div><h2>NEXUS security activity</h2><p>Recent owner-scoped security events</p></div></div>
        <button className="icon-button" onClick={() => void loadSecurityEvents()} aria-label="Refresh security events"><RefreshCw size={15} /></button>
      </div>
      <div className="nexus-event-list">
        {securityEvents.length === 0
          ? <p className="memory-empty">No security events recorded yet.</p>
          : securityEvents.map(event => <article className="nexus-event" key={event.id}><span className={`event-severity ${event.severity}`}>{event.severity}</span><strong>{event.event_type.replaceAll("_", " ")}</strong><time>{new Date(event.created_at).toLocaleString()}</time></article>)}
      </div>
    </section>
    </>
  );
}
