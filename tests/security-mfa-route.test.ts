import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient, getOwnerSession } = vi.hoisted(() => ({
  createClient: vi.fn(),
  getOwnerSession: vi.fn()
}));

vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("@/lib/auth/owner", () => ({ getOwnerSession }));

import { POST } from "@/app/api/security/mfa/route";

describe("owner MFA verification route", () => {
  const factorId = "123e4567-e89b-42d3-a456-426614174000";
  const listFactors = vi.fn();
  const challenge = vi.fn();
  const verify = vi.fn();
  const getAuthenticatorAssuranceLevel = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    getOwnerSession.mockResolvedValue({ user: { id: "owner-1" }, reason: null });
    listFactors.mockResolvedValue({ data: { totp: [{ id: factorId, status: "verified" }] }, error: null });
    challenge.mockResolvedValue({ data: { id: "challenge-1" }, error: null });
    verify.mockResolvedValue({ error: null });
    getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" },
      error: null
    });
    createClient.mockResolvedValue({
      auth: {
        mfa: { listFactors, challenge, verify, getAuthenticatorAssuranceLevel }
      }
    });
  });

  it("allows an enrolled verified factor to complete a sign-in challenge", async () => {
    const response = await POST(new Request("https://friday.test/api/security/mfa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", factorId, code: "123456" })
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      verified: true,
      currentLevel: "aal2",
      nextLevel: "aal2"
    });
    expect(challenge).toHaveBeenCalledWith({ factorId });
    expect(verify).toHaveBeenCalledWith({ factorId, challengeId: "challenge-1", code: "123456" });
  });
});
