"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LockKeyhole, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (signInError) throw signInError;

      const { data } = await supabase.auth.getUser();
      if (!data.user) throw new Error("Could not verify the signed-in account.");

      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) throw assuranceError;
      const destination = assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2"
        ? "/security?mode=verify"
        : "/workspace";
      router.replace(destination);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/" className="auth-brand">
          <span className="brand-mark"><Sparkles size={17} /></span>
          FRIDAY<span className="brand-muted">.AI</span>
        </Link>
        <div className="auth-icon"><LockKeyhole size={22} /></div>
        <p className="auth-eyebrow">OWNER ACCESS</p>
        <h1>Welcome back, Boss.</h1>
        <p className="auth-copy">Sign in with the authorised owner account to enter your private workspace.</p>
        <p className="auth-notice">Owner access only. Sign-in becomes available after the private database and authentication settings are configured.</p>
        <form className="auth-form" onSubmit={signIn}>
          <label htmlFor="email">Owner email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Verifying..." : "Enter FRIDAY"}</button>
        </form>
        <p className="auth-footnote">Private owner access. Public registration is disabled.</p>
      </section>
    </main>
  );
}
