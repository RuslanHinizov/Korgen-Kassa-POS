import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/management/cashboxes — Управление → Управление кассами
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const cashboxes = await prisma.cashbox.findMany({
      where: { storeId },
      orderBy: { no: "asc" },
      include: {
        account: { select: { name: true, balance: true } },
        extraAccount: { select: { name: true, balance: true } },
      },
    });
  return NextResponse.json({
    cashboxes: cashboxes.map((c) => ({
      id: c.id, no: c.no, name: c.name, active: c.active, appVersion: c.appVersion, platform: c.platform, pairedAt: c.pairedAt, lastSyncAt: c.lastSyncAt,
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

  const cashbox = await prisma.$transaction(async (tx) => {
    const account = await tx.financeAccount.create({ data: { storeId, name: parsed.data.name, type: "CASH" } });
    const extraAccount = await tx.financeAccount.findFirst({ where: { storeId, type: "NONCASH" }, orderBy: { createdAt: "asc" } })
      ?? await tx.financeAccount.create({ data: { storeId, name: "Банковский счет", type: "NONCASH" } });
    return tx.cashbox.create({ data: { storeId, name: parsed.data.name, accountId: account.id, extraAccountId: extraAccount.id } });
  });
  return NextResponse.json({ cashbox }, { status: 201 });
}
