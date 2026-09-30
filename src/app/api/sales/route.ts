import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { counterpartyScope } from "@/lib/counterparty-scope";
import { CASHBOX_DEVICE_COOKIE, getPairedCashboxId } from "@/lib/cashbox-device";
import { resolveReferenceValues } from "@/lib/reference-values";
import { z } from "zod";
import { pluginRegistry } from "@/lib/plugins";
import { getOpenShift } from "@/lib/shift";
import { applyInventoryMovement, consumeInventoryLots } from "@/lib/inventory-ledger";
import { resolveStockLines } from "@/lib/bundle";
import { lineGross, roundAmount, allocateReceiptDiscount } from "@/lib/rounding";
import { evaluatePromotions, type PromotionRule } from "@/lib/promotions";
import { findBlockedCategory, type SaleRestrictionRule } from "@/lib/sale-restrictions";
import { attributedUserId } from "@/lib/offline-write";
import { resolvePosRequest, isPosRequestError } from "@/lib/pos-request";

const saleSchema = z.object({
  items: z
    .array(
      z.object({
        /** null — "Универсальный продукт": a manually-entered line with no catalog product. */
        productId: z.string().nullable(),
        name: z.string(),
        price: z.number(),
        quantity: z.number().positive(),
        unit: z.enum(["pcs", "kg", "l", "m"]).default("pcs"),
        notes: z.string().optional(),
        discountAmount: z.number().min(0).default(0),
      })
    )
    .min(1),
  paymentMethod: z.enum(["CASH", "CARD", "OTHER", "CREDIT"]).default("CASH"),
  amountTendered: z.number().optional(),
  paymentLines: z
    .array(
      z.object({
        method: z.enum(["CASH", "CARD", "OTHER"]),
        amount: z.number().min(0),
      })
    )
    .optional(),
  tipAmount: z.number().min(0).default(0),
  taxRate: z.number().min(0).max(1).default(0),
  discountAmount: z.number().min(0).default(0),
  discountType: z.enum(["fixed", "percent"]).default("fixed"),
  note: z.string().optional(),
  customerId: z.string().optional(),
  /** Optional staff member attributed to the sale (distinct from the cashier) */
  consultantId: z.string().optional(),
  /** Discount-card code scanned/typed at checkout */
  discountCardCode: z.string().optional(),
  /** Loyalty points to redeem as discount (0 = no redemption) */
  loyaltyPointsUsed: z.number().int().min(0).default(0),
  referenceValues: z.array(z.object({ bookId: z.string(), entryId: z.string() })).optional(),
  /** Offline kassa: id made on the till. The same id sent twice yields the same sale, never a duplicate. */
  clientSaleId: z.string().min(8).max(64).optional(),
  /** Receipt number the till printed itself while offline. */
  receiptNo: z.string().max(40).optional(),
  /** When the till actually rang the sale up (ISO). Only trusted within a sane window, see below. */
  soldAt: z.string().datetime().optional(),
  /** The till was offline when it rang this sale. */
  offline: z.boolean().optional(),
  /** The shift the till says the sale belongs to (an offline till knows it before the server does). */
  shiftId: z.string().optional(),
  /** Who really rang the sale up, when another cashier's session uploads it (mandatory for a Hub upload). */
  cashierUserId: z.string().optional(),
  /** Which physical register (Cashbox), when a local Hub uploads this — a Hub has no cashbox-device cookie of its own. */
  cashboxId: z.string().optional(),
});

/** An offline till may upload a sale days later; accept its own timestamp only inside this window. */
const MAX_OFFLINE_AGE_MS = 14 * 24 * 3600_000;
const MAX_CLOCK_AHEAD_MS = 5 * 60_000;

