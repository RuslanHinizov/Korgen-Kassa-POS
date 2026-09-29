import { create } from "zustand";
import { persist } from "zustand/middleware";
import { lineGross, roundAmount } from "@/lib/rounding";
import type { DiscountLine } from "@/lib/promotions";

export type PaymentMethod = "CASH" | "CARD" | "OTHER" | "CREDIT";

function lineId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `line-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** JSON/localStorage may contain legacy or malformed values. Never let one turn totals into NaN. */
function finiteNumber(value: unknown, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export interface CartItem {
  /** Stable per-line id — the true identity for remove/update/selection (NOT productId, which repeats across lines only when merged). */
  id: string;
  /** null for "Универсальный продукт" — a manually-entered line not tied to any catalog product. */
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  /** Per-item notes / modifiers */
  notes: string;
  /** Snapshot of stock at time of add (for offline validation) */
  stock: number;
  /** Snapshot used only to warn the cashier about a low remaining balance. */
  lowStockThreshold?: number;
  /** "kg"/"l"/"m" products support fractional quantities; old persisted carts default to pieces. */
  unit?: "pcs" | "kg" | "l" | "m";
  /** For category-scoped promotions */
  categoryId?: string | null;
  /** Per-line discount (currency amount), matches UMAG's СКИДКА column. */
  lineDiscount: number;
  /** Catalog price captured before the cashier overrode the price at the kassa. */
  catalogPrice?: number;
  /** Wholesale price snapshot, used by the kassa's wholesale toggle. */
  wholesalePrice?: number | null;
}

/** One line in a split-tender payment */
export interface PaymentLine {
  method: PaymentMethod;
  amount: number;
}

export interface CartState {
  items: CartItem[];
  discountAmount: number;
  discountType: "fixed" | "percent";
  /** Primary payment method (used when no paymentLines set) */
  paymentMethod: PaymentMethod;
  amountTendered: number;
  /** Split-tender lines — empty = single method mode */
  paymentLines: PaymentLine[];
  /** Tip amount in currency units */
  tipAmount: number;
  /** Custom tax rate override (null means use default) */
  taxRate: number | null;
  /** Loyalty points to redeem on this sale */
  loyaltyPointsUsed: number;
  note: string;

  /** Auto-applied promotion discount lines (set by the POS engine) */
  autoDiscounts: DiscountLine[];
  autoDiscountTotal: number;
  /** Attached discount card */
  discountCardCode: string;
  discountCardPercent: number;

  // Actions
  /** Catalog items with the same productId merge into the existing line; custom (productId: null) items never merge.
   *  `notes`/`lineDiscount` are optional — used when restoring a held-order snapshot, default to ""/0 otherwise. */
  addItem: (item: Omit<CartItem, "id" | "quantity" | "notes" | "lineDiscount"> & Partial<Pick<CartItem, "notes" | "lineDiscount">>, quantity?: number) => void;
  /** "Универсальный продукт" — a manually-entered name+price line with no catalog product. */
  addCustomItem: (item: { name: string; price: number; quantity: number }) => void;
  removeItem: (id: string) => void;
  removeItems: (ids: string[]) => void;
  updateQuantity: (id: string, quantity: number) => void;
  updateItemNotes: (id: string, notes: string) => void;
  updateLineDiscount: (id: string, amount: number) => void;
  updateItemPrice: (id: string, price: number) => void;
  setDiscount: (amount: number, type: "fixed" | "percent") => void;
  setPaymentMethod: (method: PaymentMethod) => void;
  setAmountTendered: (amount: number) => void;
  setTipAmount: (amount: number) => void;
  setTaxRate: (rate: number | null) => void;
  setLoyaltyPointsUsed: (points: number) => void;
  /** Add / replace a payment line for the given method */
  setPaymentLine: (line: PaymentLine) => void;
  removePaymentLine: (method: PaymentMethod) => void;
  clearPaymentLines: () => void;
  setNote: (note: string) => void;
  setAutoDiscounts: (lines: DiscountLine[], total: number) => void;
  setDiscountCard: (code: string, percent: number) => void;
  clearCart: () => void;

  /** Rounding rules from the kassa permissions (set by the POS screen once settings load). */
  roundingWeight: string;
  roundingDiscount: string;
  setRounding: (weight: string, discount: string) => void;
  /** One line before discounts, honouring weighted-item rounding. */
  lineGrossOf: (item: CartItem) => number;

  // Derived
  subtotal: () => number;
  /** manual (whole-cart) discount only */
  manualDiscountValue: () => number;
  /** sum of every line's own lineDiscount */
  lineDiscountTotal: () => number;
  /** manual + auto (promotions + card) + per-line, capped at subtotal */
  discountValue: () => number;
  taxAmount: (taxRate: number) => number;
  total: (taxRate: number) => number;
  paymentLinesTotal: () => number;
  changeDue: (taxRate: number) => number;
  isSplitMode: () => boolean;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      discountAmount: 0,
      discountType: "fixed",
      paymentMethod: "CASH",
      amountTendered: 0,
      paymentLines: [],
      tipAmount: 0,
      taxRate: null,
      loyaltyPointsUsed: 0,
      note: "",
      autoDiscounts: [],
      autoDiscountTotal: 0,
      discountCardCode: "",
      discountCardPercent: 0,

      roundingWeight: "NONE",
      roundingDiscount: "NONE",
      setRounding: (weight, discount) => set({ roundingWeight: weight || "NONE", roundingDiscount: discount || "NONE" }),
      lineGrossOf: (item) => lineGross(finiteNumber(item.price), finiteNumber(item.quantity), item.unit, get().roundingWeight),

      addItem: (item, quantity = 1) =>
        set((state) => {
          const amount = Math.max(0.001, finiteNumber(quantity, 1));
          // A held order is serialized as JSON, where Infinity (the stock marker
          // for a manual "Универсальный продукт") becomes null.  Manual lines are
          // intentionally not stock-limited, so restore their sentinel here.
          const availableStock = item.productId === null ? Infinity : finiteNumber(item.stock);
          const existing = item.productId != null ? state.items.find((i) => i.productId === item.productId) : undefined;
          // Like UMAG's till, a sale is never limited by the stock balance (the balance may go negative and shows in the
          // reports); an offline till cannot know the real balance anyway. The line only shows a "no stock" badge.
          if (existing) {
            return {
              items: state.items.map((i) =>
                i.id === existing.id
                  ? { ...i, quantity: existing.quantity + amount, unit: item.unit ?? i.unit ?? "pcs" }
                  : i
              ),
            };
          }
          return { items: [...state.items, { ...item, stock: availableStock, id: lineId(), unit: item.unit ?? "pcs", quantity: amount, notes: item.notes ?? "", lineDiscount: item.lineDiscount ?? 0 }] };
        }),

      addCustomItem: (item) =>
        set((state) => ({
          items: [
            ...state.items,
            { id: lineId(), productId: null, name: item.name, price: item.price, quantity: Math.max(0.001, item.quantity), notes: "", stock: Infinity, unit: "pcs", categoryId: null, lineDiscount: 0 },
          ],
        })),

      removeItem: (id) =>
        set((state) => ({
          items: state.items.filter((i) => i.id !== id),
        })),

      removeItems: (ids) =>
        set((state) => {
          const idSet = new Set(ids);
          return { items: state.items.filter((i) => !idSet.has(i.id)) };
        }),

      updateQuantity: (id, quantity) =>
        set((state) => {
          const safeQuantity = finiteNumber(quantity);
          if (safeQuantity <= 0) {
            return { items: state.items.filter((i) => i.id !== id) };
          }
          return {
            items: state.items.map((i) => (i.id === id ? { ...i, quantity: safeQuantity } : i)),
          };
        }),

      updateItemNotes: (id, notes) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, notes } : i
          ),
        })),

      updateItemPrice: (id, price) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, catalogPrice: i.catalogPrice ?? i.price, price: Math.max(0, finiteNumber(price)) } : i
          ),
        })),

      updateLineDiscount: (id, amount) =>
        set((state) => ({
          items: state.items.map((i) =>
            i.id === id ? { ...i, lineDiscount: Math.max(0, finiteNumber(amount)) } : i
          ),
        })),

      setDiscount: (amount, type) =>
        set({ discountAmount: Math.max(0, finiteNumber(amount)), discountType: type }),

      setPaymentMethod: (method) => set({ paymentMethod: method }),
      setAmountTendered: (amount) => set({ amountTendered: amount }),
      setTipAmount: (amount) => set({ tipAmount: Math.max(0, finiteNumber(amount)) }),
      setTaxRate: (rate) => set({ taxRate: rate === null ? null : finiteNumber(rate) }),
      setLoyaltyPointsUsed: (points) => set({ loyaltyPointsUsed: Math.max(0, finiteNumber(points)) }),

      setPaymentLine: (line) =>
        set((state) => {
          const filtered = state.paymentLines.filter((p) => p.method !== line.method);
          return { paymentLines: [...filtered, line] };
        }),

      removePaymentLine: (method) =>
        set((state) => ({
          paymentLines: state.paymentLines.filter((p) => p.method !== method),
        })),

      clearPaymentLines: () => set({ paymentLines: [] }),

      setNote: (note) => set({ note }),
      setAutoDiscounts: (lines, total) => set({ autoDiscounts: lines, autoDiscountTotal: Math.max(0, finiteNumber(total)) }),
      setDiscountCard: (code, percent) => set({ discountCardCode: code, discountCardPercent: Math.max(0, finiteNumber(percent)) }),

      clearCart: () =>
        set({
          items: [],
          discountAmount: 0,
          discountType: "fixed",
          amountTendered: 0,
          paymentLines: [],
          tipAmount: 0,
          taxRate: null,
          loyaltyPointsUsed: 0,
          note: "",
          autoDiscounts: [],
          autoDiscountTotal: 0,
          discountCardCode: "",
          discountCardPercent: 0,
          paymentMethod: "CASH",
        }),

      subtotal: () =>
        get().items.reduce((sum, i) => sum + get().lineGrossOf(i), 0),

      manualDiscountValue: () => {
        const { discountAmount, discountType } = get();
        const amount = finiteNumber(discountAmount);
        const sub = get().subtotal();
        if (discountType === "percent") return (sub * amount) / 100;
        return Math.min(amount, sub);
      },

      lineDiscountTotal: () => get().items.reduce((sum, i) => sum + finiteNumber(i.lineDiscount), 0),

      discountValue: () => {
        const sub = get().subtotal();
        const raw = get().manualDiscountValue() + finiteNumber(get().autoDiscountTotal) + get().lineDiscountTotal();
        return Math.min(sub, roundAmount(raw, get().roundingDiscount));
      },

      taxAmount: (defaultTaxRate) => {
        const { taxRate: overrideRate, subtotal, discountValue } = get();
        const base = subtotal() - discountValue();
        const rate = finiteNumber(overrideRate === null ? defaultTaxRate : overrideRate);
        // taxRate is usually stored as decimal (0.1) in props, ensure we check the input format
        // assuming props/override are both multipliers (e.g. 0.1 for 10%)
        return base * rate;
      },

      total: (defaultTaxRate) => {
        const { taxRate: overrideRate, subtotal, discountValue, tipAmount } = get();
        const base = subtotal() - discountValue();
        const rate = finiteNumber(overrideRate === null ? defaultTaxRate : overrideRate);
        const tax = base * rate;
        return base + tax + finiteNumber(tipAmount);
      },

      paymentLinesTotal: () =>
        get().paymentLines.reduce((sum, p) => sum + finiteNumber(p.amount), 0),

      isSplitMode: () => get().paymentLines.length > 0,

      changeDue: (defaultTaxRate) => {
        const { amountTendered, paymentMethod, paymentLines } = get();
        const tot = get().total(defaultTaxRate);
        if (paymentLines.length > 0) {
          const paid = paymentLines.reduce((s, p) => s + finiteNumber(p.amount), 0);
          return Math.max(0, paid - tot);
        }
        if (paymentMethod !== "CASH") return 0;
        return Math.max(0, finiteNumber(amountTendered) - tot);
      },
    }),
    {
      name: "olgax-pos-cart",
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<CartState>;
        const items = Array.isArray(persisted.items) ? persisted.items : [];
        return {
          ...currentState,
          ...persisted,
          items: items.map((raw) => {
            const item = raw as Partial<CartItem>;
            const manual = item.productId == null;
            return {
              ...item,
              id: typeof item.id === "string" ? item.id : lineId(),
              productId: item.productId ?? null,
              stock: manual ? Infinity : finiteNumber(item.stock),
              price: finiteNumber(item.price),
              quantity: Math.max(0.001, finiteNumber(item.quantity, 1)),
              notes: typeof item.notes === "string" ? item.notes : "",
              lineDiscount: Math.max(0, finiteNumber(item.lineDiscount)),
              unit: item.unit ?? "pcs",
            } as CartItem;
          }),
        };
      },
    }
  )
);
