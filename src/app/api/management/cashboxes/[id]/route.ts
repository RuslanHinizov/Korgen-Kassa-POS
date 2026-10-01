import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/management/cashboxes/:id — full detail for the edit modal (all 3 tabs)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const cashbox = await prisma.cashbox.findFirst({
      where: { id, storeId },
      include: { account: { select: { id: true, name: true, balance: true } }, extraAccount: { select: { id: true, name: true, balance: true } } },
    });
  if (!cashbox) return NextResponse.json({ error: "Касса не найдена" }, { status: 404 });

  return NextResponse.json({
    cashbox: {
      id: cashbox.id, no: cashbox.no, name: cashbox.name, active: cashbox.active, oneTimeKey: cashbox.oneTimeKey,
      accountId: cashbox.accountId, accountName: cashbox.account?.name ?? null, cashBalance: cashbox.account ? Number(cashbox.account.balance) : 0,
      extraAccountId: cashbox.extraAccountId, extraAccountName: cashbox.extraAccount?.name ?? null, extraBalance: cashbox.extraAccount ? Number(cashbox.extraAccount.balance) : 0,
      appVersion: cashbox.appVersion, platform: cashbox.platform, lastSyncAt: cashbox.lastSyncAt,
      receiptHeaderText: cashbox.receiptHeaderText, receiptFooterText: cashbox.receiptFooterText,
      receiptCyrillicCodepage: cashbox.receiptCyrillicCodepage, receiptPaperWidth: cashbox.receiptPaperWidth,
      receiptTabularView: cashbox.receiptTabularView, receiptPrintVat: cashbox.receiptPrintVat,
    },
  });
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  extraAccountId: z.string().nullable().optional(),
  receiptHeaderText: z.string().max(200).optional(),
  receiptFooterText: z.string().max(200).optional(),
  receiptCyrillicCodepage: z.number().int().optional(),
  receiptPaperWidth: z.number().int().optional(),
  receiptTabularView: z.boolean().optional(),
  receiptPrintVat: z.boolean().optional(),
});

// PATCH /api/management/cashboxes/:id — edit name / active / receipt settings / extra linked account
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  const existing = await prisma.cashbox.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Касса не найдена" }, { status: 404 });

  if (parsed.data.extraAccountId) {
    const extra = await prisma.financeAccount.findFirst({ where: { id: parsed.data.extraAccountId, storeId } });
    if (!extra) return NextResponse.json({ error: "Счёт не найден" }, { status: 404 });
    if (extra.type !== "NONCASH") return NextResponse.json({ error: "К кассе можно привязать только безналичные счета" }, { status: 400 });
  }

  const cashbox = await prisma.$transaction(async (tx) => {
    const updated = await tx.cashbox.update({ where: { id }, data: parsed.data });
    if (parsed.data.name && updated.accountId) {
      await tx.financeAccount.update({ where: { id: updated.accountId }, data: { name: parsed.data.name } });
    }
    return updated;
  });
  return NextResponse.json({ cashbox });
}

// DELETE /api/management/cashboxes/:id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.cashbox.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Касса не найдена" }, { status: 404 });
  await prisma.cashbox.delete({ where: { id } });

  // A kassa's own accounts would otherwise pile up on the dashboard and in Финансы. Only empty ones
  // that nothing else uses go; an account with money, history or another kassa on it stays.
  for (const accountId of [existing.accountId, existing.extraAccountId]) {
    if (!accountId) continue;
    const stillUsed = await prisma.cashbox.count({ where: { OR: [{ accountId }, { extraAccountId: accountId }] } });
    if (stillUsed > 0) continue;
    const account = await prisma.financeAccount.findUnique({ where: { id: accountId }, select: { balance: true } });
    if (!account || Number(account.balance) !== 0) continue;
    await prisma.financeAccount.delete({ where: { id: accountId } }).catch(() => {});
  }
  return NextResponse.json({ ok: true });
}
