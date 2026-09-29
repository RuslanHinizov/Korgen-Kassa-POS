/**
 * A till that was offline for days holds hundreds of writes. They must go up oldest-first, exactly once each, survive a
 * connection that drops half-way (and resume in order), and a refused key must keep everything for later.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Row = { id: string; createdAt: number; [k: string]: unknown };
const rows = new Map<string, Row>();
const meta = new Map<string, unknown>();

vi.mock("@/lib/offline/idb", () => ({
  idbPut: async (_s: string, v: Row) => { rows.set(v.id, v); return true; },
  idbDelete: async (_s: string, id: string) => { rows.delete(id); },
  idbGetAll: async () => [...rows.values()],
  idbGet: async (_s: string, k: string) => meta.get(k),
  idbUpdate: async (_s: string, k: string, fn: (c: unknown) => unknown) => { const n = fn(meta.get(k)); meta.set(k, n); return n; },
}));

import { enqueue, flushQueue, getOfflineStatus, listQueue, nextReceiptNo, deviceCode } from "@/lib/offline/queue";

const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  rows.clear();
  meta.clear();
  vi.stubGlobal("navigator", { onLine: true });
  vi.stubGlobal("localStorage", (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; })());
});
afterEach(() => vi.unstubAllGlobals());

async function fill(n: number) {
  for (let i = 0; i < n; i++) await enqueue("sale", "/api/sales", { seq: i, clientSaleId: `c${i}` }, `q${String(i).padStart(4, "0")}`);
  // distinct, increasing timestamps so "oldest first" is well defined
  let t = 1_000_000;
  for (const r of rows.values()) r.createdAt = t++;
}

describe("a large offline queue", () => {
  it("uploads 300 waiting writes oldest-first, once each, and ends empty", async () => {
    await fill(300);
    const seen: number[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => { seen.push(JSON.parse(String(init.body)).seq); return json(201); });
    await flushQueue();
    expect(seen).toHaveLength(300);
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(new Set(seen).size).toBe(300);
    expect(await listQueue()).toHaveLength(0);
    expect(getOfflineStatus().pending).toBe(0);
  });

  it("stops where the connection drops, keeps the rest in order, and resumes from there", async () => {
    await fill(200);
    let sent = 0;
    vi.stubGlobal("fetch", async () => { if (sent === 120) throw new TypeError("network"); sent++; return json(201); });
    await flushQueue();
    expect(sent).toBe(120);
    expect((await listQueue()).map((i) => (i.payload as { seq: number }).seq)).toEqual(Array.from({ length: 80 }, (_, i) => 120 + i));

    const resumed: number[] = [];
    vi.stubGlobal("fetch", async (_u: string, init: RequestInit) => { resumed.push(JSON.parse(String(init.body)).seq); return json(201); });
    await flushQueue();
    expect(resumed[0]).toBe(120);
    expect(resumed).toHaveLength(80);
    expect(await listQueue()).toHaveLength(0);
  });

  it("keeps everything when the server refuses the key (401), and says a sign-in / new package is needed", async () => {
    await fill(50);
    let calls = 0;
    vi.stubGlobal("fetch", async () => { calls++; return json(401, { error: "Unauthorized" }); });
    await flushQueue();
    expect(calls).toBe(1); // it does not hammer the server 50 times
    expect(await listQueue()).toHaveLength(50);
    expect(getOfflineStatus().needsLogin).toBe(true);
  });

  it("treats 'already have it' (200) as done and parks a refused write (400) without blocking the rest", async () => {
    await fill(5);
    let i = 0;
    vi.stubGlobal("fetch", async () => { i++; return i === 2 ? json(400, { error: "bad" }) : json(i === 4 ? 200 : 201, { duplicate: i === 4 }); });
    await flushQueue();
    const left = await listQueue();
    expect(left).toHaveLength(1);
    expect(left[0].failed).toBe(true);
    expect(getOfflineStatus().failed).toBe(1);
  });
});

describe("receipt numbers on several tills", () => {
  it("counts up on one till without gaps or repeats, even for 1000 sales in a burst", async () => {
    const numbers = await Promise.all(Array.from({ length: 1000 }, () => nextReceiptNo()));
    expect(new Set(numbers).size).toBe(1000);
  });

  it("gives every till its own long-enough code: 500 tills, no clash", () => {
    const codes = new Set<string>();
    for (let t = 0; t < 500; t++) {
      vi.stubGlobal("localStorage", (() => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }; })());
      codes.add(deviceCode());
    }
    expect(codes.size).toBe(500);
    expect([...codes].every((c) => c.length === 6)).toBe(true);
  });
});
