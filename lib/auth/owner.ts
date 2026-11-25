import { createClient } from "@/lib/supabase/server";

export async function getOwnerSession() {
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

  return { user: data.user, reason: null };
}
