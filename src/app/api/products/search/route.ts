import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// Explicit field allow-list — never expose cost, supplierId, or timestamps
// to this client-facing endpoint.
const PRODUCT_SELECT = {
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
} as const;

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

function parseLimit(req: NextRequest): number {
  const raw = Number(req.nextUrl.searchParams.get("limit"));
  if (!Number.isFinite(raw) || raw <= 0) return DEFAULT_LIMIT;
  return Math.min(raw, MAX_LIMIT);
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q") ?? "";
  const categoryId = req.nextUrl.searchParams.get("categoryId") ?? "";
  const take = parseLimit(req);
  const storeId = await getStoreId();

  if (!q.trim()) {
    const products = await prisma.product.findMany({
      where: { storeId, active: true, deletedAt: null, ...(categoryId ? { categoryId } : {}) },
      select: PRODUCT_SELECT,
      orderBy: { name: "asc" },
      take,
    });
    return NextResponse.json(
      products.map((p: typeof products[number]) => ({ ...p, price: parseFloat(p.price.toString()), wholesalePrice: p.wholesalePrice == null ? null : Number(p.wholesalePrice), stock: parseFloat(p.stock.toString()) }))
    );
  }

  // Store scale EAN-13: PP + five digit PLU + five digit weight in grams + checksum.
  // Standard prefixes 20/21/22 are accepted. We intentionally use the embedded amount
  // only for a product explicitly configured with a five digit scale PLU.
  const weighted = /^2[0-2](\d{5})(\d{5})\d$/.exec(q);
  if (weighted) {
    const product = await prisma.product.findFirst({ where: { storeId, active: true, deletedAt: null, unit: "kg", scalePlu: weighted[1] }, select: PRODUCT_SELECT });
    if (product) return NextResponse.json([{ ...product, price: Number(product.price), wholesalePrice: product.wholesalePrice == null ? null : Number(product.wholesalePrice), stock: Number(product.stock), scanQuantity: Number(weighted[2]) / 1000 }]);
  }

  const products = await prisma.product.findMany({
    where: {
      storeId,
      active: true,
      deletedAt: null,
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcode: { equals: q } },
      ],
    },
    select: PRODUCT_SELECT,
    take,
    orderBy: { name: "asc" },
  });

  return NextResponse.json(
    products.map((p: typeof products[number]) => ({ ...p, price: parseFloat(p.price.toString()), wholesalePrice: p.wholesalePrice == null ? null : Number(p.wholesalePrice), stock: parseFloat(p.stock.toString()) }))
  );
}
