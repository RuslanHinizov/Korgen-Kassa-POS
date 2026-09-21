import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";

// GET /api/store-transfers?from=&to=&status=DRAFT,POSTED&userId=&q=&page=&pageSize= — flat list, newest first
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const statusParam = sp.get("status");
  const statuses = statusParam ? statusParam.split(",").filter((s) => s === "DRAFT" || s === "POSTED" || s === "CANCELLED") : undefined;
  const userId = sp.get("userId") || "";
  const q = sp.get("q")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 50)));

  const storeId = await getStoreId();
  const where: Prisma.StoreTransferWhereInput = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(statuses && statuses.length > 0 ? { status: { in: statuses as ("DRAFT" | "POSTED" | "CANCELLED")[] } } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { OR: [{ comment: { contains: q, mode: "insensitive" } }, { items: { some: { OR: [{ product: { name: { contains: q, mode: "insensitive" } } }, { product: { barcode: { contains: q } } }] } } }] } : {}),
  };

  const [total, all] = await Promise.all([
    prisma.storeTransfer.count({ where }),
    prisma.storeTransfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { user: { select: { name: true } }, toStore: { select: { name: true } }, _count: { select: { items: true } } },
    }),
  ]);

  const transfers = all.map((t) => ({
    id: t.id, documentNo: t.documentNo, status: t.status, comment: t.comment,
    createdAt: t.createdAt, postedAt: t.postedAt, totalAmount: Number(t.totalAmount),
    userName: t.user.name, toStoreName: t.toStore.name, itemCount: t._count.items,
  }));
  const totalAmount = transfers.reduce((s, t) => s + t.totalAmount, 0);

  if (sp.get("export") === "xlsx") {
    const statusLabel: Record<string, string> = { DRAFT: "Черновик", POSTED: "Проведён", CANCELLED: "Удалён" };
    return xlsxResponse({
      filename: "peremeshenie",
      rows: [["Номер", "Дата", "В магазин", "Пользователь", "Статус", "Сумма", "Комментарий"], ...transfers.map((t) => [t.documentNo, new Date(t.createdAt), t.toStoreName, t.userName, statusLabel[t.status] ?? t.status, t.totalAmount, t.comment ?? ""])],
    });
  }

  return NextResponse.json({ transfers, total, totalAmount });
}

const createSchema = z.object({ toStoreId: z.string().min(1), comment: z.string().max(1000).optional(), createdAt: z.coerce.date().optional() });

// POST /api/store-transfers — create an empty draft (Черновик)
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  if (parsed.data.toStoreId === storeId) {
    return NextResponse.json({ error: "Нельзя перемещать товар в тот же магазин" }, { status: 400 });
  }
  const toStore = await prisma.store.findUnique({ where: { id: parsed.data.toStoreId } });
  if (!toStore) return NextResponse.json({ error: "Магазин назначения не найден" }, { status: 404 });

  const transfer = await prisma.storeTransfer.create({
    data: { storeId, toStoreId: parsed.data.toStoreId, userId: session.user.id, comment: parsed.data.comment, createdAt: parsed.data.createdAt },
  });
  return NextResponse.json({ transfer }, { status: 201 });
}
