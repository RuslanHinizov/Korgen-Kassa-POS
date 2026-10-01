import { describe, it, expect, vi, beforeEach } from "vitest";

const db = { flag: null as null | { setupComplete: boolean }, owners: 0, stores: 0 };
vi.mock("@/lib/db", () => ({
  prisma: {
    businessSettings: { findUnique: async () => db.flag },
    user: { count: async () => db.owners },
    store: { count: async () => db.stores },
  },
}));

import { isInstalled } from "@/lib/installed";

beforeEach(() => { db.flag = null; db.owners = 0; db.stores = 0; });

describe("isInstalled (the first-run wizard must not open on a server that has an owner)", () => {
  it("a brand-new server is not installed", async () => {
    expect(await isInstalled()).toBe(false);
  });
  it("the wizard's own flag counts", async () => {
    db.flag = { setupComplete: true };
    expect(await isInstalled()).toBe(true);
  });
  it("a platform owner counts even after every market was wiped", async () => {
    db.owners = 1;
    expect(await isInstalled()).toBe(true);
  });
  it("any market counts", async () => {
    db.stores = 1;
    expect(await isInstalled()).toBe(true);
  });
});
