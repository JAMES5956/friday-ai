import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth/owner";
import SecurityClient from "@/app/security/security-client";

export const dynamic = "force-dynamic";

export default async function SecurityPage({
  searchParams
}: {
  searchParams: Promise<{ mode?: string }>;
}) {
  let owner;
  try {
    owner = await getOwnerSession();
  } catch {
    redirect("/login?setup=required");
  }
  if (!owner.user) redirect("/login");
  const params = await searchParams;
  const mode = params.mode === "verify" ? "verify" : "setup";
  return <SecurityClient initialMode={mode} />;
}
