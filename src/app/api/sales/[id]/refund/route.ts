import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { resolveReferenceValues } from "@/lib/reference-values";
import { z } from "zod";
import { verifyManagerToken, MANAGER_COOKIE } from "@/lib/manager-token";
import { logAudit } from "@/lib/audit";
import { applyInventoryMovement, restoreReturnedLot } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { canUsePosAction } from "@/lib/pos-permissions";
import { CLIENT_ID, attributedUserId, trustedTime } from "@/lib/offline-write";
import { resolvePosRequest, isPosRequestError } from "@/lib/pos-request";

const refundSchema = z.object({
  reason: z.string().optional(),
  referenceValues: z.array(z.object({ bookId: z.string(), entryId: z.string() })).optional(),
  restoreStock: z.boolean().default(true),
  items: z.array(z.object({
    /** a sale item id, or "L:<n>" (n-th line) for a sale an offline till has not uploaded yet */
    saleItemId: z.string(),
    quantity: z.number().positive(),
  })).min(1),
  /** Offline till: id made on the till (becomes the refund id), time, who. */
  id: z.string().regex(CLIENT_ID).optional(),
  refundedAt: z.string().datetime().optional(),
  cashierUserId: z.string().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const ctx = await resolvePosRequest(req);
  if (isPosRequestError(ctx)) return ctx.error;
  const { storeId, actor, viaHub } = ctx;

  const privileged = ["ADMIN", "MANAGER"].includes(actor.role ?? "");
  const mgrCookie = (await cookies()).get(MANAGER_COOKIE)?.value;
  const { id: saleIdParam } = await params;
  const permissions = await prisma.businessSettings.findUnique({
    where: { storeId },
    select: { posAccessReturn: true },
  });
  const allowedByRole = canUsePosAction(permissions?.posAccessReturn, actor.role);
  const managerOk = privileged || verifyManagerToken(mgrCookie, actor.userId);
  // A Hub upload already passed this same check on the till when the cashier/manager made the refund there;
  // the Hub is a trusted, token-authenticated channel, not a spoofable browser request.
  if (!viaHub && !allowedByRole && !managerOk) {
    return NextResponse.json({ error: "Возврат запрещен настройками кассы" }, { status: 403 });
  }
  // An offline till names a sale it has not uploaded yet by the id it made for it (clientSaleId).
  const sale = await prisma.sale.findFirst({
    where: { storeId, OR: [{ id: saleIdParam }, { clientSaleId: saleIdParam }] },
    include: {
      items: true,
      refunds: { select: { items: true } },
      cashbox: { select: { accountId: true, extraAccountId: true } },
    },
  });
  if (!sale) return NextResponse.json({ error: "Продажа не найдена" }, { status: 404 });
  const saleId = sale.id;

  const body = await req.json();
  const parsed = refundSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  // The same upload twice returns the refund it already created — checked before "is the sale still refundable",
  // because the first upload may have refunded it completely.
  if (parsed.data.id) {
    const already = await prisma.refund.findFirst({ where: { id: parsed.data.id, sale: { storeId } } });
    if (already) return NextResponse.json({ refund: already, duplicate: true }, { status: 200 });
  }
  if (sale.status !== "COMPLETED") return NextResponse.json({ error: "Эту продажу нельзя вернуть" }, { status: 400 });
  const refundUserId = await attributedUserId(actor, storeId, parsed.data.cashierUserId);
  if (!refundUserId) return NextResponse.json({ error: "cashierUserId required" }, { status: 400 });

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
      const line = /^L:(\d+)$/.exec(requested.saleItemId);
      const source = line ? sale.items.find((item) => item.lineNo === Number(line[1])) : sale.items.find((item) => item.id === requested.saleItemId);
      if (!source) throw new Error("ITEM_NOT_IN_SALE");
      const remaining = Number(source.quantity) - (refunded.get(source.id) ?? 0);
      if (source.unit === "pcs" && !Number.isInteger(requested.quantity)) throw new Error("PIECE_QUANTITY_MUST_BE_WHOLE");
      if (requested.quantity > remaining + 0.0001) throw new Error("RETURN_QUANTITY_EXCEEDED");
      if (seen.has(source.id)) throw new Error("DUPLICATE_ITEM");
      seen.add(source.id);
      return { saleItemId: source.id, productId: source.productId, name: source.name, quantity: requested.quantity, price: Number(source.total) / Number(source.quantity), unit: source.unit };
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Некорректные товары возврата" }, { status: 400 });
  }
  const refundAmount = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const timeAdjusted = !!parsed.data.refundedAt && !trustedTime(parsed.data.refundedAt);

  const refund = await prisma.$transaction(async (tx) => {
    const r = await tx.refund.create({
      data: {
        ...(parsed.data.id ? { id: parsed.data.id } : {}),
        saleId,
        userId: refundUserId,
        createdAt: trustedTime(parsed.data.refundedAt),
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
            await applyInventoryMovement(tx, { productId: line.productId, userId: refundUserId, type: "SALE_RETURN", quantity: line.quantity, referenceType: "Refund", referenceId: r.id, note: reason || "Sale return" });
            await restoreReturnedLot(tx, { productId: line.productId, quantity: line.quantity, referenceId: r.id });
          }
        }
      }
    }

    return r;
  });

  await logAudit({
    userId: refundUserId,
    action: "SALE_REFUND",
    entityType: "Sale",
    entityId: saleId,
    details: { amount: refundAmount, reason: reason || null, itemCount: items.length, managerOverride: !allowedByRole },
  });

  return NextResponse.json({ refund, timeAdjusted });
}
