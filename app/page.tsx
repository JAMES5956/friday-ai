"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AudioLines,
  BrainCircuit,
  ShieldCheck,
  Sparkles,
  ArrowUpRight,
  Mic
} from "lucide-react";

const capabilities = [
  {
    icon: BrainCircuit,
    title: "Central intelligence",
    description: "One coordinating intelligence, supported by specialist agents."
  },
  {
    icon: ShieldCheck,
    title: "NEXUS security",
    description: "Independent security oversight, privacy controls and recovery."
  },
  {
    icon: AudioLines,
    title: "Voice-first interface",
    description: "A natural assistant experience designed around conversation."
  }
];

export default function Home() {
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [serviceStatus, setServiceStatus] = useState("");

  async function checkAssistant(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || isSending) return;

    setIsSending(true);
    setServiceStatus("");

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message })
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };

      setServiceStatus(
        result.error?.message ??
          (response.ok
            ? "FRIDAY received the request."
            : "FRIDAY could not process the request.")
      );
    } catch {
      setServiceStatus("FRIDAY could not be reached. Check your connection.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <main className="shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <Link className="brand" href="/" aria-label="FRIDAY AI home">
          <span className="brand-mark"><Sparkles size={17} /></span>
          <span>FRIDAY<span className="brand-muted">.AI</span></span>
        </Link>
        <div className="preview-status"><span /> FOUNDATION PREVIEW</div>
      </header>

      <section className="hero">
        <div className="eyebrow"><span className="eyebrow-line" /> PERSONAL INTELLIGENCE SYSTEM</div>
        <h1>At your command,<br /><span>Boss.</span></h1>
        <p className="hero-copy">
          A new kind of assistant. One intelligence coordinating capable agents,
          with your privacy and control at the centre.
        </p>

        <div className="core-stage" aria-label="Abstract glowing FRIDAY AI core illustration">
          <div className="orbit orbit-outer" />
          <div className="orbit orbit-middle" />
          <div className="orbit orbit-inner" />
          <div className="core-glow" />
          <div className="core">
            <div className="core-inner"><Sparkles size={34} strokeWidth={1.2} /></div>
          </div>
          <div className="core-caption">FRIDAY <span>•</span> CORE INTERFACE</div>
        </div>

        <div className="command-panel">
          <div className="command-top"><span>COMMAND INTERFACE</span><span className="command-ready">API CONNECTION TEST</span></div>
          <form className="command-input" onSubmit={checkAssistant}>
            <Mic size={18} aria-hidden="true" />
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Type a test message to check the assistant API..."
              aria-label="Test message for FRIDAY"
              maxLength={4000}
              disabled={isSending}
            />
            <button type="submit" aria-label="Send test message" disabled={!message.trim() || isSending}>
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="command-note" aria-live="polite">
            {isSending
              ? "Checking the FRIDAY API..."
              : serviceStatus ||
                "Text requests can reach the API boundary. AI responses are not enabled until authentication and a model provider are configured."}
          </p>
        </div>
      </section>

      <section className="capabilities" aria-label="Core design principles">
        {capabilities.map(({ icon: Icon, title, description }) => (
          <article className="capability" key={title}>
            <div className="capability-icon"><Icon size={20} strokeWidth={1.6} /></div>
            <div><h2>{title}</h2><p>{description}</p></div>
          </article>
        ))}
      </section>

      <footer className="footer">
        <span>FRIDAY AI CORPORATION</span>
        <span>PRIVATE BY DESIGN <i>•</i> BUILT FOR BOSS</span>
      </footer>
    </main>
  );
}
