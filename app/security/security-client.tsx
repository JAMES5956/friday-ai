"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isTotpCode, normaliseTotpCode } from "@/lib/auth/totp-code";

type Factor = { id: string; friendlyName: string | null; status: string };
type Enrollment = { factorId: string; qrCode: string; secret: string };

export default function SecurityClient({ initialMode }: { initialMode: "setup" | "verify" }) {
  const router = useRouter();
  const [mode, setMode] = useState(initialMode);
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function loadStatus() {
    try {
      const response = await fetch("/api/security/mfa", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not load authenticator status.");
      setFactors(payload.factors ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load authenticator status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadStatus(); }, []);

  async function beginEnrollment() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/security/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "enroll" })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not start authenticator setup.");
      setEnrollment({ factorId: payload.factorId, qrCode: payload.qrCode, secret: payload.secret });
      setMode("setup");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start authenticator setup.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    const factorId = enrollment?.factorId ?? factors.find(factor => factor.status === "verified")?.id;
    if (!factorId) {
      setError("No authenticator factor is available. Start setup first.");
      return;
    }
    if (!isTotpCode(code.trim())) {
      setError("Enter the current 6–8 digit authenticator code.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/security/mfa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify", factorId, code: code.trim() })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message ?? "The authenticator code was not accepted.");
      setNotice(mode === "setup" ? "Authenticator successfully enabled." : "Identity verified.");
      const supabase = createClient();
      const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assurance?.currentLevel === "aal2") {
        window.setTimeout(() => router.replace("/workspace"), 700);
      } else {
        await loadStatus();
        setEnrollment(null);
        setCode("");
        setMode("verify");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Authenticator verification failed.");
    } finally {
      setBusy(false);
    }
  }

  const verifiedFactor = factors.find(factor => factor.status === "verified");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Link href="/workspace" className="auth-brand">FRIDAY<span className="brand-muted">.AI</span></Link>
        <p className="auth-eyebrow">NEXUS SECURITY · OWNER ONLY</p>
        <h1>{mode === "verify" ? "Verify it’s you, Boss." : "Secure FRIDAY access."}</h1>
        <p className="auth-copy">
          {mode === "verify"
            ? "Enter the current code from your authenticator app to complete sign-in."
            : "Add an authenticator app as a second factor for sensitive owner operations."}
        </p>

        {loading ? <p className="auth-notice">Checking authenticator status…</p> : null}

        {!loading && mode === "setup" && !enrollment && verifiedFactor ? (
          <div className="auth-notice">An authenticator is already enabled. You can verify a code or return to your workspace.</div>
        ) : null}

        {!loading && mode === "setup" && !enrollment && !verifiedFactor ? (
          <button type="button" onClick={() => void beginEnrollment()} disabled={busy}>
            {busy ? "Preparing…" : "Set up authenticator"}
          </button>
        ) : null}

        {enrollment ? (
          <div className="mfa-enrollment">
            <p>Scan this QR code with Google Authenticator, Microsoft Authenticator, 1Password or another TOTP app.</p>
            <img
              className="mfa-qr"
              src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(enrollment.qrCode)}`}
              alt="Authenticator setup QR code"
            />
            <p className="auth-notice">If you cannot scan it, enter this setup key manually:</p>
            <code className="mfa-secret">{enrollment.secret}</code>
          </div>
        ) : null}

        {!loading && (mode === "verify" || enrollment || verifiedFactor) ? (
          <form className="auth-form" onSubmit={event => { event.preventDefault(); void verifyCode(); }}>
            <label htmlFor="auth-code">Authenticator code</label>
            <input
              id="auth-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={event => setCode(normaliseTotpCode(event.target.value))}
              placeholder="123456"
              required
            />
            <button type="submit" disabled={busy || code.length < 6}>
              {busy ? "Verifying…" : mode === "setup" ? "Enable authenticator" : "Verify and continue"}
            </button>
          </form>
        ) : null}

        {error ? <p className="auth-error" role="alert">{error}</p> : null}
        {notice ? <p className="auth-notice" role="status">{notice}</p> : null}
        <div className="mfa-actions">
          {mode === "verify" && !enrollment ? (
            <button type="button" className="secondary-button" onClick={() => setMode("setup")}>Authenticator setup</button>
          ) : null}
          <Link href="/workspace">Return to workspace</Link>
        </div>
        <p className="auth-footnote">Never share your authenticator code or setup key. Keep a separate backup authenticator if possible.</p>
      </section>
    </main>
  );
}
