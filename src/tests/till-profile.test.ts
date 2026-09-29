/**
 * The /till shell decides what to draw from the till's own stored facts only. These tests pin the three outcomes
 * (unbound / signed-out / ready) and the fallbacks used when the cached settings are missing or partial.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const store: { meta: Record<string, unknown>; config: Record<string, unknown> } = { meta: {}, config: {} };

vi.mock("@/lib/offline/idb", () => ({ idbGet: async (_s: string, key: string) => store.meta[key] }));
vi.mock("@/lib/offline/config-cache", () => ({ getCachedConfig: async (key: string) => store.config[key] }));
vi.mock("@/lib/offline/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/offline/auth")>("@/lib/offline/auth");
  return { ...actual, getTillAuth: async () => store.meta.tillAuth };
});

import { loadTillProfile } from "@/lib/offline/till-profile";

const auth = (over: Record<string, unknown> = {}) => ({ key: "tillAuth", userId: "u1", name: "Аня", role: "CASHIER", storeId: "s1", at: Date.now(), mode: "offline", ...over });

beforeEach(() => {
  store.meta = {};
  store.config = {};
});

describe("loadTillProfile", () => {
  it("is unbound when nothing is stored", async () => {
    expect((await loadTillProfile()).state).toBe("unbound");
  });

  it("is signed-out when the market is known but there is no cashier", async () => {
    store.meta.tillStore = { key: "tillStore", storeId: "s1" };
    expect(await loadTillProfile()).toEqual({ state: "signed-out", storeId: "s1" });
  });

  it("is signed-out when the sign-in is older than the till's session limit", async () => {
    store.meta.tillStore = { key: "tillStore", storeId: "s1" };
    store.meta.tillAuth = auth({ at: Date.now() - 20 * 3600_000 });
    expect((await loadTillProfile()).state).toBe("signed-out");
  });

  it("is signed-out when the cashier belongs to another market", async () => {
    store.meta.tillStore = { key: "tillStore", storeId: "s1" };
    store.meta.tillAuth = auth({ storeId: "other" });
    expect((await loadTillProfile()).state).toBe("signed-out");
  });

  it("uses default brand colours and currency when settings were never cached", async () => {
    store.meta.tillAuth = auth();
    const r = await loadTillProfile();
    expect(r.state).toBe("ready");
    if (r.state !== "ready") return;
    expect(r.profile.storeId).toBe("s1");
    expect(r.profile.primaryColor).toBe("#15503A");
    expect(r.profile.currency).toEqual({ symbol: "$", decimals: 2, locale: "en" });
  });

  it("reads colours and currency from the cached settings (0 decimals stays 0)", async () => {
    store.meta.tillStore = { key: "tillStore", storeId: "s1" };
    store.meta.tillAuth = auth();
    store.config.settings = { primaryColor: "#123456", accentColor: "#abcdef", currency: "₸", currencyDecimals: 0, language: "ru" };
    const r = await loadTillProfile();
    expect(r.state === "ready" && r.profile).toMatchObject({ primaryColor: "#123456", accentColor: "#abcdef", currency: { symbol: "₸", decimals: 0, locale: "ru" } });
  });
});
