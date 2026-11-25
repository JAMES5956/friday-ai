import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth/owner";
import { Sparkles, ShieldCheck, BrainCircuit, LogOut } from "lucide-react";
import { signOut } from "@/app/workspace/sign-out";

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
        <form action={signOut}><button className="signout-button" type="submit"><LogOut size={15} /> Sign out</button></form>
      </header>
      <section className="workspace-hero">
        <p className="auth-eyebrow">PRIVATE OWNER WORKSPACE</p>
        <h1>At your command,<br /><span>Boss.</span></h1>
        <p>Your private FRIDAY workspace is protected by owner authentication.</p>
      </section>
      <section className="workspace-grid">
        <article><BrainCircuit /><h2>FRIDAY Intelligence</h2><p>Central orchestration is the next implementation milestone. No model provider is connected yet.</p><span>IN DEVELOPMENT</span></article>
        <article><ShieldCheck /><h2>NEXUS Security</h2><p>Owner-only access is enforced at the application boundary. Security monitoring and audit automation remain under development.</p><span>FOUNDATION</span></article>
        <article><Sparkles /><h2>Persistent Memory</h2><p>Database schema and access policies are being prepared. Memory storage is not active until the database is configured.</p><span>PREPARATION</span></article>
      </section>
    </main>
  );
}
