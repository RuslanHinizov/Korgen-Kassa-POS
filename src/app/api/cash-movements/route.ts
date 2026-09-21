import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { serialize } from "@/lib/serialize";
import { getOpenShift } from "@/lib/shift";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";
import { resolvePosActor } from "@/lib/pos-actor";

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
  type: z.enum(["IN", "OUT", "PAYOUT", "DROP"]),
  amount: z.number().positive(),
  reason: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { posCashInOut: true } });
  if (settings && !settings.posCashInOut) {
    return NextResponse.json({ error: "Внос и вынос средств отключен в настройках кассы" }, { status: 403 });
  }

  const shift = await getOpenShift(actor.userId, storeId);
  if (!shift) return NextResponse.json({ error: "No open shift" }, { status: 409 });

  const movement = await prisma.cashMovement.create({
    data: {
      shiftId: shift.id,
      userId: actor.userId,
      type: parsed.data.type,
      amount: parsed.data.amount,
      reason: parsed.data.reason,
    },
  });

  await logAudit({
    userId: actor.userId,
    action: parsed.data.type === "IN" ? "CASH_IN" : "CASH_OUT",
    entityType: "CashMovement",
    entityId: movement.id,
    details: { type: parsed.data.type, amount: parsed.data.amount, reason: parsed.data.reason },
  });

  return NextResponse.json({ movement: serialize(movement) }, { status: 201 });
}
