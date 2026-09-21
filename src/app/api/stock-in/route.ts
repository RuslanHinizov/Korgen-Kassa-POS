import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getStockInActor, stockInOwnerFilter } from "@/lib/stock-in-access";
import type { Prisma } from "@/generated/prisma/client";

// GET /api/stock-in?from=&to=&status=DRAFT,POSTED,DELETED&userId=&q=&page=&pageSize= — flat list, newest first
export async function GET(req: NextRequest) {
  const actor = await getStockInActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const statusParam = sp.get("status");
  const statuses = statusParam
    ? statusParam.split(",").filter((s): s is "DRAFT" | "POSTED" | "DELETED" => s === "DRAFT" || s === "POSTED" || s === "DELETED")
    : (["DRAFT", "POSTED"] as const);
  const userId = sp.get("userId") || "";
  const q = sp.get("q")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const where: Prisma.StockInWhereInput = {
    storeId: actor.storeId,
    ...stockInOwnerFilter(actor),
    ...(from || to ? { stockInDate: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED" | "DELETED")[] } } : {}),
    ...(userId ? { userId } : {}),
    ...(q
      ? { items: { some: { OR: [{ product: { name: { contains: q, mode: "insensitive" } } }, { product: { barcode: { contains: q } } }] } } }
      : {}),
  };

  const [total, all] = await Promise.all([
    prisma.stockIn.count({ where }),
    prisma.stockIn.findMany({
      where,
      orderBy: { stockInDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true } }, _count: { select: { items: true } } },
    }),
  ]);

  const stockIns = all.map((s) => ({
    id: s.id, documentNo: s.documentNo, status: s.status, stockInDate: s.stockInDate,
    note: s.note, totalCost: Number(s.totalCost), userName: s.user.name, itemCount: s._count.items,
  }));
  const totalCost = stockIns.reduce((sum, s) => sum + s.totalCost, 0);

  if (sp.get("export") === "xlsx") {
    const STATUS_LABEL: Record<string, string> = { DRAFT: "Черновик", POSTED: "Проведён", DELETED: "Удалён" };
    return xlsxResponse({
      filename: "oprihodovanie",
      rows: [["Номер", "Дата", "Статус", "Пользователь", "Комментарий", "Общая сумма"], ...stockIns.map((s) => [s.documentNo, new Date(s.stockInDate), STATUS_LABEL[s.status] ?? s.status, s.userName, s.note ?? "", s.totalCost])],
    });
  }

  return NextResponse.json({ stockIns, total, totalCost });
}

// POST /api/stock-in — create an empty draft
export async function POST(req: NextRequest) {
  const actor = await getStockInActor();
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const stockInDate = body?.stockInDate ? new Date(body.stockInDate) : new Date();
  const stockIn = await prisma.stockIn.create({
    data: { storeId: actor.storeId, userId: actor.userId, stockInDate },
  });
  return NextResponse.json({ stockIn }, { status: 201 });
}
