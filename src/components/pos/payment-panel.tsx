"use client";

import { useState, useEffect } from "react";
import { ReferenceBookFields, useReferenceBooks } from "./reference-book-fields";
import { useTranslations } from "next-intl";
import { useCartStore, PaymentMethod } from "@/store/cart";
import { formatCurrency } from "@/lib/utils";
import { getDeviceSettings } from "@/hooks/use-device-settings";
import { kickCashDrawer } from "@/lib/thermal-print";
import { submitSale } from "@/lib/offline/submit-sale";
import { useRouter } from "next/navigation";
import { DebtScreen, type Debtor } from "./debt-screen";
import {
  PauseCircle,
  ClipboardList,
  SplitSquareHorizontal,
  X,
  Percent,
  RotateCcw,
  Star,
  Delete,
} from "lucide-react";

interface PaymentPanelProps {
  taxRate: number;
  /** When true, checkout is disabled until a shift is opened. */
  checkoutBlocked?: boolean;
  onClear: () => void;
  /** ОТМЕНА — leaves the payment screen with the cart untouched (UMAG: returns to the sale screen). */
  onCancel?: () => void;
  /** Called with the new sale ID after a successful sale — triggers receipt.
   *  `sale` is the server's authoritative created-sale record (its totals reflect discounts
   *  like loyalty redemption that this panel's own cart-derived totals don't know about). */
  onSaleComplete?: (saleId: string, sale?: unknown) => void;
  /** Open the held-orders modal */
  onHoldOrders?: () => void;
  /** Optional customer to attach to the sale */
  customerId?: string | null;
  /** Optional consultant to attribute the sale to */
  consultantId?: string | null;
  /** "Продажа в кредит" cashbox permission — hides the CREDIT option when off. Defaults to true. */
  creditSaleEnabled?: boolean;
  /** "Отложка" cashbox permission. */
  holdEnabled?: boolean;
  /** "Безналичный расчет" cashbox permission. */
  cardPaymentEnabled?: boolean;
}

const TIP_PRESETS = [
  { label: "10%", value: 10 },
  { label: "15%", value: 15 },
  { label: "20%", value: 20 },
];

// CREDIT (веresiye) is never part of a split — it's only offered as a whole-sale
// single method, and only once a customer is attached. Split-tender keeps CASH/CARD/OTHER.
type SplitMethod = "CASH" | "CARD" | "OTHER";
const PAYMENT_METHODS: SplitMethod[] = ["CASH", "CARD", "OTHER"];

const METHOD_KEY: Record<PaymentMethod, "cash" | "card" | "other" | "credit"> = {
  CASH: "cash",
  CARD: "card",
  OTHER: "other",
  CREDIT: "credit",
};

