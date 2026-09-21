import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";

interface Row {
  id: string; kind: "receipt" | "return"; docId: string; docNo: number; supplierName: string;
  userName: string; amount: number; createdAt: Date; accountName: string;
}

// GET /api/purchase-receipts/payments?q=&sortBy=time|amount&sortOrder=asc|desc&page=&pageSize=
// — Закупки → Платежи: the unified feed UMAG shows here merges Приёмка payments
// (positive) and Возврат payments (negative, money coming back) into one ledger.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const q = sp.get("q")?.trim();
  const docNo = q ? Number(q) : undefined;
  const sortBy = sp.get("sortBy") === "amount" ? "amount" : "time";
  const sortOrder = sp.get("sortOrder") === "asc" ? 1 : -1;
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(200, Math.max(1, Number(sp.get("pageSize") ?? 20)));

  const storeId = await getStoreId();
  const receiptWhere = { receipt: { storeId, ...(docNo && !Number.isNaN(docNo) ? { documentNo: docNo } : {}) } };
  const returnWhere = { return: { storeId, ...(docNo && !Number.isNaN(docNo) ? { documentNo: docNo } : {}) } };

  const [receiptPayments, returnPayments] = await Promise.all([
    prisma.purchaseReceiptPayment.findMany({
      where: receiptWhere,
      include: { user: { select: { name: true } }, account: { select: { name: true } }, receipt: { select: { id: true, documentNo: true, supplier: { select: { name: true } } } } },
    }),
    prisma.supplierReturnPayment.findMany({
      where: returnWhere,
      include: { user: { select: { name: true } }, account: { select: { name: true } }, return: { select: { id: true, documentNo: true, supplier: { select: { name: true } } } } },
    }),
  ]);

  const rows: Row[] = [
    ...receiptPayments.map((p) => ({
      id: p.id, kind: "receipt" as const, docId: p.receipt.id, docNo: p.receipt.documentNo,
      supplierName: p.receipt.supplier?.name ?? "—", userName: p.user.name, amount: Number(p.amount), createdAt: p.createdAt, accountName: p.account.name,
    })),
    ...returnPayments.map((p) => ({
      id: p.id, kind: "return" as const, docId: p.return.id, docNo: p.return.documentNo,
      supplierName: p.return.supplier?.name ?? "—", userName: p.user.name, amount: -Number(p.amount), createdAt: p.createdAt, accountName: p.account.name,
    })),
  ];

  rows.sort((a, b) => {
    const diff = sortBy === "amount" ? a.amount - b.amount : +a.createdAt - +b.createdAt;
    return diff * sortOrder;
  });

  if (sp.get("export") === "xlsx") {
    const header = ["Время", "Приёмка/Возврат №", "Со счёта", "Поставщик", "Пользователь", "Сумма"];
    return xlsxResponse({
      filename: "zakupki-platezhi",
      sheetName: "Платежи",
      rows: [header, ...rows.map((r) => [
        new Date(r.createdAt), r.docNo, r.accountName, r.supplierName, r.userName, r.amount,
      ])],
    });
  }

  const total = rows.length;
  const start = (page - 1) * pageSize;
  const page_ = rows.slice(start, start + pageSize);

  return NextResponse.json({
    payments: page_.map((p) => ({
      id: p.id, kind: p.kind, docId: p.docId, docNo: p.docNo, supplierName: p.supplierName,
      userName: p.userName, amount: p.amount, createdAt: p.createdAt, accountName: p.accountName,
    })),
    total,
  });
}
