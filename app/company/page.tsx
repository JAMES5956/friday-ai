import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth/owner";
import { Sparkles } from "lucide-react";
import { departments } from "@/lib/company/departments";
import HQClient from "@/app/company/hq-client";

export const dynamic = "force-dynamic";

export default async function CompanyPage() {
  let session;
  try {
    session = await getOwnerSession();
  } catch {
    redirect("/login?setup=required");
  }
  if (!session.user) redirect("/login");

  return (
    <main className="company-shell">
      <header className="workspace-topbar">
        <a className="auth-brand" href="/workspace"><span className="brand-mark"><Sparkles size={17} /></span> FRIDAY AI CORPORATION</a>
        <a className="signout-button" href="/workspace">Return to workspace</a>
      </header>
      <section className="company-intro">
        <p className="auth-eyebrow">PRIVATE CORPORATE HEADQUARTERS</p>
        <h1>Welcome to the company,<br /><span>Boss.</span></h1>
        <p>Explore the planned FRIDAY AI Corporation headquarters and its specialist departments.</p>
      </section>
      <HQClient departments={[...departments]} />
      <p className="company-disclaimer">VIRTUAL HQ PREVIEW · Departments and agent roles are architectural placeholders. Live agent sessions, meetings, 3D navigation and manufacturing integrations are not connected yet.</p>
    </main>
  );
}
