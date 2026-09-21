import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { resolvePosActor } from "@/lib/pos-actor";
import { z } from "zod";
import { canUsePosAction } from "@/lib/pos-permissions";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";

const schema = z.object({
  productId: z.string().nullable().optional(),
  productName: z.string().min(1),
  beforeQty: z.number(),
  afterQty: z.number().nullable().optional(),
  reason: z.string().optional(),
  action: z.enum(["DELETE", "DECREASE"]).default("DELETE"),
});

// POST /api/pos/cancelled-items — fired from the POS cart whenever a cashier
// reduces or removes a line before checkout (honesty/shrink audit trail).
export async function POST(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { productId, productName, beforeQty, afterQty, reason, action } = parsed.data;
  const storeId = await getStoreId();
  const permissions = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { posAccessDeleteItem: true, posAccessDecreaseQty: true },
  });
  const access = action === "DELETE" ? permissions?.posAccessDeleteItem : permissions?.posAccessDecreaseQty;
  if (!canUsePosAction(access, actor.role)) {
    return NextResponse.json({ error: "Действие запрещено настройками кассы" }, { status: 403 });
  }
  if (productId) {
    const product = await prisma.product.findFirst({ where: { id: productId, storeId } });
    if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });
  }

  const pairedCashboxId = getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const cashboxId = pairedCashboxId
    ? (await prisma.cashbox.findFirst({ where: { id: pairedCashboxId, storeId }, select: { id: true } }))?.id
    : undefined;

  await prisma.cancelledItem.create({
    data: {
      storeId,
      productId: productId || null,
      productName,
      userId: actor.userId,
      cashboxId,
      beforeQty,
      afterQty: afterQty ?? null,
      reason: reason || null,
    },
  });

  return NextResponse.json({ ok: true }, { status: 201 });
}
