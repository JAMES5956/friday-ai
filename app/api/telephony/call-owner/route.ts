import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";
import {
  getTwilioConfig,
  createTwilioCall,
  buildPublicUrl
} from "@/lib/telephony/twilio";

export const runtime = "nodejs";

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return fail("UNSUPPORTED_MEDIA_TYPE", "Send application/json.", 415);
  }
  let payload: { confirm?: unknown };
  try {
    payload = await request.json();
  } catch {
    return fail("INVALID_JSON", "Send a valid confirmation.", 400);
  }
  if (!payload || payload.confirm !== true) {
    return fail("EXPLICIT_CONFIRMATION_REQUIRED", "Confirm that you want FRIDAY to place a test call to your registered number.", 400);
  }

  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    return fail("AUTH_NOT_CONFIGURED", "Owner authentication is not configured.", 503);
  }
  if (!owner.user) return fail("OWNER_AUTH_REQUIRED", "Sign in as the authorised owner.", 401);

  const config = getTwilioConfig();
  if (!config) return fail("TELEPHONY_NOT_CONFIGURED", "Phone calling is disabled or its private provider settings are incomplete.", 503);

  let supabase: Awaited<ReturnType<typeof createClient>>;
  try {
    supabase = await createClient();
  } catch {
    return fail("AUDIT_UNAVAILABLE", "NEXUS cannot verify the call request. No call was placed.", 503);
  }
  const { error: auditError } = await supabase.from("security_audit_events").insert({
    user_id: owner.user.id,
    event_type: "owner_test_call_requested",
    severity: "info",
    details: { destination: "registered_owner_number" }
  });
  if (auditError) return fail("AUDIT_UNAVAILABLE", "NEXUS could not record the call request. No call was placed.", 503);

  const result = await createTwilioCall(
    config,
    config.ownerNumber,
    buildPublicUrl(config, "/api/telephony/owner-voice")
  );
  if (!result.ok) return fail(result.code, "The phone provider could not place the call.", 502);

  return NextResponse.json(
    { accepted: true, status: result.status, message: "Your test call has been queued to your registered number." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
