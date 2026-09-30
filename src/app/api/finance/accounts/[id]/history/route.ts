import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

interface Row { id: string; createdAt: Date; type: string; amount: number }

// GET /api/finance/accounts/:id/history?from=&to=&page=&pageSize= — История счёта:
// a single account's ledger: manual Payment rows, Приёмка/Возврат приёмки settlements, transfers in and out,
// customer debt repayments, and (for a register's accounts) the till's Кассовая продажа / Кассовый возврат.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: accountId } = await params;
  const storeId = await getStoreId();

  const account = await prisma.financeAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 25)));
  const dateWhere = from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};

  const registerOf = { cashbox: { OR: [{ accountId }, { extraAccountId: accountId }] } };
  const [payments, receiptPayments, returnPayments, transfers, customerPayments, tillSales, tillRefunds] = await Promise.all([
    prisma.payment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.purchaseReceiptPayment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.supplierReturnPayment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.transfer.findMany({ where: { storeId, OR: [{ fromAccountId: accountId }, { toAccountId: accountId }], ...dateWhere } }),
    prisma.customerPayment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.sale.findMany({
      where: { storeId, status: { not: "VOIDED" }, ...registerOf, ...dateWhere },
      select: { id: true, createdAt: true, total: true, paymentMethod: true, paymentLines: true, cashbox: { select: { accountId: true, extraAccountId: true } } },
    }),
    prisma.refund.findMany({
      where: { sale: { storeId, ...registerOf }, ...dateWhere },
      select: { id: true, createdAt: true, amount: true, sale: { select: { paymentMethod: true, cashbox: { select: { accountId: true, extraAccountId: true } } } } },
    }),
  ]);

  // What a sale put into this account: the cash part goes to the register's cash account, card/other to its extra account.
  const saleRows: Row[] = [];
  for (const s of tillSales) {
    const lines = Array.isArray(s.paymentLines) ? (s.paymentLines as unknown as { method: string; amount: number }[]) : [];
    const cash = lines.length > 0 ? lines.filter((l) => l.method === "CASH").reduce((a, l) => a + Number(l.amount), 0) : s.paymentMethod === "CASH" ? Number(s.total) : 0;
    const nonCash = lines.length > 0 ? lines.filter((l) => l.method !== "CASH").reduce((a, l) => a + Number(l.amount), 0) : s.paymentMethod === "CARD" || s.paymentMethod === "OTHER" ? Number(s.total) : 0;
    const amount = (s.cashbox?.accountId === accountId ? cash : 0) + (s.cashbox?.extraAccountId === accountId ? nonCash : 0);
    if (amount) saleRows.push({ id: s.id, createdAt: s.createdAt, type: "Кассовая продажа", amount });
  }
  const refundRows: Row[] = [];
  for (const r of tillRefunds) {
    const target = r.sale.paymentMethod === "CASH" ? r.sale.cashbox?.accountId : r.sale.paymentMethod === "CARD" || r.sale.paymentMethod === "OTHER" ? r.sale.cashbox?.extraAccountId : null;
    if (target === accountId) refundRows.push({ id: r.id, createdAt: r.createdAt, type: "Кассовый возврат", amount: -Number(r.amount) });
  }

  const rows: Row[] = [
    ...payments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: p.direction === "IN" ? "Приход" : "Расход", amount: p.direction === "IN" ? Number(p.amount) : -Number(p.amount) })),
    ...receiptPayments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: "Приемка", amount: -Number(p.amount) })),
    ...returnPayments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: "Возврат приемки", amount: Number(p.amount) })),
    ...transfers.map((t) => ({ id: t.id, createdAt: t.createdAt, type: t.toAccountId === accountId ? "Перевод (поступление)" : "Перевод (списание)", amount: t.toAccountId === accountId ? Number(t.amount) : -Number(t.amount) })),
    ...customerPayments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: "Оплата долга покупателем", amount: Number(p.amount) })),
    ...saleRows,
    ...refundRows,
  ].sort((a, b) => +b.createdAt - +a.createdAt);

  const total = rows.length;
  const totalAmount = rows.reduce((s, r) => s + r.amount, 0);
  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({
    account: { id: account.id, name: account.name, type: account.type, balance: Number(account.balance) },
    history: pageRows,
    total,
    totalAmount,
  });
}
