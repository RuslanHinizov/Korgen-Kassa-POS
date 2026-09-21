import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { resolveReferenceValues } from "@/lib/reference-values";
import { z } from "zod";
import { verifyManagerToken, MANAGER_COOKIE } from "@/lib/manager-token";
import { logAudit } from "@/lib/audit";
import { applyInventoryMovement, restoreReturnedLot } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { resolvePosActor } from "@/lib/pos-actor";
import { canUsePosAction } from "@/lib/pos-permissions";

const refundSchema = z.object({
  reason: z.string().optional(),
  referenceValues: z.array(z.object({ bookId: z.string(), entryId: z.string() })).optional(),
  restoreStock: z.boolean().default(true),
  items: z.array(z.object({
    saleItemId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const actor = await resolvePosActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const privileged = ["ADMIN", "MANAGER"].includes(actor.role ?? "");
  const mgrCookie = (await cookies()).get(MANAGER_COOKIE)?.value;
  const { id: saleId } = await params;
  const storeId = await getStoreId();
  const permissions = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { posAccessReturn: true },
  });
  const allowedByRole = canUsePosAction(permissions?.posAccessReturn, actor.role);
  const managerOk = privileged || verifyManagerToken(mgrCookie, actor.userId);
  if (!allowedByRole && !managerOk) {
    return NextResponse.json({ error: "Возврат запрещен настройками кассы" }, { status: 403 });
  }
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, storeId },
    include: {
      items: true,
      refunds: { select: { items: true } },
      cashbox: { select: { accountId: true, extraAccountId: true } },
    },
  });
  if (!sale) return NextResponse.json({ error: "Sale not found" }, { status: 404 });
  if (sale.status !== "COMPLETED") return NextResponse.json({ error: "Sale is not refundable" }, { status: 400 });

  const body = await req.json();
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { reason, restoreStock, items: requestedItems } = parsed.data;
  const references = await resolveReferenceValues(storeId, "RETURN", parsed.data.referenceValues);
  if (!references.ok) return NextResponse.json({ error: references.error }, { status: 400 });
  const seen = new Set<string>();
  const refunded = new Map<string, number>();
  for (const prior of sale.refunds) {
    if (!Array.isArray(prior.items)) continue;
    for (const entry of prior.items) {
      if (entry && typeof entry === "object" && "saleItemId" in entry && typeof entry.saleItemId === "string") {
        const quantity = Number("quantity" in entry ? entry.quantity : 0);
        refunded.set(entry.saleItemId, (refunded.get(entry.saleItemId) ?? 0) + (Number.isFinite(quantity) ? quantity : 0));
      }
    }
  }
  let items: { saleItemId: string; productId: string | null; name: string; quantity: number; price: number; unit: string }[];
  try {
    items = requestedItems.map((requested) => {
      if (seen.has(requested.saleItemId)) throw new Error("DUPLICATE_ITEM");
      seen.add(requested.saleItemId);
      const source = sale.items.find((item) => item.id === requested.saleItemId);
      if (!source) throw new Error("ITEM_NOT_IN_SALE");
      const remaining = Number(source.quantity) - (refunded.get(source.id) ?? 0);
      if (source.unit === "pcs" && !Number.isInteger(requested.quantity)) throw new Error("PIECE_QUANTITY_MUST_BE_WHOLE");
      if (requested.quantity > remaining + 0.0001) throw new Error("RETURN_QUANTITY_EXCEEDED");
      return { saleItemId: source.id, productId: source.productId, name: source.name, quantity: requested.quantity, price: Number(source.total) / Number(source.quantity), unit: source.unit };
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Некорректные товары возврата" }, { status: 400 });
  }
  const refundAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const refund = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.create({
      data: {
        saleId,
        userId: actor.userId,
        amount: refundAmount,
        reason: reason || null,
        referenceValues: references.values.length ? references.values : undefined,
        items: items,
        restoreStock,
      },
    });

    const allReturned = sale.items.every((item) => {
      const nowReturned = items.find((r) => r.saleItemId === item.id)?.quantity ?? 0;
      return (refunded.get(item.id) ?? 0) + nowReturned >= Number(item.quantity) - 0.0001;
    });
    if (allReturned) await tx.sale.update({ where: { id: saleId }, data: { status: "REFUNDED" } });

    // Mirror the sale's account credit: money paid out of the same register it was rung up on.
    if (sale.cashbox) {
      const targetAccountId = sale.paymentMethod === "CASH" ? sale.cashbox.accountId
        : sale.paymentMethod === "CARD" || sale.paymentMethod === "OTHER" ? sale.cashbox.extraAccountId
        : null; // CREDIT sales never credited the register, so nothing to reverse
      if (targetAccountId) {
        await tx.financeAccount.update({ where: { id: targetAccountId }, data: { balance: { decrement: refundAmount } } });
      }
    }

    // Restore stock (a Комплект restores its components; a Услуга has none)
    if (restoreStock) {
      for (const item of items) {
        if (item.productId) {
          const lines = await resolveStockLines(tx, item.productId, item.quantity);
          for (const line of lines) {
            await applyInventoryMovement(tx, { productId: line.productId, userId: actor.userId, type: "SALE_RETURN", quantity: line.quantity, referenceType: "Refund", referenceId: r.id, note: reason || "Sale return" });
            await restoreReturnedLot(tx, { productId: line.productId, quantity: line.quantity, referenceId: r.id });
          }
        }
      }
    }

    return r;
  });

  await logAudit({
    userId: actor.userId,
    action: "SALE_REFUND",
    entityType: "Sale",
    entityId: saleId,
    details: { amount: refundAmount, reason: reason || null, itemCount: items.length, managerOverride: !allowedByRole },
  });

  return NextResponse.json({ refund });
}
