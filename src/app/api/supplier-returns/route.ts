import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { getStoreId } from "@/lib/store-context";
import { Prisma } from "@/generated/prisma/client";

// GET /api/supplier-returns?from=&to=&status=DRAFT,POSTED&supplierId=&q=&page=&pageSize= — list, newest first
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
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const where: Prisma.SupplierReturnWhereInput = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(statuses && statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED")[] } } : {}),
    ...(supplierId ? { supplierId } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { items: { some: { OR: [{ name: { contains: q, mode: "insensitive" } }, { product: { barcode: { contains: q } } }] } } } : {}),
  };

  const [total, all] = await Promise.all([
    prisma.supplierReturn.count({ where }),
    prisma.supplierReturn.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { supplier: { select: { name: true } }, user: { select: { name: true } }, payments: { select: { amount: true } } },
    }),
  ]);

  const returns = all.map((r) => {
    const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
    return {
      id: r.id, documentNo: r.documentNo, status: r.status, createdAt: r.createdAt,
      supplierName: r.supplier?.name ?? null, userName: r.user.name, comment: r.comment,
      totalAmount: Number(r.totalAmount), paidAmount: paid, remainingAmount: Number(r.totalAmount) - paid,
    };
  });

  if (sp.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "vozvraty-postavshchikam",
      rows: [["Номер", "Дата", "Пользователь", "Поставщик", "Сумма", "Оплачено", "Осталось", "Комментарий"], ...returns.map((r) => [r.documentNo, new Date(r.createdAt), r.userName, r.supplierName ?? "", r.totalAmount, r.paidAmount, r.remainingAmount, r.comment ?? ""])],
    });
  }

  return NextResponse.json({ returns, total });
}

// POST /api/supplier-returns — create an empty draft
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

  const supplierReturn = await prisma.supplierReturn.create({
    data: { storeId, userId: session.user.id, supplierId },
  });
  return NextResponse.json({ supplierReturn }, { status: 201 });
}
