import { NextRequest, NextResponse } from "next/server";
import { getStoreId } from "@/lib/store-context";
import { CATALOG_DEFAULT_LIMIT, CATALOG_MAX_LIMIT, fetchCatalogPage } from "@/lib/catalog-query";

/**
 * GET /api/pos/catalog — the product list the till keeps a copy of, so it can search and sell with no connection.
 *
 * Incremental: `since` (ISO time) + `afterId` continue after the last row already received, oldest change first,
 * so the first call downloads everything (in pages) and later calls only what changed — including products
 * that were deleted or switched off, sent as `{ id, removed: true }` so the till can drop them.
 *
 * Same field allow-list as /api/products/search: never cost, supplier or other office-only data.
 * (The office Hub's own catalogue pull is /api/hub/pull, which shares this same query — see catalog-query.ts.)
 */
export async function GET(req: NextRequest) {
  const storeId = await getStoreId();
  const sp = req.nextUrl.searchParams;
  const sinceRaw = sp.get("since");
  const afterId = sp.get("afterId") ?? "";
  const rawLimit = Number(sp.get("limit"));
  const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, CATALOG_MAX_LIMIT) : CATALOG_DEFAULT_LIMIT;

  const since = sinceRaw ? new Date(sinceRaw) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const { products, hasMore } = await fetchCatalogPage(storeId, validSince, afterId, take);

  // storeId lets a till that switches to another market throw the old copy away instead of mixing catalogues.
  return NextResponse.json({ storeId, products, hasMore, serverTime: new Date().toISOString() });
}
