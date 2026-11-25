import { NextResponse } from "next/server";
import { encryptPrivateData } from "@/lib/security/encryption";

export function GET() {
  let privateDataEncryptionConfigured = false;
  try {
    // Validate key format and length without returning or persisting any secret.
    encryptPrivateData("readiness-check");
    privateDataEncryptionConfigured = true;
  } catch {
    privateDataEncryptionConfigured = false;
  }

  const checks = {
    ownerAuthenticationConfigured: Boolean(
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
      process.env.FRIDAY_OWNER_EMAIL
    ),
    privateDataEncryptionConfigured,
    aiProviderConfigured: Boolean(
      process.env.AI_BASE_URL &&
      process.env.AI_MODEL &&
      process.env.AI_API_KEY
    )
  };
  const configurationPresent = Object.values(checks).every(Boolean);

  return NextResponse.json(
    {
      name: "FRIDAY AI",
      status: configurationPresent ? "configuration-present" : "pre-deployment",
      deployment: "runtime-not-verified",
      checks,
      message: "These readiness checks validate required environment configuration only. They do not verify Supabase connectivity, owner sign-in, or AI provider availability."
    },
    {
      status: configurationPresent ? 200 : 503,
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
