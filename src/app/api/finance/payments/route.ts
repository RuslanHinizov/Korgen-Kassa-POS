import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

interface Row {
  id: string; kind: "payment" | "receipt" | "return"; documentNo: number; createdAt: Date;
  counterparty: string; userName: string; purpose: string; amountOut: number; amountIn: number;
  accountName: string; comment: string;
}

// GET /api/finance/payments?from=&to=&direction=&userId=&expenseTypeId=&q=&page=&pageSize=&export=csv
// — Финансы → Платежи: the unified ledger UMAG shows at /store/0/movements/overview,
// merging manual Приход/Расход entries with the auto-generated Приёмка/Возврат приёмки ones.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const direction = sp.get("direction"); // "IN" | "OUT" | null (both)
  const userId = sp.get("userId") || "";
  const expenseTypeId = sp.get("expenseTypeId") || "";
  const q = sp.get("q")?.trim().toLowerCase() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const dateWhere = from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {};
  const business = await prisma.businessSettings.findUnique({ where: { storeId } });
  const storeName = business?.name ?? "Магазин";

  // expenseTypeId only applies to manual Расход entries — Приёмка/Возврат have no expense type
  const includeReceiptsAndReturns = !expenseTypeId;
  const includeReceipts = includeReceiptsAndReturns && (!direction || direction === "OUT");
  const includeReturns = includeReceiptsAndReturns && (!direction || direction === "IN");

  const paymentWhere = {
    storeId,
    ...dateWhere,
    ...(userId ? { userId } : {}),
    ...(direction ? { direction: direction as "IN" | "OUT" } : {}),
    ...(expenseTypeId ? { expenseTypeId, direction: "OUT" as const } : {}),
  };

  const [payments, receiptPayments, returnPayments] = await Promise.all([
    prisma.payment.findMany({
      where: paymentWhere,
      include: { user: { select: { name: true } }, account: { select: { name: true } }, expenseType: { select: { name: true } } },
    }),
    includeReceipts
      ? prisma.purchaseReceiptPayment.findMany({
          where: { ...dateWhere, ...(userId ? { userId } : {}), account: { storeId } },
          include: { user: { select: { name: true } }, account: { select: { name: true } }, receipt: { select: { documentNo: true, supplier: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
    includeReturns
      ? prisma.supplierReturnPayment.findMany({
          where: { ...dateWhere, ...(userId ? { userId } : {}), account: { storeId } },
          include: { user: { select: { name: true } }, account: { select: { name: true } }, return: { select: { documentNo: true, supplier: { select: { name: true } } } } },
        })
      : Promise.resolve([]),
  ]);

  let rows: Row[] = [
    ...payments.map((p) => ({
      id: p.id, kind: "payment" as const, documentNo: p.documentNo, createdAt: p.createdAt,
      counterparty: storeName, userName: p.user.name, purpose: p.expenseType?.name ?? "",
      amountOut: p.direction === "OUT" ? Number(p.amount) : 0, amountIn: p.direction === "IN" ? Number(p.amount) : 0,
      accountName: p.account.name, comment: p.comment ?? "",
    })),
    ...receiptPayments.map((p) => ({
      id: p.id, kind: "receipt" as const, documentNo: p.receipt.documentNo, createdAt: p.createdAt,
      counterparty: p.receipt.supplier?.name ?? "—", userName: p.user.name, purpose: "Приемка",
      amountOut: Number(p.amount), amountIn: 0, accountName: p.account.name, comment: p.note ?? "",
    })),
    ...returnPayments.map((p) => ({
      id: p.id, kind: "return" as const, documentNo: p.return.documentNo, createdAt: p.createdAt,
      counterparty: p.return.supplier?.name ?? "—", userName: p.user.name, purpose: "Возврат приемки",
      amountOut: 0, amountIn: Number(p.amount), accountName: p.account.name, comment: p.note ?? "",
    })),
  ];

  if (q) rows = rows.filter((r) => r.counterparty.toLowerCase().includes(q) || r.comment.toLowerCase().includes(q));
  rows.sort((a, b) => +b.createdAt - +a.createdAt);

  const total = rows.length;
  const totalOut = rows.reduce((s, r) => s + r.amountOut, 0);
  const totalIn = rows.reduce((s, r) => s + r.amountIn, 0);

  if (sp.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "payments",
      rows: [["Номер", "Дата", "Контрагент", "Пользователь", "Назначение платежа", "Сумма расхода", "Сумма прихода", "Счет", "Комментарий"], ...rows.map((r) => [r.documentNo, new Date(r.createdAt), r.counterparty, r.userName, r.purpose, r.amountOut, r.amountIn, r.accountName, r.comment])],
    });
  }

  const start = (page - 1) * pageSize;
  const pageRows = rows.slice(start, start + pageSize);

  return NextResponse.json({ payments: pageRows, total, totalOut, totalIn });
}

const createSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  amount: z.number().positive(),
  accountId: z.string().min(1),
  expenseTypeId: z.string().optional(),
  comment: z.string().max(500).optional(),
}).refine((d) => d.direction === "IN" || !!d.expenseTypeId, { message: "Укажите назначение платежа", path: ["expenseTypeId"] });

// POST /api/finance/payments — Создание платежей (Приход/Расход)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { direction, amount, accountId, expenseTypeId, comment } = parsed.data;
  const storeId = await getStoreId();

  const account = await prisma.financeAccount.findFirst({ where: { id: accountId, storeId } });
  if (!account) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  if (direction === "OUT" && !account.allowNegativeBalance && Number(account.balance) - amount < 0) {
    return NextResponse.json({ error: "Недостаточно средств на счёте" }, { status: 400 });
  }

  const payment = await prisma.$transaction(async (tx) => {
    const created = await tx.payment.create({
      data: { storeId, direction, amount, accountId, expenseTypeId: direction === "OUT" ? expenseTypeId : null, comment, userId: session.user.id },
    });
    await tx.financeAccount.update({
      where: { id: accountId },
      data: { balance: direction === "IN" ? { increment: amount } : { decrement: amount } },
    });
    return created;
  });

  return NextResponse.json({ payment }, { status: 201 });
}
