import { createClient } from "@/lib/supabase/server";

type OwnerSessionOptions = {
  requireMfa?: boolean;
};

export async function getOwnerSession(options: OwnerSessionOptions = {}) {
  const ownerEmail = process.env.FRIDAY_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail) {
    return { user: null, reason: "OWNER_NOT_CONFIGURED" as const };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user) {
    return { user: null, reason: "UNAUTHENTICATED" as const };
  }

  if (data.user.email?.toLowerCase() !== ownerEmail) {
    await supabase.auth.signOut();
    return { user: null, reason: "NOT_OWNER" as const };
  }

  if (options.requireMfa) {
    const { data: assurance, error: assuranceError } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

    if (assuranceError) {
      return { user: null, reason: "MFA_CHECK_FAILED" as const };
    }
    if (assurance.nextLevel === "aal2" && assurance.currentLevel !== "aal2") {
      return { user: null, reason: "MFA_REQUIRED" as const };
    }
  }

  return { user: data.user, reason: null };
}
