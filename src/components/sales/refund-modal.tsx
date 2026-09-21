"use client";

import { useState } from "react";
import { ReferenceBookFields, useReferenceBooks } from "@/components/pos/reference-book-fields";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { X, RotateCcw } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { RefundReceiptModal } from "@/components/receipt/refund-receipt-modal";

interface RefundItem {
  saleItemId: string;
  productId: string | null;
  name: string;
  quantity: number;
  price: number;
}

interface RefundModalProps {
  saleId: string;
  documentNo: number;
  saleTotal: number;
  items: {
    id: string;
    name: string;
    quantity: number;
    price: { toString(): string };
    productId?: string | null;
  }[];
  onClose: () => void;
}

export function RefundModal({ saleId, documentNo, saleTotal, items, onClose }: RefundModalProps) {
  const router = useRouter();
  const t = useTranslations("sales.refund_modal");
  const tc = useTranslations("common");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(items.map((i) => i.id)));
  const [qtys, setQtys] = useState<Record<string, number>>(
    Object.fromEntries(items.map((i) => [i.id, i.quantity]))
  );
  const [reason, setReason] = useState("");
  const referenceBooks = useReferenceBooks("RETURN");
  const [restoreStock, setRestoreStock] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [committedItems, setCommittedItems] = useState<{ name: string; quantity: number; price: number; total: number }[]>([]);
  const [committedTotal, setCommittedTotal] = useState(0);
  const [committedReason, setCommittedReason] = useState("");

  const selectedItems = items.filter((i) => selected.has(i.id));
  const refundTotal = selectedItems.reduce(
    (sum, i) => sum + parseFloat(i.price.toString()) * (qtys[i.id] ?? i.quantity),
    0
  );

  function toggleItem(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selectedItems.length === 0) { setError(t("err_select")); return; }
    const missingBook = referenceBooks.missing();
    if (missingBook) { setError(`Выберите значение справочника «${missingBook}»`); return; }
    setSaving(true);
    setError(null);
    try {
      const refundItems: RefundItem[] = selectedItems.map((i) => ({
        saleItemId: i.id,
        productId: i.productId ?? null,
        name: i.name,
        quantity: qtys[i.id] ?? i.quantity,
        price: parseFloat(i.price.toString()),
      }));
      const res = await fetch(`/api/sales/${saleId}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason || undefined, referenceValues: referenceBooks.payload(), restoreStock, items: refundItems }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? t("err_submit"));
      }
      // Save data for receipt before clearing state
      const receiptItems = selectedItems.map((i) => ({
        name: i.name,
        quantity: qtys[i.id] ?? i.quantity,
        price: parseFloat(i.price.toString()),
        total: parseFloat(i.price.toString()) * (qtys[i.id] ?? i.quantity),
      }));
      setCommittedItems(receiptItems);
      setCommittedTotal(refundTotal);
      setCommittedReason(reason);
      router.refresh();
      setShowReceipt(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("err_submit"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <RefundReceiptModal
        open={showReceipt}
        onClose={onClose}
        saleId={saleId}
        documentNo={documentNo}
        items={committedItems}
        refundTotal={committedTotal}
        reason={committedReason || undefined}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="font-semibold">{t("title")}</h2>
              <p className="text-xs text-muted-foreground">{t("sale_total", { amount: formatCurrency(saleTotal) })}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
          )}

          {/* Items selection */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">{t("items_to_refund")}</label>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-primary"
                onClick={() =>
                  selected.size === items.length
                    ? setSelected(new Set())
                    : setSelected(new Set(items.map((i) => i.id)))
                }
              >
                {selected.size === items.length ? t("deselect_all") : t("select_all")}
              </button>
            </div>
            <div className="rounded-lg border divide-y max-h-56 overflow-y-auto">
              {items.map((item) => (
                <label key={item.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => toggleItem(item.id)}
                    className="h-4 w-4 accent-primary flex-shrink-0"
                  />
                  <span className="flex-1 text-sm">{item.name}</span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <input
                      type="number"
                      min={1}
                      max={item.quantity}
                      value={qtys[item.id] ?? item.quantity}
                      onChange={(e) =>
                        setQtys((prev) => ({
                          ...prev,
                          [item.id]: Math.min(item.quantity, Math.max(1, parseInt(e.target.value) || 1)),
                        }))
                      }
                      onClick={(e) => e.stopPropagation()}
                      className="w-14 rounded border px-2 py-1 text-xs text-center bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                      disabled={!selected.has(item.id)}
                    />
                    <span className="text-xs text-muted-foreground w-14 text-right">
                      {formatCurrency(parseFloat(item.price.toString()) * (qtys[item.id] ?? item.quantity))}
                    </span>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Refund total */}
          <div className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2.5">
            <span className="text-sm font-medium">{t("refund_amount")}</span>
            <span className="text-lg font-bold text-destructive">{formatCurrency(refundTotal)}</span>
          </div>

          <ReferenceBookFields state={referenceBooks} />

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium">{t("reason")} <span className="text-muted-foreground font-normal">({tc("optional")})</span></label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reason_placeholder")}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Restore stock */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={restoreStock}
              onChange={(e) => setRestoreStock(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
            <span className="text-sm">{t("restore_stock")}</span>
          </label>

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border px-4 py-2 text-sm hover:bg-accent transition-colors"
            >
              {tc("cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || selectedItems.length === 0}
              className="flex-1 rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-60 transition-colors"
            >
              {saving ? t("submitting") : t("refund_btn", { amount: formatCurrency(refundTotal) })}
            </button>
          </div>
        </form>
      </div>
    </div>
    </>
  );
}
