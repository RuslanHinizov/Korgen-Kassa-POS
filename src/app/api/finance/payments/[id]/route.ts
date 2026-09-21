import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/finance/payments/:id — Редактирование платежей (manual Приход/Расход only)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const payment = await prisma.payment.findFirst({ where: { id, storeId } });
  if (!payment) return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });

  return NextResponse.json({
    payment: {
      id: payment.id, documentNo: payment.documentNo, direction: payment.direction, amount: Number(payment.amount),
      accountId: payment.accountId, expenseTypeId: payment.expenseTypeId, comment: payment.comment, createdAt: payment.createdAt,
    },
  });
}

const patchSchema = z.object({
  amount: z.number().positive().optional(),
  accountId: z.string().min(1).optional(),
  expenseTypeId: z.string().nullable().optional(),
  comment: z.string().max(500).nullable().optional(),
});

// PATCH /api/finance/payments/:id — edit a manual payment; reverses its old balance
// effect and reapplies the new one, since ledger rows are otherwise never deleted.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const existing = await prisma.payment.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Платёж не найден" }, { status: 404 });

  const newAmount = parsed.data.amount ?? Number(existing.amount);
  const newAccountId = parsed.data.accountId ?? existing.accountId;
  const sign = existing.direction === "IN" ? 1 : -1;

  if (sign < 0) {
    const newAccount = await prisma.financeAccount.findFirst({ where: { id: newAccountId, storeId } });
    if (!newAccount) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
    // the old effect on this same account (if unchanged) is reverted before the new one lands, so
    // account for that when it's the same account as before
    const balanceBeforeNewEffect = newAccountId === existing.accountId
      ? Number(newAccount.balance) - sign * Number(existing.amount)
      : Number(newAccount.balance);
    if (!newAccount.allowNegativeBalance && balanceBeforeNewEffect + sign * newAmount < 0) {
      return NextResponse.json({ error: "Недостаточно средств на счёте" }, { status: 400 });
    }
  }

  const payment = await prisma.$transaction(async (tx) => {
    // revert the old effect on the old account
    await tx.financeAccount.update({ where: { id: existing.accountId }, data: { balance: { decrement: sign * Number(existing.amount) } } });
    // apply the new effect on the (possibly different) account
    await tx.financeAccount.update({ where: { id: newAccountId }, data: { balance: { increment: sign * newAmount } } });
    return tx.payment.update({
      where: { id },
      data: {
        amount: newAmount, accountId: newAccountId,
        expenseTypeId: parsed.data.expenseTypeId, comment: parsed.data.comment,
      },
    });
  });

  return NextResponse.json({ payment });
}
