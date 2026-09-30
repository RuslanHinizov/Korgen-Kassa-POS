import { prisma } from "@/lib/db";

export interface RevenueDay {
  date: string;
  revenue: number;
  transactions: number;
}
export interface RevenueSummary {
  revenue: number;
  grossProfit: number;
  transactions: number;
  avgTransaction: number;
  revenueByDay: RevenueDay[];
}

/**
 * Revenue/profit summary for [start, end] — used by the Главная dashboard.
 * Like UMAG's: revenue = sales − returns, profit = (sales − their cost) − (returns − the cost of what came back).
 * Returns count on the day they were made; a fully refunded sale still counts as a sale (its refund is the deduction).
 */
export async function getRevenueSummary(
  start: Date,
  end: Date,
  storeId: string,
  /** Viewer's UTC offset as `Date#getTimezoneOffset()` (minutes, +5h → -300); days are bucketed in that zone. */
  tzOffsetMin = 0
): Promise<RevenueSummary> {
  const localDay = (d: Date) => new Date(d.getTime() - tzOffsetMin * 60000).toISOString().slice(0, 10);
  const sales = await prisma.sale.findMany({
    where: { storeId, createdAt: { gte: start, lte: end }, status: { in: ["COMPLETED", "REFUNDED"] } },
    select: {
      total: true,
      discountAmount: true,
      createdAt: true,
      items: { select: { total: true, quantity: true, discountAmount: true, product: { select: { cost: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  const byDay: Record<string, { revenue: number; transactions: number }> = {};
  let totalRevenue = 0;
  let totalGrossProfit = 0;

  for (const sale of sales) {
    const day = localDay(sale.createdAt);
    if (!byDay[day]) byDay[day] = { revenue: 0, transactions: 0 };
    const rev = parseFloat(sale.total.toString());
    byDay[day].revenue += rev;
    byDay[day].transactions += 1;
    totalRevenue += rev;

    // Sale.discountAmount also contains the per-line discounts, which SaleItem.total already nets out;
    // only the order-level remainder still has to come off the profit.
    const lineDiscounts = sale.items.reduce((s, i) => s + parseFloat(i.discountAmount.toString()), 0);
    totalGrossProfit -= Math.max(0, parseFloat(sale.discountAmount.toString()) - lineDiscounts);

    for (const item of sale.items) {
      const itemRevenue = parseFloat(item.total.toString());
      const unitCost = item.product?.cost ? parseFloat(item.product.cost.toString()) : 0;
      totalGrossProfit += itemRevenue - unitCost * parseFloat(item.quantity.toString());
    }
  }

  // Returns made in the period, taken off revenue and (at cost) added back to profit.
  const refunds = await prisma.refund.findMany({
    where: { sale: { storeId }, createdAt: { gte: start, lte: end } },
    select: { amount: true, createdAt: true, items: true },
  });
  const refundLines = refunds.flatMap((r) => (Array.isArray(r.items) ? (r.items as unknown as { productId?: string | null; quantity: number }[]) : []));
  const returnedIds = [...new Set(refundLines.map((l) => l.productId).filter((id): id is string => !!id))];
  const costRows = returnedIds.length ? await prisma.product.findMany({ where: { id: { in: returnedIds }, storeId }, select: { id: true, cost: true } }) : [];
  const costById = new Map(costRows.map((p) => [p.id, Number(p.cost ?? 0)]));
  for (const r of refunds) {
    const day = localDay(r.createdAt);
    if (!byDay[day]) byDay[day] = { revenue: 0, transactions: 0 };
    const amount = Number(r.amount);
    byDay[day].revenue -= amount;
    totalRevenue -= amount;
    totalGrossProfit -= amount;
    for (const l of Array.isArray(r.items) ? (r.items as unknown as { productId?: string | null; quantity: number }[]) : []) {
      totalGrossProfit += Number(l.quantity) * (l.productId ? (costById.get(l.productId) ?? 0) : 0);
    }
  }

  // Keep every day in the selected range, including zero-sale days. Besides
  // making the chart truthful, this matches the operational dashboard pattern:
  // an empty day is meaningful and must not disappear from the time axis.
  const revenueByDay: RevenueDay[] = [];
  const cursor = new Date(`${localDay(start)}T00:00:00.000Z`);
  const lastDay = localDay(end);
  while (cursor.toISOString().slice(0, 10) <= lastDay) {
    const date = cursor.toISOString().slice(0, 10);
    const data = byDay[date] ?? { revenue: 0, transactions: 0 };
    revenueByDay.push({ date, ...data });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return {
    revenue: totalRevenue,
    grossProfit: totalGrossProfit,
    transactions: sales.length,
    avgTransaction: sales.length > 0 ? totalRevenue / sales.length : 0,
    revenueByDay,
  };
}

/** Sum of stock × sale price and stock × cost, for active products (Склад card). */
export async function getStockValue(
  storeId: string
): Promise<{ saleValue: number; costValue: number }> {
  const rows = await prisma.$queryRaw<{ sale_value: string | null; cost_value: string | null }[]>`
    SELECT SUM(stock * price) AS sale_value, SUM(stock * COALESCE(cost, 0)) AS cost_value
    FROM "Product" WHERE active = true AND "deletedAt" IS NULL AND "storeId" = ${storeId}
  `;
  return {
    saleValue: parseFloat(rows[0]?.sale_value ?? "0") || 0,
    costValue: parseFloat(rows[0]?.cost_value ?? "0") || 0,
  };
}
