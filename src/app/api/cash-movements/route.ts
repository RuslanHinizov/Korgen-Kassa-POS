import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";
import { serialize } from "@/lib/serialize";
import { getOpenShift } from "@/lib/shift";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { resolvePosActor } from "@/lib/pos-actor";
import { CLIENT_ID, attributedUserId, trustedTime } from "@/lib/offline-write";
import { resolvePosRequest, isPosRequestError } from "@/lib/pos-request";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const shiftId = req.nextUrl.searchParams.get("shiftId");
  if (!shiftId) return NextResponse.json({ error: "shiftId required" }, { status: 400 });

  const storeId = await getStoreId();
  const shift = await prisma.shift.findFirst({ where: { id: shiftId, storeId } });
  if (!shift) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const movements = await prisma.cashMovement.findMany({
    where: { shiftId },
    orderBy: { createdAt: "desc" },
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json({ movements: serialize(movements) });
}

const createSchema = z.object({
  type: z.enum(["DEPOSIT", "EXPENSE", "DIVIDEND"]),
  amount: z.number().positive(),
  reason: z.string().max(200).optional(),
  /** For an EXPENSE: the purpose by name (Другое, Закуп мелочей, Заработная плата, Коммунальные расходы, Инкассация). Defaults to Другое. */
  expenseType: z.string().max(60).optional(),
  /** Offline till: id made on the till (becomes the row's id), the shift it belongs to, when, and who. */
  id: z.string().regex(CLIENT_ID).optional(),
  shiftId: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  cashierUserId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const ctx = await resolvePosRequest(req);
  if (isPosRequestError(ctx)) return ctx.error;
  const { storeId, actor } = ctx;

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posCashInOut: true } });
  if (settings && !settings.posCashInOut) {
    return NextResponse.json({ error: "Внос и вынос средств отключен в настройках кассы" }, { status: 403 });
  }

  // The same upload twice returns the movement it already created.
  if (parsed.data.id) {
    const already = await prisma.cashMovement.findFirst({ where: { id: parsed.data.id, shift: { storeId } } });
    if (already) return NextResponse.json({ movement: serialize(already), duplicate: true }, { status: 200 });
  }

  const movementUserId = await attributedUserId(actor, storeId, parsed.data.cashierUserId);
  if (!movementUserId) return NextResponse.json({ error: "cashierUserId required" }, { status: 400 });
  // an offline till names the shift itself (the server may not have seen it open yet)
  const shift =
    (parsed.data.shiftId ? await prisma.shift.findFirst({ where: { id: parsed.data.shiftId, storeId } }) : null) ??
    (await getOpenShift(movementUserId, storeId));
  if (!shift) return NextResponse.json({ error: "Нет открытой смены" }, { status: 409 });

  const timeAdjusted = !!parsed.data.createdAt && !trustedTime(parsed.data.createdAt);

  // Like UMAG's till, a cash in/out is a finance entry on the register's cash account: Вложения = Приход, Расходы and
  // Дивиденды = Расход (with its purpose). It shows up in Платежи, the account's history, the cash-flow report and the balance.
  const pairedId = ctx.cashboxId ?? getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const cashbox = pairedId ? await prisma.cashbox.findFirst({ where: { id: pairedId, storeId }, select: { accountId: true } }) : null;
  const accountId = cashbox?.accountId ?? null;
  let expenseTypeId: string | null = null;
  if (accountId && parsed.data.type !== "DEPOSIT") {
    const wanted = parsed.data.type === "DIVIDEND" ? { name: "Дивиденды" } : { name: parsed.data.expenseType?.trim() || "Другое" };
    expenseTypeId =
      (await prisma.expenseType.findFirst({ where: { storeId, ...wanted }, select: { id: true } }))?.id ??
      (await prisma.expenseType.findFirst({ where: { storeId, name: "Другое" }, select: { id: true } }))?.id ??
      null;
  }
  const at = trustedTime(parsed.data.createdAt);
  const movement = await prisma.$transaction(async (tx) => {
    const created = await tx.cashMovement.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        shiftId: shift.id,
        userId: movementUserId,
        type: parsed.data.type,
        amount: parsed.data.amount,
        reason: parsed.data.reason,
        accountId,
        createdAt: at,
      },
    });
    if (accountId) {
      const isIn = parsed.data.type === "DEPOSIT";
      await tx.payment.create({
        data: {
          storeId,
          direction: isIn ? "IN" : "OUT",
          amount: parsed.data.amount,
          expenseTypeId,
          accountId,
          userId: movementUserId,
          comment: parsed.data.reason ?? null,
          createdAt: at,
        },
      });
      await tx.financeAccount.update({ where: { id: accountId }, data: { balance: isIn ? { increment: parsed.data.amount } : { decrement: parsed.data.amount } } });
    }
    return created;
  });

  await logAudit({
    userId: movementUserId,
    action: parsed.data.type === "DEPOSIT" ? "CASH_IN" : "CASH_OUT",
    entityType: "CashMovement",
    entityId: movement.id,
    details: { type: parsed.data.type, amount: parsed.data.amount, reason: parsed.data.reason },
  });

  return NextResponse.json({ movement: serialize(movement), timeAdjusted }, { status: 201 });
}
