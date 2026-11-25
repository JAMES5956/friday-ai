import { NextResponse } from "next/server";
import {
  getTwilioConfig,
  twilioWebhookUrl,
  validateTwilioSignature,
  escapeXml,
  twimlResponse
} from "@/lib/telephony/twilio";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const config = getTwilioConfig();
  if (!config) return NextResponse.json({ error: "Telephony is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid telephony webhook." }, { status: 400 });
  }
  const params = new URLSearchParams();
  form.forEach((value, key) => {
    if (typeof value === "string") params.append(key, value);
  });
  const url = twilioWebhookUrl(request);
  if (!url || !validateTwilioSignature(config.authToken, url, params, request.headers.get("x-twilio-signature"))) {
    return NextResponse.json({ error: "Webhook signature verification failed." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  if (
    params.get("AccountSid") !== config.accountSid ||
    !params.get("CallSid") ||
    params.get("Direction") !== "outbound-api" ||
    params.get("From") !== config.fromNumber ||
    params.get("To") !== config.ownerNumber
  ) {
    return NextResponse.json({ error: "Unrecognised owner test call." }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  return twimlResponse(
    `<Say voice="${escapeXml(config.voice)}" language="${escapeXml(config.language)}">Hello, Boss. This is FRIDAY. Your phone connection test is successful. The full eight o'clock morning briefing is not enabled until your schedule and calendar sources are connected. Goodbye.</Say><Hangup/>`
  );
}
