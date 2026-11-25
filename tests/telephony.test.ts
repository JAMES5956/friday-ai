import { describe, expect, it } from "vitest";
import {
  computeTwilioSignature,
  validateTwilioSignature,
  escapeXml
} from "../lib/telephony/twilio";

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
});

describe("telephone output safety", () => {
  it("escapes XML characters before placing caller content into TwiML", () => {
    expect(escapeXml(`Victor & <Boss> "sir"`)).toBe("Victor &amp; &lt;Boss&gt; &quot;sir&quot;");
  });
});
