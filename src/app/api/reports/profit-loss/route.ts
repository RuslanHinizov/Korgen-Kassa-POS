import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { parseDateRange } from "@/lib/sales-statistics";
import { xlsxResponse } from "@/lib/xlsx-response";

const REASON_LABEL: Record<string, string> = {
  DAMAGED: "Испорченный",
  EXPIRED: "Просроченный",
  KITCHEN: "Кухня",
  OTHER: "Другое",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function splitByMethod(sale: any) {
  const total = Number(sale.total);
  const lines = sale.paymentLines;
  const out = { cash: 0, card: 0, other: 0 };
  if (Array.isArray(lines) && lines.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const p of lines as any[]) {
      if (p.method === "CASH") out.cash += Number(p.amount);
      else if (p.method === "CARD") out.card += Number(p.amount);
      else out.other += Number(p.amount);
    }
  } else if (sale.paymentMethod === "CASH") out.cash = total;
  else if (sale.paymentMethod === "CARD") out.card = total;
  else out.other = total;
  return out;
}

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { from, to } = parseDateRange(req.nextUrl.searchParams);
  const storeId = await getStoreId();

  const [sales, refunds, writeOffs] = await Promise.all([
    prisma.sale.findMany({
      where: { storeId, status: { in: ["COMPLETED", "REFUNDED"] }, createdAt: { gte: from, lte: to } },
      select: {
        total: true, paymentMethod: true, paymentLines: true,
        items: { select: { quantity: true, product: { select: { cost: true, price: true } } } },
      },
    }),
    prisma.refund.findMany({
      where: { sale: { storeId }, createdAt: { gte: from, lte: to } },
      select: { amount: true, items: true },
    }),
    prisma.writeOff.findMany({
      where: { storeId, status: "POSTED", postedAt: { gte: from, lte: to } },
      select: { items: { select: { reason: true, quantity: true, unitCost: true } } },
    }),
  ]);

  let salesTotal = 0;
  let cash = 0, card = 0, other = 0;
  let cogsSold = 0;
  for (const s of sales) {
    salesTotal += Number(s.total);
    const split = splitByMethod(s);
    cash += split.cash; card += split.card; other += split.other;
    for (const it of s.items) {
      cogsSold += Number(it.quantity) * Number(it.product?.cost ?? it.product?.price ?? 0);
    }
  }

  let returnsTotal = 0;
  let cogsReturned = 0;
  const productIds = new Set<string>();
  for (const r of refunds) {
    returnsTotal += Number(r.amount);
    const items = r.items as unknown as { productId?: string | null }[];
    for (const it of items) if (it.productId) productIds.add(it.productId);
  }
  if (productIds.size > 0) {
    const products = await prisma.product.findMany({ where: { id: { in: [...productIds] }, storeId }, select: { id: true, cost: true, price: true } });
    const costMap = new Map(products.map((p) => [p.id, Number(p.cost ?? p.price)]));
    for (const r of refunds) {
      const items = r.items as unknown as { productId?: string | null; quantity: number }[];
      for (const it of items) {
        if (!it.productId) continue;
        cogsReturned += it.quantity * (costMap.get(it.productId) ?? 0);
      }
    }
  }

  const writeOffByReason: Record<string, number> = { DAMAGED: 0, EXPIRED: 0, KITCHEN: 0, OTHER: 0 };
  for (const w of writeOffs) {
    for (const it of w.items) {
      writeOffByReason[it.reason] = (writeOffByReason[it.reason] ?? 0) + Number(it.quantity) * Number(it.unitCost ?? 0);
    }
  }
  const writeOffTotal = Object.values(writeOffByReason).reduce((a, b) => a + b, 0);

  const revenue = salesTotal - returnsTotal;
  const cogs = cogsSold - cogsReturned;
  const grossProfit = revenue - cogs;
  const operatingExpenses = writeOffTotal;
  const netProfit = grossProfit - operatingExpenses;

  const tree = [
    {
      label: "Выручка", amount: revenue,
      children: [
        {
          label: "Продажи", amount: salesTotal,
          children: [
            { label: "Наличными", amount: cash },
            { label: "Безналичными", amount: card },
            { label: "В долг", amount: other },
          ],
        },
        { label: "Возврат", amount: returnsTotal },
      ],
    },
    {
      label: "Себестоимость", amount: cogs,
      children: [
        { label: "Себестоимость проданных товаров", amount: cogsSold },
        { label: "Себестоимость возвращенных товаров", amount: cogsReturned },
      ],
    },
    { label: "Валовая прибыль", amount: grossProfit, bold: true },
    {
      label: "Операционные расходы", amount: operatingExpenses,
      children: [
        {
          label: "Списание", amount: writeOffTotal,
          children: Object.entries(REASON_LABEL).map(([key, label]) => ({ label, amount: writeOffByReason[key] ?? 0 })),
        },
      ],
    },
    { label: "Чистая прибыль", amount: netProfit, bold: true },
  ];

  if (req.nextUrl.searchParams.get("export") === "xlsx") {
    const flatten = (
      nodes: { label: string; amount: number; children?: unknown[] }[],
      depth = 0,
    ): [string, number][] =>
      nodes.flatMap((node) => [
        ["  ".repeat(depth) + node.label, node.amount] as [string, number],
        ...flatten(
          (node.children ?? []) as { label: string; amount: number; children?: unknown[] }[],
          depth + 1,
        ),
      ]);

    return xlsxResponse({
      filename: "pribyli-i-ubytki",
      sheetName: "Прибыль и убытки",
      rows: [["Статья", "Сумма"], ...flatten(tree)],
    });
  }

  return NextResponse.json({ tree, from, to });
}
