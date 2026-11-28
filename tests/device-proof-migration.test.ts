import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261128124000_device_proof_of_possession.sql"),
  "utf8"
);

describe("device proof-of-possession migration", () => {
  it("keeps challenge records owner-scoped with restricted column grants", () => {
    expect(migration).toMatch(/alter table public\.device_challenges enable row level security/i);
    expect(migration).toMatch(/revoke all on table public\.device_challenges from public, anon, authenticated, service_role/i);
    expect(migration).toMatch(/grant select on table public\.device_challenges to authenticated/i);
    expect(migration).toMatch(/grant insert \(owner_id, device_id, nonce, expires_at\) on table public\.device_challenges to authenticated/i);
    expect(migration).toMatch(/grant update \(consumed_at\) on table public\.device_challenges to authenticated/i);
  });

  it("requires ownership and an active registered device to issue a challenge", () => {
    expect(migration).toMatch(/create policy "Owners read their own device challenges"[\s\S]*using \(\(select auth\.uid\(\)\) = owner_id\)/i);
    expect(migration).toMatch(/create policy "Owners issue challenges for active devices"[\s\S]*with check/i);
    expect(migration).toMatch(/d\.owner_id = \(select auth\.uid\(\)\)/i);
    expect(migration).toMatch(/d\.status = 'active'/i);
  });

  it("allows only a one-time consume transition before expiry", () => {
    expect(migration).toMatch(/create policy "Owners consume their own challenges once"[\s\S]*using/i);
    expect(migration).toMatch(/consumed_at is null/i);
    expect(migration).toMatch(/expires_at > now\(\)/i);
    expect(migration).toMatch(/with check \([\s\S]*consumed_at is not null/i);
  });
});
