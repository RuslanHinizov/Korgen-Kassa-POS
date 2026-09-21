import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getProductStatRows, withDerived, sumTotals } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const SORT_FIELDS = ["saleQty", "saleAmount", "returnQty", "profit"] as const;
type SortField = (typeof SORT_FIELDS)[number];

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

  const rows = (await getProductStatRows(req)).map(withDerived);

  rows.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  const totals = sumTotals(rows);
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  if (sp.get("export") === "xlsx") {
    const header = ["Название товара", "Штрихкод", "Ед. изм", "Кол-во продаж", "Сумма продаж", "Сумма себестоимости", "Кол-во возвратов", "Сумма возвратов", "Наценка", "Рентабельность %", "Прибыль"];
    return xlsxResponse({
      filename: "statistika-po-tovaram",
      sheetName: "Товары",
      rows: [header, ...rows.map((r) => [
        r.productName, r.barcode ?? "", r.unit, r.saleQty, r.saleAmount, r.saleCost,
        r.returnQty, r.returnAmount, r.markup, r.rentability, r.profit,
      ])],
    });
  }

  return NextResponse.json({ items, total, totals });
}
