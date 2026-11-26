import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOwnerSession } from "@/lib/auth/owner";
import { decryptPrivateData, encryptPrivateData } from "@/lib/security/encryption";
import { getMemoryExpiry, isMemorySensitivity } from "@/lib/memory/policy";

async function getDatabaseClient() {
  try {
    return await createClient();
  } catch {
    return null;
  }
}

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

  const supabase = await getDatabaseClient();
  if (!supabase) return NextResponse.json({ error: "Private database access is not configured." }, { status: 503 });
  const { data, error } = await supabase
    .from("memories")
    .select("id, category, content, source, confidence, retained, sensitivity, expires_at, source_reference, last_accessed_at, created_at, updated_at")
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

  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send application/json." }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 16_384) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > 16_384) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let payload: { content?: unknown; category?: unknown; sensitivity?: unknown; expiresInDays?: unknown; sourceReference?: unknown };
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
    }
    payload = parsed as typeof payload;
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }

  if (typeof payload.content !== "string" || !payload.content.trim() || payload.content.length > 10000) {
    return NextResponse.json({ error: "Memory must contain 1 to 10,000 characters." }, { status: 400 });
  }
  const category = typeof payload.category === "string" && /^[a-z0-9_-]{1,40}$/i.test(payload.category)
    ? payload.category
    : "general";
  const sensitivity = payload.sensitivity === undefined ? "internal" : payload.sensitivity;
  if (!isMemorySensitivity(sensitivity)) return NextResponse.json({ error: "Choose routine, internal or restricted sensitivity." }, { status: 400 });
  const expiresAt = getMemoryExpiry(payload.expiresInDays);
  if (expiresAt === undefined) return NextResponse.json({ error: "Expiry must be between 1 and 3,650 days." }, { status: 400 });
  if (payload.sourceReference !== undefined && (typeof payload.sourceReference !== "string" || payload.sourceReference.length > 500)) {
    return NextResponse.json({ error: "Source reference must be 500 characters or fewer." }, { status: 400 });
  }

  let encryptedContent: string;
  try {
    encryptedContent = encryptPrivateData(payload.content.trim());
  } catch {
    return NextResponse.json({ error: "Private memory encryption is not configured." }, { status: 503 });
  }

  const supabase = await getDatabaseClient();
  if (!supabase) return NextResponse.json({ error: "Private database access is not configured." }, { status: 503 });
  const { data: withinLimit, error: limitError } = await supabase.rpc("consume_rate_limit", { p_limit: 20 });
  if (limitError) return NextResponse.json({ error: "NEXUS request protection is unavailable." }, { status: 503 });
  if (!withinLimit) return NextResponse.json({ error: "Too many memory changes. Try again in a minute." }, { status: 429 });

  const { data, error } = await supabase
    .from("memories")
    .insert({ user_id: auth.user.id, category, content: encryptedContent, source: "owner", sensitivity, expires_at: expiresAt, source_reference: typeof payload.sourceReference === "string" ? payload.sourceReference.trim() || null : null })
    .select("id, category, sensitivity, expires_at, created_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not save memory. Check database setup." }, { status: 503 });
  return NextResponse.json({ memory: data }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export async function DELETE(request: Request) {
  const auth = await requireOwner();
  if (auth.error || !auth.user) return auth.error;

  if (!(request.headers.get("content-type") ?? "").toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send application/json." }, { status: 415 });
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > 1_024) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }
  if (new TextEncoder().encode(rawBody).byteLength > 1_024) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let payload: { id?: unknown };
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Send a JSON object." }, { status: 400 });
    }
    payload = parsed as typeof payload;
  } catch {
    return NextResponse.json({ error: "Send valid JSON." }, { status: 400 });
  }
  if (typeof payload.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(payload.id)) {
    return NextResponse.json({ error: "A valid memory ID is required." }, { status: 400 });
  }

  const supabase = await getDatabaseClient();
  if (!supabase) return NextResponse.json({ error: "Private database access is not configured." }, { status: 503 });
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
