import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";
import { resolveReferenceValues } from "@/lib/reference-values";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { resolvePosActor } from "@/lib/pos-actor";
import { canUsePosAction } from "@/lib/pos-permissions";
import { applyInventoryMovement } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { logAudit } from "@/lib/audit";

const schema = z.object({
  reason: z.string().trim().max(500).optional(),
  referenceValues: z.array(z.object({ bookId: z.string(), entryId: z.string() })).optional(),
  items: z.array(z.object({ productId: z.string(), quantity: z.number().positive().max(1_000_000) })).min(1),
});

/** Cash-register return without a receipt. Prices and product data are always taken
 * from the current store catalog; the browser never supplies an amount. */
export async function POST(req: NextRequest) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const references = await resolveReferenceValues(storeId, "RETURN", parsed.data.referenceValues);
  if (!references.ok) return NextResponse.json({ error: references.error }, { status: 400 });
  const settings = await prisma.businessSettings.findUnique({
    where: { storeId }, select: { posAccessReturnNoReceipt: true },
  });
  if (!canUsePosAction(settings?.posAccessReturnNoReceipt, actor.role)) {
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
  const pairedId = getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const cashbox = pairedId ? await prisma.cashbox.findFirst({ where: { id: pairedId, storeId }, select: { accountId: true } }) : null;

  const customerReturn = await prisma.$transaction(async (tx) => {
    const created = await tx.customerReturn.create({
      data: {
        storeId, userId: actor.userId, status: "POSTED", postedAt: new Date(),
        referenceValues: references.values.length ? references.values : undefined,
        comment: parsed.data.reason || "Возврат без чека", totalAmount,
        items: { create: products.map((product) => ({
          productId: product.id, name: product.name, unit: product.unit,
          quantity: quantities.get(product.id) ?? 0, price: product.price,
          total: Number(product.price) * (quantities.get(product.id) ?? 0),
        })) },
      },
    });
    await tx.customerReturnPayment.create({ data: { returnId: created.id, amount: totalAmount, method: "CASH", userId: actor.userId, note: "Возврат без чека" } });
    if (cashbox?.accountId && totalAmount > 0) {
      await tx.financeAccount.update({ where: { id: cashbox.accountId }, data: { balance: { decrement: totalAmount } } });
    }
    for (const product of products) {
      const quantity = quantities.get(product.id) ?? 0;
      const lines = await resolveStockLines(tx, product.id, quantity);
      for (const line of lines) {
        await applyInventoryMovement(tx, {
          productId: line.productId, userId: actor.userId, type: "SALE_RETURN", quantity: line.quantity,
          referenceType: "CustomerReturn", referenceId: created.id, documentNo: String(created.documentNo),
          note: parsed.data.reason || "Возврат без чека",
        });
      }
    }
    return created;
  });

  await logAudit({ userId: actor.userId, action: "CUSTOMER_RETURN_POST", entityType: "CustomerReturn", entityId: customerReturn.id, details: { documentNo: customerReturn.documentNo, withoutReceipt: true, totalAmount } });
  return NextResponse.json({ customerReturn }, { status: 201 });
}
