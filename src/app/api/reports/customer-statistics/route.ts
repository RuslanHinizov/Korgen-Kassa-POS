import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange, withDerived, sumTotals } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const SORT_FIELDS = ["saleQty", "saleAmount", "returnQty", "profit"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const WALK_IN = "__walk_in__";

interface Bucket { saleQty: number; saleAmount: number; saleCost: number; returnQty: number; returnAmount: number; returnCost: number }
function emptyBucket(): Bucket {
  return { saleQty: 0, saleAmount: 0, saleCost: 0, returnQty: 0, returnAmount: 0, returnCost: 0 };
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const userId = sp.get("userId") || "";
  const sortFieldParam = sp.get("sortField") as SortField | null;
  const sortField: SortField = sortFieldParam && SORT_FIELDS.includes(sortFieldParam) ? sortFieldParam : "saleAmount";
  const sortOrder = sp.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));
  const storeId = await getStoreId();

  const sales = await prisma.sale.findMany({
    where: { storeId, status: { in: ["COMPLETED", "REFUNDED"] }, createdAt: { gte: from, lte: to }, ...(userId ? { userId } : {}) },
    select: { customerId: true, items: { select: { productId: true, quantity: true, total: true } } },
  });
  const refunds = await prisma.refund.findMany({
    where: { sale: { storeId }, createdAt: { gte: from, lte: to }, ...(userId ? { userId } : {}) },
    select: { items: true, sale: { select: { customerId: true } } },
  });

  const productIds = new Set<string>();
  for (const s of sales) for (const it of s.items) if (it.productId) productIds.add(it.productId);
  for (const r of refunds) {
    const items = r.items as unknown as { productId?: string | null }[];
    for (const it of items) if (it.productId) productIds.add(it.productId);
  }
  const products = await prisma.product.findMany({ where: { id: { in: [...productIds] }, storeId }, select: { id: true, cost: true, price: true } });
  const costMap = new Map(products.map((p) => [p.id, Number(p.cost ?? p.price)]));

  const buckets = new Map<string, Bucket>();
  function bucket(key: string) {
    if (!buckets.has(key)) buckets.set(key, emptyBucket());
    return buckets.get(key)!;
  }

  for (const s of sales) {
    const b = bucket(s.customerId ?? WALK_IN);
    for (const it of s.items) {
      const qty = Number(it.quantity);
      b.saleQty += qty;
      b.saleAmount += Number(it.total);
      b.saleCost += qty * (it.productId ? (costMap.get(it.productId) ?? 0) : 0);
    }
  }
  for (const r of refunds) {
    const b = bucket(r.sale.customerId ?? WALK_IN);
    const items = r.items as unknown as { productId?: string | null; quantity: number; price: number }[];
    for (const it of items) {
      b.returnQty += it.quantity;
      b.returnAmount += it.quantity * it.price;
      b.returnCost += it.quantity * (it.productId ? (costMap.get(it.productId) ?? 0) : 0);
    }
  }

  const customerIds = [...buckets.keys()].filter((k) => k !== WALK_IN);
  const customers = await prisma.customer.findMany({ where: { id: { in: customerIds }, storeId }, select: { id: true, name: true } });
  const customerMap = new Map(customers.map((c) => [c.id, c.name]));

  const grouped = [...buckets.entries()].map(([key, b]) => {
    const label = key === WALK_IN ? "Розничный покупатель" : (customerMap.get(key) ?? "Розничный покупатель");
    return withDerived({ key: key === WALK_IN ? null : key, label, ...b });
  });

  grouped.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  const totals = sumTotals(grouped);

  if (sp.get("export") === "xlsx") {
    const header = ["Покупатель", "Кол-во продаж", "Сумма продаж", "Сумма себестоимости", "Кол-во возвратов", "Сумма возвратов", "Наценка", "Рентабельность %", "Прибыль"];
    return xlsxResponse({
      filename: "statistika-po-pokupatelyam",
      sheetName: "Покупатели",
      rows: [header, ...grouped.map((r) => [
        r.label, r.saleQty, r.saleAmount, r.saleCost, r.returnQty, r.returnAmount, r.markup, r.rentability, r.profit,
      ])],
    });
  }

  const total = grouped.length;
  const start = (page - 1) * pageSize;
  const items = grouped.slice(start, start + pageSize);

  return NextResponse.json({ items, total, totals });
}
