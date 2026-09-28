import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";
import { resolveReferenceValues } from "@/lib/reference-values";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canUsePosAction } from "@/lib/pos-permissions";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { logAudit } from "@/lib/audit";
import { CLIENT_ID, attributedUserId, trustedTime } from "@/lib/offline-write";
import { resolvePosRequest, isPosRequestError } from "@/lib/pos-request";

const schema = z.object({
  reason: z.string().trim().max(500).optional(),
  referenceValues: z.array(z.object({ bookId: z.string(), entryId: z.string() })).optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive().max(1_000_000) })).min(1),
  /** Offline till: id made on the till (becomes the return id), time, who. */
  id: z.string().regex(CLIENT_ID).optional(),
  returnedAt: z.string().datetime().optional(),
  cashierUserId: z.string().optional(),
  /** Which physical register, when a local Hub uploads this — see /api/sales. */
  cashboxId: z.string().optional(),
});

/** Cash-register return without a receipt. Prices and product data are always taken
 * from the current store catalog; the browser never supplies an amount. */
export async function POST(req: NextRequest) {
  const ctx = await resolvePosRequest(req);
  if (isPosRequestError(ctx)) return ctx.error;
  const { storeId, actor, viaHub } = ctx;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // The same upload twice returns the return it already created.
  if (parsed.data.id) {
    const already = await prisma.customerReturn.findFirst({ where: { id: parsed.data.id, storeId } });
    if (already) return NextResponse.json({ customerReturn: already, duplicate: true }, { status: 200 });
  }
  const returnUserId = await attributedUserId(actor, storeId, parsed.data.cashierUserId);
  if (!returnUserId) return NextResponse.json({ error: "cashierUserId required" }, { status: 400 });
  const returnedAt = trustedTime(parsed.data.returnedAt);
  const timeAdjusted = !!parsed.data.returnedAt && !returnedAt;

  const references = await resolveReferenceValues(storeId, "RETURN", parsed.data.referenceValues);
  if (!references.ok) return NextResponse.json({ error: references.error }, { status: 400 });
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId }, select: { posAccessReturnNoReceipt: true },
  });
  // A Hub upload already passed this same check on the till — see the identical note in sales/[id]/refund.
  if (!viaHub && !canUsePosAction(settings?.posAccessReturnNoReceipt, actor.role)) {
    return NextResponse.json({ error: "Возврат без чека запрещён настройками кассы" }, { status: 403 });
  }

  const quantities = new Map<string, number>();
  for (const item of parsed.data.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  const products = await prisma.product.findMany({
    where: { storeId, id: { in: [...quantities.keys()] }, active: true, deletedAt: null },
    select: { id: true, name: true, price: true, unit: true },
  });
  if (products.length !== quantities.size) return NextResponse.json({ error: "Один или несколько товаров не найдены" }, { status: 404 });
  if (products.some((product) => product.unit === "pcs" && !Number.isInteger(quantities.get(product.id) ?? 0))) {
    return NextResponse.json({ error: "Количество штучного товара должно быть целым" }, { status: 400 });
  }
  const totalAmount = products.reduce((sum, product) => sum + Number(product.price) * (quantities.get(product.id) ?? 0), 0);

  // Cash leaves the register the return was rung up on, when the terminal is paired.
  const pairedId = parsed.data.cashboxId ?? getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const cashbox = pairedId ? await prisma.cashbox.findFirst({ where: { id: pairedId, storeId }, select: { accountId: true } }) : null;

  const customerReturn = await prisma.$transaction(async (tx) => {
    const created = await tx.customerReturn.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        storeId, userId: returnUserId, status: "POSTED", postedAt: returnedAt ?? new Date(),
        ...(returnedAt ? { createdAt: returnedAt } : {}),
        referenceValues: references.values.length ? references.values : undefined,
        comment: parsed.data.reason || "Возврат без чека", totalAmount,
        items: { create: products.map((product) => ({
          productId: product.id, name: product.name, unit: product.unit,
          quantity: quantities.get(product.id) ?? 0, price: product.price,
          total: Number(product.price) * (quantities.get(product.id) ?? 0),
        })) },
      },
    });
    await tx.customerReturnPayment.create({ data: { returnId: created.id, amount: totalAmount, method: "CASH", userId: returnUserId, note: "Возврат без чека" } });
    if (cashbox?.accountId && totalAmount > 0) {
      await tx.financeAccount.update({ where: { id: cashbox.accountId }, data: { balance: { decrement: totalAmount } } });
    }
    for (const product of products) {
      const quantity = quantities.get(product.id) ?? 0;
      const lines = await resolveStockLines(tx, product.id, quantity);
      for (const line of lines) {
        await applyInventoryMovement(tx, {
          productId: line.productId, userId: returnUserId, type: "SALE_RETURN", quantity: line.quantity,
          referenceType: "CustomerReturn", referenceId: created.id, documentNo: String(created.documentNo),
          note: parsed.data.reason || "Возврат без чека",
        });
      }
    }
    return created;
  });

  await logAudit({ userId: returnUserId, action: "CUSTOMER_RETURN_POST", entityType: "CustomerReturn", entityId: customerReturn.id, details: { documentNo: customerReturn.documentNo, withoutReceipt: true, totalAmount } });
  return NextResponse.json({ customerReturn, timeAdjusted }, { status: 201 });
}
