/**
 * Offline PIN sign-in must accept exactly the PINs the server hashed with src/lib/pin.ts (Node scrypt), keep wrong
 * PINs out, and lock an employee after 5 misses.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPin } from "@/lib/pin";

const store: { meta: Record<string, unknown>; config: Record<string, unknown> } = { meta: {}, config: {} };

vi.mock("@/lib/offline/idb", () => ({
  idbGet: async (_s: string, key: string) => store.meta[key],
  idbPut: async (_s: string, row: { key: string }) => { store.meta[row.key] = row; return true; },
  idbDelete: async (_s: string, key: string) => { delete store.meta[key]; },
}));
vi.mock("@/lib/offline/config-cache", () => ({ getCachedConfig: async (key: string) => store.config[key] }));

import { listPinCashiers, pinMatches, signInWithPin } from "@/lib/offline/pin-login";

beforeEach(() => {
  store.meta = { tillStore: { key: "tillStore", storeId: "s1" } };
  store.config = {
    packageCashiers: [
      { id: "u1", name: "Аня", role: "CASHIER", pin: hashPin("1234") },
      { id: "u2", name: "Без пина", role: "CASHIER", pin: null },
      { id: "u3", name: "Склад", role: "WAREHOUSE" },
    ],
  };
});

describe("pinMatches", () => {
  it("accepts a PIN hashed by the server and rejects any other", async () => {
    const stored = hashPin("4821");
    expect(await pinMatches("4821", stored)).toBe(true);
    expect(await pinMatches("4822", stored)).toBe(false);
    expect(await pinMatches("", stored)).toBe(false);
  });

  it("rejects a malformed stored value", async () => {
    expect(await pinMatches("1234", "nocolon")).toBe(false);
  });
});

describe("listPinCashiers", () => {
  it("lists only employees who have a PIN", async () => {
    expect((await listPinCashiers()).map((c) => c.id)).toEqual(["u1"]);
  });
});

describe("signInWithPin", () => {
  it("signs in with the right PIN and records who is working", async () => {
    expect(await signInWithPin("u1", "1234")).toEqual({ ok: true });
    expect(store.meta.tillAuth).toMatchObject({ userId: "u1", name: "Аня", role: "CASHIER", storeId: "s1", mode: "offline" });
  });

  it("refuses a wrong PIN without signing anyone in", async () => {
    expect(await signInWithPin("u1", "9999")).toEqual({ ok: false, reason: "wrong" });
    expect(store.meta.tillAuth).toBeUndefined();
  });

  it("refuses an employee with no PIN and an unknown one", async () => {
    expect(await signInWithPin("u2", "1234")).toEqual({ ok: false, reason: "unknown" });
    expect(await signInWithPin("nobody", "1234")).toEqual({ ok: false, reason: "unknown" });
  });

  it("is unbound when no market was ever loaded", async () => {
    store.meta = {};
    expect(await signInWithPin("u1", "1234")).toEqual({ ok: false, reason: "unbound" });
  });

  it("locks after 5 wrong PINs, even for the right one, and a right PIN resets the count", async () => {
    for (let i = 0; i < 4; i++) expect((await signInWithPin("u1", "0000")).ok).toBe(false);
    expect(await signInWithPin("u1", "1234")).toEqual({ ok: true });
    for (let i = 0; i < 4; i++) await signInWithPin("u1", "0000");
    const fifth = await signInWithPin("u1", "0000");
    expect(fifth).toMatchObject({ ok: false, reason: "locked" });
    expect(await signInWithPin("u1", "1234")).toMatchObject({ ok: false, reason: "locked" });
  });
});
