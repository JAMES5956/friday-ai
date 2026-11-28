import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { buildDeviceProofMessage } from "@/lib/security/device-proof";

export const runtime = "nodejs";

const DEVICE_ID = /^[A-Za-z0-9._:-]{16,128}$/;

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

    const deviceId = (payload as Record<string, unknown>).deviceId;
    if (typeof deviceId !== "string" || !DEVICE_ID.test(deviceId)) {
      return fail("INVALID_DEVICE", "Provide a valid registered device ID.", 400);
    }

    const nonce = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + 120_000).toISOString();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("issue_device_challenge", {
      p_device_id: deviceId,
      p_nonce: nonce,
      p_expires_at: expiresAt
    });

    if (error || typeof data !== "string") {
      return fail("DEVICE_CHALLENGE_UNAVAILABLE", "Could not issue a challenge for this active device.", 404);
    }

    const message = buildDeviceProofMessage({
      challengeId: data,
      ownerId: owner.user.id,
      deviceId,
      nonce,
      expiresAt: String(Date.parse(expiresAt))
    });

    return NextResponse.json({
      challengeId: data,
      message,
      expiresAt
    }, { headers: { "Cache-Control": "no-store", Pragma: "no-cache" } });
  } catch {
    return fail("DEVICE_CHALLENGE_UNAVAILABLE", "Could not issue a device challenge.", 503);
  }
}
