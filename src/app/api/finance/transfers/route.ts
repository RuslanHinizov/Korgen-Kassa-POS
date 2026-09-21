import { xlsxResponse } from "@/lib/xlsx-response";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";

// GET /api/finance/transfers?from=&to=&fromAccountId=&toAccountId=&userId=&q=&page=&pageSize=&export=csv
// — Финансы → Переводы: money moved between the store's own accounts.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");
  const fromAccountId = sp.get("fromAccountId") || "";
  const toAccountId = sp.get("toAccountId") || "";
  const userId = sp.get("userId") || "";
  const q = sp.get("q")?.trim() || "";
  const page = Math.max(1, Number(sp.get("page") ?? 1));
  const pageSize = Math.min(500, Math.max(1, Number(sp.get("pageSize") ?? 25)));

  const storeId = await getStoreId();
  const where: Prisma.TransferWhereInput = {
    storeId,
    ...(from || to ? { createdAt: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } } : {}),
    ...(fromAccountId ? { fromAccountId } : {}),
    ...(toAccountId ? { toAccountId } : {}),
    ...(userId ? { userId } : {}),
    ...(q ? { comment: { contains: q, mode: "insensitive" } } : {}),
  };

  const [total, all] = await Promise.all([
    prisma.transfer.count({ where }),
    prisma.transfer.findMany({
      where,
      orderBy: { createdAt: "desc" },
      ...(sp.get("export") ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      include: { fromAccount: { select: { name: true } }, toAccount: { select: { name: true } }, user: { select: { name: true } } },
    }),
  ]);

  const transfers = all.map((t) => ({
    id: t.id, documentNo: t.documentNo, createdAt: t.createdAt, amount: Number(t.amount),
    fromAccountName: t.fromAccount.name, toAccountName: t.toAccount.name, userName: t.user.name, comment: t.comment ?? "",
  }));
  const totalAmount = transfers.reduce((s, t) => s + t.amount, 0);

  if (sp.get("export") === "xlsx") {
    return xlsxResponse({
      filename: "transfers",
      rows: [["Номер", "Дата", "Со счёта", "На счёт", "Сумма", "Пользователь", "Комментарий"], ...transfers.map((t) => [t.documentNo, new Date(t.createdAt), t.fromAccountName, t.toAccountName, t.amount, t.userName, t.comment])],
    });
  }

  return NextResponse.json({ transfers, total, totalAmount });
}

const createSchema = z.object({
  fromAccountId: z.string().min(1),
  toAccountId: z.string().min(1),
  amount: z.number().positive(),
  comment: z.string().max(500).optional(),
}).refine((d) => d.fromAccountId !== d.toAccountId, { message: "Счета должны отличаться", path: ["toAccountId"] });

// POST /api/finance/transfers — Создание перевода
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { fromAccountId, toAccountId, amount, comment } = parsed.data;
  const storeId = await getStoreId();

  const fromAccount = await prisma.financeAccount.findFirst({ where: { id: fromAccountId, storeId } });
  if (!fromAccount) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  const toAccount = await prisma.financeAccount.findFirst({ where: { id: toAccountId, storeId } });
  if (!toAccount) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  if (!fromAccount.allowNegativeBalance && Number(fromAccount.balance) - amount < 0) {
    return NextResponse.json({ error: "Недостаточно средств на счёте" }, { status: 400 });
  }

  const transfer = await prisma.$transaction(async (tx) => {
    const created = await tx.transfer.create({ data: { storeId, fromAccountId, toAccountId, amount, comment, userId: session.user.id } });
    await tx.financeAccount.update({ where: { id: fromAccountId }, data: { balance: { decrement: amount } } });
    await tx.financeAccount.update({ where: { id: toAccountId }, data: { balance: { increment: amount } } });
    return created;
  });

  return NextResponse.json({ transfer }, { status: 201 });
}
