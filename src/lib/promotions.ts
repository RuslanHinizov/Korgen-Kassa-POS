/**
 * Promotion engine — pure and isomorphic (runs on the POS client for a live
 * preview and on the server at checkout for the authoritative discount).
 */

export type PromotionType = "PERCENT_OFF" | "AMOUNT_OFF" | "BUY_X_GET_Y" | "BUNDLE_PRICE";

export interface PromotionRule {
  id: string;
  name: string;
  type: PromotionType;
  active: boolean;
  priority: number;
  scope: "cart" | "category" | "product";
  categoryId: string | null;
  productId: string | null;
  percent: number | null;
  amount: number | null;
  buyQty: number | null;
  getQty: number | null;
  getPercent: number | null;
  minSubtotal: number | null;
  startsAt: string | null;
  endsAt: string | null;
  daysOfWeek: string | null; // "1,2,3,4,5" — 1=Mon … 7=Sun
  startTime: string | null; // "HH:MM"
  endTime: string | null;
  bundleItems: { productId: string; quantity: number }[];
}

export interface CartLine {
  productId: string;
  categoryId: string | null;
  price: number;
  quantity: number;
}

export interface DiscountLine {
  promotionId: string;
  name: string;
  amount: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Is `promo` valid at instant `now`? */
export function isPromotionLive(promo: PromotionRule, now = new Date()): boolean {
  if (!promo.active) return false;
  if (promo.startsAt && now < new Date(promo.startsAt)) return false;
  if (promo.endsAt && now > new Date(promo.endsAt)) return false;
  if (promo.daysOfWeek) {
    const iso = now.getDay() === 0 ? 7 : now.getDay(); // 1..7, Mon..Sun
    if (!promo.daysOfWeek.split(",").map((s) => s.trim()).includes(String(iso))) return false;
  }
  if (promo.startTime && promo.endTime) {
    const mins = now.getHours() * 60 + now.getMinutes();
    const toM = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + m;
    };
    const a = toM(promo.startTime), b = toM(promo.endTime);
    const inWindow = a <= b ? mins >= a && mins <= b : mins >= a || mins <= b; // handles overnight
    if (!inWindow) return false;
  }
  return true;
}

/**
 * Evaluate all promotions + an optional flat discount-card % against a cart.
 * Rules:
 *   - promos run in `priority` order (desc);
 *   - a line already claimed by a product/category promo is not discounted again;
 *   - cart-scope promos apply once against the not-yet-discounted subtotal;
 *   - the discount card applies last, on what remains.
 * Returns the discount lines and the (capped) total.
 */
export function evaluatePromotions(
  lines: CartLine[],
  promos: PromotionRule[],
  opts: { now?: Date; discountCardPercent?: number } = {},
): { discounts: DiscountLine[]; totalDiscount: number } {
  const now = opts.now ?? new Date();
  const subtotal = round2(lines.reduce((s, l) => s + l.price * l.quantity, 0));
  if (subtotal <= 0) return { discounts: [], totalDiscount: 0 };

  const live = promos
    .filter((p) => isPromotionLive(p, now))
    .sort((a, b) => b.priority - a.priority);

  const qtyByProduct = new Map<string, number>();
  for (const l of lines) qtyByProduct.set(l.productId, (qtyByProduct.get(l.productId) ?? 0) + l.quantity);

  const claimed = new Set<number>(); // indices of lines used by a scoped promo
  const discounts: DiscountLine[] = [];
  let running = subtotal;

  for (const p of live) {
    if (p.minSubtotal && subtotal < p.minSubtotal) continue;
    let amount = 0;

    if (p.type === "BUNDLE_PRICE" && p.bundleItems.length > 0 && p.amount != null) {
      const times = Math.min(
        ...p.bundleItems.map((bi) => Math.floor((qtyByProduct.get(bi.productId) ?? 0) / Math.max(1, bi.quantity))),
      );
      if (times > 0) {
        const normal = p.bundleItems.reduce((s, bi) => {
          const line = lines.find((l) => l.productId === bi.productId);
          return s + (line?.price ?? 0) * bi.quantity;
        }, 0);
        amount = Math.max(0, round2((normal - p.amount) * times));
      }
    } else if (p.type === "BUY_X_GET_Y" && p.buyQty && p.getQty) {
      const group = p.buyQty + p.getQty;
      const pct = (p.getPercent ?? 100) / 100;
      lines.forEach((l, i) => {
        if (claimed.has(i)) return;
        const match = p.scope === "product" ? l.productId === p.productId : p.scope === "category" ? l.categoryId === p.categoryId : true;
        if (!match) return;
        const freeUnits = Math.floor(l.quantity / group) * p.getQty!;
        if (freeUnits > 0) {
          amount += l.price * freeUnits * pct;
          claimed.add(i);
        }
      });
      amount = round2(amount);
    } else if (p.type === "PERCENT_OFF" && p.percent != null) {
      if (p.scope === "cart") {
        amount = round2((running * p.percent) / 100);
      } else {
        lines.forEach((l, i) => {
          if (claimed.has(i)) return;
          const match = p.scope === "product" ? l.productId === p.productId : l.categoryId === p.categoryId;
          if (!match) return;
          amount += (l.price * l.quantity * p.percent!) / 100;
          claimed.add(i);
        });
        amount = round2(amount);
      }
    } else if (p.type === "AMOUNT_OFF" && p.amount != null) {
      amount = round2(Math.min(p.amount, running));
    }

    if (amount > 0.009) {
      discounts.push({ promotionId: p.id, name: p.name, amount });
      running = round2(Math.max(0, running - amount));
    }
  }

  // discount card — flat % on what is left
  const cardPct = opts.discountCardPercent ?? 0;
  if (cardPct > 0 && running > 0) {
    const cardAmount = round2((running * cardPct) / 100);
    if (cardAmount > 0.009) {
      discounts.push({ promotionId: "__card__", name: `Скидочная карта −${cardPct}%`, amount: cardAmount });
      running = round2(running - cardAmount);
    }
  }

  const totalDiscount = round2(Math.min(subtotal, discounts.reduce((s, d) => s + d.amount, 0)));
  return { discounts, totalDiscount };
}
