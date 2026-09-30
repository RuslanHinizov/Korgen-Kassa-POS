import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { getProductStatRows } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

interface Row {
  productId: string;
  productName: string;
  barcode: string | null;
  price: number;
  cost: number;
  markup: number | null;
  qty: number;
  costTotal: number;
  revenue: number;
  profit: number;
  abcRevenue: "A" | "B" | "C";
  abcProfit: "A" | "B" | "C";
}

function classify<T>(rows: T[], value: (r: T) => number): Map<T, "A" | "B" | "C"> {
  const sorted = [...rows].sort((a, b) => value(b) - value(a));
  const total = sorted.reduce((s, r) => s + value(r), 0);
  const map = new Map<T, "A" | "B" | "C">();
  if (total <= 0) {
    for (const r of sorted) map.set(r, "C");
    return map;
  }
  // Classify by the cumulative share *before* this item — the item that
  // crosses a threshold still belongs to the class it crossed into, so a
  // single item contributing 100% is still "A" (nothing preceded it).
  let cumBefore = 0;
  for (const r of sorted) {
    const pctBefore = cumBefore / total;
    map.set(r, pctBefore < 0.8 ? "A" : pctBefore < 0.95 ? "B" : "C");
    cumBefore += value(r);
  }
  return map;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const sortOrder = sp.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const statRows = (await getProductStatRows(req)).filter((r) => r.saleQty - r.returnQty > 0 || r.saleAmount - r.returnAmount !== 0);

  const products = await prisma.product.findMany({
    where: { id: { in: statRows.map((r) => r.productId) }, storeId },
    select: { id: true, price: true, cost: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));

  const base = statRows.map((r) => {
    const p = productMap.get(r.productId);
    const price = Number(p?.price ?? 0);
    const cost = Number(p?.cost ?? 0);
    const qty = r.saleQty - r.returnQty;
    const costTotal = r.saleCost - r.returnCost;
    const revenue = r.saleAmount - r.returnAmount;
    const profit = revenue - costTotal;
    return {
      productId: r.productId, productName: r.productName, barcode: r.barcode,
      price, cost, markup: cost > 0 ? ((price - cost) / cost) * 100 : null,
      qty, costTotal, revenue, profit,
    };
  });

  const revenueClass = classify(base, (r) => r.revenue);
  const profitClass = classify(base, (r) => r.profit);

  const rows: Row[] = base.map((r) => ({
    ...r,
    abcRevenue: revenueClass.get(r)!,
    abcProfit: profitClass.get(r)!,
  }));

  rows.sort((a, b) => (a.profit - b.profit) * sortOrder);

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  if (sp.get("export") === "xlsx") {
    const header = ["№", "Товар", "Прод. цена", "Закуп.цена", "Наценка %", "Кол-во продаж", "Сумма продаж по с/с", "Сумма продаж по р/ц", "АВС по р/ц", "Прибыль", "АВС по прибыли", "Свод"];
    return xlsxResponse({
      filename: "abc-analiz",
      sheetName: "ABC-анализ",
      rows: [header, ...rows.map((r, i) => [
        i + 1, r.productName, r.price, r.cost, r.markup ?? "", r.qty, r.costTotal,
        r.revenue, r.abcRevenue, r.profit, r.abcProfit, `${r.abcRevenue}${r.abcProfit}`,
      ])],
    });
  }

  return NextResponse.json({ items, total });
}
