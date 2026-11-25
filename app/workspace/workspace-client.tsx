"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BrainCircuit, Send, ShieldCheck, Sparkles, Plus, RefreshCw, Mic, Volume2 } from "lucide-react";

type SpeechResultEvent = { results: ArrayLike<ArrayLike<{ transcript: string }>> };
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
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
type ConversationItem = { id: string; title: string; updated_at: string };
type MemoryItem = { id: string; category: string; content: string; created_at: string };
type SecurityEvent = { id: string; event_type: string; severity: string; created_at: string };
type SpecialistRecommendation = { agentId: string; name: string; role: string; confidence: "high" | "moderate"; reason: string };

export default function WorkspaceClient() {
  const [messages, setMessages] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationId, setConversationId] = useState<string>();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [includeMemory, setIncludeMemory] = useState(false);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [memoryDraft, setMemoryDraft] = useState("");
  const [memoryBusy, setMemoryBusy] = useState(false);
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [listening, setListening] = useState(false);
  const [wakeWordActive, setWakeWordActive] = useState(false);
  const [speechLanguage, setSpeechLanguage] = useState("en-KE");
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [providerConfigured, setProviderConfigured] = useState(false);
  const [modelTier, setModelTier] = useState<string>();
  const [specialistRecommendation, setSpecialistRecommendation] = useState<SpecialistRecommendation | null>(null);
  const [lastUserRequest, setLastUserRequest] = useState("");
  const [handoffBusy, setHandoffBusy] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  function stopRecognition() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
    setWakeWordActive(false);
  }

  function startVoiceInput() {
    stopRecognition();
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Voice input is not supported by this browser. Try a current version of Chrome.");
      return;
    }
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = speechLanguage === "sheng" ? "en-KE" : speechLanguage;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim();
      if (transcript) setDraft(previous => previous ? previous + " " + transcript : transcript);
    };
    recognition.onerror = () => setStatus("Microphone input failed or permission was denied.");
    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };
    setListening(true);
    try { recognition.start(); }
    catch {
      recognitionRef.current = null;
      setListening(false);
      setStatus("Could not start microphone input.");
    }
  }

  function toggleWakeWord() {
    if (wakeWordActive) {
      stopRecognition();
      setStatus("Wake phrase listening stopped.");
      return;
    }
    const speechWindow = window as SpeechWindow;
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setStatus("Wake phrase listening is not supported by this browser.");
      return;
    }
    stopRecognition();
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = speechLanguage === "sheng" ? "en-KE" : speechLanguage;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = event => {
      const transcript = event.results[event.results.length - 1]?.[0]?.transcript?.trim() ?? "";
      const match = transcript.match(/(?:hey\s+)?friday[,:;\s]*(.*)$/i);
      if (!match) return;
      const command = match[1].trim();
      setDraft(command);
      setStatus(command ? "Wake phrase detected. Review your message and send when ready." : "I'm listening, Boss. Say your request after the wake phrase.");
      recognition.stop();
    };
    recognition.onerror = () => {
      setStatus("Wake phrase listening stopped because microphone access failed.");
      setWakeWordActive(false);
      setListening(false);
      recognitionRef.current = null;
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setWakeWordActive(false);
      setListening(false);
    };
    setListening(true);
    setWakeWordActive(true);
    setStatus("Wake phrase listening is active while this tab remains open.");
    try { recognition.start(); }
    catch {
      recognitionRef.current = null;
      setListening(false);
      setWakeWordActive(false);
      setStatus("Could not start wake phrase listening.");
    }
  }

  function speakText(text: string) {
    if (!("speechSynthesis" in window)) {
      setStatus("Speech output is not available in this browser yet.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voiceLocale = speechLanguage === "sheng" ? "en-KE" : speechLanguage;
    utterance.lang = voiceLocale;
    const languagePrefix = voiceLocale.split("-")[0].toLowerCase();
    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(voice => voice.lang.toLowerCase() === speechLanguage.toLowerCase())
      ?? voices.find(voice => voice.lang.toLowerCase().startsWith(languagePrefix));
    if (preferredVoice) utterance.voice = preferredVoice;
    utterance.rate = 1;
    utterance.pitch = 1.02;
    window.speechSynthesis.speak(utterance);
  }

  function speakLatestReply() {
    const latestReply = [...messages].reverse().find(item => item.role === "assistant");
    if (!latestReply) {
      setStatus("There is no FRIDAY reply to speak yet.");
      return;
    }
    speakText(latestReply.content);
  }


  async function loadConversations(preferLatest = false) {
    try {
      const response = await fetch("/api/assistant", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not load conversation history."); return; }
      const items: ConversationItem[] = payload.conversations ?? [];
      setProviderConfigured(Boolean(payload.providerConfigured));
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

  async function deleteConversation(id: string) {
    if (!window.confirm("Permanently delete this conversation and its messages?")) return;
    try {
      const response = await fetch("/api/assistant", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: id })
      });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not delete this conversation."); return; }
      setConversations(previous => previous.filter(item => item.id !== id));
      if (conversationId === id) startNewConversation();
      setStatus("Conversation deleted.");
    } catch { setStatus("Could not reach the conversation service."); }
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

  useEffect(() => { void loadMemories(); void loadSecurityEvents(); void loadConversations(true); return () => { recognitionRef.current?.stop(); window.speechSynthesis?.cancel(); }; // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const refreshConversations = () => { void loadConversations(); };
    window.addEventListener("friday:conversation-refresh", refreshConversations);
    return () => window.removeEventListener("friday:conversation-refresh", refreshConversations);
  }, [loadConversations]);

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
      setModelTier(payload.modelTier);
      setSpecialistRecommendation(payload.specialistRecommendation ?? null);
      setLastUserRequest(content);
      setMessages(previous => [...previous, { role: "assistant", content: payload.reply }]);
      if (autoSpeak) speakText(payload.reply);
      void loadConversations();
    } catch {
      setStatus("The FRIDAY service could not be reached.");
    } finally {
      setSending(false);
    }
  }

  async function handoffToSpecialist() {
    if (!specialistRecommendation || !lastUserRequest || handoffBusy) return;
    setHandoffBusy(true); setStatus("");
    try {
      const response = await fetch("/api/agents/tasks", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: specialistRecommendation.agentId, title: `Assist with: ${lastUserRequest.slice(0, 135)}`, description: lastUserRequest }) });
      const payload = await response.json();
      if (!response.ok) { setStatus(payload.error?.message ?? "Could not prepare the specialist handoff."); return; }
      setStatus(payload.message ?? "Task saved. Specialist execution is not enabled yet.");
    } catch { setStatus("Could not reach the specialist task service."); }
    finally { setHandoffBusy(false); }
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
          <span className={providerConfigured ? "service-pill ready" : "service-pill"}>{providerConfigured ? "MODEL PROVIDER READY" : "PROVIDER CONFIG REQUIRED"}</span>
        </div>
        <div className="conversation-history" aria-label="Recent conversations">
          <button type="button" className="new-conversation-button" onClick={startNewConversation}>+ New conversation</button>
          {conversations.map(item => <div className="conversation-item-wrap" key={item.id}><button type="button" className={conversationId === item.id ? "conversation-item active" : "conversation-item"} onClick={() => void loadConversation(item.id)}>{item.title || "Private conversation"}<small>{new Date(item.updated_at).toLocaleDateString()}</small></button><button type="button" className="conversation-delete-button" onClick={() => void deleteConversation(item.id)} aria-label="Delete conversation">×</button></div>)}
        </div>
        <div className="chat-transcript" aria-live="polite">
          {messages.length === 0 && (
            <div className="chat-empty">
              <Sparkles size={24} />
              <h3>Ready when you are, Boss.</h3>
              <p>{providerConfigured ? "Your model provider is connected. FRIDAY is ready for your instructions." : "Connect an approved model provider to enable FRIDAY replies."}</p>
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
        <div className="voice-controls">
          <label>Speech language
            <select value={speechLanguage} onChange={event => setSpeechLanguage(event.target.value)}>
              <option value="en-KE">English (Kenya)</option>
              <option value="sw-KE">Kiswahili (Kenya)</option>
              <option value="sheng">Sheng / mixed (Kenyan English recognition)</option>
            </select>
          </label>
          <label className="auto-speak-toggle"><input type="checkbox" checked={autoSpeak} onChange={event => setAutoSpeak(event.target.checked)} /> Speak replies automatically</label>
        </div>
        <div className="voice-action-row">
          <button type="button" className="speech-output-button" onClick={speakLatestReply}><Volume2 size={14} /> Speak latest reply</button>
          <button type="button" className="wake-word-button" onClick={toggleWakeWord} disabled={listening && !wakeWordActive}>{wakeWordActive ? "Stop wake phrase" : "Enable wake phrase"}</button>
        </div>
        <p className="voice-note">{wakeWordActive ? "Wake phrase mode listens for “Hey Friday” or “Friday” while this tab is open. Stop it anytime." : listening ? "Listening for your message. Tap the microphone permission prompt if shown." : "Push-to-talk is available. Wake phrase mode is optional and requires this page to stay open."} Browser speech recognition may send audio to the browser speech service; background listening is not guaranteed.</p>
        {modelTier && <p className="voice-note">Last response model tier: {modelTier}.</p>}
        {specialistRecommendation && <div className="specialist-recommendation">
          <p><strong>Suggested specialist: {specialistRecommendation.name}</strong> · {specialistRecommendation.role} ({specialistRecommendation.confidence} confidence)</p>
          <p>{specialistRecommendation.reason} FRIDAY remains in control; this is only a recommendation.</p>
          <button type="button" onClick={() => void handoffToSpecialist()} disabled={handoffBusy}>{handoffBusy ? "Saving task..." : `Prepare task for ${specialistRecommendation.name}`}</button>
          <small>Nothing runs automatically. This saves a task for review; specialist execution is not enabled.</small>
        </div>}
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
