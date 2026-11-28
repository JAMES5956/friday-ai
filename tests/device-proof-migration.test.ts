import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261128124000_device_proof_of_possession.sql"),
  "utf8"
);

describe("device proof-of-possession migration", () => {
  it("keeps challenge records inaccessible through direct client table access", () => {
    expect(migration).toMatch(/alter table public\.device_challenges enable row level security/i);
    expect(migration).toMatch(/revoke all on table public\.device_challenges from public, anon, authenticated, service_role/i);
    expect(migration).not.toMatch(/grant\s+select|grant\s+insert|grant\s+update/i);
  });

  it("restricts challenge issuance and consumption to the authenticated owner", () => {
    expect(migration).toMatch(/d\.owner_id = v_owner_id/i);
    expect(migration).toMatch(/d\.status = 'active'/i);
    expect(migration).toMatch(/c\.owner_id = auth\.uid\(\)/i);
    expect(migration).toMatch(/c\.consumed_at is null/i);
    expect(migration).toMatch(/c\.expires_at > now\(\)/i);
    expect(migration).toMatch(/grant execute on function public\.issue_device_challenge[\s\S]*to authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.consume_device_challenge[\s\S]*to authenticated/i);
  });
});
