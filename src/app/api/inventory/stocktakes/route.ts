import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxResponse } from "@/lib/xlsx-response";
import { z } from "zod";

const STATUSES = ["DRAFT", "COUNTING", "REVIEWING", "POSTED", "CANCELLED"] as const;

// GET /api/inventory/stocktakes?status=DRAFT,COUNTING — list, newest first
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const statusParam = req.nextUrl.searchParams.get("status");
  const statuses = statusParam ? statusParam.split(",").filter((s): s is (typeof STATUSES)[number] => (STATUSES as readonly string[]).includes(s)) : undefined;
  const storeId = await getStoreId();

  const stocktakes = await prisma.stocktake.findMany({
    where: { storeId, ...(statuses && statuses.length > 0 ? { status: { in: statuses } } : {}) },
    include: { user: { select: { name: true } }, _count: { select: { items: true } } },
    orderBy: { countedAt: "desc" },
    ...(req.nextUrl.searchParams.get("export") === "xlsx" ? {} : { take: 200 }),
  });

  if (req.nextUrl.searchParams.get("export") === "xlsx") {
    const label: Record<string, string> = { DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён" };
    return xlsxResponse({
      filename: "inventarizaciya",
      sheetName: "Инвентаризация",
      rows: [
        ["Номер", "Дата подсчёта", "Проведена", "Статус", "Пользователь", "Позиций", "Комментарий"],
        ...stocktakes.map((s) => [s.documentNo, s.countedAt, s.postedAt ?? "", label[s.status] ?? s.status, s.user.name, s._count.items, s.note ?? ""]),
      ],
    });
  }

  return NextResponse.json({
    stocktakes: stocktakes.map((s) => ({
      id: s.id, documentNo: s.documentNo, status: s.status, note: s.note, countedAt: s.countedAt, postedAt: s.postedAt,
      userName: s.user.name, itemCount: s._count.items,
    })),
  });
}

const createSchema = z.object({ note: z.string().max(1000).optional(), countedAt: z.coerce.date().optional() });

// POST /api/inventory/stocktakes — create an empty draft (Черновик)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const stocktake = await prisma.stocktake.create({
    data: { storeId, userId: session.user.id, note: parsed.data.note, countedAt: parsed.data.countedAt },
  });
  return NextResponse.json({ stocktake }, { status: 201 });
}
