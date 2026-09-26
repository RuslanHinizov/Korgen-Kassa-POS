import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

/**
 * GET /api/pos/catalog — the product list the till keeps a copy of, so it can search and sell with no connection.
 *
 * Incremental: `since` (ISO time) + `afterId` continue after the last row already received, oldest change first,
 * so the first call downloads everything (in pages) and later calls only what changed — including products
 * that were deleted or switched off, sent as `{ id, removed: true }` so the till can drop them.
 *
 * Same field allow-list as /api/products/search: never cost, supplier or other office-only data.
 */
const SELECT = {
  id: true,
  name: true,
  price: true,
  wholesalePrice: true,
  stock: true,
  lowStockThreshold: true,
  sku: true,
  barcode: true,
  scalePlu: true,
  category: true,
  categoryId: true,
  imageUrl: true,
  unit: true,
  active: true,
  deletedAt: true,
  updatedAt: true,
} as const;

const DEFAULT_LIMIT = 2000;
const MAX_LIMIT = 5000;

export async function GET(req: NextRequest) {
  const storeId = await getStoreId();
  const sp = req.nextUrl.searchParams;
  const sinceRaw = sp.get("since");
  const afterId = sp.get("afterId") ?? "";
  const rawLimit = Number(sp.get("limit"));
  const take = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, MAX_LIMIT) : DEFAULT_LIMIT;

  const since = sinceRaw ? new Date(sinceRaw) : null;
  const validSince = since && !Number.isNaN(since.getTime()) ? since : null;

  const where = validSince
    ? {
        storeId,
        OR: [{ updatedAt: { gt: validSince } }, ...(afterId ? [{ updatedAt: validSince, id: { gt: afterId } }] : [])],
      }
    : { storeId, active: true, deletedAt: null };

  const rows = await prisma.product.findMany({
    where,
    select: SELECT,
    orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
    take: take + 1,
  });
  const hasMore = rows.length > take;
  const page = hasMore ? rows.slice(0, take) : rows;

  const products = page.map((p) =>
    !p.active || p.deletedAt
      ? { id: p.id, removed: true as const, updatedAt: p.updatedAt.toISOString() }
      : {
          id: p.id,
          name: p.name,
          price: Number(p.price),
          wholesalePrice: p.wholesalePrice == null ? null : Number(p.wholesalePrice),
          stock: Number(p.stock),
          lowStockThreshold: p.lowStockThreshold,
          sku: p.sku,
          barcode: p.barcode,
          scalePlu: p.scalePlu,
          category: p.category,
          categoryId: p.categoryId,
          imageUrl: p.imageUrl,
          unit: p.unit,
          updatedAt: p.updatedAt.toISOString(),
        }
  );

  // storeId lets a till that switches to another market throw the old copy away instead of mixing catalogues.
  return NextResponse.json({ storeId, products, hasMore, serverTime: new Date().toISOString() });
}
