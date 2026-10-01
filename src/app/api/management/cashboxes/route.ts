import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";
import { createCashboxSetupCode } from "@/lib/cashbox-device";

// GET /api/management/cashboxes — Управление → Управление кассами
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const rows = await prisma.cashbox.findMany({
      where: { storeId },
      orderBy: { no: "asc" },
      include: {
        account: { select: { name: true, balance: true } },
        extraAccount: { select: { name: true, balance: true } },
      },
    });
  const cashboxes = await Promise.all(rows.map(async (row) => {
    if (row.oneTimeKey || row.pairedAt || !row.active) return row;
    const oldDevice = await prisma.hubToken.findFirst({ where: { cashboxId: row.id, revokedAt: null }, select: { createdAt: true } });
    if (oldDevice) {
      const pairedAt = oldDevice.createdAt;
      await prisma.cashbox.updateMany({ where: { id: row.id, pairedAt: null, oneTimeKey: null }, data: { pairedAt } });
      return { ...row, pairedAt };
    }
    for (let attempt = 0; attempt < 5; attempt++) {
      const oneTimeKey = createCashboxSetupCode();
      try {
        const claimed = await prisma.cashbox.updateMany({ where: { id: row.id, pairedAt: null, oneTimeKey: null }, data: { oneTimeKey } });
        if (claimed.count === 1) return { ...row, oneTimeKey };
        return (await prisma.cashbox.findUnique({
          where: { id: row.id },
          include: {
            account: { select: { name: true, balance: true } },
            extraAccount: { select: { name: true, balance: true } },
          },
        })) ?? row;
      } catch (error) {
        if ((error as { code?: string }).code !== "P2002" || attempt === 4) throw error;
      }
    }
    return row;
  }));
  return NextResponse.json({
    cashboxes: cashboxes.map((c) => ({
      id: c.id, no: c.no, name: c.name, active: c.active, oneTimeKey: c.oneTimeKey, appVersion: c.appVersion, platform: c.platform, pairedAt: c.pairedAt, lastSyncAt: c.lastSyncAt,
      accountId: c.accountId, accountName: c.account?.name ?? null, balance: c.account ? Number(c.account.balance) : null,
      extraAccountId: c.extraAccountId, extraAccountName: c.extraAccount?.name ?? null, extraBalance: c.extraAccount ? Number(c.extraAccount.balance) : null,
      linkedAccountsCount: (c.accountId ? 1 : 0) + (c.extraAccountId ? 1 : 0),
    })),
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

// POST /api/management/cashboxes — Создать кассу; auto-creates the cashbox's own cash account
// the same way real UMAG does (each register carries its own cash balance), and links it to
// the store's shared non-cash account (matches real UMAG: one "Банковский счет" per store,
// not one per register) so card/other payments always have somewhere to land.
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  let cashbox;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      cashbox = await prisma.$transaction(async (tx) => {
        const account = await tx.financeAccount.create({ data: { storeId, name: parsed.data.name, type: "CASH" } });
        const extraAccount = await tx.financeAccount.findFirst({ where: { storeId, type: "NONCASH" }, orderBy: { createdAt: "asc" } })
          ?? await tx.financeAccount.create({ data: { storeId, name: "Банковский счет", type: "NONCASH" } });
        return tx.cashbox.create({ data: { storeId, name: parsed.data.name, accountId: account.id, extraAccountId: extraAccount.id, oneTimeKey: createCashboxSetupCode() } });
      });
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2002" || attempt === 4) throw error;
    }
  }
  if (!cashbox) return NextResponse.json({ error: "Не удалось создать уникальный код подключения" }, { status: 500 });
  return NextResponse.json({ cashbox }, { status: 201 });
}
