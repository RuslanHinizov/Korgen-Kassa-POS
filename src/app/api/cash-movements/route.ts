import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
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
  if (!shift) return NextResponse.json({ error: "No open shift" }, { status: 409 });

  const timeAdjusted = !!parsed.data.createdAt && !trustedTime(parsed.data.createdAt);

  const movement = await prisma.cashMovement.create({
    data: {
      ...(parsed.data.id ? { id: parsed.data.id } : {}),
      shiftId: shift.id,
      userId: movementUserId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
      createdAt: trustedTime(parsed.data.createdAt),
    },
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
