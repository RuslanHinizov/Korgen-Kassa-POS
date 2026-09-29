/** The offline till uploads with its package's device token — and only there, never from the cashier's browser register. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db: Record<string, unknown> = {};
vi.mock("@/lib/offline/idb", () => ({
  idbGet: async (_s: string, k: string) => db[k],
  idbPut: async (_s: string, v: { key: string }) => ((db[v.key] = v), true),
  idbDelete: async (_s: string, k: string) => { delete db[k]; },
}));

import { deviceAuthHeaders, setDeviceToken } from "@/lib/offline/device-token";

const at = (pathname: string) => vi.stubGlobal("location", { pathname });

beforeEach(() => { for (const k of Object.keys(db)) delete db[k]; });
afterEach(() => vi.unstubAllGlobals());

describe("deviceAuthHeaders", () => {
  it("sends the Bearer token on the offline till", async () => {
    at("/till");
    await setDeviceToken("hub_abc");
    expect(await deviceAuthHeaders()).toEqual({ Authorization: "Bearer hub_abc" });
  });

  it("sends nothing on the browser register, even if a token was loaded", async () => {
    at("/store/s1/pos");
    await setDeviceToken("hub_abc");
    expect(await deviceAuthHeaders()).toEqual({});
  });

  it("sends nothing when the package carried no token, and a new package without one clears the old", async () => {
    at("/till");
    expect(await deviceAuthHeaders()).toEqual({});
    await setDeviceToken("hub_abc");
    await setDeviceToken(undefined);
    expect(await deviceAuthHeaders()).toEqual({});
  });
});

describe("enrollDevice", () => {
  const stubFetch = (impl: (url: string, init: RequestInit) => Promise<Response>) => vi.stubGlobal("fetch", impl);

  it("trades the package key for the till's own key, once, without anyone doing anything", async () => {
    vi.stubGlobal("location", { pathname: "/till" });
    vi.stubGlobal("localStorage", { getItem: () => "ABC123", setItem: () => undefined });
    await setDeviceToken("hub_package");
    const seen: string[] = [];
    stubFetch(async (_u, init) => { seen.push(String((init.headers as Record<string, string>).Authorization)); return new Response(JSON.stringify({ token: "hub_own" }), { status: 200 }); });
    const { enrollDevice } = await import("@/lib/offline/device-token");
    await enrollDevice();
    expect(seen).toEqual(["Bearer hub_package"]);
    expect(await deviceAuthHeaders()).toEqual({ Authorization: "Bearer hub_own" });
    await enrollDevice(); // already enrolled: no second call
    expect(seen).toHaveLength(1);
  });

  it("keeps the package key when the server cannot be reached, so it can try again later", async () => {
    vi.stubGlobal("location", { pathname: "/till" });
    await setDeviceToken("hub_package");
    stubFetch(async () => { throw new TypeError("offline"); });
    vi.resetModules();
    const { enrollDevice } = await import("@/lib/offline/device-token");
    await enrollDevice();
    expect(await deviceAuthHeaders()).toEqual({ Authorization: "Bearer hub_package" });
  });
});