export async function POST(req: NextRequest) {
  const ctx = await resolvePosRequest(req);
  if (isPosRequestError(ctx)) return ctx.error;
  const { storeId, actor } = ctx;

  const body = await req.json();
  const parsed = saleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const {
    items,
    paymentMethod,
    amountTendered,
    paymentLines,
    tipAmount,
    taxRate,
    discountAmount,
    discountType,
    note,
    customerId,
    consultantId,
    discountCardCode,
    loyaltyPointsUsed,
    referenceValues: referenceChoices,
    clientSaleId,
    receiptNo,
    soldAt,
    offline,
    shiftId,
    cashierUserId,
    cashboxId: cashboxIdInput,
  } = parsed.data;

  // Derive primary paymentMethod from largest split-tender line (if split mode).
  // CREDIT (вересиye) is never part of a split — it's the sole method for the whole sale.
  const effectiveMethod: "CASH" | "CARD" | "OTHER" | "CREDIT" =
    paymentLines && paymentLines.length > 0
      ? (paymentLines.reduce((a, b) => (a.amount >= b.amount ? a : b)).method as
          | "CASH"
          | "CARD"
          | "OTHER")
      : paymentMethod;

  if (effectiveMethod === "CREDIT" && !customerId) {
    return NextResponse.json(
      { error: "Для продажи в кредит нужно выбрать покупателя" },
      { status: 400 }
    );
  }

  // A retried upload (lost response, flaky connection) must return the sale it already created —
  // checked first, before any rule that could reject a replay.
  if (clientSaleId) {
    const already = await prisma.sale.findUnique({
      where: { storeId_clientSaleId: { storeId, clientSaleId } },
      include: { items: true },
    });
    if (already) return NextResponse.json({ sale: already, duplicate: true }, { status: 200 });
  }

  // The till's own sale time (offline sales are uploaded later) — trusted only inside a sane window.
  let soldAtDate: Date | undefined;
  if (soldAt) {
    const t = new Date(soldAt).getTime();
    const now = Date.now();
    if (Number.isFinite(t) && t <= now + MAX_CLOCK_AHEAD_MS && t >= now - MAX_OFFLINE_AGE_MS) soldAtDate = new Date(Math.min(t, now));
  }
  // The till claimed a time outside that window (clock wrong, or offline too long) — server "now" was used
  // instead. Reported back so the cashier can be warned (see UnsyncedBanner).
  const timeAdjusted = !!soldAt && !soldAtDate;

  const saleUserId = await attributedUserId(actor, storeId, cashierUserId);
  if (!saleUserId) return NextResponse.json({ error: "cashierUserId required" }, { status: 400 });
  const references = await resolveReferenceValues(storeId, "SALE", referenceChoices);
  if (!references.ok) return NextResponse.json({ error: references.error }, { status: 400 });
  const settings = await prisma.businessSettings.findUnique({ where: { storeId } });

  // Which physical register this sale was rung up on: a Hub names it explicitly (it has no cashbox-device
  // cookie of its own — that cookie lives on the till's browser, one hop further away); a browser till reads
  // its own pairing cookie. Its linked accounts get the proceeds, so cash/card lands on the register's real balance.
  const pairedCashboxId = cashboxIdInput ?? ctx.cashboxId ?? getPairedCashboxId((await cookies()).get(CASHBOX_DEVICE_COOKIE)?.value);
  const pairedCashbox = pairedCashboxId
    ? await prisma.cashbox.findFirst({
        where: { id: pairedCashboxId, storeId },
        select: { id: true, name: true, accountId: true, extraAccountId: true },
      })
    : null;
  const cashboxId = pairedCashbox?.id;

  // Kassa permissions are not merely visual toggles. Reject direct API calls too.
  if (items.some((item) => item.productId === null) && settings && !settings.posUniversalProduct) {
    return NextResponse.json(
      { error: "Продажа универсального продукта отключена в настройках кассы" },
      { status: 403 }
    );
  }
  const containsCardPayment =
    effectiveMethod === "CARD" || Boolean(paymentLines?.some((line) => line.method === "CARD"));
  if (containsCardPayment && settings && !settings.posCardPayment) {
    return NextResponse.json(
      { error: "Безналичный расчет отключен в настройках кассы" },
      { status: 403 }
    );
  }

  // Load loyalty settings if customer is attached; also gates CREDIT sales on
  // the "Продажа в кредит" cashbox permission (posCreditSale).
  let loyaltySettings: { enabled: boolean; earnRate: number; redeemValue: number } | null = null;
  let cashbackEnabled = false;
  if (customerId || effectiveMethod === "CREDIT") {
    if (effectiveMethod === "CREDIT" && settings && !settings.posCreditSale) {
      return NextResponse.json(
        { error: "Продажа в кредит отключена в настройках кассы" },
        { status: 403 }
      );
    }
    if (settings?.loyaltyEnabled) {
      loyaltySettings = {
        enabled: true,
        earnRate: parseFloat(settings.loyaltyEarnRate.toString()),
        redeemValue: parseFloat(settings.loyaltyRedeemValue.toString()),
      };
      cashbackEnabled = Boolean(settings.cashbackEnabled);
    }
  }

  const lineGrossOf = (i: (typeof items)[number]) =>
    lineGross(i.price, i.quantity, i.unit, settings?.posRoundingWeightItems);
  const subtotal = items.reduce((sum, i) => sum + lineGrossOf(i), 0);
  const lineDiscountTotal = items.reduce((sum, i) => sum + (i.discountAmount || 0), 0);
  const discountValue =
    (discountType === "percent"
      ? (subtotal * discountAmount) / 100
      : Math.min(discountAmount, subtotal)) + lineDiscountTotal;

  // Every line's product must belong to the current store — reject the whole
  // sale otherwise, rather than letting a cross-store productId corrupt another
  // store's inventory ledger below. Lines with productId: null ("Универсальный
  // продукт") skip this check entirely — there's no catalog product to verify.
  const uniqueProductIds = [
    ...new Set(items.map((i) => i.productId).filter((id): id is string => id != null)),
  ];
  const catRows = await prisma.product.findMany({
    where: { id: { in: uniqueProductIds }, storeId, deletedAt: null },
    select: { id: true, categoryId: true, price: true, wholesalePrice: true },
  });
  if (catRows.length !== uniqueProductIds.length) {
    return NextResponse.json({ error: "Один или несколько товаров недоступны" }, { status: 400 });
  }

  // Prices come from the browser, so the "change price at kassa" permissions are enforced here.
  const priceById = new Map(catRows.map((r) => [r.id, r]));
  for (const line of items) {
    const product = line.productId ? priceById.get(line.productId) : undefined;
    if (!product) continue;
    const catalog = Number(product.price);
    if (Math.abs(line.price - catalog) < 0.005) continue;
    const isWholesale =
      product.wholesalePrice != null &&
      Math.abs(line.price - Number(product.wholesalePrice)) < 0.005 &&
      settings?.allowWholesale &&
      settings?.posWholesaleAtPos;
    if (isWholesale) continue;
    if (settings && !settings.posChangePriceAtPos) {
      return NextResponse.json(
        { error: "Изменение цены на кассе запрещено настройками" },
        { status: 403 }
      );
    }
    if (settings?.posBanPriceDecrease && line.price < catalog) {
      return NextResponse.json(
        { error: "Понижение цены на кассе запрещено настройками" },
        { status: 403 }
      );
    }
    if (line.price < 0) return NextResponse.json({ error: "Некорректная цена" }, { status: 400 });
  }
  const catById = new Map(catRows.map((c) => [c.id, c.categoryId]));

  if (customerId) {
    const customer = await prisma.customer.findFirst({
      where: { id: customerId, ...(await counterpartyScope(storeId)) },
    });
    if (!customer) return NextResponse.json({ error: "Покупатель не найден" }, { status: 400 });
  }
  if (consultantId) {
    const consultant = await prisma.consultant.findFirst({ where: { id: consultantId, storeId } });
    if (!consultant) return NextResponse.json({ error: "Консультант не найден" }, { status: 400 });
  }
  const restrictionRules = await prisma.saleRestriction.findMany({
    where: { active: true },
    include: { category: { select: { name: true } } },
  });
  const restrictionRuleList: SaleRestrictionRule[] = restrictionRules.map((r) => ({
    id: r.id,
    categoryId: r.categoryId,
    categoryName: r.category.name,
    active: r.active,
    daysOfWeek: r.daysOfWeek,
    startTime: r.startTime,
    endTime: r.endTime,
  }));
  const blocked = findBlockedCategory(
    items.map((i) => (i.productId ? catById.get(i.productId) : undefined)),
    restrictionRuleList,
    // an offline sale is judged at the moment it was rung up, not at the moment it reached the server
    soldAtDate ?? new Date()
  );
  if (blocked) {
    return NextResponse.json(
      {
        error: `Продажа товаров категории «${blocked.categoryName}» запрещена сейчас (${blocked.startTime}–${blocked.endTime})`,
      },
      { status: 403 }
    );
  }

  // Re-evaluate promotions + discount card server-side (authoritative).
  let promoDiscount = 0;
  let promoLines: { promotionId: string; name: string; amount: number }[] = [];
  try {
    const [promos, card] = await Promise.all([
      prisma.promotion.findMany({
        where: { storeId, active: true },
        orderBy: { priority: "desc" },
        include: { bundleItems: { select: { productId: true, quantity: true } } },
      }),
      discountCardCode
        ? prisma.discountCard.findFirst({
            where: { code: discountCardCode.trim(), storeId },
            select: { percent: true, active: true },
          })
        : Promise.resolve(null),
    ]);
    const lines = items.map((i) => ({
      productId: i.productId ?? "",
      categoryId: i.productId ? (catById.get(i.productId) ?? null) : null,
      price: i.price,
      quantity: i.quantity,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rules = promos.map((p: any) => ({
      ...p,
      percent: p.percent == null ? null : Number(p.percent),
      amount: p.amount == null ? null : Number(p.amount),
      getPercent: p.getPercent == null ? null : Number(p.getPercent),
      minSubtotal: p.minSubtotal == null ? null : Number(p.minSubtotal),
    })) as PromotionRule[];
    const cardPct = card && card.active ? Number(card.percent) : 0;
    const evalRes = evaluatePromotions(lines, rules, { discountCardPercent: cardPct, now: soldAtDate ?? new Date() });
    promoDiscount = evalRes.totalDiscount;
    promoLines = evalRes.discounts;
  } catch (e) {
    console.error("[sales] promotion eval failed", e);
  }

  // Loyalty redemption discount (points / redeemValue = $ discount)
  const loyaltyDiscount =
    loyaltySettings && loyaltyPointsUsed > 0 ? loyaltyPointsUsed / loyaltySettings.redeemValue : 0;
  const totalDiscount = Math.min(
    subtotal,
    roundAmount(discountValue + promoDiscount, settings?.posRoundingDiscount) + loyaltyDiscount
  );
  // Receipt-level discounts (header %, promotions, card, points) become part of each line's own discount.
  const receiptLevelDiscount = Math.max(0, totalDiscount - lineDiscountTotal);
  const lineShares = allocateReceiptDiscount(
    items.map((i) => ({ gross: lineGrossOf(i), lineDiscount: i.discountAmount || 0 })),
    receiptLevelDiscount
  );
  const taxAmt = (subtotal - totalDiscount) * taxRate;
  const total = subtotal - totalDiscount + taxAmt + (tipAmount ?? 0);

  if (settings && !settings.posSalesOverMillion && total > 1_000_000) {
    return NextResponse.json(
      { error: "Продажи свыше миллиона отключены в настройках кассы" },
      { status: 403 }
    );
  }

  // Change due: cash single-method or from split lines total
  const paidTotal =
    paymentLines && paymentLines.length > 0
      ? paymentLines.reduce((s, p) => s + p.amount, 0)
      : (amountTendered ?? 0);

  // The browser disables checkout until a split payment is covered, but this
  // validation is authoritative: API callers must not be able to create a
  // completed sale with an unpaid balance.
  if (paymentLines && paymentLines.length > 0 && paidTotal + 0.005 < total) {
    return NextResponse.json({ error: "Сумма оплаты меньше суммы продажи" }, { status: 400 });
  }
  if (
    effectiveMethod === "CASH" &&
    amountTendered !== undefined &&
    amountTendered + 0.005 < total
  ) {
    return NextResponse.json({ error: "Полученная сумма меньше суммы продажи" }, { status: 400 });
  }

  const changeDue =
    effectiveMethod === "CASH" || paymentLines?.some((p) => p.method === "CASH")
      ? Math.max(0, paidTotal - total)
      : undefined;

  // A sale uploaded later belongs to the shift the till says it was rung up in, else the one that was running
  // when it was rung up — not to whatever is open now.
  const openShift =
    (shiftId ? await prisma.shift.findFirst({ where: { id: shiftId, storeId } }) : null) ??
    (soldAtDate
      ? await prisma.shift.findFirst({
          where: {
            userId: saleUserId,
            storeId,
            openedAt: { lte: soldAtDate },
            OR: [{ closedAt: null }, { closedAt: { gte: soldAtDate } }],
          },
          orderBy: { openedAt: "desc" },
        })
      : null) ?? (await getOpenShift(saleUserId, storeId));
  if (settings?.requireOpenShift && !openShift) {
    return NextResponse.json(
      { error: "Для проведения продажи необходимо открыть смену" },
      { status: 403 }
    );
  }

  // Loyalty points earned on this sale. Flat rate (points per currency unit of
  // the sale's grand total) unless cashbackEnabled, in which case each line
  // earns via its own category's cashback % (converted to points via
  // redeemValue) when set, falling back to the flat rate for lines whose
  // category has no override.
  let earnedPoints = 0;
  if (loyaltySettings?.enabled) {
    if (cashbackEnabled) {
      const categoryIds = [...new Set([...catById.values()].filter((cid): cid is string => !!cid))];
      const categories =
        categoryIds.length > 0
          ? await prisma.category.findMany({
              where: { id: { in: categoryIds } },
              select: { id: true, cashbackPercent: true },
            })
          : [];
      const cashbackByCategory = new Map(categories.map((c) => [c.id, c.cashbackPercent]));
      for (const i of items) {
        const lineTotal = i.price * i.quantity;
        const catId = i.productId ? catById.get(i.productId) : undefined;
        const pct = catId ? cashbackByCategory.get(catId) : null;
        earnedPoints +=
          pct != null
            ? lineTotal * (pct / 100) * loyaltySettings.redeemValue
            : lineTotal * loyaltySettings.earnRate;
      }
    } else {
      earnedPoints = total * loyaltySettings.earnRate;
    }
    earnedPoints = Math.floor(earnedPoints);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sale;
  try {
    sale = await prisma.$transaction(async (tx: any) => {
      const created = await tx.sale.create({
        data: {
          storeId,
          userId: saleUserId,
          referenceValues: references.values.length ? references.values : undefined,
          customerId: customerId || undefined,
          consultantId: consultantId || undefined,
          shiftId: openShift?.id ?? undefined,
          cashboxId,
          subtotal,
          taxRate,
          taxAmount: taxAmt,
          discountAmount: totalDiscount,
          tipAmount: tipAmount ?? 0,
          total,
          paymentMethod: effectiveMethod,
          paymentLines: paymentLines && paymentLines.length > 0 ? paymentLines : undefined,
          amountTendered: amountTendered ?? (paidTotal > 0 ? paidTotal : undefined),
          changeDue,
          notes: note,
          promoDetails: promoLines.length > 0 ? promoLines : undefined,
          clientSaleId: clientSaleId ?? undefined,
          receiptNo: receiptNo ?? undefined,
          offline: Boolean(offline),
          createdAt: soldAtDate,
          items: {
            create: items.map((i, lineNo) => ({
              lineNo,
              productId: i.productId ?? undefined,
              name: i.name,
              price: i.price,
              quantity: i.quantity,
              unit: i.unit,
              discountAmount: (i.discountAmount || 0) + lineShares[lineNo],
              total: lineGrossOf(i) - (i.discountAmount || 0) - lineShares[lineNo],
              notes: i.notes ?? undefined,
            })),
          },
        },
        include: { items: true },
      });

      // Credit the paired register's linked accounts with the proceeds actually kept —
      // cash net of change to the cashbox's own cash account, card/other to its linked
      // non-cash account. CREDIT sales receive no money yet, so nothing is credited.
      if (pairedCashbox) {
        const cashKept =
          paymentLines && paymentLines.length > 0
            ? paymentLines.filter((p) => p.method === "CASH").reduce((s, p) => s + p.amount, 0)
            : effectiveMethod === "CASH"
              ? total
              : 0;
        const nonCashKept =
          paymentLines && paymentLines.length > 0
            ? paymentLines
                .filter((p) => p.method === "CARD" || p.method === "OTHER")
                .reduce((s, p) => s + p.amount, 0)
            : effectiveMethod === "CARD" || effectiveMethod === "OTHER"
              ? total
              : 0;

        if (cashKept > 0 && pairedCashbox.accountId) {
          await tx.financeAccount.update({
            where: { id: pairedCashbox.accountId },
            data: { balance: { increment: cashKept } },
          });
        }
        if (nonCashKept > 0 && pairedCashbox.extraAccountId) {
          await tx.financeAccount.update({
            where: { id: pairedCashbox.extraAccountId },
            data: { balance: { increment: nonCashKept } },
          });
        }
      }

      // Decrement stock and write an immutable inventory-ledger record.
      // A Комплект (BUNDLE) decrements its component products instead of itself;
      // a Услуга (SERVICE) has no stock at all; "Универсальный продукт" (productId:
      // null) has no catalog product at all, so there's nothing to decrement.
      for (const item of items) {
        if (!item.productId) continue;
        const lines = await resolveStockLines(tx, item.productId, item.quantity);
        for (const line of lines) {
          await applyInventoryMovement(tx, {
            productId: line.productId,
            userId: saleUserId,
            type: "SALE",
            quantity: -line.quantity,
            referenceType: "Sale",
            referenceId: created.id,
            note: `POS sale ${created.id}`,
          });
          await consumeInventoryLots(tx, line.productId, line.quantity);
        }
      }

      // Loyalty points: deduct redeemed, award earned
      if (customerId && loyaltySettings?.enabled) {
        type LogEntry = {
          customerId: string;
          saleId: string;
          delta: number;
          type: "EARN" | "REDEEM" | "ADJUST";
          note: string;
        };
        const logs: LogEntry[] = [];

        if (loyaltyPointsUsed > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { decrement: loyaltyPointsUsed } },
          });
          logs.push({
            customerId,
            saleId: created.id,
            delta: -loyaltyPointsUsed,
            type: "REDEEM" as const,
            note: `Redeemed ${loyaltyPointsUsed} pts`,
          });
        }
        if (earnedPoints > 0) {
          await tx.customer.update({
            where: { id: customerId },
            data: { loyaltyPoints: { increment: earnedPoints } },
          });
          logs.push({
            customerId,
            saleId: created.id,
            delta: earnedPoints,
            type: "EARN" as const,
            note: `Earned on sale`,
          });
        }
        for (const log of logs) {
          await tx.loyaltyLog.create({ data: log });
        }
      }

      return created;
    });
  } catch (e) {
    // Two uploads of the same sale raced: the loser hits the unique (storeId, clientSaleId) index.
    if (clientSaleId && (e as { code?: string })?.code === "P2002") {
      const winner = await prisma.sale.findUnique({
        where: { storeId_clientSaleId: { storeId, clientSaleId } },
        include: { items: true },
      });
      if (winner) return NextResponse.json({ sale: winner, duplicate: true }, { status: 200 });
    }
    if (e instanceof Error && e.message === "INSUFFICIENT_STOCK") {
      return NextResponse.json({ error: "Недостаточно товара на складе" }, { status: 409 });
    }
    throw e;
  }

  // Fire plugin hook (non-blocking — errors are caught inside fire())
  pluginRegistry
    .fire("onSaleComplete", {
      saleId: sale.id,
      total: parseFloat(sale.total.toString()),
      taxAmount: parseFloat(sale.taxAmount?.toString() ?? "0"),
      tipAmount: parseFloat(sale.tipAmount?.toString() ?? "0"),
      items: sale.items.map(
        (i: {
          productId: string | null;
          name: string;
          quantity: { toString(): string };
          unit: string;
          price: { toString(): string };
        }) => ({
          productId: i.productId,
          name: i.name,
          quantity: parseFloat(i.quantity.toString()),
          unit: i.unit,
          price: parseFloat(i.price.toString()),
        })
      ),
      customerId: sale.customerId ?? null,
      paymentMethod: sale.paymentMethod,
      loyaltyPointsUsed: loyaltyPointsUsed || 0,
    })
    .catch(() => {
      /* handled inside fire() */
    });

  return NextResponse.json({ sale: { ...sale, cashboxName: pairedCashbox?.name ?? null }, timeAdjusted }, { status: 201 });
}
