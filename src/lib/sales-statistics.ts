import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { Prisma } from "@/generated/prisma/client";

export interface ProductStatRow {
  productId: string;
  productName: string;
  barcode: string | null;
  unit: string;
  categoryId: string | null;
  supplierId: string | null;
  saleQty: number;
  saleAmount: number;
  saleCost: number;
  returnQty: number;
  returnAmount: number;
  returnCost: number;
}

export interface DerivedRow {
  saleQty: number;
  saleAmount: number;
  saleCost: number;
  returnQty: number;
  returnAmount: number;
  returnCost: number;
  profit: number;
  rentability: number;
  markup: number;
}

export function parseDateRange(sp: URLSearchParams) {
  const from = sp.get("from") ? new Date(sp.get("from")!) : new Date(new Date().setHours(0, 0, 0, 0));
  const to = sp.get("to") ? new Date(sp.get("to")!) : new Date(new Date().setHours(23, 59, 59, 999));
  return { from, to };
}

export function withDerived<T extends { saleAmount: number; saleCost: number; returnAmount: number; returnCost: number }>(r: T): T & DerivedRow {
  const profit = r.saleAmount - r.saleCost - (r.returnAmount - r.returnCost);
  const netCost = r.saleCost - r.returnCost;
  const rentability = netCost > 0 ? (profit / netCost) * 100 : 0;
  return { ...r, profit, rentability, markup: Math.round(rentability) } as T & DerivedRow;
}

export function sumTotals<T extends { saleAmount: number; saleCost: number; returnAmount: number; returnCost: number; profit: number }>(rows: T[]) {
  return rows.reduce(
    (acc, r) => ({
      saleAmount: acc.saleAmount + r.saleAmount,
      saleCost: acc.saleCost + r.saleCost,
      returnAmount: acc.returnAmount + r.returnAmount,
      returnCost: acc.returnCost + r.returnCost,
      profit: acc.profit + r.profit,
    }),
    { saleAmount: 0, saleCost: 0, returnAmount: 0, returnCost: 0, profit: 0 }
  );
}

/**
 * Core building block for every "Статистика продаж" report tab: per-product
 * sold/returned quantity+amount for the given period and filters. Category,
 * supplier and comparison reports all re-group this same row set instead of
 * re-querying — only the "по чекам" (receipt-level) and "по покупателям"
 * (customer-level, no per-product dimension) reports need their own query.
 */
export async function getProductStatRows(req: NextRequest): Promise<ProductStatRow[]> {
  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const q = sp.get("q")?.trim() || "";
  const categoryId = sp.get("categoryId") || "";
  const subcategoryIds = (sp.get("subcategoryIds") || "").split(",").filter(Boolean);
  const supplierId = sp.get("supplierId") || "";
  const userId = sp.get("userId") || "";

  const categoryIds = subcategoryIds.length > 0 ? subcategoryIds : categoryId ? [categoryId] : [];
  const storeId = await getStoreId();

  const productWhere: Prisma.ProductWhereInput = { storeId };
  if (q) productWhere.OR = [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q } }];
  if (categoryIds.length > 0) productWhere.categoryId = { in: categoryIds };
  if (supplierId) productWhere.supplierId = supplierId;

  const saleWhere: Prisma.SaleItemWhereInput = {
    sale: {
      storeId,
      status: { in: ["COMPLETED", "REFUNDED"] },
      createdAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
    },
    productId: { not: null },
    ...(Object.keys(productWhere).length > 0 ? { product: productWhere } : {}),
  };

  const salesGrouped = await prisma.saleItem.groupBy({
    by: ["productId"],
    where: saleWhere,
    _sum: { quantity: true, total: true },
  });

  const productIds = salesGrouped.map((g) => g.productId!).filter(Boolean);

  const refunds = await prisma.refund.findMany({
    where: {
      sale: { storeId },
      createdAt: { gte: from, lte: to },
      ...(userId ? { userId } : {}),
    },
    select: { items: true },
  });

  const returnByProduct = new Map<string, { qty: number; amount: number }>();
  for (const r of refunds) {
    const items = r.items as unknown as { productId?: string | null; quantity: number; price: number }[];
    for (const it of items) {
      if (!it.productId) continue;
      const cur = returnByProduct.get(it.productId) ?? { qty: 0, amount: 0 };
      cur.qty += it.quantity;
      cur.amount += it.quantity * it.price;
      returnByProduct.set(it.productId, cur);
    }
  }
  for (const id of returnByProduct.keys()) if (!productIds.includes(id)) productIds.push(id);

  const products = await prisma.product.findMany({
    where: { id: { in: productIds }, storeId },
    select: { id: true, name: true, barcode: true, unit: true, cost: true, price: true, categoryId: true, supplierId: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  // Returns can reference products outside the current category/supplier/search filter
  // (e.g. a category was reassigned after the sale) — re-apply those filters here so
  // a return doesn't pull in a row the product-side filters would have excluded.
  function passesProductFilter(p: { name: string; barcode: string | null; categoryId: string | null; supplierId: string | null }) {
    if (q) {
      const hit = p.name.toLowerCase().includes(q.toLowerCase()) || (p.barcode ?? "").includes(q);
      if (!hit) return false;
    }
    if (categoryIds.length > 0 && !categoryIds.includes(p.categoryId ?? "")) return false;
    if (supplierId && p.supplierId !== supplierId) return false;
    return true;
  }

  const rows: ProductStatRow[] = [];
  for (const g of salesGrouped) {
    const p = productMap.get(g.productId!);
    if (!p) continue;
    const qty = Number(g._sum.quantity ?? 0);
    const amount = Number(g._sum.total ?? 0);
    const unitCost = Number(p.cost ?? 0);
    const ret = returnByProduct.get(p.id);
    rows.push({
      productId: p.id,
      productName: p.name,
      barcode: p.barcode,
      unit: p.unit,
      categoryId: p.categoryId,
      supplierId: p.supplierId,
      saleQty: qty,
      saleAmount: amount,
      saleCost: qty * unitCost,
      returnQty: ret?.qty ?? 0,
      returnAmount: ret?.amount ?? 0,
      returnCost: (ret?.qty ?? 0) * unitCost,
    });
  }
  // Returns for a product with zero sales in this period (fully returned earlier-period sale)
  for (const [productId, ret] of returnByProduct) {
    if (rows.some((r) => r.productId === productId)) continue;
    const p = productMap.get(productId);
    if (!p || !passesProductFilter(p)) continue;
    const unitCost = Number(p.cost ?? 0);
    rows.push({
      productId: p.id,
      productName: p.name,
      barcode: p.barcode,
      unit: p.unit,
      categoryId: p.categoryId,
      supplierId: p.supplierId,
      saleQty: 0,
      saleAmount: 0,
      saleCost: 0,
      returnQty: ret.qty,
      returnAmount: ret.amount,
      returnCost: ret.qty * unitCost,
    });
  }

  return rows;
}
