import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const SORT_FIELDS = ["salesCount", "salesSum", "returnsCount", "returnsSum", "total"] as const;
type SortField = (typeof SORT_FIELDS)[number];

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
  const [sales, refunds, consultants] = await Promise.all([
    prisma.sale.findMany({
      where: { storeId, status: { in: ["COMPLETED", "REFUNDED"] }, createdAt: { gte: from, lte: to }, consultantId: { not: null } },
      select: { consultantId: true, total: true },
    }),
    prisma.refund.findMany({
      where: { sale: { storeId, consultantId: { not: null } }, createdAt: { gte: from, lte: to } },
      select: { amount: true, sale: { select: { consultantId: true } } },
    }),
    prisma.consultant.findMany({ where: { storeId }, select: { id: true, name: true } }),
  ]);

  const consultantMap = new Map(consultants.map((c) => [c.id, c.name]));

  interface Bucket { salesCount: number; salesSum: number; returnsCount: number; returnsSum: number }
  const buckets = new Map<string, Bucket>();
  function bucket(id: string) {
    if (!buckets.has(id)) buckets.set(id, { salesCount: 0, salesSum: 0, returnsCount: 0, returnsSum: 0 });
    return buckets.get(id)!;
  }

  for (const s of sales) {
    const b = bucket(s.consultantId!);
    b.salesCount += 1;
    b.salesSum += Number(s.total);
  }
  for (const r of refunds) {
    const id = r.sale.consultantId;
    if (!id) continue;
    const b = bucket(id);
    b.returnsCount += 1;
    b.returnsSum += Number(r.amount);
  }

  const rows = [...buckets.entries()].map(([id, b]) => ({
    id,
    name: consultantMap.get(id) ?? "—",
    salesCount: b.salesCount,
    salesSum: b.salesSum,
    returnsCount: b.returnsCount,
    returnsSum: b.returnsSum,
    total: b.salesSum - b.returnsSum,
  }));

  rows.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  if (sp.get("export") === "xlsx") {
    const header = ["Консультант", "Кол-во продаж", "Сумма продаж", "Кол-во возвратов", "Сумма возвратов", "Итого"];
    return xlsxResponse({
      filename: "otchet-po-konsultantam",
      sheetName: "Консультанты",
      rows: [header, ...rows.map((r) => [r.name, r.salesCount, r.salesSum, r.returnsCount, r.returnsSum, r.total])],
    });
  }

  const totals = rows.reduce(
    (acc, r) => ({
      salesCount: acc.salesCount + r.salesCount, salesSum: acc.salesSum + r.salesSum,
      returnsCount: acc.returnsCount + r.returnsCount, returnsSum: acc.returnsSum + r.returnsSum, total: acc.total + r.total,
    }),
    { salesCount: 0, salesSum: 0, returnsCount: 0, returnsSum: 0, total: 0 }
  );

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return NextResponse.json({ items, total, totals });
}
