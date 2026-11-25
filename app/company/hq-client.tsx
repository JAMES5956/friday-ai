"use client";

import { useState } from "react";
import { Building2, ChevronRight, Users, Video } from "lucide-react";

type Agent = { id: string; name: string; role: string; status: "foundation" | "planned" };

type Department = {
  id: string;
  name: string;
  floor: string;
  lead: string;
  purpose: string;
};

export default function HQClient({ departments, agents }: { departments: Department[]; agents: Agent[] }) {
  const [selected, setSelected] = useState(departments[0]?.id ?? "executive");
  const active = departments.find(department => department.id === selected) ?? departments[0];
  if (!active) return null;

  return (
    <section className="hq-layout">
      <div className="hq-tower-panel">
        <div className="hq-scene-label"><Building2 size={16} /> GLASS TOWER · VIRTUAL HQ</div>
        <div className="hq-tower" aria-label="Interactive conceptual company tower">
          <div className="hq-spire" />
          {departments.map(department => (
            <button
              type="button"
              key={department.id}
              className={`hq-floor ${selected === department.id ? "active" : ""}`}
              onClick={() => setSelected(department.id)}
              aria-pressed={selected === department.id}
              aria-label={`Floor ${department.floor}: ${department.name}`}
            >
              <span>{department.floor}</span><i />
            </button>
          ))}
          <div className="hq-podium"><span>FRIDAY AI</span><small>CORPORATE CAMPUS</small></div>
        </div>
        <p className="hq-instruction">Select a floor to explore its department.</p>
      </div>

      <div className="hq-detail-panel">
        <p className="auth-eyebrow">SELECTED DEPARTMENT · FLOOR {active.floor}</p>
        <h2>{active.name}</h2>
        <p className="hq-lead">Department lead: <strong>{active.lead}</strong></p>
        <p className="hq-purpose">{active.purpose}</p>
        <div className="hq-room-list">
          <article><Users size={17} /><div><strong>Department workspace</strong><span>Agent workspaces are planned for this department.</span></div></article>
          <article><Video size={17} /><div><strong>Meeting room</strong><span>Live meetings and conferencing are not connected yet.</span></div></article>
        </div>
        <div className="hq-agent-directory">
          <div className="hq-agent-heading"><strong>Specialist directory</strong><span>{agents.length} registered roles</span></div>
          {agents.map(agent => (
            <article className="hq-agent-row" key={agent.id}>
              <div><strong>{agent.name}</strong><span>{agent.role}</span></div>
              <span className={`hq-agent-status ${agent.status}`}>{agent.status === "foundation" ? "FOUNDATION" : "PLANNED"}</span>
            </article>
          ))}
          <p className="hq-agent-note">Directory only: specialist agents are not independently running yet. NEXUS currently provides the initial deterministic security gate.</p>
        </div>
        <div className="hq-detail-footer"><span>ACCESS</span><strong>OWNER VIEW</strong></div>
        <div className="hq-department-list">
          {departments.map(department => (
            <button type="button" key={department.id} onClick={() => setSelected(department.id)} className={selected === department.id ? "selected" : ""}>
              <span>F{department.floor}</span>{department.name}<ChevronRight size={14} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
