import { beforeEach, describe, expect, it, vi } from "vitest";

const { createClient } = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));

import { getOwnerSession } from "@/lib/auth/owner";

describe("owner session assurance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.FRIDAY_OWNER_EMAIL = "boss@example.test";
  });

  it("accepts the configured owner without requiring step-up MFA", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1", email: "BOSS@example.test" } },
          error: null
        }),
        signOut: vi.fn()
      }
    });

    const result = await getOwnerSession();
    expect(result.user?.id).toBe("owner-1");
  });

  it("rejects a non-owner account and signs it out", async () => {
    const signOut = vi.fn();
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "other", email: "other@example.test" } },
          error: null
        }),
        signOut
      }
    });

    const result = await getOwnerSession();
    expect(result.reason).toBe("NOT_OWNER");
    expect(signOut).toHaveBeenCalledOnce();
  });

  it("requires aal2 for protected owner operations", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1", email: "boss@example.test" } },
          error: null
        }),
        signOut: vi.fn(),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
            data: { currentLevel: "aal1", nextLevel: "aal2" },
            error: null
          })
        }
      }
    });

    const result = await getOwnerSession({ requireMfa: true });
    expect(result.user).toBeNull();
    expect(result.reason).toBe("MFA_REQUIRED");
  });

  it("allows the owner when no second factor is enrolled", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1", email: "boss@example.test" } },
          error: null
        }),
        signOut: vi.fn(),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
            data: { currentLevel: "aal1", nextLevel: "aal1" },
            error: null
          })
        }
      }
    });

    const result = await getOwnerSession({ requireMfa: true });
    expect(result.user?.id).toBe("owner-1");
  });

  it("accepts protected owner operations only at aal2", async () => {
    createClient.mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "owner-1", email: "boss@example.test" } },
          error: null
        }),
        signOut: vi.fn(),
        mfa: {
          getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
            data: { currentLevel: "aal2", nextLevel: "aal2" },
            error: null
          })
        }
      }
    });

    const result = await getOwnerSession({ requireMfa: true });
    expect(result.user?.id).toBe("owner-1");
  });
});
