import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/finance/transfers/:id — Редактирование перевода
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const transfer = await prisma.transfer.findFirst({ where: { id, storeId } });
  if (!transfer) return NextResponse.json({ error: "Перевод не найден" }, { status: 404 });

  return NextResponse.json({
    transfer: {
      id: transfer.id, documentNo: transfer.documentNo, fromAccountId: transfer.fromAccountId, toAccountId: transfer.toAccountId,
      amount: Number(transfer.amount), comment: transfer.comment, createdAt: transfer.createdAt,
    },
  });
}

const patchSchema = z.object({
  fromAccountId: z.string().min(1).optional(),
  toAccountId: z.string().min(1).optional(),
  amount: z.number().positive().optional(),
  comment: z.string().max(500).nullable().optional(),
});

// PATCH /api/finance/transfers/:id — edit a transfer; reverses its old balance effect
// on both accounts and reapplies the new one (transfers are never deleted, only corrected).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const existing = await prisma.transfer.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Перевод не найден" }, { status: 404 });

  const newFromId = parsed.data.fromAccountId ?? existing.fromAccountId;
  const newToId = parsed.data.toAccountId ?? existing.toAccountId;
  if (newFromId === newToId) return NextResponse.json({ error: "Счета должны отличаться" }, { status: 400 });
  const newAmount = parsed.data.amount ?? Number(existing.amount);

  // Compute each affected account's balance right after undoing the old transfer
  // (an account may appear on both sides of the old and new transfer, so read fresh).
  const affectedIds = Array.from(new Set([existing.fromAccountId, existing.toAccountId, newFromId, newToId]));
  const accounts = await prisma.financeAccount.findMany({ where: { id: { in: affectedIds }, storeId } });
  const balanceAfterUndo = new Map(accounts.map((a) => [a.id, Number(a.balance)]));
  balanceAfterUndo.set(existing.fromAccountId, (balanceAfterUndo.get(existing.fromAccountId) ?? 0) + Number(existing.amount));
  balanceAfterUndo.set(existing.toAccountId, (balanceAfterUndo.get(existing.toAccountId) ?? 0) - Number(existing.amount));

  const fromAccount = accounts.find((a) => a.id === newFromId);
  if (!fromAccount) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  if (!accounts.find((a) => a.id === newToId)) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
  const fromBalanceAfterNew = (balanceAfterUndo.get(newFromId) ?? 0) - newAmount;
  if (!fromAccount.allowNegativeBalance && fromBalanceAfterNew < 0) {
    return NextResponse.json({ error: "Недостаточно средств на счёте" }, { status: 400 });
  }

  const transfer = await prisma.$transaction(async (tx) => {
    await tx.financeAccount.update({ where: { id: existing.fromAccountId }, data: { balance: { increment: Number(existing.amount) } } });
    await tx.financeAccount.update({ where: { id: existing.toAccountId }, data: { balance: { decrement: Number(existing.amount) } } });
    await tx.financeAccount.update({ where: { id: newFromId }, data: { balance: { decrement: newAmount } } });
    await tx.financeAccount.update({ where: { id: newToId }, data: { balance: { increment: newAmount } } });
    return tx.transfer.update({
      where: { id },
      data: { fromAccountId: newFromId, toAccountId: newToId, amount: newAmount, comment: parsed.data.comment },
    });
  });

  return NextResponse.json({ transfer });
}
