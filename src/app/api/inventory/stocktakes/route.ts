import { backdatingError } from "@/lib/backdating";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

const STATUSES = ["DRAFT", "COUNTING", "REVIEWING", "POSTED", "CANCELLED"] as const;
const LABEL: Record<string, string> = { DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён" };

// GET /api/inventory/stocktakes — Инвентаризация list, matching real UMAG's filter set
// (date range, статус, пользователь, комментарий, товар) + pagination.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const statusParam = sp.get("status");
  const statuses = statusParam ? statusParam.split(",").filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s)) : undefined;
  const from = sp.get("from");
  const to = sp.get("to");
  const userId = sp.get("userId");
  const comment = sp.get("comment");
  const q = sp.get("q");
  const storeId = await getStoreId();

  const where: Prisma.StocktakeWhereInput = {
    storeId,
    ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}),
    ...(from || to ? { countedAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(userId ? { userId } : {}),
    ...(comment ? { note: { contains: comment, mode: "insensitive" } } : {}),
    ...(q ? { items: { some: { product: { OR: [{ name: { contains: q, mode: "insensitive" } }, { barcode: { contains: q, mode: "insensitive" } }] } } } } : {}),
  };

  if (sp.get("export") === "xlsx") {
    const all = await prisma.stocktake.findMany({ where, include: { user: { select: { name: true } }, _count: { select: { items: true } } }, orderBy: { countedAt: "desc" } });
    return xlsxResponse({
      filename: "inventarizaciya",
      sheetName: "Инвентаризация",
      rows: [
        ["Номер", "Дата подсчёта", "Проведена", "Статус", "Пользователь", "Позиций", "Комментарий"],
        ...all.map((s) => [s.documentNo, s.countedAt, s.postedAt ?? "", LABEL[s.status] ?? s.status, s.user.name, s._count.items, s.note ?? ""]),
      ],
    });
  }

  const page = Math.max(1, Number(sp.get("page")) || 1);
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize")) || 50));

  const [stocktakes, total, users] = await Promise.all([
    prisma.stocktake.findMany({
      where,
      include: { user: { select: { name: true } }, _count: { select: { items: true } } },
      orderBy: { countedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.stocktake.count({ where }),
    prisma.stocktake.findMany({ where: { storeId }, distinct: ["userId"], select: { userId: true, user: { select: { name: true } } } }),
  ]);

  return NextResponse.json({
    stocktakes: stocktakes.map((s) => ({
      id: s.id, documentNo: s.documentNo, status: s.status, note: s.note, countedAt: s.countedAt, postedAt: s.postedAt,
      userName: s.user.name, itemCount: s._count.items,
    })),
    total,
    users: users.map((u) => ({ id: u.userId, name: u.user.name })),
  });
}

const createSchema = z.object({ note: z.string().max(1000).optional(), countedAt: z.coerce.date().optional() });

// POST /api/inventory/stocktakes — create an empty draft (Черновик)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const bd = await backdatingError(storeId, parsed.data.countedAt);
  if (bd) return NextResponse.json({ error: bd }, { status: 400 });

  const stocktake = await prisma.stocktake.create({
    data: { storeId, userId: session.user.id, note: parsed.data.note, countedAt: parsed.data.countedAt },
  });
  return NextResponse.json({ stocktake }, { status: 201 });
}
