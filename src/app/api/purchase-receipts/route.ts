import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";
import { Prisma } from "@/generated/prisma/client";

// GET /api/purchase-receipts?from=&to=&status=DRAFT,POSTED&supplierId=&q=&page=&pageSize= — flat list, newest first
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const statusParam = sp.get("status");
  const statuses = statusParam ? statusParam.split(",").filter((s) => s === "DRAFT" || s === "POSTED") : undefined;
  const supplierId = sp.get("supplierId") || "";
  const userId = sp.get("userId") || "";
  const q = sp.get("q")?.trim() || "";
  const isConsignmentParam = sp.get("isConsignment");
  const documentNoParam = sp.get("documentNo")?.trim() || "";
  const supplierQuery = sp.get("supplierQuery")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const documentNo = documentNoParam && /^\d+$/.test(documentNoParam) ? Number(documentNoParam) : undefined;
  const where: Prisma.PurchaseReceiptWhereInput = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(statuses && statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED")[] } } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { items: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { product: { barcode: { contains: q } } }] } } } : {}),
    ...(isConsignmentParam != null ? { isConsignment: isConsignmentParam === "true" } : {}),
    ...(documentNo !== undefined ? { documentNo } : {}),
    ...(supplierQuery ? { supplier: { name: { contains: supplierQuery, mode: "insensitive" } } } : {}),
  };

  const [total, all] = await Promise.all([
    prisma.purchaseReceipt.count({ where }),
    prisma.purchaseReceipt.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(sp.get("export") ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: {
        supplier: { select: { name: true } },
        user: { select: { name: true } },
        payments: { select: { amount: true } },
        items: { select: { quantity: true, salePrice: true } },
      },
    }),
  ]);

  const receipts = all.map((r) => {
    const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
    const saleValue = r.items.reduce((s, i) => s + Number(i.quantity) * Number(i.salePrice), 0);
    return {
      id: r.id, documentNo: r.documentNo, status: r.status, createdAt: r.createdAt,
      supplierName: r.supplier?.name ?? null, userName: r.user.name, comment: r.comment,
      isConsignment: r.isConsignment,
      totalAmount: Number(r.totalAmount), paidAmount: paid, remainingAmount: Number(r.totalAmount) - paid,
      saleValue,
    };
  });

  const totals = receipts.reduce(
    (acc, r) => ({
      totalAmount: acc.totalAmount + r.totalAmount, paidAmount: acc.paidAmount + r.paidAmount,
      remainingAmount: acc.remainingAmount + r.remainingAmount, saleValue: acc.saleValue + r.saleValue,
    }),
    { totalAmount: 0, paidAmount: 0, remainingAmount: 0, saleValue: 0 }
  );

  if (sp.get("export") === "xlsx") {
    return xlsxResponse({
      filename: sp.get("isConsignment") === "true" ? "konsignaciya" : "priemka",
      sheetName: "Приёмки",
      rows: [["Номер", "Дата", "Пользователь", "Поставщик", "Сумма", "Оплачено", "Осталось", "Комментарий"], ...receipts.map((r) => [r.documentNo, new Date(r.createdAt), r.userName, r.supplierName ?? "", r.totalAmount, r.paidAmount, r.remainingAmount, r.comment ?? ""])],
    });
  }

  return NextResponse.json({ receipts, total, totals });
}

// POST /api/purchase-receipts — create an empty draft
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const supplierId = typeof body?.supplierId === "string" ? body.supplierId : null;
  const storeId = await getStoreId();
  if (supplierId) {
    const supplier = await prisma.supplier.findFirst({ where: { id: supplierId, ...(await counterpartyScope(storeId)) } });
    if (!supplier) return NextResponse.json({ error: "Поставщик не найден" }, { status: 404 });
  }

  const receipt = await prisma.purchaseReceipt.create({
    data: { storeId, userId: session.user.id, supplierId },
  });
  return NextResponse.json({ receipt }, { status: 201 });
}
