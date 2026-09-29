/** On the till program a refused device key must never turn a sale away: it is kept on the till and the cashier is warned. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const rows = new Map<string, { id: string }>();
const meta = new Map<string, unknown>();
vi.mock("@/lib/offline/idb", () => ({
  idbPut: async (_s: string, v: { id?: string; key?: string }) => { if (v.key) meta.set(v.key, v); else rows.set(v.id as string, v as { id: string }); return true; },
  idbDelete: async (_s: string, k: string) => { rows.delete(k); meta.delete(k); },
  idbGetAll: async () => [...rows.values()],
  idbGet: async (_s: string, k: string) => meta.get(k),
  idbUpdate: async (_s: string, k: string, fn: (c: unknown) => unknown) => { const n = fn(meta.get(k)); meta.set(k, n); return n; },
}));

import { sendOrQueue } from "@/lib/offline/send";
import { getOfflineStatus } from "@/lib/offline/queue";

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const send = () => sendOrQueue({ kind: "sale", endpoint: "/api/sales", payload: { a: 1 }, clientId: "sale1", fallbackError: "err" });

beforeEach(() => { rows.clear(); meta.clear(); vi.stubGlobal("navigator", { onLine: true }); });
afterEach(() => vi.unstubAllGlobals());

describe("sendOrQueue with a device key", () => {
  it("keeps the sale and raises the warning when the key is refused (401)", async () => {
    vi.stubGlobal("location", { pathname: "/till" });
    meta.set("deviceToken", { key: "deviceToken", token: "hub_revoked" });
    vi.stubGlobal("fetch", async () => json(401, { error: "Unauthorized" }));
    const r = await send();
    expect(r).toMatchObject({ ok: true, queued: true });
    expect(rows.has("sale1")).toBe(true);
    expect(getOfflineStatus().needsLogin).toBe(true);
  });

  it("still reports a real 401 to the browser register (no device key), as before", async () => {
    vi.stubGlobal("location", { pathname: "/store/s1/pos" });
    vi.stubGlobal("fetch", async () => json(401, { error: "Unauthorized" }));
    expect(await send()).toMatchObject({ ok: false, status: 401 });
    expect(rows.size).toBe(0);
  });

  it("passes a normal answer through on the till", async () => {
    vi.stubGlobal("location", { pathname: "/till" });
    meta.set("deviceToken", { key: "deviceToken", token: "hub_ok" });
    vi.stubGlobal("fetch", async () => json(201, { sale: { id: "s" } }));
    expect(await send()).toMatchObject({ ok: true, queued: false });
  });
});
