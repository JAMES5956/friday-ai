import { NextResponse } from "next/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }
  if (!owner.user) {
    return NextResponse.json({ error: "Owner authentication required." }, { status: 401 });
  }

  let supabase;
  try {
    supabase = await createClient();
  } catch {
    return NextResponse.json({ error: "Security audit storage is not configured." }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("security_audit_events")
    .select("id, event_type, severity, details, created_at")
    .eq("user_id", owner.user.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: "Security audit feed is unavailable." }, { status: 503 });
  }

  return NextResponse.json(
    { events: data ?? [] },
    { headers: { "Cache-Control": "no-store" } }
  );
}
