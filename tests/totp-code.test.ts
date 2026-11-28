import { describe, expect, it } from "vitest";
import { isTotpCode, normaliseTotpCode } from "@/lib/auth/totp-code";

describe("TOTP input helpers", () => {
  it("accepts only six to eight numeric digits", () => {
    expect(isTotpCode("123456")).toBe(true);
    expect(isTotpCode("12345678")).toBe(true);
    expect(isTotpCode("12345")).toBe(false);
    expect(isTotpCode("123456789")).toBe(false);
    expect(isTotpCode("12a456")).toBe(false);
    expect(isTotpCode("\\d12345")).toBe(false);
    expect(isTotpCode("")).toBe(false);
  });

  it("normalises pasted input to at most eight digits", () => {
    expect(normaliseTotpCode("12 34-56")).toBe("123456");
    expect(normaliseTotpCode("abc123456xyz")).toBe("123456");
    expect(normaliseTotpCode("123456789")).toBe("12345678");
    expect(normaliseTotpCode("letters only")).toBe("");
  });
});
