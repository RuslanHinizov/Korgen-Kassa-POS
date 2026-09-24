"use client";

import { useState, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCartStore } from "@/store/cart";
import { evaluatePromotions, type PromotionRule } from "@/lib/promotions";
import { formatCurrency, cn } from "@/lib/utils";
import { unitLabel } from "@/lib/units";
import {
  ClipboardList,
  Grip,
  MinusCircle,
  PlusCircle,
  Settings2,
  ShoppingBag,
  Trash2,
  User,
  X,
  Zap,
} from "lucide-react";
import { KioskSearchBar, QuickProductsDialog, type ProductResult } from "./product-search";
import { PaymentModal } from "./payment-modal";
import { CustomerCapture, type CustomerSummary } from "./customer-capture";
import { HeldOrdersModal } from "./held-orders-modal";
import { VoidItemModal } from "./void-item-modal";
import { CustomItemModal } from "./custom-item-modal";
import { CreateProductModal } from "./create-product-modal";
import { LabelPickerModal, ProductLabelModal, type LabelProduct } from "./product-label";
import { EditItemModal } from "./edit-item-modal";
import { PriceCheckModal } from "./price-check-modal";
import { GlobalSearchModal } from "./global-search-modal";
import { KioskTopBar } from "./kiosk-top-bar";
import { POSSalesPanel } from "./pos-sales-modal";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { NumericKeypad } from "@/components/ui/numeric-keypad";
import { ReceiptModal } from "@/components/receipt/receipt-modal";
import { KeyboardShortcutsModal } from "./keyboard-shortcuts-modal";
import { usePosKeyboardShortcuts } from "@/hooks/use-pos-keyboard-shortcuts";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";
import type { ReceiptData, ReceiptSettings } from "@/components/receipt/receipt";
import { canUsePosAction, type PosAccessRole } from "@/lib/pos-permissions";
import { toast } from "sonner";

const DEFAULT_TAX_RATE = 0; // overridden via business settings

const DEFAULT_RECEIPT_SETTINGS: ReceiptSettings = {
  name: "My Shop",
  logoUrl: null,
  currency: "$",
  currencyDecimals: 2,
  taxName: "Tax",
  receiptFooter: "Thank you for your business!",
};

type KioskPermissions = {
  posUniversalProduct: boolean;
  posCreateProduct: boolean;
  posEditProductAtPos: boolean;
  posHoldOrder: boolean;
  posDiscount: boolean;
  posCashInOut: boolean;
  posCardPayment: boolean;
  posChangePriceAtPos: boolean;
  posBanPriceDecrease: boolean;
  wholesaleAtPos: boolean;
  posPriceCheck: boolean;
  posGlobalSearch: boolean;
  posCollapseWindow: boolean;
  posInstantSync: boolean;
  posAccessReturn: PosAccessRole;
  posAccessReturnNoReceipt: PosAccessRole;
  posAccessDeleteItem: PosAccessRole;
  posAccessDecreaseQty: PosAccessRole;
};

const DEFAULT_KIOSK_PERMISSIONS: KioskPermissions = {
  posUniversalProduct: true, posCreateProduct: true, posEditProductAtPos: true, posHoldOrder: true,
  posDiscount: true, posCashInOut: true, posCardPayment: true, posChangePriceAtPos: true, posBanPriceDecrease: false,
  wholesaleAtPos: false, posPriceCheck: false, posGlobalSearch: false, posCollapseWindow: true, posInstantSync: true,
  posAccessReturn: "ALL", posAccessReturnNoReceipt: "ALL", posAccessDeleteItem: "ALL", posAccessDecreaseQty: "ALL",
};

