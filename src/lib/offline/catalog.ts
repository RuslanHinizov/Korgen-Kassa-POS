/**
 * The till's own copy of the product catalogue (IndexedDB), so it can search and sell with no connection.
 *
 * `syncCatalog()` downloads everything on the first run and only what changed afterwards.
 * `searchLocal()` answers a search from that copy, with the same matching rules as /api/products/search.
 */

import { idbClear, idbCount, idbDelete, idbGet, idbGetAll, idbPut, idbPutMany } from "./idb";

export interface LocalProduct {
  id: string;
  name: string;
  price: number;
  wholesalePrice: number | null;
  stock: number;
  lowStockThreshold: number;
  sku: string | null;
  barcode: string | null;
  scalePlu: string | null;
  category: string | null;
  categoryId: string | null;
  imageUrl: string | null;
  unit: string;
  updatedAt: string;
  /** set by searchLocal for a scale (weight) barcode */
  scanQuantity?: number;
}

interface CatalogCursor {
  key: "catalogCursor";
  /** the market this copy belongs to */
  storeId?: string;
  since: string | null;
  afterId: string;
  syncedAt: number | null;
}

type CatalogRow = LocalProduct | { id: string; removed: true; updatedAt: string };

let memory: LocalProduct[] | null = null;
let syncing: Promise<{ ok: boolean; changed: number }> | null = null;

async function loadMemory(): Promise<LocalProduct[]> {
  if (!memory) memory = await idbGetAll<LocalProduct>("products");
  return memory;
}

/** When the copy was last brought up to date (ms), or null if it has never been downloaded. */
export async function catalogSyncedAt(): Promise<number | null> {
  return (await idbGet<CatalogCursor>("meta", "catalogCursor"))?.syncedAt ?? null;
}

export async function catalogSize(): Promise<number> {
  return idbCount("products");
}

/** Forget the local copy (e.g. another store's cashier signs in on this till). */
export async function clearCatalog(): Promise<void> {
  await idbClear("products");
  await idbDelete("meta", "catalogCursor");
  memory = null;
}

export function syncCatalog(): Promise<{ ok: boolean; changed: number }> {
  if (syncing) return syncing;
  syncing = doSync().finally(() => {
    syncing = null;
  });
  return syncing;
}

async function doSync(): Promise<{ ok: boolean; changed: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: false, changed: 0 };
  let cursor = (await idbGet<CatalogCursor>("meta", "catalogCursor")) ?? { key: "catalogCursor" as const, since: null, afterId: "", syncedAt: null };
  let changed = 0;
  try {
    for (let page = 0; page < 200; page++) {
      const qs = new URLSearchParams({ limit: "2000" });
      if (cursor.since) {
        qs.set("since", cursor.since);
        if (cursor.afterId) qs.set("afterId", cursor.afterId);
      }
      const res = await fetch(`/api/pos/catalog?${qs}`, { cache: "no-store" });
      if (!res.ok) return { ok: false, changed };
      const data = (await res.json()) as { storeId?: string; products: CatalogRow[]; hasMore: boolean };

      // The till was used by another market before: drop that copy and start over for this one.
      if (data.storeId && cursor.storeId && cursor.storeId !== data.storeId) {
        await clearCatalog();
        cursor = { key: "catalogCursor", since: null, afterId: "", syncedAt: null };
        continue;
      }
      if (data.storeId) cursor = { ...cursor, storeId: data.storeId };

      const upserts = data.products.filter((p): p is LocalProduct => !("removed" in p));
      const removed = data.products.filter((p) => "removed" in p);
      if (upserts.length) await idbPutMany("products", upserts);
      for (const r of removed) await idbDelete("products", r.id);
      changed += data.products.length;

      const last = data.products[data.products.length - 1];
      if (last) cursor = { ...cursor, since: last.updatedAt, afterId: last.id };
      cursor = { ...cursor, syncedAt: Date.now() };
      await idbPut("meta", cursor);
      if (!data.hasMore) break;
    }
  } catch {
    return { ok: false, changed };
  }
  if (changed > 0) memory = null; // the in-memory search index is rebuilt on the next search
  return { ok: true, changed };
}

/** Same rules as the server search: name/SKU contains the text, barcode equals it, scale barcodes carry a weight. */
export async function searchLocal(query: string, limit = 20): Promise<LocalProduct[]> {
  const q = query.trim();
  const all = await loadMemory();

  if (!q) return [...all].sort((a, b) => a.name.localeCompare(b.name, "ru")).slice(0, limit);

  const weighted = /^2[0-2](\d{5})(\d{5})\d$/.exec(q);
  if (weighted) {
    const hit = all.find((p) => p.unit === "kg" && p.scalePlu === weighted[1]);
    if (hit) return [{ ...hit, scanQuantity: Number(weighted[2]) / 1000 }];
  }

  const needle = q.toLowerCase();
  const out: LocalProduct[] = [];
  for (const p of all) {
    if (p.name.toLowerCase().includes(needle) || (p.sku && p.sku.toLowerCase().includes(needle)) || p.barcode === q) out.push(p);
  }
  out.sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return out.slice(0, limit);
}
