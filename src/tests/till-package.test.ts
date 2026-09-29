/**
 * The market package must survive a round trip, refuse damaged/foreign files, and — when loaded on a till —
 * never replace another market's data while that market still has unsent sales.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const db = { meta: {} as Record<string, unknown>, products: [] as { id: string }[], queue: 0, config: {} as Record<string, unknown> };

vi.mock("@/lib/offline/idb", () => ({
  idbDelete: async (_s: string, k: string) => { delete db.meta[k]; },
  idbGet: async (_s: string, k: string) => db.meta[k],
  idbPut: async (_s: string, v: { key: string }) => ((db.meta[v.key] = v), true),
  idbPutMany: async (_s: string, v: { id: string }[]) => ((db.products = v), true),
  idbCount: async () => db.queue,
}));
vi.mock("@/lib/offline/config-cache", () => ({ cacheConfig: async (k: string, v: unknown) => void (db.config[k] = v) }));
vi.mock("@/lib/offline/catalog", () => ({ clearCatalog: async () => void (db.products = []) }));
const bind = vi.fn(async (storeId: string) => void (db.meta.tillStore = { key: "tillStore", storeId }));
vi.mock("@/lib/offline/clear", () => ({ bindTillToStore: (id: string) => bind(id) }));

import { parsePackage, serializePackage, type TillPackageBody } from "@/lib/till-package-format";
import { importPackage } from "@/lib/offline/package-import";

const product = (id: string, updatedAt: string) => ({ id, name: `Товар ${id}`, price: 100, wholesalePrice: null, stock: 5, lowStockThreshold: 1, sku: null, barcode: null, scalePlu: null, category: null, categoryId: null, imageUrl: null, unit: "pcs", updatedAt });
const body = (storeId = "s1"): TillPackageBody => ({
  generatedAt: "2026-09-29T10:00:00.000Z",
  store: { id: storeId, name: "Нурай" },
  settings: { currency: "₸", taxRate: 0.12 },
  promotions: [],
  quickGroups: [],
  quickItems: [],
  cashiers: [{ id: "u1", name: "Аня", role: "CASHIER" }],
  products: [product("a", "2026-09-01T00:00:00.000Z"), product("b", "2026-09-05T00:00:00.000Z")],
});

beforeEach(() => {
  db.meta = {}; db.products = []; db.queue = 0; db.config = {}; bind.mockClear();
});

describe("package format", () => {
  it("round-trips", async () => {
    const r = await parsePackage(await serializePackage(body()));
    expect(r.ok && r.pkg.body).toEqual(body());
  });
  it("rejects text that is not JSON / not a package", async () => {
    expect(await parsePackage("nope")).toEqual({ ok: false, reason: "not-json" });
    expect(await parsePackage('{"hello":1}')).toEqual({ ok: false, reason: "not-a-package" });
  });
  it("rejects a file changed after it was written", async () => {
    const text = (await serializePackage(body())).replace("Нурай", "Другой");
    expect(await parsePackage(text)).toEqual({ ok: false, reason: "damaged" });
  });
  it("rejects a truncated file", async () => {
    const text = await serializePackage(body());
    expect((await parsePackage(text.slice(0, text.length - 40))).ok).toBe(false);
  });
  it("rejects a newer version", async () => {
    const text = (await serializePackage(body())).replace('"version":1', '"version":99');
    expect(await parsePackage(text)).toEqual({ ok: false, reason: "newer-version" });
  });
});

describe("importPackage", () => {
  it("binds the till, stores products and config, and sets the catalogue resume point", async () => {
    const r = await importPackage(await serializePackage(body()));
    expect(r).toMatchObject({ ok: true, storeName: "Нурай", products: 2 });
    expect(bind).toHaveBeenCalledWith("s1");
    expect(db.products).toHaveLength(2);
    expect(db.config.settings).toEqual({ currency: "₸", taxRate: 0.12 });
    expect(db.meta.catalogCursor).toMatchObject({ storeId: "s1", since: "2026-09-05T00:00:00.000Z", afterId: "b" });
    expect(db.meta.packageInfo).toMatchObject({ storeName: "Нурай", products: 2 });
  });
  it("refuses another market while sales are waiting to be uploaded, and changes nothing", async () => {
    db.meta.tillStore = { key: "tillStore", storeId: "old" };
    db.queue = 3;
    const r = await importPackage(await serializePackage(body("s2")));
    expect(r).toEqual({ ok: false, reason: "unsent-sales" });
    expect(bind).not.toHaveBeenCalled();
    expect(db.products).toHaveLength(0);
  });
  it("accepts a newer package of the SAME market even with unsent sales", async () => {
    db.meta.tillStore = { key: "tillStore", storeId: "s1" };
    db.queue = 3;
    expect((await importPackage(await serializePackage(body()))).ok).toBe(true);
  });
  it("does not touch the till when the file is damaged", async () => {
    const r = await importPackage("{}");
    expect(r.ok).toBe(false);
    expect(bind).not.toHaveBeenCalled();
  });
});
