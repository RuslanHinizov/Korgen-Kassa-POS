import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";

const MONTH_NAMES = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

// GET /api/reports/cash-flow — monthly rollup, all from real data:
// purchases (supplier payments), expenses (Финансы → Платежи, Расход, excluding
// dividend-tagged ones), investments (Платежи, Приход), dividends (Платежи, Расход
// with an expense type named "Дивиденды").
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 25)));
  const monthsBack = 36;

  const now = new Date();
  const currentYear = now.getFullYear();
  const months: { year: number; month: number }[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth() });
  }

  const earliest = new Date(months[months.length - 1].year, months[months.length - 1].month, 1);
  const storeId = await getStoreId();
  const [purchasePayments, ledgerPayments] = await Promise.all([
    prisma.purchaseReceiptPayment.findMany({
      where: { createdAt: { gte: earliest }, account: { storeId } },
      select: { amount: true, createdAt: true },
    }),
    prisma.payment.findMany({
      where: { storeId, createdAt: { gte: earliest } },
      select: { amount: true, direction: true, createdAt: true, expenseType: { select: { name: true } } },
    }),
  ]);

  const purchasesByKey = new Map<string, number>();
  for (const p of purchasePayments) {
    const key = `${p.createdAt.getFullYear()}-${p.createdAt.getMonth()}`;
    purchasesByKey.set(key, (purchasesByKey.get(key) ?? 0) + Number(p.amount));
  }

  const expensesByKey = new Map<string, number>();
  const investmentsByKey = new Map<string, number>();
  const dividendsByKey = new Map<string, number>();
  for (const p of ledgerPayments) {
    const key = `${p.createdAt.getFullYear()}-${p.createdAt.getMonth()}`;
    const amount = Number(p.amount);
    if (p.direction === "IN") {
      investmentsByKey.set(key, (investmentsByKey.get(key) ?? 0) + amount);
    } else if (p.expenseType?.name.trim().toLowerCase() === "дивиденды") {
      dividendsByKey.set(key, (dividendsByKey.get(key) ?? 0) + amount);
    } else {
      expensesByKey.set(key, (expensesByKey.get(key) ?? 0) + amount);
    }
  }

  const rows = months.map(({ year, month }) => {
    const key = `${year}-${month}`;
    return {
      key,
      label: year === currentYear ? MONTH_NAMES[month] : `${MONTH_NAMES[month]}, ${year}г.`,
      purchases: purchasesByKey.get(key) ?? 0,
      expenses: expensesByKey.get(key) ?? 0,
      investments: investmentsByKey.get(key) ?? 0,
      dividends: dividendsByKey.get(key) ?? 0,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      purchases: acc.purchases + r.purchases, expenses: acc.expenses + r.expenses,
      investments: acc.investments + r.investments, dividends: acc.dividends + r.dividends,
    }),
    { purchases: 0, expenses: 0, investments: 0, dividends: 0 }
  );

  if (sp.get("export") === "xlsx") {
    const header = ["Месяц", "Закупы", "Расходы", "Вложения", "Дивиденды"];
    return xlsxResponse({
      filename: "dvizhenie-deneg",
      sheetName: "Движение денег",
      rows: [header, ...rows.map((r) => [r.label, r.purchases, r.expenses, r.investments, r.dividends])],
    });
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const items = rows.slice(start, start + pageSize);

  return NextResponse.json({ items, total, totals });
}
