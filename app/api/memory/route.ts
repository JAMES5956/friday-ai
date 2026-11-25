import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";

async function requireOwner() {
  try {
    const owner = await getOwnerSession();
    return owner.user
      ? { user: owner.user, error: null }
      : { user: null, error: NextResponse.json({ error: "Owner authentication required." }, { status: 401 }) };
  } catch {
    return { user: null, error: NextResponse.json({ error: "Authentication is not configured." }, { status: 503 }) };
  }
}

export async function GET() {
  const auth = await requireOwner();
  if (auth.error || !auth.user) return auth.error;

  try {
    encryptPrivateData("configuration-check");
  } catch {
    return NextResponse.json({ error: "Private memory encryption is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memories")
    .select("id, category, content, source, confidence, retained, created_at, updated_at")
    .eq("user_id", auth.user.id)
    .eq("retained", true)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: "Memory database is unavailable." }, { status: 503 });

  try {
    return NextResponse.json({
      memories: (data ?? []).map(memory => ({
        ...memory,
        content: decryptPrivateData(memory.content)
      }))
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Memory could not be decrypted. Check the encryption key." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const auth = await requireOwner();
  if (auth.error || !auth.user) return auth.error;

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

  let encryptedContent: string;
  try {
    encryptedContent = encryptPrivateData(payload.content.trim());
  } catch {
    return NextResponse.json({ error: "Private memory encryption is not configured." }, { status: 503 });
  }

  const supabase = await createClient();
  const { data: withinLimit, error: limitError } = await supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (limitError) return NextResponse.json({ error: "NEXUS request protection is unavailable." }, { status: 503 });
  if (!withinLimit) return NextResponse.json({ error: "Too many memory changes. Try again in a minute." }, { status: 429 });

  const { data, error } = await supabase
    .from("memories")
    .insert({ user_id: auth.user.id, category, content: encryptedContent, source: "owner" })
    .select("id, category, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not save memory. Check database setup." }, { status: 503 });
  return NextResponse.json({ memory: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (auth.error || !auth.user) return auth.error;

  let payload: { id?: unknown };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }
  if (typeof payload.id !== "string" || !/^[0-9a-f-]{36}$/i.test(payload.id)) {
    return NextResponse.json({ error: "A valid memory ID is required." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: withinLimit, error: limitError } = await supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (limitError) return NextResponse.json({ error: "NEXUS request protection is unavailable." }, { status: 503 });
  if (!withinLimit) return NextResponse.json({ error: "Too many memory changes. Try again in a minute." }, { status: 429 });

  const { error } = await supabase
    .from("memories")
    .delete()
    .eq("id", payload.id)
    .eq("user_id", auth.user.id);

  if (error) return NextResponse.json({ error: "Could not delete memory." }, { status: 503 });
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}
