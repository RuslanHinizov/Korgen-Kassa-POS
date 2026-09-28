import { prisma } from "@/lib/db";

/** Shared by /api/pos/catalog (browser till) and /api/hub/pull (office Hub) — same incremental product feed. */
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

export const CATALOG_MAX_LIMIT = 5000;
export const CATALOG_DEFAULT_LIMIT = 2000;

export async function fetchCatalogPage(storeId: string, since: Date | null, afterId: string, take: number) {
  const where = since
    ? { storeId, OR: [{ updatedAt: { gt: since } }, ...(afterId ? [{ updatedAt: since, id: { gt: afterId } }] : [])] }
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
  return { products, hasMore };
}
