import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";

export const runtime = "nodejs";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("application/json")) return null;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 2_048) throw new RangeError("REQUEST_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 2_048) throw new RangeError("REQUEST_TOO_LARGE");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function ownerClient() {
  const owner = await getOwnerSession();
  if (!owner.user) return { error: fail("OWNER_AUTH_REQUIRED", "Sign in with the authorised owner account.", 401) } as const;
  return { owner: owner.user, supabase: await createClient() } as const;
}

export async function GET() {
  try {
    const context = await ownerClient();
    if ("error" in context) return context.error;

    const [factors, assurance] = await Promise.all([
      context.supabase.auth.mfa.listFactors(),
      context.supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    ]);
    if (factors.error || assurance.error) {
      return fail("MFA_STATUS_UNAVAILABLE", "Could not retrieve multi-factor authentication status.", 503);
    }

    return NextResponse.json({
      currentLevel: assurance.data.currentLevel,
      nextLevel: assurance.data.nextLevel,
      factors: factors.data.totp.map(factor => ({
        id: factor.id,
        friendlyName: factor.friendly_name,
        status: factor.status
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("MFA_STATUS_UNAVAILABLE", "Could not retrieve multi-factor authentication status.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const context = await ownerClient();
    if ("error" in context) return context.error;

    const payload = await readPayload(request);
    if (!payload) return fail("INVALID_PAYLOAD", "Send a valid JSON object.", 400);

    if (payload.action === "enroll") {
      const { data: factors, error: factorsError } = await context.supabase.auth.mfa.listFactors();
      if (factorsError) return fail("MFA_UNAVAILABLE", "Could not inspect existing authentication factors.", 503);
      if (factors.totp.some(factor => factor.status === "verified")) {
        return fail("MFA_ALREADY_ENABLED", "An authenticator factor is already enabled.", 409);
      }

      const { data, error } = await context.supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "FRIDAY owner authenticator"
      });
      if (error) return fail("MFA_ENROLLMENT_FAILED", "Could not start authenticator enrollment.", 503);

      return NextResponse.json({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
        uri: data.totp.uri
      }, { headers: { "Cache-Control": "no-store", "Pragma": "no-cache" } });
    }

    if (payload.action === "verify") {
      if (typeof payload.factorId !== "string" || !UUID.test(payload.factorId) ||
          typeof payload.code !== "string" || !/^\d{6,8}$/.test(payload.code)) {
        return fail("INVALID_MFA_CODE", "Provide the authenticator factor ID and its current verification code.", 400);
      }

      const { data: factors, error: factorsError } = await context.supabase.auth.mfa.listFactors();
      if (factorsError) return fail("MFA_UNAVAILABLE", "Could not inspect authentication factors.", 503);
      const factor = factors.totp.find(item => item.id === payload.factorId && (String(item.status) === "unverified" || String(item.status) === "verified"));
      if (!factor) return fail("MFA_FACTOR_NOT_FOUND", "The pending authenticator factor was not found.", 404);

      const { data: challenge, error: challengeError } =
        await context.supabase.auth.mfa.challenge({ factorId: factor.id });
      if (challengeError) return fail("MFA_CHALLENGE_FAILED", "Could not create an authenticator challenge.", 503);

      const { error: verifyError } = await context.supabase.auth.mfa.verify({
        factorId: factor.id,
        challengeId: challenge.id,
        code: payload.code
      });
      if (verifyError) return fail("MFA_VERIFICATION_FAILED", "The authenticator code was not accepted.", 401);

      const { data: assurance, error: assuranceError } =
        await context.supabase.auth.mfa.getAuthenticatorAssuranceLevel();
      if (assuranceError) return fail("MFA_STATUS_UNAVAILABLE", "Authenticator verification succeeded, but status could not be confirmed.", 503);

      return NextResponse.json({
        verified: true,
        currentLevel: assurance.currentLevel,
        nextLevel: assurance.nextLevel
      }, { headers: { "Cache-Control": "no-store" } });
    }

    return fail("INVALID_ACTION", "Supported actions are enroll and verify.", 400);
  } catch (error) {
    if (error instanceof RangeError) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    return fail("MFA_OPERATION_FAILED", "Could not complete the multi-factor authentication operation.", 503);
  }
}
