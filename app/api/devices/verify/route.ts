import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { buildDeviceProofMessage, verifyDeviceProof } from "@/lib/security/device-proof";

export const runtime = "nodejs";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(request: Request) {
  try {
    const owner = await getOwnerSession({ requireMfa: true });
    if (!owner.user) {
      const status = owner.reason === "MFA_REQUIRED" ? 403 : owner.reason === "MFA_CHECK_FAILED" ? 503 : 401;
      return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner and verify MFA.", status);
    }

    const contentType = (request.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("application/json")) return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 2_048) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    const payload: unknown = JSON.parse(raw);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return fail("INVALID_PAYLOAD", "Send a JSON object.", 400);
    }

    const values = payload as Record<string, unknown>;
    if (typeof values.challengeId !== "string" || !UUID.test(values.challengeId) ||
        typeof values.signature !== "string" || !/^[A-Za-z0-9_-]{86}$/.test(values.signature)) {
      return fail("INVALID_DEVICE_PROOF", "Provide a valid challenge ID and Ed25519 signature.", 400);
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("consume_device_challenge", {
      p_challenge_id: values.challengeId
    });

    const challenge = Array.isArray(data) ? data[0] : null;
    if (error || !challenge || challenge.owner_id !== owner.user.id ||
        typeof challenge.device_id !== "string" || typeof challenge.nonce !== "string" ||
        typeof challenge.expires_at !== "string" || typeof challenge.public_key !== "string") {
      return fail("DEVICE_CHALLENGE_INVALID", "The device challenge is expired, already used or unavailable.", 401);
    }

    const expiresAt = new Date(challenge.expires_at);
    if (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return fail("DEVICE_CHALLENGE_INVALID", "The device challenge has expired.", 401);
    }

    const message = buildDeviceProofMessage({
      challengeId: values.challengeId,
      ownerId: owner.user.id,
      deviceId: challenge.device_id,
      nonce: challenge.nonce,
      expiresAt: challenge.expires_at
    });

    if (!verifyDeviceProof(challenge.public_key, message, values.signature)) {
      return fail("DEVICE_PROOF_REJECTED", "The device could not prove possession of its registered private key.", 401);
    }

    return NextResponse.json({
      verified: true,
      deviceId: challenge.device_id
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("DEVICE_PROOF_UNAVAILABLE", "Could not verify device possession.", 503);
  }
}
