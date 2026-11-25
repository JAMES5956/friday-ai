import { afterEach, describe, expect, it } from "vitest";
import {
  computeTwilioSignature,
  validateTwilioSignature,
  escapeXml,
  encodeCallState,
  decodeCallState,
  getTwilioConfig
} from "../lib/telephony/twilio";

const originalEnv = { ...process.env };

afterEach(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnv)) delete process.env[key];
  }
  Object.assign(process.env, originalEnv);
});

describe("Twilio webhook verification", () => {
  it("validates the signature for the exact public URL and form fields", () => {
    const params = new URLSearchParams({ CallSid: "CA123", From: "+254700000000", SpeechResult: "Hello FRIDAY" });
    const signature = computeTwilioSignature("test-auth-token", "https://friday.example/api/telephony/turn", params);
    expect(validateTwilioSignature("test-auth-token", "https://friday.example/api/telephony/turn", params, signature)).toBe(true);
  });

  it("rejects a missing or incorrect signature", () => {
    const params = new URLSearchParams({ CallSid: "CA123" });
    expect(validateTwilioSignature("secret", "https://friday.example/hook", params, null)).toBe(false);
    expect(validateTwilioSignature("secret", "https://friday.example/hook", params, "wrong")).toBe(false);
  });

  it("rejects signatures if the URL or parameters change", () => {
    const params = new URLSearchParams({ CallSid: "CA123", From: "+254700000000" });
    const signature = computeTwilioSignature("secret", "https://friday.example/hook", params);
    expect(validateTwilioSignature("secret", "https://friday.example/other", params, signature)).toBe(false);
    expect(validateTwilioSignature("secret", "https://friday.example/hook", new URLSearchParams({ CallSid: "CA999", From: "+254700000000" }), signature)).toBe(false);
  });

  it("handles repeated form fields deterministically", () => {
    const first = new URLSearchParams();
    first.append("Digits", "2");
    first.append("Digits", "1");
    const second = new URLSearchParams();
    second.append("Digits", "1");
    second.append("Digits", "2");
    expect(computeTwilioSignature("secret", "https://friday.example/hook", first)).toBe(
      computeTwilioSignature("secret", "https://friday.example/hook", second)
    );
  });
});

describe("telephone output safety", () => {
  it("escapes XML characters before placing caller content into TwiML", () => {
    expect(escapeXml(`Victor & <Boss> "sir" 'hello'`)).toBe("Victor &amp; &lt;Boss&gt; &quot;sir&quot; &apos;hello&apos;");
  });
});

describe("encrypted call state", () => {
  it("round-trips call context using the application encryption key", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
    const state = JSON.stringify({ callSid: "CA123", turns: [{ role: "user", content: "Hello" }], count: 1 });
    const token = encodeCallState(state);
    expect(token).not.toContain("Hello");
    expect(decodeCallState(token)).toBe(state);
  });

  it("rejects tampered encrypted state", () => {
    process.env.FRIDAY_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString("base64");
    const token = encodeCallState("private state");
    const tampered = token.slice(0, -2) + "AA";
    expect(() => decodeCallState(tampered)).toThrow();
  });
});

describe("telephony configuration", () => {
  it("remains disabled unless explicitly enabled", () => {
    process.env.FRIDAY_TELEPHONY_ENABLED = "false";
    expect(getTwilioConfig()).toBeNull();
  });

  it("rejects incomplete or invalid provider settings", () => {
    process.env.FRIDAY_TELEPHONY_ENABLED = "true";
    process.env.TWILIO_ACCOUNT_SID = "not-a-sid";
    process.env.TWILIO_AUTH_TOKEN = "secret";
    process.env.TWILIO_PHONE_NUMBER = "+254700000000";
    process.env.FRIDAY_OWNER_PHONE = "+254711111111";
    process.env.FRIDAY_PUBLIC_BASE_URL = "http://friday.example";
    expect(getTwilioConfig()).toBeNull();
  });
});
