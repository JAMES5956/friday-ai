import { createHmac, timingSafeEqual } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";

export type TwilioConfig = {
  accountSid: string;
  authToken: string;
  fromNumber: string;
  ownerNumber: string;
  publicBaseUrl: string;
  voice: string;
  language: string;
};

export function getTwilioConfig(): TwilioConfig | null {
  if (process.env.FRIDAY_TELEPHONY_ENABLED !== "true") return null;
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  const ownerNumber = process.env.FRIDAY_OWNER_PHONE?.trim();
  const publicBaseUrl = process.env.FRIDAY_PUBLIC_BASE_URL?.trim();
  if (!accountSid || !authToken || !fromNumber || !ownerNumber || !publicBaseUrl) return null;
  if (!/^AC[a-f0-9]{32}$/i.test(accountSid)) return null;
  if (!/^\+[1-9]\d{7,14}$/.test(fromNumber) || !/^\+[1-9]\d{7,14}$/.test(ownerNumber)) return null;
  try {
    const base = new URL(publicBaseUrl);
    if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash || base.username || base.password) return null;
  } catch {
    return null;
  }
  return {
    accountSid,
    authToken,
    fromNumber,
    ownerNumber,
    publicBaseUrl: publicBaseUrl.replace(/\/$/, ""),
    voice: process.env.FRIDAY_TWILIO_VOICE?.trim() || "Polly.Amy",
    language: process.env.FRIDAY_CALL_LANGUAGE?.trim() || "en-GB"
  };
}

export function twilioWebhookUrl(request: Request) {
  const base = process.env.FRIDAY_PUBLIC_BASE_URL?.trim();
  if (!base) return null;
  try {
    const configured = new URL(base);
    if (configured.protocol !== "https:" || configured.pathname !== "/" || configured.search || configured.hash) return null;
    const incoming = new URL(request.url);
    return configured.origin + incoming.pathname + incoming.search;
  } catch {
    return null;
  }
}

export function computeTwilioSignature(authToken: string, url: string, params: URLSearchParams) {
  let payload = url;
  const keys = [...new Set([...params.keys()])].sort();
  for (const key of keys) {
    for (const value of params.getAll(key).sort()) payload += key + value;
  }
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function validateTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
  suppliedSignature: string | null
) {
  if (!suppliedSignature || suppliedSignature.length > 128) return false;
  const expected = computeTwilioSignature(authToken, url, params);
  const expectedBuffer = Buffer.from(expected, "utf8");
  const suppliedBuffer = Buffer.from(suppliedSignature, "utf8");
  return expectedBuffer.length === suppliedBuffer.length && timingSafeEqual(expectedBuffer, suppliedBuffer);
}

export function encodeCallState(value: string) {
  const compressed = deflateRawSync(Buffer.from(value, "utf8")).toString("base64url");
  return encryptPrivateData(compressed);
}

export function decodeCallState(token: string) {
  const compressed = Buffer.from(decryptPrivateData(token), "base64url");
  return inflateRawSync(compressed).toString("utf8");
}

export function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;"
  })[character] ?? character);
}

export function twimlResponse(xml: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${xml}</Response>`, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "no-store, max-age=0"
    }
  });
}

export async function createTwilioCall(config: TwilioConfig, destination: string, voiceUrl: string) {
  const body = new URLSearchParams({
    To: destination,
    From: config.fromNumber,
    Url: voiceUrl,
    Method: "POST"
  });
  let response: Response;
  try {
    response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body,
        cache: "no-store",
        signal: AbortSignal.timeout(15_000)
      }
    );
  } catch {
    return { ok: false as const, code: "TELEPHONY_PROVIDER_UNREACHABLE" };
  }
  if (!response.ok) return { ok: false as const, code: "TELEPHONY_PROVIDER_REJECTED" };
  let result: { sid?: string; status?: string };
  try {
    result = await response.json() as { sid?: string; status?: string };
  } catch {
    return { ok: false as const, code: "TELEPHONY_PROVIDER_INVALID_RESPONSE" };
  }
  if (!result.sid) return { ok: false as const, code: "TELEPHONY_PROVIDER_INVALID_RESPONSE" };
  return { ok: true as const, callSid: result.sid, status: result.status ?? "queued" };
}

export function buildPublicUrl(config: TwilioConfig, path: string) {
  return config.publicBaseUrl + path;
}
