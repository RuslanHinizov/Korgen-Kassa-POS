import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { Prisma } from "@/generated/prisma/client";

// GET /api/customer-returns?from=&to=&status=DRAFT,POSTED&userId=&customerQuery=&q=&page=&pageSize= — list, newest first
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const statusParam = sp.get("status");
  const statuses = statusParam ? statusParam.split(",").filter((s) => s === "DRAFT" || s === "POSTED") : undefined;
  const userId = sp.get("userId") || "";
  const customerQuery = sp.get("customerQuery")?.trim() || "";
  const q = sp.get("q")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const where: Prisma.CustomerReturnWhereInput = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(statuses && statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED")[] } } : {}),
    ...(userId ? { userId } : {}),
    ...(customerQuery ? { customer: { name: { contains: customerQuery, mode: "insensitive" } } } : {}),
    ...(q ? { items: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { product: { barcode: { contains: q } } }] } } } : {}),
  };

  const [total, all, totalsAgg] = await Promise.all([
    prisma.customerReturn.count({ where }),
    prisma.customerReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { customer: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
    prisma.customerReturn.findMany({ where, select: { totalAmount: true, payments: { select: { amount: true } } } }),
  ]);

  const totals = totalsAgg.reduce(
    (acc, r) => {
      const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
      return { totalAmount: acc.totalAmount + Number(r.totalAmount), paidAmount: acc.paidAmount + paid, remainingAmount: acc.remainingAmount + (Number(r.totalAmount) - paid) };
    },
    { totalAmount: 0, paidAmount: 0, remainingAmount: 0 }
  );

  const returns = all.map((r) => {
    const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: r.id, documentNo: r.documentNo, status: r.status, createdAt: r.createdAt,
      customerName: r.customer?.name ?? null, comment: r.comment,
      totalAmount: Number(r.totalAmount), paidAmount: paid, remainingAmount: Number(r.totalAmount) - paid,
    };
  });

  if (sp.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "vozvrat-pokupateley",
      rows: [["Номер", "Дата", "Контрагент", "Статус", "Сумма", "Оплачено", "Осталось", "Комментарий"], ...returns.map((r) => [r.documentNo, new Date(r.createdAt), r.customerName ?? "Розничный покупатель", r.status === "POSTED" ? "Проведён" : "Черновик", r.totalAmount, r.paidAmount, r.remainingAmount, r.comment ?? ""])],
    });
  }

  return NextResponse.json({ returns, total, totals });
}

// POST /api/customer-returns — create an empty draft
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const customerId = typeof body?.customerId === "string" ? body.customerId : null;
  const storeId = await getStoreId();
  if (customerId) {
    const customer = await prisma.customer.findFirst({ where: { id: customerId, ...(await counterpartyScope(storeId)) } });
    if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 404 });
  }

  const customerReturn = await prisma.customerReturn.create({
    data: { storeId, userId: session.user.id, customerId },
  });
  return NextResponse.json({ customerReturn }, { status: 201 });
}
