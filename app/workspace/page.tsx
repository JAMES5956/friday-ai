import { redirect } from "next/navigation";
import Link from "next/link";
import { getOwnerSession } from "@/lib/auth/owner";
import { Sparkles, LogOut, Users, ShieldCheck, Building2 } from "lucide-react";
import { signOut } from "@/app/workspace/sign-out";
import WorkspaceClient from "@/app/workspace/workspace-client";
import TaskCenter from "@/app/workspace/task-center";
import AgentMemoryPanel from "@/app/workspace/agent-memory";
import MemoryIntegrityPanel from "@/app/workspace/memory-integrity";
import KnowledgeArchive from "@/app/workspace/knowledge-archive";
import ProjectsPanel from "@/app/workspace/projects";
import { specialistAgents } from "@/lib/agents/registry";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  let session;
  try {
    session = await getOwnerSession();
  } catch {
    redirect("/login?setup=required");
  }
  if (!session.user) redirect("/login");

  return (
    <main className="workspace-shell">
      <header className="workspace-topbar">
        <div className="auth-brand"><span className="brand-mark"><Sparkles size={17} /></span> FRIDAY<span className="brand-muted">.AI</span></div>
        <div className="workspace-owner">OWNER SESSION VERIFIED</div>
        <Link className="signout-button" href="/company"><Building2 size={15} /> Company HQ</Link>
        <form action={signOut}><button className="signout-button" type="submit"><LogOut size={15} /> Sign out</button></form>
      </header>
      <section className="workspace-hero">
        <p className="auth-eyebrow">PRIVATE OWNER WORKSPACE</p>
        <h1>At your command,<br /><span>Boss.</span></h1>
        <p>Welcome to your private FRIDAY workspace. Your account is verified.</p>
      </section>
      <TaskCenter />
      <AgentMemoryPanel />
      <MemoryIntegrityPanel />
      <KnowledgeArchive />
      <ProjectsPanel />
      <WorkspaceClient />
      <section className="agent-section">
        <div className="workspace-section-heading"><div><Users /><div><h2>Specialist network</h2><p>Central orchestration with dedicated domains</p></div></div></div>
        <div className="agent-grid">
          {specialistAgents.map(agent => <article className="agent-card" key={agent.id}><strong>{agent.name}</strong><span>{agent.role}</span><small>{agent.status === "foundation" ? "SECURITY FOUNDATION" : "OWNER-TRIGGERED SPECIALIST"}</small></article>)}
        </div>
      </section>
      <footer className="workspace-footer"><ShieldCheck size={14} /> NEXUS SECURITY FOUNDATION · OWNER-ONLY ACCESS · PRE-DEPLOYMENT</footer>
    </main>
  );
}
