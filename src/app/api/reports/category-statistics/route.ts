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

function aggregate(key: string, label: string, rows: ProductStatRow[]) {
  const base = rows.reduce(
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
  return withDerived({ key, label, expandable: false, ...base });
}

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
  const parentCategoryId = sp.get("parentCategoryId") || "";

  const storeId = await getStoreId();
  const rows = await getProductStatRows(req);
  const categories = await prisma.category.findMany({ where: { storeId }, select: { id: true, name: true, parentId: true } });
  const catMap = new Map(categories.map((c) => [c.id, c]));

  function topAncestor(id: string | null): string {
    if (!id) return UNASSIGNED;
    let cur = catMap.get(id);
    if (!cur) return UNASSIGNED;
    while (cur.parentId) {
      const parent = catMap.get(cur.parentId);
      if (!parent) break;
      cur = parent;
    }
    return cur.id;
  }

  let grouped: ReturnType<typeof aggregate>[];

  if (parentCategoryId) {
    const scoped = rows.filter((r) => topAncestor(r.categoryId) === parentCategoryId);
    const buckets = new Map<string, ProductStatRow[]>();
    for (const r of scoped) {
      const key = r.categoryId && r.categoryId !== parentCategoryId ? r.categoryId : `product:${r.productId}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    grouped = [...buckets.entries()].map(([key, bucketRows]) => {
      if (key.startsWith("product:")) {
        const r = bucketRows[0];
        return { ...aggregate(key, r.productName, bucketRows), expandable: false };
      }
      const cat = catMap.get(key);
      return { ...aggregate(key, cat?.name ?? "Незаданные", bucketRows), expandable: false };
    });
  } else {
    const buckets = new Map<string, ProductStatRow[]>();
    for (const r of rows) {
      const key = topAncestor(r.categoryId);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(r);
    }
    grouped = [...buckets.entries()].map(([key, bucketRows]) => {
      const label = key === UNASSIGNED ? "Незаданные" : (catMap.get(key)?.name ?? "Незаданные");
      const hasChildLevel = bucketRows.some((r) => r.categoryId && r.categoryId !== key);
      return { ...aggregate(key, label, bucketRows), expandable: key !== UNASSIGNED && (hasChildLevel || bucketRows.length > 0) };
    });
  }

  grouped.sort((a, b) => (a[sortField] - b[sortField]) * sortOrder);

  const totals = sumTotals(grouped);

  if (sp.get("export") === "xlsx") {
    // One row per category totals, immediately followed by the products sold within it —
    // matches what an admin sees on screen when they expand every category, not just the rollup.
    const byTopCategory = new Map<string, ProductStatRow[]>();
    for (const r of rows) {
      const key = topAncestor(r.categoryId);
      if (!byTopCategory.has(key)) byTopCategory.set(key, []);
      byTopCategory.get(key)!.push(r);
    }
    const header = ["Категория", "Товар", "Кол-во продаж", "Сумма продаж", "Сумма себестоимости", "Кол-во возвратов", "Сумма возвратов", "Наценка", "Рентабельность %", "Прибыль"];
    const body: (string | number)[][] = [];
    for (const cat of grouped) {
      body.push([cat.label, "", cat.saleQty, cat.saleAmount, cat.saleCost, cat.returnQty, cat.returnAmount, cat.markup, cat.rentability, cat.profit]);
      const products = (byTopCategory.get(cat.key) ?? []).map((p) => withDerived(p)).sort((a, b) => b.saleAmount - a.saleAmount);
      for (const p of products) {
        body.push(["", p.productName, p.saleQty, p.saleAmount, p.saleCost, p.returnQty, p.returnAmount, p.markup, p.rentability, p.profit]);
      }
    }
    return xlsxResponse({
      filename: "statistika-po-kategoriyam",
      sheetName: "Категории",
      rows: [header, ...body],
    });
  }

  const total = grouped.length;
  const start = (page - 1) * pageSize;
  const items = grouped.slice(start, start + pageSize);

  return NextResponse.json({ items, total, totals });
}
