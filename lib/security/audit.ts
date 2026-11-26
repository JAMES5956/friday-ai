import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

export async function recordNexusIntegritySummary(
  supabase: SupabaseClient,
  ownerId: string,
  counts: { tampered: number; unreadable: number }
) {
  if (counts.tampered < 1 && counts.unreadable < 1) return;
  const summary = { tampered: counts.tampered, unreadable: counts.unreadable };
  const eventKey = createHash("sha256")
    .update("nexus-integrity-summary:v1\\0")
    .update(ownerId)
    .update("\\0")
    .update(JSON.stringify(summary))
    .digest("hex");

  const { error } = await supabase.from("security_audit_events").upsert({
    user_id: ownerId,
    event_type: "nexus_integrity_anomaly",
    severity: counts.tampered > 0 ? "critical" : "warning",
    details: summary,
    event_key: eventKey
  }, { onConflict: "user_id,event_key", ignoreDuplicates: true });

  if (error) throw new Error("NEXUS could not persist the integrity incident summary.");
}
