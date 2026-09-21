import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { getProductStatRows, withDerived, sumTotals, type ProductStatRow } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const SORT_FIELDS = ["saleQty", "saleAmount", "returnQty", "profit"] as const;
type SortField = (typeof SORT_FIELDS)[number];
const UNASSIGNED = "__unassigned__";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const sortFieldParam = sp.get("sortField") as SortField | null;
  const sortField: SortField = sortFieldParam && SORT_FIELDS.includes(sortFieldParam) ? sortFieldParam : "saleAmount";
  const sortOrder = sp.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const rows = await getProductStatRows(req);
  const supplierIds = [...new Set(rows.map((r) => r.supplierId).filter((id): id is string => !!id))];
  const suppliers = await prisma.supplier.findMany({ where: { id: { in: supplierIds }, storeId }, select: { id: true, name: true } });
  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));

  const buckets = new Map<string, ProductStatRow[]>();
  for (const r of rows) {
    const key = r.supplierId ?? UNASSIGNED;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(r);
  }

  const grouped = [...buckets.entries()].map(([key, bucketRows]) => {
    const label = key === UNASSIGNED ? "Незаданные" : (supplierMap.get(key) ?? "Незаданные");
    const base = bucketRows.reduce(
      (acc, r) => ({
        saleQty: acc.saleQty + r.saleQty,
        saleAmount: acc.saleAmount + r.saleAmount,
        saleCost: acc.saleCost + r.saleCost,
        returnQty: acc.returnQty + r.returnQty,
        returnAmount: acc.returnAmount + r.returnAmount,
        returnCost: acc.returnCost + r.returnCost,
      }),
      { saleQty: 0, saleAmount: 0, saleCost: 0, returnQty: 0, returnAmount: 0, returnCost: 0 }
    );
    return withDerived({ key, label, ...base });
  });

  grouped.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  const totals = sumTotals(grouped);

  if (sp.get("export") === "xlsx") {
    const header = ["Поставщик", "Кол-во продаж", "Сумма продаж", "Сумма себестоимости", "Кол-во возвратов", "Сумма возвратов", "Наценка", "Рентабельность %", "Прибыль"];
    return xlsxResponse({
      filename: "statistika-po-postavshikam",
      sheetName: "Поставщики",
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
