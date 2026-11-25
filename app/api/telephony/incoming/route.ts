import { NextResponse } from "next/server";
import {
  getTwilioConfig,
  twilioWebhookUrl,
  validateTwilioSignature,
  escapeXml,
  twimlResponse,
  buildPublicUrl
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
  if (params.get("AccountSid") !== config.accountSid || !params.get("CallSid")) {
    return NextResponse.json({ error: "Unrecognised telephony account or call." }, { status: 403 });
  }

  const action = escapeXml(buildPublicUrl(config, "/api/telephony/turn"));
  const greeting = "Hello. You've reached FRIDAY, Victor's assistant. How may I help you today?";
  return twimlResponse(
    `<Gather input="speech" action="${action}" method="POST" speechTimeout="auto" language="${escapeXml(config.language)}" timeout="7"><Say voice="${escapeXml(config.voice)}" language="${escapeXml(config.language)}">${greeting}</Say></Gather><Say voice="${escapeXml(config.voice)}" language="${escapeXml(config.language)}">I didn't hear anything. Please call again when you're ready. Goodbye.</Say><Hangup/>`
  );
}
