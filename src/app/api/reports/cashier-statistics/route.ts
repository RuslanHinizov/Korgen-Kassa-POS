import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const SORT_FIELDS = ["reportSum", "salesSum", "nonCash", "returns", "total"] as const;
type SortField = (typeof SORT_FIELDS)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function nonCashAmount(sale: any): number {
  const total = Number(sale.total);
  const lines = sale.paymentLines;
  if (Array.isArray(lines) && lines.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return lines.filter((p: any) => p.method !== "CASH").reduce((s: number, p: any) => s + Number(p.amount), 0);
  }
  return sale.paymentMethod !== "CASH" ? total : 0;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const { from, to } = parseDateRange(sp);
  const sortFieldParam = sp.get("sortField") as SortField | null;
  const sortField: SortField = sortFieldParam && SORT_FIELDS.includes(sortFieldParam) ? sortFieldParam : "salesSum";
  const sortOrder = sp.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const [sales, refunds, shifts, users] = await Promise.all([
    prisma.sale.findMany({
      where: { storeId, status: { in: ["COMPLETED", "REFUNDED"] }, createdAt: { gte: from, lte: to } },
      select: { userId: true, total: true, paymentMethod: true, paymentLines: true },
    }),
    prisma.refund.findMany({
      where: { sale: { storeId }, createdAt: { gte: from, lte: to } },
      select: { userId: true, amount: true },
    }),
    prisma.shift.findMany({
      where: { storeId, status: "CLOSED", closedAt: { gte: from, lte: to } },
      select: { userId: true, countedCash: true },
    }),
    prisma.user.findMany({ select: { id: true, name: true } }),
  ]);

  const userMap = new Map(users.map((u) => [u.id, u.name]));

  interface Bucket { reportSum: number; salesSum: number; nonCash: number; returns: number }
  const buckets = new Map<string, Bucket>();
  function bucket(userId: string) {
    if (!buckets.has(userId)) buckets.set(userId, { reportSum: 0, salesSum: 0, nonCash: 0, returns: 0 });
    return buckets.get(userId)!;
  }

  for (const s of sales) {
    const b = bucket(s.userId);
    b.salesSum += Number(s.total);
    b.nonCash += nonCashAmount(s);
  }
  for (const r of refunds) {
    bucket(r.userId).returns += Number(r.amount);
  }
  for (const sh of shifts) {
    if (sh.countedCash != null) bucket(sh.userId).reportSum += Number(sh.countedCash);
  }

  const rows = [...buckets.entries()].map(([userId, b]) => ({
    userId,
    name: userMap.get(userId) ?? "—",
    reportSum: b.reportSum,
    salesSum: b.salesSum,
    nonCash: b.nonCash,
    returns: b.returns,
    total: b.salesSum - b.returns,
  }));

  rows.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  if (sp.get("export") === "xlsx") {
    const header = ["Кассир", "По отчёту", "Продажи", "Безналичные", "Возвраты", "Итого"];
    return xlsxResponse({
      filename: "otchet-po-kassiram",
      sheetName: "Кассиры",
      rows: [header, ...rows.map((r) => [r.name, r.reportSum, r.salesSum, r.nonCash, r.returns, r.total])],
    });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      reportSum: acc.reportSum + r.reportSum, salesSum: acc.salesSum + r.salesSum,
      nonCash: acc.nonCash + r.nonCash, returns: acc.returns + r.returns, total: acc.total + r.total,
    }),
    { reportSum: 0, salesSum: 0, nonCash: 0, returns: 0, total: 0 }
  );

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return NextResponse.json({ items, total, totals });
}