export function PaymentPanel({
  taxRate,
  checkoutBlocked,
  onClear,
  onCancel,
  onSaleComplete,
  onHoldOrders,
  customerId,
  consultantId,
  creditSaleEnabled = true,
  holdEnabled = true,
  cardPaymentEnabled = true,
}: PaymentPanelProps) {
  const t = useTranslations("pos");
  const router = useRouter();
  const {
    items,
    paymentMethod,
    setPaymentMethod,
    amountTendered,
    setAmountTendered,
    paymentLines,
    setPaymentLine,
    removePaymentLine,
    clearPaymentLines,
    clearCart,
    tipAmount,
    setTipAmount,
    isSplitMode,
    paymentLinesTotal,
    total,
    subtotal,
    discountValue,
    taxAmount,
    taxRate: taxRateOverride,
    setTaxRate,
    loyaltyPointsUsed,
    setLoyaltyPointsUsed,
    discountAmount,
    discountType,
  } = useCartStore();

  const referenceBooks = useReferenceBooks("SALE");
  const [loading, setLoading] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customTip, setCustomTip] = useState("");
  const [showTaxEdit, setShowTaxEdit] = useState(false);
  const [splitInput, setSplitInput] = useState<Record<SplitMethod, string>>({
    CASH: "",
    CARD: "",
    OTHER: "",
  });

  // Loyalty state
  const [loyaltyInfo, setLoyaltyInfo] = useState<{
    points: number;
    enabled: boolean;
    earnRate: number;
    redeemValue: number;
    maxRedeemDiscount: number;
  } | null>(null);

  useEffect(() => {
    if (!customerId) {
      setLoyaltyInfo(null);
      setLoyaltyPointsUsed(0);
      return;
    }
    fetch(`/api/loyalty?customerId=${customerId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.enabled) setLoyaltyInfo(d);
        else {
          setLoyaltyInfo(null);
          setLoyaltyPointsUsed(0);
        }
      })
      .catch(() => {
        setLoyaltyInfo(null);
      });
  }, [customerId, setLoyaltyPointsUsed]);

  // В долг (CREDIT) needs the cashbox permission on — fall back to CASH otherwise. Unlike before, it no
  // longer requires a customer already attached: UMAG's ЗАПИСАТЬ flow picks/creates the debtor ON that
  // tab's own full screen (see DebtScreen below), not beforehand.
  useEffect(() => {
    if (!creditSaleEnabled && paymentMethod === "CREDIT") setPaymentMethod("CASH");
  }, [creditSaleEnabled, paymentMethod, setPaymentMethod]);

  useEffect(() => {
    if (!cardPaymentEnabled && paymentMethod === "CARD") setPaymentMethod("CASH");
  }, [cardPaymentEnabled, paymentMethod, setPaymentMethod]);

  const availablePaymentMethods = cardPaymentEnabled
    ? PAYMENT_METHODS
    : PAYMENT_METHODS.filter((method) => method !== "CARD");

  // Loyalty discount in dollars
  const loyaltyDiscount =
    loyaltyInfo && loyaltyPointsUsed > 0
      ? Math.min(loyaltyPointsUsed / loyaltyInfo.redeemValue, loyaltyInfo.maxRedeemDiscount)
      : 0;

  // total()/changeDue() in the cart store don't know about loyalty redemption (it depends on
  // customer + business settings only fetched here) -- apply it locally so the on-screen total
  // and change-due match what /api/sales actually records (it applies loyaltyDiscount server-side).
  const tot = Math.max(0, total(taxRate) - loyaltyDiscount);

  // Безналичная/В долг: UMAG auto-fills ПОЛУЧЕНО with the full amount due the moment that tab is
  // opened (observed 2026-09-26) — cash is the only method where the cashier types a tendered amount.
  useEffect(() => {
    if (!isSplitMode() && paymentMethod !== "CASH") setAmountTendered(tot);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethod, tot]);

  const isEmpty = items.length === 0;
  const splitMode = isSplitMode();
  const splitPaid = paymentLinesTotal();
  const change = splitMode
    ? Math.max(0, splitPaid - tot)
    : paymentMethod !== "CASH"
      ? 0
      : Math.max(0, amountTendered - tot);
  const splitRemaining = Math.max(0, tot - splitPaid);
  const effectiveTaxRate = taxRateOverride !== null ? taxRateOverride : taxRate;

  // Tip as percent of subtotal pre-tip
  const sub = subtotal() - discountValue();
  const activeTipPct = sub > 0 ? Math.round((tipAmount / sub) * 100) : 0;

  function handleTipPreset(pct: number) {
    if (activeTipPct === pct) {
      setTipAmount(0);
    } else {
      setTipAmount((sub * pct) / 100);
    }
    setCustomTip("");
  }

  function handleCustomTip(val: string) {
    setCustomTip(val);
    const n = parseFloat(val);
    if (!isNaN(n) && n >= 0) setTipAmount(n);
    else if (val === "") setTipAmount(0);
  }

  function handleSplitInput(method: SplitMethod, val: string) {
    setSplitInput((prev) => ({ ...prev, [method]: val }));
    const n = parseFloat(val);
    if (!isNaN(n) && n > 0) setPaymentLine({ method, amount: n });
    else removePaymentLine(method);
  }

  function appendTendered(value: string) {
    if (splitMode || paymentMethod !== "CASH") return;
    const current = amountTendered ? String(amountTendered) : "";
    const next =
      value === "⌫"
        ? current.slice(0, -1)
        : value === "." && current.includes(".")
          ? current
          : `${current}${value}`;
    setAmountTendered(Number(next) || 0);
  }

  /** Presets ADD to whatever is already in the field (UMAG, observed 2026-09-26: 0 → +500 = 500.00 → +200 = 700.00). */
  function addPreset(amount: number) {
    setAmountTendered((amountTendered || 0) + amount);
  }

  /** БЕЗ СДАЧИ — pay the exact amount due, no change. Passed straight through instead of relying on
   * `setAmountTendered` + a re-render (the state update wouldn't be visible in this same click). */
  function payExact() {
    setAmountTendered(tot);
    void handleCompleteSale(tot);
  }

  /** ЗАПИСАТЬ on the В долг screen — completes the sale on credit against the picked/created debtor. */
  async function recordDebtSale(debtor: Debtor) {
    await handleCompleteSale(undefined, debtor.id);
  }

  async function handleCompleteSale(tenderedOverride?: number, customerIdOverride?: string) {
    if (isEmpty) return;
    setError(null);
    const missingBook = referenceBooks.missing();
    if (missingBook) { setError(`Выберите значение справочника «${missingBook}»`); return; }
    setLoading(true);

    const {
      items: cartItems,
      discountAmount,
      discountType,
      note,
      discountCardCode,
    } = useCartStore.getState();

    try {
      const body: Record<string, unknown> = {
        items: cartItems.map((i) => ({
          productId: i.productId,
          name: i.name,
          price: i.price,
          quantity: i.quantity,
          unit: i.unit ?? "pcs",
          notes: i.notes || undefined,
          discountAmount: i.lineDiscount || 0,
        })),
        taxRate: effectiveTaxRate,
        discountAmount,
        discountType,
        discountCardCode: discountCardCode || undefined,
        tipAmount,
        note: note || undefined,
        customerId: customerIdOverride ?? customerId ?? undefined,
        consultantId: consultantId || undefined,
        loyaltyPointsUsed: loyaltyPointsUsed || 0,
        referenceValues: referenceBooks.payload(),
      };

      const cashTendered = tenderedOverride ?? amountTendered ?? tot;
      if (splitMode && paymentLines.length > 0) {
        body.paymentLines = paymentLines;
      } else {
        body.paymentMethod = paymentMethod;
        if (paymentMethod === "CASH") body.amountTendered = cashTendered || tot;
      }

      // No connection? The sale is kept on the till and uploaded later (see src/lib/offline).
      const submitted = await submitSale(
        body,
        {
          total: tot,
          subtotal: subtotal(),
          discountAmount: discountValue() + loyaltyDiscount,
          taxAmount: taxAmount(effectiveTaxRate),
          tipAmount,
          amountTendered: splitMode ? splitPaid : paymentMethod === "CASH" ? cashTendered || tot : tot,
        },
        t("failed_complete_sale")
      );
      if (!submitted.ok) throw new Error(submitted.error);

      referenceBooks.reset();
      const resp = { sale: submitted.sale };
      const saleId: string = resp.sale?.id ?? "";

      // Cash-drawer kick (if enabled on this device and cash was involved)
      const cashInvolved = splitMode
        ? paymentLines.some((p) => p.method === "CASH")
        : paymentMethod === "CASH";
      if (cashInvolved && getDeviceSettings().openDrawerOnCash) {
        kickCashDrawer().catch(() => {});
      }

      if (onSaleComplete) {
        onSaleComplete(saleId, resp.sale);
      } else {
        onClear();
      }
      if (navigator.onLine && !submitted.queued) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("unknown_error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleHoldOrder() {
    if (isEmpty) return;
    setHoldLoading(true);
    try {
      const res = await fetch("/api/held-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartSnapshot: { items, paymentMethod, amountTendered, discountAmount, discountType },
          label: `Hold ${new Date().toLocaleTimeString()}`,
        }),
      });
      if (res.ok) {
        clearCart();
      }
    } finally {
      setHoldLoading(false);
    }
  }

  // В долг: a genuinely separate full screen in UMAG (not a panel inside the payment window) — НАЗАД goes
  // straight back to the sale screen (onCancel), never back to this payment panel.
  if (!splitMode && paymentMethod === "CREDIT") {
    return (
      <DebtScreen
        saleTotal={tot}
        onBack={() => onCancel?.()}
        onRecord={(debtor) => void recordDebtSale(debtor)}
        recording={loading}
        error={error}
      />
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      {/* UMAG's own payment ribbon: К ОПЛАТЕ / ПОЛУЧЕНО (green) / СДАЧА (red). "Осталось" is a Korgen
          addition, useful for split-tender only, shown as a 4th column just there. */}
      <div className={`grid gap-2 bg-[#f1f1f1] px-4 py-2 text-center ${splitMode ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3"}`}>
        <PaymentStat label="К оплате" value={formatCurrency(tot)} />
        <PaymentStat
          label="Получено"
          value={formatCurrency(splitMode ? splitPaid : amountTendered)}
          className="text-[#1fa45c]"
        />
        {splitMode && (
          <PaymentStat label="Осталось" value={formatCurrency(splitRemaining)} />
        )}
        <PaymentStat label="Сдача" value={formatCurrency(change)} className="text-[#d64545]" />
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          aria-label="Телефон клиента"
          placeholder="+7 (___) ___-__-__"
          className="h-9 rounded-sm border border-slate-300 px-3 text-xs outline-none focus:border-[#19b969]"
        />
        <input
          aria-label="Пользователь"
          placeholder="Пользователь"
          className="h-9 rounded-sm border border-slate-300 px-3 text-xs outline-none focus:border-[#19b969]"
        />
      </div>
      <ReferenceBookFields state={referenceBooks} />
      {/* Hold / Recall row */}
      {holdEnabled && <div className="flex gap-2">
        <button
          onClick={handleHoldOrder}
          disabled={isEmpty || holdLoading}
          className="text-muted-foreground flex flex-1 items-center justify-center gap-1 rounded-sm border border-slate-300 py-2 text-xs font-medium transition-colors hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50"
        >
          <PauseCircle className="h-3.5 w-3.5" />
          {holdLoading ? "..." : t("hold")}
        </button>
        <button
          onClick={onHoldOrders}
          className="text-muted-foreground flex flex-1 items-center justify-center gap-1 rounded-sm border border-slate-300 py-2 text-xs font-medium transition-colors hover:bg-slate-100"
        >
          <ClipboardList className="h-3.5 w-3.5" />
          {t("recall")}
        </button>
      </div>}

      {/* Tip row */}
      {!isEmpty && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">{t("tip")}</span>
            {tipAmount > 0 && (
              <button
                onClick={() => {
                  setTipAmount(0);
                  setCustomTip("");
                }}
                className="text-muted-foreground hover:text-destructive text-xs"
              >
                {t("tip_remove")}
              </button>
            )}
          </div>
          <div className="flex gap-1.5">
            {TIP_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handleTipPreset(p.value)}
                className={
                  activeTipPct === p.value && customTip === ""
                    ? "border-primary bg-primary/10 text-primary flex-1 rounded-md border-2 py-1.5 text-xs font-semibold"
                    : "text-muted-foreground hover:bg-accent flex-1 rounded-md border py-1.5 text-xs font-medium transition-colors"
                }
              >
                {p.label}
              </button>
            ))}
            <input
              type="number"
              min={0}
              step={0.01}
              value={customTip}
              onChange={(e) => handleCustomTip(e.target.value)}
              placeholder={t("custom")}
              className="bg-background focus:ring-ring w-20 rounded-md border px-2 py-1.5 text-center text-xs focus:ring-2 focus:outline-none"
            />
          </div>
        </div>
      )}

      {/* Tax override */}
      {!isEmpty && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-xs font-medium">{t("tax")}</span>
            <div className="flex items-center gap-2">
              <label className="text-muted-foreground flex cursor-pointer items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={taxRateOverride === 0}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setTaxRate(0);
                      setShowTaxEdit(false);
                    } else {
                      setTaxRate(null);
                    }
                  }}
                  className="accent-primary h-3 w-3"
                />
                {t("tax_exempt")}
              </label>
              <button
                onClick={() => setShowTaxEdit((v) => !v)}
                className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors"
              >
                <Percent className="h-3 w-3" />
                {taxRateOverride !== null
                  ? t("tax_custom", { rate: (taxRateOverride * 100).toFixed(0) })
                  : t("tax_default", { rate: (taxRate * 100).toFixed(0) })}
              </button>
              {taxRateOverride !== null && (
                <button
                  onClick={() => {
                    setTaxRate(null);
                    setShowTaxEdit(false);
                  }}
                  className="text-muted-foreground hover:text-destructive"
                  title={t("reset_to_default")}
                >
                  <RotateCcw className="h-3 w-3" />
                </button>
              )}
            </div>
          </div>
          {showTaxEdit && taxRateOverride !== 0 && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={taxRateOverride !== null ? taxRateOverride * 100 : taxRate * 100}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  if (!isNaN(val) && val >= 0 && val <= 100) setTaxRate(val / 100);
                }}
                className="bg-background focus:ring-ring flex-1 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
                placeholder={t("rate_percent")}
              />
              <span className="text-muted-foreground text-xs">%</span>
            </div>
          )}
        </div>
      )}

      {/* Loyalty Points */}
      {!isEmpty && loyaltyInfo?.enabled && loyaltyInfo.points > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1 text-xs font-medium">
              <Star className="h-3 w-3 text-yellow-500" /> {t("loyalty_points")}
            </span>
            <span className="text-xs font-semibold">
              {t("points_available", { points: loyaltyInfo.points })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={loyaltyInfo.points}
              step={loyaltyInfo.redeemValue}
              value={loyaltyPointsUsed || ""}
              onChange={(e) => setLoyaltyPointsUsed(parseInt(e.target.value) || 0)}
              placeholder={t("points_to_redeem")}
              className="bg-background focus:ring-ring flex-1 rounded-md border px-2 py-1.5 text-xs focus:ring-2 focus:outline-none"
            />
            {loyaltyPointsUsed > 0 && (
              <span className="text-xs font-medium text-green-600">
                -{formatCurrency(loyaltyDiscount)}
              </span>
            )}
          </div>
          <p className="text-muted-foreground text-[10px]">
            {t("loyalty_hint", {
              earn: loyaltyInfo.earnRate,
              redeem: loyaltyInfo.redeemValue,
              unit: formatCurrency(1),
            })}
          </p>
        </div>
      )}

      {/* Payment method / split toggle */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs font-medium">{t("payment")}</span>
          <button
            onClick={() => {
              if (splitMode) {
                clearPaymentLines();
                setSplitInput({ CASH: "", CARD: "", OTHER: "" });
              } else {
                // seed the primary method with the remaining total
                setPaymentLine({ method: paymentMethod, amount: tot });
                setSplitInput((prev) => ({ ...prev, [paymentMethod]: String(tot.toFixed(2)) }));
              }
            }}
            className="text-muted-foreground hover:text-primary flex items-center gap-1 text-xs transition-colors"
          >
            <SplitSquareHorizontal className="h-3.5 w-3.5" />
            {splitMode ? t("single") : t("split")}
          </button>
        </div>

        {splitMode ? (
          /* ---- Split tender: UMAG shows exactly 2 stacked fields (cash on top, selected; card
             below, with a card icon) — Korgen's 3rd tender (OTHER) is kept, styled the same way. ---- */
          <div className="space-y-2">
            {availablePaymentMethods.map((method) => {
              const line = paymentLines.find((p) => p.method === method);
              return (
                <div key={method} className="space-y-1">
                  <label className="text-xs font-medium text-[#218f68]">{t(METHOD_KEY[method])}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      autoFocus={method === "CASH"}
                      value={splitInput[method]}
                      onChange={(e) => handleSplitInput(method, e.target.value)}
                      placeholder="0.00"
                      className={`flex h-11 flex-1 rounded-sm border-2 bg-white px-3 text-lg outline-none focus:ring-2 focus:ring-[#33b8bd] ${
                        line ? "border-[#33b8bd]" : "border-[#74cdd1]"
                      }`}
                    />
                    {line && (
                      <button
                        onClick={() => {
                          removePaymentLine(method);
                          setSplitInput((prev) => ({ ...prev, [method]: "" }));
                        }}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            <div className="flex justify-between pt-1 text-xs">
              <span className="text-muted-foreground">
                {t("remaining")}:{" "}
                <span
                  className={
                    splitRemaining > 0
                      ? "text-destructive font-semibold"
                      : "font-semibold text-green-600"
                  }
                >
                  {formatCurrency(splitRemaining)}
                </span>
              </span>
              {change > 0 && (
                <span className="font-medium text-green-600">
                  {t("change")}: {formatCurrency(change)}
                </span>
              )}
            </div>
          </div>
        ) : (
          /* ---- Single method ---- */
          <>
            <div className="flex gap-0 rounded-sm border border-[#91d7bf] p-0.5">
              {(creditSaleEnabled
                ? [...availablePaymentMethods, "CREDIT" as const]
                : availablePaymentMethods
              ).map((method) => (
                <button
                  key={method}
                  onClick={() => setPaymentMethod(method)}
                  className={
                    paymentMethod === method
                      ? "flex-1 rounded-sm bg-[#24bb69] py-2 text-xs font-semibold text-white"
                      : "flex-1 rounded-sm py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-emerald-50"
                  }
                >
                  {t(METHOD_KEY[method])}
                </button>
              ))}
            </div>

            {paymentMethod === "CASH" && (
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#218f68]">Банковский счет</label>
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  value={amountTendered || ""}
                  onChange={(e) => setAmountTendered(parseFloat(e.target.value) || 0)}
                  placeholder={formatCurrency(tot)}
                  className="placeholder:text-muted-foreground flex h-11 w-full rounded-sm border-2 border-[#74cdd1] bg-white px-3 py-2 text-lg outline-none focus:ring-2 focus:ring-[#33b8bd]"
                />
                <div className="grid gap-2 sm:grid-cols-[17rem_1fr]">
                  <div>
                    <div className="grid grid-cols-3 gap-px overflow-hidden rounded-sm border border-slate-200 bg-slate-200">
                      {["7", "8", "9", "4", "5", "6", "1", "2", "3", "⌫", "0", "."].map((key) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => appendTendered(key)}
                          className="flex h-11 items-center justify-center bg-white text-sm text-slate-600 hover:bg-emerald-50"
                        >
                          {key === "⌫" ? <Delete className="h-4 w-4" /> : key}
                        </button>
                      ))}
                    </div>
                    {/* ОЧИСТИТЬ — zeroes the field (and ПОЛУЧЕНО with it), separate from ⌫ (deletes one digit). */}
                    <button
                      type="button"
                      onClick={() => setAmountTendered(0)}
                      className="mt-1 w-full rounded-sm border border-slate-300 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100"
                    >
                      ОЧИСТИТЬ
                    </button>
                  </div>
                  <div className="grid grid-cols-3 gap-1">
                    {[200, 500, 1000, 2000, 5000, 10000].map((amount) => (
                      <button
                        key={amount}
                        type="button"
                        onClick={() => addPreset(amount)}
                        className="rounded-sm bg-slate-100 px-2 text-[10px] font-medium text-slate-600 hover:bg-emerald-50"
                      >
                        +{amount.toLocaleString("ru-RU")}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="col-span-3 rounded-sm border border-[#8bd1d9] py-2 text-[10px] font-medium text-[#238990] hover:bg-cyan-50"
                    >
                      Каспи QR
                    </button>
                    {/* ОПЛАТА С ОФД — fiscal (WebKassa) payment; pale/inactive until Adım 4. */}
                    <button
                      type="button"
                      disabled
                      title="Фискализация ещё не подключена"
                      className="col-span-3 rounded-sm border border-slate-200 py-2 text-[10px] font-medium text-slate-300 cursor-not-allowed"
                    >
                      ОПЛАТА С ОФД
                    </button>
                  </div>
                </div>
                {change > 0 && (
                  <p className="text-sm font-medium text-green-600">
                    {t("change")}: {formatCurrency(change)}
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Totals breakdown */}
      {!isEmpty && (
        <div className="space-y-1 rounded-sm bg-slate-100 px-3 py-2 text-xs">
          <div className="text-muted-foreground flex justify-between">
            <span>{t("subtotal")}</span>
            <span>{formatCurrency(subtotal())}</span>
          </div>
          {discountValue() > 0 && (
            <div className="text-muted-foreground flex justify-between">
              <span>{t("discount")}</span>
              <span>−{formatCurrency(discountValue())}</span>
            </div>
          )}
          {sub > 0 && (
            <div className="text-muted-foreground relative flex justify-between">
              <button
                onClick={() => setShowTaxEdit(!showTaxEdit)}
                className="hover:text-foreground group flex items-center gap-1.5 transition-colors"
                title={t("tax_rate_override")}
              >
                <span>{t("tax")}</span>
                {taxRateOverride !== null ? (
                  <span className="rounded bg-blue-100 px-1 text-[10px] font-medium text-blue-700 dark:bg-blue-900 dark:text-blue-100">
                    {taxRateOverride === 0 ? t("exempt") : `${(taxRateOverride * 100).toFixed(2)}%`}
                  </span>
                ) : (
                  <span className="flex items-center gap-0.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100">
                    <Percent className="h-3 w-3" />
                    {(taxRate * 100).toFixed(taxRate % 1 === 0 ? 0 : 1)}%
                  </span>
                )}
              </button>
              <span>{formatCurrency(taxAmount(taxRate))}</span>

              {showTaxEdit && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowTaxEdit(false)} />
                  <div className="border-border bg-popover ring-border/10 animate-in fade-in zoom-in-95 absolute bottom-full left-0 z-50 mb-2 w-52 rounded-lg border p-3 shadow-xl ring-1">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-foreground text-xs font-semibold">
                          {t("tax_rate_override")}
                        </p>
                        <button
                          onClick={() => setShowTaxEdit(false)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <input
                            type="number"
                            placeholder={(taxRate * 100).toString()}
                            className="bg-background w-full rounded-md border px-2 py-1.5 pr-6 text-xs"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const val = parseFloat(e.currentTarget.value);
                                if (!isNaN(val)) {
                                  setTaxRate(val / 100);
                                  setShowTaxEdit(false);
                                }
                              }
                            }}
                          />
                          <span className="text-muted-foreground absolute top-1.5 right-2 text-xs">
                            %
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            const input =
                              e.currentTarget.previousElementSibling?.querySelector("input");
                            if (input) {
                              const val = parseFloat(input.value);
                              if (!isNaN(val)) {
                                setTaxRate(val / 100);
                                setShowTaxEdit(false);
                              }
                            }
                          }}
                          className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs"
                        >
                          {t("set")}
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={() => {
                            setTaxRate(0);
                            setShowTaxEdit(false);
                          }}
                          className={`flex items-center justify-center gap-1 rounded border py-1.5 text-[10px] transition-colors ${
                            taxRateOverride === 0
                              ? "bg-destructive/10 text-destructive border-destructive/20"
                              : "bg-muted/50 hover:bg-destructive/10 hover:text-destructive"
                          }`}
                        >
                          <X className="h-3 w-3" /> {t("exempt")}
                        </button>
                        <button
                          onClick={() => {
                            setTaxRate(null);
                            setShowTaxEdit(false);
                          }}
                          disabled={taxRateOverride === null}
                          className="bg-muted/50 hover:text-primary flex items-center justify-center gap-1 rounded border py-1.5 text-[10px] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <RotateCcw className="h-3 w-3" /> {t("reset")}
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
          {tipAmount > 0 && (
            <div className="text-muted-foreground flex justify-between">
              <span>{t("tip")}</span>
              <span>{formatCurrency(tipAmount)}</span>
            </div>
          )}
          {loyaltyDiscount > 0 && (
            <div className="text-muted-foreground flex justify-between">
              <span>{t("loyalty_points")}</span>
              <span>−{formatCurrency(loyaltyDiscount)}</span>
            </div>
          )}
          <div className="text-foreground mt-1 flex justify-between border-t pt-1 font-semibold">
            <span>{t("total")}</span>
            <span>{formatCurrency(tot)}</span>
          </div>
        </div>
      )}

      {error && <p className="text-destructive text-xs">{error}</p>}
      {checkoutBlocked && (
        <div
          role="alert"
          className="rounded-lg border-2 border-amber-400 bg-amber-50 px-4 py-3 text-center text-amber-950 shadow-sm dark:border-amber-500 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="text-base font-extrabold">Сначала откройте смену</p>
          <p className="mt-1 text-sm font-medium">{t("shift_required")}</p>
        </div>
      )}

      {/* UMAG's own 3 bottom buttons: ОТМЕНА / БЕЗ СДАЧИ / ОПЛАТА. */}
      <div className="flex gap-2">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-sm bg-[#d64545] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-[#c23a3a]"
          >
            ОТМЕНА
          </button>
        )}
        {!splitMode && paymentMethod === "CASH" && (
          <button
            type="button"
            onClick={payExact}
            disabled={isEmpty || loading || checkoutBlocked}
            className="flex-1 rounded-sm bg-slate-200 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-300 disabled:pointer-events-none disabled:opacity-50"
          >
            БЕЗ СДАЧИ
          </button>
        )}
        <button
          data-charge-btn
          type="button"
          onClick={() => void handleCompleteSale()}
          disabled={isEmpty || loading || checkoutBlocked || (splitMode && splitRemaining > 0.005)}
          className="flex-1 rounded-sm bg-[#24bb69] py-3 text-sm font-bold text-white transition-colors hover:bg-[#1fa45c] disabled:pointer-events-none disabled:opacity-50"
        >
          {loading ? t("processing") : `${t("checkout")} ${formatCurrency(tot)}`}
        </button>
      </div>

      {/* Void / Clear — Korgen addition (empties the cart), kept below UMAG's own buttons. */}
      {!isEmpty && (
        <button
          onClick={onClear}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive w-full rounded-md border py-2 text-xs transition-colors"
        >
          {t("void")}
        </button>
      )}
    </div>
  );
}

function PaymentStat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium text-slate-500">{label}</p>
      <p className={`truncate text-base leading-tight font-bold text-slate-700 ${className ?? ""}`}>{value}</p>
    </div>
  );
}
