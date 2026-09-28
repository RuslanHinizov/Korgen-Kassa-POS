"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useCartStore } from "@/store/cart";
import { lineGross } from "@/lib/rounding";
import { X, History } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { listLocalHeldOrders, removeLocalHeldOrder } from "@/lib/offline/held-orders";

interface HeldOrderSnapshot {
  items: Array<{ productId: string | null; name: string; price: number; quantity: number; stock: number; unit?: "pcs" | "kg" | "l" | "m"; categoryId?: string | null; notes?: string; lineDiscount?: number }>;
  discountAmount?: number;
  discountType?: "fixed" | "percent";
  paymentMethod: "CASH" | "CARD" | "OTHER";
}

interface HeldOrder {
  localId: string | null;
  serverId: string | null;
  label: string | null;
  createdAt: string;
  cartSnapshot: HeldOrderSnapshot;
}

interface HeldOrdersModalProps {
  open: boolean;
  onClose: () => void;
}

export function HeldOrdersModal({ open, onClose }: HeldOrdersModalProps) {
  const t = useTranslations("pos.held");
  const [orders, setOrders] = useState<HeldOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const { setDiscount, setPaymentMethod, addItem, clearCart, roundingWeight } = useCartStore();

  async function fetchOrders() {
    setLoading(true);
    const local = await listLocalHeldOrders();
    const localOnly: HeldOrder[] = local
      .filter((o) => !o.serverId)
      .map((o) => ({ localId: o.id, serverId: null, label: o.label, createdAt: o.createdAt, cartSnapshot: o.cartSnapshot as HeldOrderSnapshot }));
    try {
      const res = await fetch("/api/held-orders");
      if (!res.ok) throw new Error();
      const data: Array<{ id: string; label: string | null; createdAt: string; cartSnapshot: HeldOrderSnapshot }> = await res.json();
      const server: HeldOrder[] = data.map((o) => ({
        localId: local.find((l) => l.serverId === o.id)?.id ?? null,
        serverId: o.id,
        label: o.label,
        createdAt: o.createdAt,
        cartSnapshot: o.cartSnapshot,
      }));
      setOrders([...localOnly, ...server]);
    } catch {
      // No connection: this till's own not-yet-synced held orders are still usable.
      setOrders(localOnly);
    } finally {
      setLoading(false);
    }
  }

  // Fetch when modal opens; reset when it closes
  useEffect(() => {
    if (open) {
      fetchOrders();
    } else {
      setOrders([]);
    }
  }, [open]);

  async function removeOrder(order: HeldOrder) {
    if (order.localId) await removeLocalHeldOrder(order.localId);
    if (order.serverId) {
      try {
        await fetch("/api/held-orders", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: order.serverId }),
        });
      } catch {
        /* offline: local copy is already gone, server will just keep its own until it's cleaned up */
      }
    }
  }

  async function recallOrder(order: HeldOrder) {
    clearCart();
    const snap = order.cartSnapshot;
    snap.items.forEach((i) => addItem(i, i.quantity));
    setDiscount(snap.discountAmount ?? 0, snap.discountType ?? "fixed");
    setPaymentMethod(snap.paymentMethod);
    await removeOrder(order);
    onClose();
  }

  async function deleteOrder(order: HeldOrder) {
    await removeOrder(order);
    setOrders((prev) => prev.filter((o) => o !== order));
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-card border shadow-xl">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="font-semibold">{t("title")}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t("loading")}</p>
          )}
          {!loading && orders.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
              <History className="h-6 w-6" />
              <p className="text-sm">{t("empty")}</p>
            </div>
          )}
          {orders.map((order) => {
            const snap = order.cartSnapshot;
            const total = snap.items.reduce((s, i) => s + lineGross(i.price, i.quantity, i.unit, roundingWeight) - (i.lineDiscount || 0), 0);
            return (
              <div
                key={order.serverId ?? order.localId ?? order.createdAt}
                className="flex items-center justify-between rounded-lg border p-3 mb-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    {order.label ?? new Date(order.createdAt).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("items_count", { count: snap.items.length })} · {formatCurrency(total)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => recallOrder(order)}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    {t("recall")}
                  </button>
                  <button
                    onClick={() => deleteOrder(order)}
                    className="rounded border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                  >
                    {t("delete")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
