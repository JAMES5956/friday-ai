import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261127075441_correct_live_security_permissions.sql"),
  "utf8"
);

describe("live NEXUS permission correction", () => {
  it("removes direct access to rate-limit counters for API roles", () => {
    expect(migration).toMatch(
      /revoke all privileges on table public\.rate_limit_counters\s+from public, anon, authenticated, service_role/i
    );
  });

  it("limits owner-device insertion and update to the required columns", () => {
    expect(migration).toMatch(
      /grant insert \(owner_id, device_id, device_name, platform, public_key\)\s+on table public\.owner_devices to authenticated/i
    );
    expect(migration).toMatch(
      /grant update \(status, revoked_at\)\s+on table public\.owner_devices to authenticated/i
    );
    expect(migration).not.toMatch(
      /grant select, insert, update on (?:table )?public\.owner_devices/i
    );
  });

  it("allows only owner-scoped registration and irreversible revocation", () => {
    expect(migration).toMatch(/status = 'active'\s+and revoked_at is null/i);
    expect(migration).toMatch(/status = 'revoked'\s+and revoked_at is not null/i);
    expect(migration).toMatch(/auth\.uid\(\)\) = owner_id/i);
  });
});
