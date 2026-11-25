import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

type CookieOptions = Parameters<NextResponse["cookies"]["set"]>[2];
type CookieToSet = { name: string; value: string; options?: CookieOptions };

export async function middleware(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const ownerEmail = process.env.FRIDAY_OWNER_EMAIL?.trim().toLowerCase();

  const isProtected =
    request.nextUrl.pathname.startsWith("/workspace") ||
    request.nextUrl.pathname.startsWith("/api/assistant");

  if (!isProtected) return NextResponse.next();

  if (!url || !anonKey || !ownerEmail) {
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "AUTH_NOT_CONFIGURED", message: "Owner authentication is not configured." } },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }
    const target = new URL("/login?setup=required", request.url);
    return NextResponse.redirect(target);
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        );
      }
    }
  });

  const { data, error } = await supabase.auth.getUser();
  const authenticatedOwner =
    !error && data.user?.email?.toLowerCase() === ownerEmail;

  if (!authenticatedOwner) {
    if (data.user) await supabase.auth.signOut();
    if (request.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "OWNER_AUTH_REQUIRED", message: "Sign in with the authorised owner account." } },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/workspace/:path*", "/api/assistant"]
};