export function POSScreen({ cashierName, cashierRole }: { cashierName: string; cashierRole: string }) {
  const t = useTranslations("pos");
  const [taxRate, setTaxRate] = useState(DEFAULT_TAX_RATE);
  const [showHeldOrders, setShowHeldOrders] = useState(false);
  const [holdLoading, setHoldLoading] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [voidTargetIds, setVoidTargetIds] = useState<string[] | null>(null);
  const [keypad, setKeypad] = useState<{ open: boolean; itemId: string; value: string }>({
    open: false,
    itemId: "",
    value: "1",
  });
  const [receiptData, setReceiptData] = useState<ReceiptData | null>(null);
  const [customer, setCustomer] = useState<CustomerSummary | null>(null);
  const [consultants, setConsultants] = useState<{ id: string; name: string; photoUrl: string | null }[]>([]);
  const [consultantId, setConsultantId] = useState("");

  useEffect(() => {
    fetch("/api/consultants?activeOnly=1")
      .then((r) => (r.ok ? r.json() : { consultants: [] }))
      .then((d) => setConsultants(d.consultants ?? []))
      .catch(() => {});
  }, []);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const [requireShift, setRequireShift] = useState(false);
  const [creditSaleEnabled, setCreditSaleEnabled] = useState(true);
  const [showSalesHistory, setShowSalesHistory] = useState(false);
  const [permissions, setPermissions] = useState<KioskPermissions>(DEFAULT_KIOSK_PERMISSIONS);
  const [hasOpenShift, setHasOpenShift] = useState(true);
  const [shiftRefreshKey, setShiftRefreshKey] = useState(0);
  const [settingsTick, setSettingsTick] = useState(0);
  const [priceCheckOpen, setPriceCheckOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [receiptSettings, setReceiptSettings] = useState<ReceiptSettings>(DEFAULT_RECEIPT_SETTINGS);

  // Load the configured business tax rate (stored as a decimal, e.g. 0.12) and receipt branding.
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => {
        const rate = Number(d?.taxRate);
        if (!Number.isNaN(rate)) setTaxRate(rate);
        setRequireShift(Boolean(d?.requireOpenShift));
        setCreditSaleEnabled(d?.posCreditSale !== false);
        setShowSalesHistory(Boolean(d?.posShowSalesHistory));
        setPermissions({
          posUniversalProduct: d?.posUniversalProduct !== false,
          posCreateProduct: d?.posCreateProduct !== false,
          posEditProductAtPos: d?.posEditProductAtPos !== false,
          posHoldOrder: d?.posHoldOrder !== false,
          posDiscount: d?.posDiscount !== false,
          posCashInOut: d?.posCashInOut !== false,
          posCardPayment: d?.posCardPayment !== false,
          posChangePriceAtPos: d?.posChangePriceAtPos !== false,
          posBanPriceDecrease: d?.posBanPriceDecrease === true,
          wholesaleAtPos: d?.posWholesaleAtPos === true && d?.allowWholesale === true,
          posPriceCheck: d?.posPriceCheck === true,
          posGlobalSearch: d?.posGlobalSearch === true,
          posCollapseWindow: d?.posCollapseWindow !== false,
          posInstantSync: d?.posInstantSync !== false,
          posAccessReturn: d?.posAccessReturn ?? "ALL",
          posAccessReturnNoReceipt: d?.posAccessReturnNoReceipt ?? "ALL",
          posAccessDeleteItem: d?.posAccessDeleteItem ?? "ALL",
          posAccessDecreaseQty: d?.posAccessDecreaseQty ?? "ALL",
        });
        setRounding(d?.posRoundingWeightItems ?? "NONE", d?.posRoundingDiscount ?? "NONE");
        setReceiptSettings({ ...DEFAULT_RECEIPT_SETTINGS, ...d });
      })
      .catch(() => {});
  }, [settingsTick]);

  // "Мгновенная синхронизация": re-read settings/permissions periodically and when the tab regains focus.
  useEffect(() => {
    if (!permissions.posInstantSync) return;
    const bump = () => setSettingsTick((n) => n + 1);
    const id = setInterval(bump, 30000);
    const onVisible = () => { if (document.visibilityState === "visible") bump(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVisible); };
  }, [permissions.posInstantSync]);

  // Track whether the cashier has an open shift.
  useEffect(() => {
    fetch("/api/shifts?scope=current")
      .then((r) => r.json())
      .then((d) => setHasOpenShift(Boolean(d?.shift)))
      .catch(() => {});
  }, [shiftRefreshKey]);

  const focusSearch = useCallback(() => {
    const el = document.getElementById("pos-search-input") as HTMLInputElement | null;
    el?.focus();
    el?.select();
  }, []);

  const [paymentOpen, setPaymentOpen] = useState(false);
  const [salesPanel, setSalesPanel] = useState<"returns" | "history" | null>(null);

  usePosKeyboardShortcuts({
    onFocusSearch: focusSearch,
    onOpenPayment: () => setPaymentOpen(true),
    onHoldOrders: () => setShowHeldOrders(true),
    onShowHelp: () => setShowShortcuts((v) => !v),
    onEscape: () => {
      setShowShortcuts(false);
      setShowHeldOrders(false);
      setPaymentOpen(false);
      setCustomOpen(false);
      setEditOpen(false);
      setQuickOpen(false);
    },
  });

  const {
    items,
    removeItems,
    updateQuantity,
    updateItemNotes,
    updateItemPrice,
    updateLineDiscount,
    lineGrossOf,
    setRounding,
    addItem,
    addCustomItem,
    subtotal,
    discountValue,
    taxAmount,
    total,
    clearCart,
    setAutoDiscounts,
    discountCardPercent,
    setDiscountCard,
  } = useCartStore();

  // Load active promotions once
  const [promos, setPromos] = useState<PromotionRule[]>([]);
  useEffect(() => {
    fetch("/api/promotions/active")
      .then((r) => r.json())
      .then((d) => setPromos(d.promotions ?? []))
      .catch(() => {});
  }, []);

  // Re-evaluate promotions whenever the cart / card changes
  const cartSig = items.map((i) => `${i.productId}:${i.quantity}`).join("|");
  useEffect(() => {
    if (items.length === 0) {
      setAutoDiscounts([], 0);
      return;
    }
    const lines = items.map((i) => ({
      productId: i.productId ?? "",
      categoryId: i.categoryId ?? null,
      price: i.price,
      quantity: i.quantity,
    }));
    const { discounts, totalDiscount } = evaluatePromotions(lines, promos, { discountCardPercent });
    setAutoDiscounts(discounts, totalDiscount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartSig, promos, discountCardPercent]);

  const [cardInput, setCardInput] = useState("");
  const [cardMsg, setCardMsg] = useState("");
  async function applyCard() {
    const code = cardInput.trim();
    if (!code) {
      setDiscountCard("", 0);
      setCardMsg("");
      return;
    }
    try {
      const r = await fetch(`/api/discount-cards?code=${encodeURIComponent(code)}`);
      if (!r.ok) {
        setCardMsg(t("card_not_found"));
        setDiscountCard("", 0);
        return;
      }
      const { card } = await r.json();
      setDiscountCard(card.code, card.percent);
      setCardMsg(`${card.holderName ? card.holderName + " · " : ""}−${card.percent}%`);
    } catch {
      setCardMsg(t("card_not_found"));
    }
  }

  const sub = subtotal();
  const disc = discountValue();
  const tax = taxAmount(taxRate);
  const tot = total(taxRate);

  // Selection / active row
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const activeItem = items.find((i) => i.id === activeItemId) ?? null;
  const activeRole = cashierRole;
  const canReturn = canUsePosAction(permissions.posAccessReturn, activeRole);
  const canReturnWithoutReceipt = canUsePosAction(permissions.posAccessReturnNoReceipt, activeRole);
  const canDeleteItem = canUsePosAction(permissions.posAccessDeleteItem, activeRole);
  const canDecreaseQty = canUsePosAction(permissions.posAccessDecreaseQty, activeRole);

  const [customOpen, setCustomOpen] = useState(false);
  const [createProduct, setCreateProduct] = useState<{ barcode: string } | null>(null);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [newLabel, setNewLabel] = useState<LabelProduct | null>(null);

  // The search bar offers "Создать товар" when a scanned barcode is unknown.
  useEffect(() => {
    const open = (e: Event) => {
      if (!permissions.posCreateProduct) { toast.error("Создание товаров на кассе отключено администратором"); return; }
      setCreateProduct({ barcode: String((e as CustomEvent<{ barcode?: string }>).detail?.barcode ?? "") });
    };
    window.addEventListener("pos-create-product", open);
    return () => window.removeEventListener("pos-create-product", open);
  }, [permissions.posCreateProduct]);
  const [editOpen, setEditOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const extra = useAnchoredPopover();

  function toggleSelectAll() {
    setSelected((prev) =>
      prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))
    );
  }
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setActiveItemId(id);
  }
  function selectRow(id: string) {
    setActiveItemId(id);
    const item = items.find((candidate) => candidate.id === id);
    if (!item) return;
    // Touching a cart line is the quickest quantity workflow on a cash monitor.
    // The keypad adapts to the product unit below (whole pieces vs. kg/litre/metre).
    setKeypad({ open: true, itemId: id, value: String(item.quantity) });
  }

  async function holdCurrentOrder() {
    if (!permissions.posHoldOrder || holdLoading) return;
    if (items.length === 0) {
      setShowHeldOrders(true);
      return;
    }
    const state = useCartStore.getState();
    setHoldLoading(true);
    try {
      const response = await fetch("/api/held-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cartSnapshot: {
            items: state.items,
            paymentMethod: state.paymentMethod,
            amountTendered: state.amountTendered,
            discountAmount: state.discountAmount,
            discountType: state.discountType,
          },
          label: `Отложено ${new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`,
        }),
      });
      if (!response.ok) throw new Error();
      clearCart();
      setSelected(new Set());
      setActiveItemId(null);
      toast.success("Чек отложен");
      setShowHeldOrders(true);
    } catch {
      toast.error("Не удалось отложить чек");
    } finally {
      setHoldLoading(false);
    }
  }

  if (!isClient) {
    return (
      <div className="bg-background flex h-full flex-col items-center justify-center space-y-4 rounded-lg border shadow-sm">
        <div className="bg-muted flex h-12 w-12 animate-pulse items-center justify-center rounded-full" />
        <div className="text-muted-foreground animate-pulse text-sm font-medium">
          {t("initializing")}
        </div>
      </div>
    );
  }

  function handleSaleComplete(saleId: string, sale?: unknown) {
    // The server's created-sale record is the source of truth for totals: it applies
    // discounts (e.g. loyalty-point redemption) that this component's own cart-derived
    // sub/disc/tax/tot don't know about, since those are computed only in PaymentPanel.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const s = (sale ?? null) as any;
    const saleTotal = s ? Number(s.total) : tot;
    const saleAmountTendered = s
      ? Number(s.amountTendered ?? 0)
      : (useCartStore.getState().amountTendered ?? 0);
    const data: ReceiptData = {
      saleId,
      documentNo: s ? Number(s.documentNo) : undefined,
      customerName: customer?.name || undefined,
      items: items.map((i) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        total: lineGrossOf(i) - i.lineDiscount,
        unit: i.unit,
        notes: i.notes || undefined,
      })),
      subtotal: s ? Number(s.subtotal) : sub,
      discountAmount: s ? Number(s.discountAmount) : disc,
      taxAmount: s ? Number(s.taxAmount) : tax,
      tipAmount: s
        ? Number(s.tipAmount) > 0
          ? Number(s.tipAmount)
          : undefined
        : useCartStore.getState().tipAmount > 0
          ? useCartStore.getState().tipAmount
          : undefined,
      total: saleTotal,
      paymentMethod: useCartStore.getState().paymentMethod,
      paymentLines:
        useCartStore.getState().paymentLines.length > 0
          ? useCartStore.getState().paymentLines
          : undefined,
      amountTendered: saleAmountTendered,
      changeDue: Math.max(0, saleAmountTendered - saleTotal),
      createdAt: new Date(),
    };
    setReceiptData(data);
    clearCart();
    setCustomer(null);
    setConsultantId("");
    setSelected(new Set());
    setActiveItemId(null);
    setPaymentOpen(false);
  }

  function logCancelledItem(
    item: { productId: string | null; name: string },
    beforeQty: number,
    afterQty: number | null,
    reason?: string,
    action: "DELETE" | "DECREASE" = "DELETE"
  ) {
    if (!item.productId) return;
    fetch("/api/pos/cancelled-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: item.productId,
        productName: item.name,
        beforeQty,
        afterQty,
        reason: reason || undefined,
        action,
      }),
    }).catch(() => {});
  }

  function handleVoidConfirm(reason?: string) {
    if (!voidTargetIds || !canDeleteItem) return;
    for (const id of voidTargetIds) {
      const target = items.find((i) => i.id === id);
      if (target) logCancelledItem(target, target.quantity, null, reason);
    }
    removeItems(voidTargetIds);
    setSelected(new Set());
    if (activeItemId && voidTargetIds.includes(activeItemId)) setActiveItemId(null);
    setVoidTargetIds(null);
  }

  function addProductToCart(product: ProductResult) {
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      lowStockThreshold: product.lowStockThreshold,
      unit: product.unit ?? "pcs",
      categoryId: product.categoryId ?? null,
    });
  }

  function adjustActiveQty(delta: number) {
    if (!activeItem) return;
    if (delta < 0 && !canDecreaseQty) return;
    const step = activeItem.unit && activeItem.unit !== "pcs" ? 0.1 : 1;
    const next = activeItem.quantity + delta * step;
    if (next <= 0) {
      if (!canDeleteItem) return;
      logCancelledItem(activeItem, activeItem.quantity, null, undefined, "DELETE");
      removeItems([activeItem.id]);
      setActiveItemId(null);
      return;
    }
    if (delta < 0) logCancelledItem(activeItem, activeItem.quantity, next, undefined, "DECREASE");
    updateQuantity(activeItem.id, next);
  }

  const voidTargetLabel = voidTargetIds
    ? voidTargetIds.length === 1
      ? (items.find((i) => i.id === voidTargetIds[0])?.name ?? "")
      : `${voidTargetIds.length} товаров`
    : "";

  return (
    <div className="flex h-full min-h-0 flex-col bg-white text-[#172b1d]">
      <KioskTopBar
        cashierName={cashierName}
        showSalesHistory={showSalesHistory}
          canReturn={canReturn || canReturnWithoutReceipt}
        cashMovementEnabled={permissions.posCashInOut}
        onShowShortcuts={() => setShowShortcuts(true)}
        onShiftChange={() => setShiftRefreshKey((k) => k + 1)}
        onShowReturns={() => canReturn && setSalesPanel("returns")}
        onShowSalesHistory={() => setSalesPanel("history")}
        activeTab={salesPanel ?? "sales"}
        onShowSales={() => setSalesPanel(null)}
        hasOpenShift={hasOpenShift}
      />

      <div className={salesPanel ? "hidden" : "contents"}>

      <div className="shrink-0 border-b border-slate-200 px-3 py-1.5 text-lg font-medium">
        Номер чека: <span className="tabular-nums">новый</span>
      </div>

      {/* Search / sale parameters row */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-slate-300 px-3 py-2">
        <KioskSearchBar />
        <select
          aria-label="Производитель"
          defaultValue=""
          className="h-9 min-w-36 rounded-md border-2 border-[#15ad68] bg-white px-3 text-sm text-slate-600 outline-none"
        >
          <option value="">Производитель</option>
        </select>
        <select
          aria-label="Заказ"
          defaultValue=""
          className="h-9 min-w-32 rounded-md border-2 border-[#15ad68] bg-white px-3 text-sm text-slate-600 outline-none"
        >
          <option value="">Заказ</option>
        </select>
        <select
          aria-label="Доставка"
          defaultValue=""
          className="h-9 min-w-28 rounded-md border-2 border-[#15ad68] bg-white px-3 text-sm text-slate-600 outline-none"
        >
          <option value="">Доставка</option>
        </select>
        <div className="text-muted-foreground ml-auto flex items-center gap-2 text-sm">
          {customer ? (
            <span className="rounded-md border px-2 py-1.5 text-xs">{customer.name}</span>
          ) : null}
          {consultantId ? (
            <span className="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs">
              {consultants.find((c) => c.id === consultantId)?.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={consultants.find((c) => c.id === consultantId)!.photoUrl!}
                  alt=""
                  className="h-5 w-5 rounded-full object-cover"
                />
              ) : (
                <User className="text-muted-foreground h-4 w-4" />
              )}
              {consultants.find((c) => c.id === consultantId)?.name}
            </span>
          ) : (
            <button
              type="button"
              ref={extra.anchorRef}
              onClick={extra.toggle}
              className="h-9 min-w-52 rounded-md border-2 border-[#15ad68] bg-white px-3 text-xs text-slate-600 hover:bg-emerald-50"
            >
              Не выбран консультант
            </button>
          )}
        </div>
      </div>

      {/* Cart table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-[#e4f5f1] text-xs font-semibold tracking-wide text-[#263b38] uppercase">
            <tr>
              <th className="w-10 px-3 py-2">
                <input
                  type="checkbox"
                  checked={items.length > 0 && selected.size === items.length}
                  onChange={toggleSelectAll}
                />
              </th>
              <th className="px-2 py-2 text-left">№</th>
              <th className="px-3 py-2 text-left">Наименование</th>
              <th className="px-3 py-2 text-right">Цена</th>
              <th className="px-3 py-2 text-right">Количество</th>
              <th className="px-3 py-2 text-right">Скидка</th>
              <th className="px-3 py-2 text-right">Сумма</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-32 text-center text-lg text-slate-500">
                  Список пуст
                </td>
              </tr>
            ) : (
              items.map((item, idx) => (
                <tr
                  key={item.id}
                  onClick={() => selectRow(item.id)}
                  className={cn(
                    "hover:bg-muted/40 cursor-pointer",
                    activeItemId === item.id && "bg-primary/10"
                  )}
                >
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(item.id)}
                      onChange={() => toggleSelected(item.id)}
                    />
                  </td>
                  <td className="text-muted-foreground px-2 py-2">{idx + 1}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{item.name}</span>
                    {item.unit && item.unit !== "pcs" && (
                      <span className="ml-2 rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-800 uppercase">{unitLabel(item.unit, true)}</span>
                    )}
                    {item.stock <= 0 ? (
                      <span className="ml-2 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">НЕТ В НАЛИЧИИ</span>
                    ) : item.lowStockThreshold !== undefined && item.stock <= item.lowStockThreshold ? (
                      <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">ОСТАЛОСЬ {item.stock} {unitLabel(item.unit, true)}</span>
                    ) : null}
                    {item.notes && (
                      <span className="text-muted-foreground ml-1.5 text-xs">({item.notes})</span>
                    )}
                    {item.productId === null && (
                      <span className="bg-muted text-muted-foreground ml-1.5 rounded px-1 text-[10px]">
                        своб.
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {formatCurrency(item.price)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.quantity}
                    {item.unit && item.unit !== "pcs" ? ` ${unitLabel(item.unit, true)}` : ""}
                  </td>
                  <td className="text-muted-foreground px-3 py-2 text-right tabular-nums">
                    {item.lineDiscount > 0 ? `−${formatCurrency(item.lineDiscount)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {formatCurrency(lineGrossOf(item) - item.lineDiscount)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom bar */}
      {requireShift && !hasOpenShift && (
        <div className="flex shrink-0 items-center justify-center gap-3 border-t-4 border-amber-500 bg-amber-50 px-5 py-4 text-center text-amber-950">
          <span className="text-2xl">⚠</span>
          <div><p className="text-lg font-bold">Сначала откройте смену</p><p className="text-sm">Откройте вкладку «Смена», затем можно будет принять оплату.</p></div>
        </div>
      )}
      <div className="flex shrink-0 flex-col gap-3 border-t border-slate-700 bg-[#383838] p-4 sm:flex-row sm:items-stretch">
        <div className="flex min-h-44 shrink-0 flex-col justify-center gap-3 rounded-lg bg-white px-7 py-5 text-[#14231b] shadow-sm sm:w-[24rem]">
          <Row label="ИТОГО" value={formatCurrency(tot)} bold />
          <Row label="ПОЛУЧЕНО" value={formatCurrency(0)} />
          <Row label="СДАЧА" value={formatCurrency(0)} />
          {disc > 0 && <Row label="Скидка" value={`−${formatCurrency(disc)}`} />}
          {tax > 0 && <Row label={t("tax")} value={formatCurrency(tax)} />}
        </div>

        <div className="ml-auto grid w-full max-w-[28rem] grid-cols-3 gap-1.5 self-center">
          <BottomButton icon={Zap} label="Быстрые товары" onClick={() => setQuickOpen(true)} />
          <BottomButton
            icon={Settings2}
            label="Изменить товар"
            onClick={() => setEditOpen(true)}
            disabled={!activeItem || !permissions.posEditProductAtPos}
          />
          <BottomButton
            icon={PlusCircle}
            label="+"
            onClick={() => adjustActiveQty(1)}
            disabled={!activeItem}
          />
          <BottomButton
            icon={ClipboardList}
            label={holdLoading ? "…" : "Отложить"}
            onClick={() => void holdCurrentOrder()}
            disabled={!permissions.posHoldOrder || holdLoading}
          />
          <BottomButton icon={Grip} label="Доп. функции" onClick={extra.toggle} />
          <BottomButton
            icon={MinusCircle}
            label="−"
            onClick={() => adjustActiveQty(-1)}
            disabled={!activeItem || !canDecreaseQty}
          />
          <BottomButton
            icon={ShoppingBag}
            label="Универсальный продукт"
            onClick={() => setCustomOpen(true)}
            disabled={!permissions.posUniversalProduct}
          />
          <BottomButton
            icon={Trash2}
            label="Удалить"
            variant="destructive"
            disabled={selected.size === 0 || !canDeleteItem}
            onClick={() => setVoidTargetIds([...selected])}
          />
          <button
            data-charge-btn
            onClick={() => setPaymentOpen(true)}
            disabled={items.length === 0 || (requireShift && !hasOpenShift)}
            className="col-span-2 flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg bg-[#26877c] px-3 py-2 text-xl font-bold text-white hover:bg-[#1e7068] disabled:pointer-events-none disabled:opacity-50"
          >
            {requireShift && !hasOpenShift ? "Сначала откройте смену" : `Оплата ${items.length > 0 ? formatCurrency(tot) : ""}`}
          </button>
        </div>
      </div>
      </div>

      {salesPanel && <POSSalesPanel mode={salesPanel} canReturnWithReceipt={canReturn} canReturnWithoutReceipt={canReturnWithoutReceipt} />}

      {extra.open && extra.pos && (
        <AnchoredPopover pos={extra.pos} onClose={extra.close} className="w-72 space-y-3">
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium">
              {t("discount_card")}
            </label>
            <div className="flex items-center gap-2">
              <input
                value={cardInput}
                onChange={(e) => setCardInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyCard();
                }}
                onBlur={applyCard}
                className="bg-background h-9 flex-1 rounded-md border px-2 text-sm"
              />
              {discountCardPercent > 0 && (
                <button
                  onClick={() => {
                    setCardInput("");
                    setDiscountCard("", 0);
                    setCardMsg("");
                  }}
                  className="text-muted-foreground hover:text-destructive rounded p-1"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            {cardMsg && <p className="text-muted-foreground mt-1 text-[11px]">{cardMsg}</p>}
          </div>
          <div>
            <label className="text-muted-foreground mb-1 block text-xs font-medium">Клиент</label>
            <CustomerCapture value={customer} onChange={setCustomer} />
          </div>
          {consultants.length > 0 && (
            <div>
              <label className="text-muted-foreground mb-1 block text-xs font-medium">
                Консультант
              </label>
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-1">
                <button
                  type="button"
                  onClick={() => setConsultantId("")}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                    consultantId === "" && "bg-muted"
                  )}
                >
                  <span className="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full">
                    <User className="h-3.5 w-3.5" />
                  </span>
                  Не выбран
                </button>
                {consultants.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    onClick={() => setConsultantId(c.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted",
                      consultantId === c.id && "bg-muted"
                    )}
                  >
                    {c.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={c.photoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />
                    ) : (
                      <span className="bg-muted text-muted-foreground flex h-6 w-6 items-center justify-center rounded-full">
                        <User className="h-3.5 w-3.5" />
                      </span>
                    )}
                    {c.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          {permissions.posCreateProduct && (
            <div className="flex flex-col gap-1 border-t pt-2">
              <button onClick={() => { extra.close(); setCreateProduct({ barcode: "" }); }} className="rounded-md px-2 py-2 text-left text-sm font-medium hover:bg-muted">+ Создать новый товар</button>
              <button onClick={() => { extra.close(); setLabelPickerOpen(true); }} className="rounded-md px-2 py-2 text-left text-sm hover:bg-muted">Печать этикетки товара</button>
            </div>
          )}
          {(permissions.posPriceCheck || permissions.posGlobalSearch || permissions.posCollapseWindow) && (
            <div className="flex flex-col gap-1 border-t pt-2">
              {permissions.posPriceCheck && (
                <button onClick={() => { extra.close(); setPriceCheckOpen(true); }} className="rounded-md px-2 py-2 text-left text-sm hover:bg-muted">Проверка цены</button>
              )}
              {permissions.posGlobalSearch && (
                <button onClick={() => { extra.close(); setGlobalSearchOpen(true); }} className="rounded-md px-2 py-2 text-left text-sm hover:bg-muted">Поиск по глобальной базе</button>
              )}
              {permissions.posCollapseWindow && (
                <button
                  onClick={() => {
                    extra.close();
                    if (document.fullscreenElement) void document.exitFullscreen();
                    else void document.documentElement.requestFullscreen?.().catch(() => {});
                  }}
                  className="rounded-md px-2 py-2 text-left text-sm hover:bg-muted"
                >
                  Свернуть / развернуть окно
                </button>
              )}
            </div>
          )}
        </AnchoredPopover>
      )}

      {priceCheckOpen && <PriceCheckModal onClose={() => setPriceCheckOpen(false)} showWholesale={permissions.wholesaleAtPos} />}
      {globalSearchOpen && <GlobalSearchModal onClose={() => setGlobalSearchOpen(false)} canAdd={permissions.posEditProductAtPos} />}

      {/* Held orders modal */}
      <HeldOrdersModal open={showHeldOrders} onClose={() => setShowHeldOrders(false)} />

      {/* Void item(s) modal */}
      <VoidItemModal
        open={!!voidTargetIds}
        itemName={voidTargetLabel}
        onConfirm={handleVoidConfirm}
        onCancel={() => setVoidTargetIds(null)}
      />

      {quickOpen && (
        <QuickProductsDialog
          onSelect={(p) => {
            setQuickOpen(false);
            addProductToCart(p);
          }}
          onClose={() => setQuickOpen(false)}
        />
      )}

      {createProduct && (
        <CreateProductModal
          initialBarcode={createProduct.barcode}
          onCreated={(product) => {
            setCreateProduct(null);
            addProductToCart(product);
            // The new item's label is shown right away so it can be printed and stuck on the goods.
            if (product.barcode) setNewLabel({ name: product.name, price: Number(product.price), unit: product.unit ?? "pcs", barcode: product.barcode });
          }}
          onClose={() => setCreateProduct(null)}
        />
      )}

      {labelPickerOpen && <LabelPickerModal onClose={() => setLabelPickerOpen(false)} />}
      {newLabel && <ProductLabelModal product={newLabel} onClose={() => setNewLabel(null)} />}

      {customOpen && (
        <CustomItemModal
          onAdd={(item) => {
            addCustomItem(item);
            setCustomOpen(false);
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}

      {editOpen && activeItem && (
        <EditItemModal
          item={activeItem}
          discountEnabled={permissions.posDiscount}
          priceEditable={permissions.posChangePriceAtPos}
          banPriceDecrease={permissions.posBanPriceDecrease}
          wholesaleEnabled={permissions.wholesaleAtPos}
          onSave={(patch) => {
            if (patch.price !== undefined && patch.price !== activeItem.price) updateItemPrice(activeItem.id, patch.price);
            updateItemNotes(activeItem.id, patch.notes);
            updateLineDiscount(activeItem.id, patch.lineDiscount);
            setEditOpen(false);
          }}
          onClose={() => setEditOpen(false)}
        />
      )}

      {paymentOpen && (
        <PaymentModal
          onClose={() => setPaymentOpen(false)}
          taxRate={taxRate}
          checkoutBlocked={requireShift && !hasOpenShift}
          onClear={() => {
            if (items.length > 0) setConfirmClear(true);
          }}
          onSaleComplete={handleSaleComplete}
          onHoldOrders={() => {
            setPaymentOpen(false);
            setShowHeldOrders(true);
          }}
          customerId={customer?.id}
          consultantId={consultantId || undefined}
          creditSaleEnabled={creditSaleEnabled}
          holdEnabled={permissions.posHoldOrder}
          cardPaymentEnabled={permissions.posCardPayment}
        />
      )}

      {/* Receipt modal */}
      {receiptData && (
        <ReceiptModal
          open={true}
          onClose={() => setReceiptData(null)}
          data={receiptData}
          settings={receiptSettings}
        />
      )}

      {/* Clear cart confirmation */}
      <AlertDialog
        open={confirmClear}
        title={t("clear_cart_title")}
        description={t("clear_cart_desc")}
        confirmLabel={t("clear")}
        cancelLabel={t("keep")}
        variant="destructive"
        onConfirm={() => {
          clearCart();
          setConfirmClear(false);
          setPaymentOpen(false);
        }}
        onCancel={() => setConfirmClear(false)}
      />

      {/* Numeric keypad (quantity edit for the active row) */}
      <NumericKeypad
        open={keypad.open}
        value={keypad.value}
        label={(() => {
          const item = items.find((candidate) => candidate.id === keypad.itemId);
          return item ? `${item.name} · Количество (${unitLabel(item.unit, true)})` : undefined;
        })()}
        allowDecimal={items.find((item) => item.id === keypad.itemId)?.unit !== "pcs"}
        presets={items.find((item) => item.id === keypad.itemId)?.unit === "pcs" ? [1, 2, 3, 5, 10] : [0.1, 0.25, 0.5, 1, 2]}
        unit={unitLabel(items.find((item) => item.id === keypad.itemId)?.unit, true)}
        max={(() => {
          const item = items.find((candidate) => candidate.id === keypad.itemId);
          return item && Number.isFinite(item.stock) ? item.stock : undefined;
        })()}
        onValueChange={(v) => setKeypad((k) => ({ ...k, value: v }))}
        onConfirm={() => {
          const item = items.find((candidate) => candidate.id === keypad.itemId);
          const parsed = parseFloat(keypad.value);
          const val = item?.unit === "pcs" ? Math.floor(parsed) : parsed;
          if (!isNaN(val) && val > 0) updateQuantity(keypad.itemId, Math.min(item?.stock ?? val, val));
          setKeypad({ open: false, itemId: "", value: "1" });
        }}
        onCancel={() => setKeypad({ open: false, itemId: "", value: "1" })}
      />

      {showShortcuts && <KeyboardShortcutsModal onClose={() => setShowShortcuts(false)} />}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={cn("flex justify-between text-base", bold && "text-xl font-bold")}>
      <span className={bold ? "" : "text-muted-foreground"}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function BottomButton({
  icon: Icon,
  label,
  onClick,
  disabled,
  variant,
  anchorRef,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  variant?: "destructive";
  anchorRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={anchorRef}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1 rounded-lg border border-slate-300 bg-[#f2f2f2] px-2 py-2 text-center text-[10px] leading-tight font-semibold text-[#353535] uppercase shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        variant === "destructive"
          ? "border-[#8c4e48] bg-[#8d514c] text-white hover:bg-[#773f3a]"
          : "hover:text-foreground hover:bg-white"
      )}
    >
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}
