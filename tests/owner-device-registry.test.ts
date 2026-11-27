import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/0013_owner_device_registry.sql"),
  "utf8"
);

describe("NEXUS owner device registry permissions", () => {
  it("does not grant broad row updates to authenticated clients", () => {
    expect(migration).toMatch(/grant select, insert on public\\.owner_devices to authenticated/i);
    expect(migration).toMatch(/grant update \\(status, revoked_at\\) on public\\.owner_devices to authenticated/i);
    expect(migration).not.toMatch(/grant select, insert, update on public\\.owner_devices/i);
  });

  it("permits only one-way revocation of an active owner device", () => {
    expect(migration).toMatch(/using \\(\\(select auth\\.uid\\(\\)\\) = owner_id and status = 'active'\\)/i);
    expect(migration).toMatch(/with check \\(\\(select auth\\.uid\\(\\)\\) = owner_id and status = 'revoked' and revoked_at is not null\\)/i);
  });
});
