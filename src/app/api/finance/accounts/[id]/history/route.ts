import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

interface Row { id: string; createdAt: Date; type: string; amount: number }

// GET /api/finance/accounts/:id/history?from=&to=&page=&pageSize= — История счёта:
// a single account's ledger, merging manual Payment rows with the auto-generated
// Приёмка/Возврат приёмки entries that settled against this account.
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

  const [payments, receiptPayments, returnPayments] = await Promise.all([
    prisma.payment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.purchaseReceiptPayment.findMany({ where: { accountId, ...dateWhere } }),
    prisma.supplierReturnPayment.findMany({ where: { accountId, ...dateWhere } }),
  ]);

  const rows: Row[] = [
    ...payments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: p.direction === "IN" ? "Приход" : "Расход", amount: p.direction === "IN" ? Number(p.amount) : -Number(p.amount) })),
    ...receiptPayments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: "Приемка", amount: -Number(p.amount) })),
    ...returnPayments.map((p) => ({ id: p.id, createdAt: p.createdAt, type: "Возврат приемки", amount: Number(p.amount) })),
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
