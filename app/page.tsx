"use client";

import { useState } from "react";
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
          <div className="command-top"><span>COMMAND INTERFACE</span><span className="command-ready">DESIGN PREVIEW</span></div>
          <div className="command-input">
            <Mic size={18} />
            <input
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="The voice interface will be connected in a later stage..."
              aria-label="Command preview"
            />
            <button type="button" aria-label="Preview command" onClick={() => setMessage("")}>
              <ArrowUpRight size={18} />
            </button>
          </div>
          <p className="command-note">This is a visual foundation only. Voice recognition and AI responses are not connected yet.</p>
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
