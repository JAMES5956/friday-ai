import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { isValidEd25519PublicKey } from "@/lib/security/device-proof";

export const runtime = "nodejs";

const DEVICE_ID = /^[A-Za-z0-9._:-]{16,128}$/;
const PLATFORMS = new Set(["android", "ios", "web", "windows", "macos", "linux", "wear_os", "watchos"]);

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

async function readPayload(request: Request): Promise<Record<string, unknown> | null> {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) return null;
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 12_288) throw new RangeError("REQUEST_TOO_LARGE");
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 12_288) throw new RangeError("REQUEST_TOO_LARGE");
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

async function ownerClient(requireMfa = false) {
  const owner = await getOwnerSession({ requireMfa });
  if (!owner.user) {
    const status = owner.reason === "MFA_REQUIRED" ? 403 : owner.reason === "MFA_CHECK_FAILED" ? 503 : 401;
    const message = owner.reason === "MFA_REQUIRED"
      ? "Verify your authenticator before changing registered devices."
      : owner.reason === "MFA_CHECK_FAILED"
        ? "NEXUS could not verify the current authentication assurance level."
        : "Sign in with the authorised owner account.";
    return { error: fail("OWNER_AUTH_REQUIRED", message, status) } as const;
  }
  return { owner: owner.user, supabase: await createClient() } as const;
}

export async function GET() {
  try {
    const context = await ownerClient();
    if ("error" in context) return context.error;
    const { data, error } = await context.supabase.from("owner_devices")
      .select("id, device_id, device_name, platform, status, created_at, last_seen_at, revoked_at")
      .eq("owner_id", context.owner.id)
      .order("created_at", { ascending: false });
    if (error) return fail("DEVICE_REGISTRY_UNAVAILABLE", "Could not load registered devices.", 503);
    return NextResponse.json({ devices: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return fail("DEVICE_REGISTRY_UNAVAILABLE", "Could not load registered devices.", 503);
  }
}

export async function POST(request: Request) {
  try {
    const context = await ownerClient(true);
    if ("error" in context) return context.error;
    const payload = await readPayload(request);
    if (!payload) return fail("INVALID_PAYLOAD", "Send a valid JSON object.", 400);

    if (typeof payload.deviceId !== "string" || !DEVICE_ID.test(payload.deviceId) ||
        typeof payload.deviceName !== "string" || payload.deviceName.trim().length < 1 || payload.deviceName.trim().length > 80 ||
        typeof payload.platform !== "string" || !PLATFORMS.has(payload.platform) ||
        typeof payload.publicKey !== "string" || payload.publicKey.length < 32 || payload.publicKey.length > 8192 || !isValidEd25519PublicKey(payload.publicKey)) {
      return fail("INVALID_DEVICE", "Provide a valid device ID, name, supported platform and Ed25519 public key.", 400);
    }

    const { data, error } = await context.supabase.from("owner_devices").insert({
      owner_id: context.owner.id,
      device_id: payload.deviceId,
      device_name: payload.deviceName.trim(),
      platform: payload.platform,
      public_key: payload.publicKey
    }).select("id, device_id, device_name, platform, status, created_at").single();

    if (error?.code === "23505") return fail("DEVICE_ALREADY_REGISTERED", "This device is already registered.", 409);
    if (error || !data) return fail("DEVICE_REGISTRATION_FAILED", "Could not register this device.", 503);

    return NextResponse.json({ device: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RangeError) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    return fail("DEVICE_REGISTRATION_FAILED", "Could not register this device.", 503);
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await ownerClient(true);
    if ("error" in context) return context.error;
    const payload = await readPayload(request);
    if (!payload) return fail("INVALID_PAYLOAD", "Send a valid JSON object.", 400);
    if (typeof payload.deviceId !== "string" || !DEVICE_ID.test(payload.deviceId) || payload.action !== "revoke") {
      return fail("INVALID_DEVICE_ACTION", "Provide a valid device ID and the revoke action.", 400);
    }

    const { data, error } = await context.supabase.from("owner_devices")
      .update({ status: "revoked", revoked_at: new Date().toISOString() })
      .eq("owner_id", context.owner.id)
      .eq("device_id", payload.deviceId)
      .eq("status", "active")
      .select("id, device_id, device_name, platform, status, revoked_at")
      .maybeSingle();

    if (error) return fail("DEVICE_REVOCATION_FAILED", "Could not revoke this device.", 503);
    if (!data) return fail("DEVICE_NOT_FOUND", "No active registered device matched that ID.", 404);
    return NextResponse.json({ device: data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RangeError) return fail("REQUEST_TOO_LARGE", "Request is too large.", 413);
    return fail("DEVICE_REVOCATION_FAILED", "Could not revoke this device.", 503);
  }
}
