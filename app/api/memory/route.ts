import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";

export async function GET() {
  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }
  if (!owner.user) return NextResponse.json({ error: "Owner authentication required." }, { status: 401 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, category, content, source, confidence, retained, created_at, updated_at")
    .eq("user_id", owner.user.id)
    .eq("retained", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Memory database is unavailable." }, { status: 503 });
  return NextResponse.json({ memories: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    return NextResponse.json({ error: "Authentication is not configured." }, { status: 503 });
  }
  if (!owner.user) return NextResponse.json({ error: "Owner authentication required." }, { status: 401 });

  let payload: { content?: unknown; category?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }

  if (typeof payload.content !== "string" || !payload.content.trim() || payload.content.length > 10000) {
    return NextResponse.json({ error: "Memory must contain 1 to 10,000 characters." }, { status: 400 });
  }
  const category = typeof payload.category === "string" && /^[a-z0-9_-]{1,40}$/i.test(payload.category)
    ? payload.category
    : "general";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memories")
    .insert({ user_id: owner.user.id, category, content: payload.content.trim(), source: "owner" })
    .select("id, category, content, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not save memory. Check database setup." }, { status: 503 });
  return NextResponse.json({ memory: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
