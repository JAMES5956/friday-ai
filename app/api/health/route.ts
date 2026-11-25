import { NextResponse } from "next/server";

export function GET() {
  const checks = {
    ownerAuthenticationConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.FRIDAY_OWNER_EMAIL
    ),
    privateDataEncryptionConfigured: Boolean(process.env.FRIDAY_DATA_ENCRYPTION_KEY),
    aiProviderConfigured: Boolean(
      process.env.AI_BASE_URL &&
      process.env.AI_MODEL &&
      process.env.AI_API_KEY
    )
  };

  return NextResponse.json(
    {
      name: "FRIDAY AI",
      status: "pre-deployment",
      deployment: "not-deployed",
      checks,
      message: "The web application is responding. Readiness flags only confirm environment values exist; they do not verify external services."
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
