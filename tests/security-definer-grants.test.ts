import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0012_harden_security_definer_grants.sql"),
  "utf8"
);

describe("NEXUS SECURITY DEFINER execution grants", () => {
  it("restricts the rate limiter RPC to authenticated sessions", () => {
    expect(migration).toMatch(
      /revoke all on function public\.consume_rate_limit\(integer\)\s+from public, anon, service_role/i
    );
    expect(migration).toMatch(
      /grant execute on function public\.consume_rate_limit\(integer\)\s+to authenticated/i
    );
  });

  it("blocks direct client access to the private rate-limit counter table", () => {
    expect(migration).toMatch(
      /revoke all on table public\.rate_limit_counters from public, anon, authenticated, service_role/i
    );
  });

  it("makes the auth trigger function unavailable as a client-callable RPC", () => {
    expect(migration).toMatch(
      /revoke all on function public\.handle_new_friday_user\(\)\s+from public, anon, authenticated, service_role/i
    );
  });
});
