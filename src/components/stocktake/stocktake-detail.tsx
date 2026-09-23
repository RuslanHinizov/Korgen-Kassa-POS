"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, Check, Download, Loader2, Search, Trash2 } from "lucide-react";
import { isFractionalUnit, parseQuantityInput } from "@/lib/units";
import { useSession } from "@/lib/auth-client";
import { AddProductsModal } from "./add-products-modal";

type Status = "DRAFT" | "COUNTING" | "REVIEWING" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён",
};
const dateTimeFmt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

interface Item {
  id: string; productId: string; productName: string; barcode: string | null; unit: string;
  currentStock: number; cost: number | null; price: number; expectedQty: number; countedQty: number | null; difference: number | null;
  scannedAt: string | null;
}
interface Doc {
  id: string; documentNo: number; status: Status; note: string | null;
  countedAt: string; postedAt: string | null; userName: string; items: Item[];
}
interface PickProduct { id: string; name: string; price: number; stock: number; unit?: string; barcode?: string | null }

export function StocktakeDetail({ id }: { id: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const role = useSession().data?.user.role;
  const [hideStock, setHideStock] = useState(false);
  const [hideAmounts, setHideAmounts] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => {
      setHideStock(Boolean(d?.hideStockDuringStocktake));
      setHideAmounts(Boolean(d?.hideAmountsDuringStocktake));
    }).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const r = await fetch(`/api/inventory/stocktakes/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/products/stocktake"); return; }
    const d = await r.json();
    setDoc(d.stocktake);
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  // Matches real UMAG: no separate review stage — Провести is available directly
  // from Черновик/Подсчёт, the document just isn't editable once Проведён.
  const editable = doc?.status === "DRAFT" || doc?.status === "COUNTING";

  async function addProduct(p: PickProduct) {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function updateCounted(itemId: string, countedQty: number) {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ countedQty }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function postDoc() {
    if (!doc) return;
    if (!confirm(`Провести инвентаризацию №${doc.documentNo}? Остатки товаров будут скорректированы.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Инвентаризация проведена");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить эту инвентаризацию?")) return;
    const r = await fetch(`/api/inventory/stocktakes/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/products/stocktake");
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/products/stocktake" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Инвентаризации
        </Link>
        <h1 className="text-xl font-bold">Инвентаризация №{doc.documentNo}</h1>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">{STATUS_LABEL[doc.status]}</span>
        <span className="text-xs text-muted-foreground">Создатель: {doc.userName}</span>
        <div className="ml-auto flex items-center gap-2">
          {editable && doc.items.length > 0 && (
            <button onClick={postDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Провести
            </button>
          )}
          <button onClick={() => window.open(`/api/inventory/stocktakes/${id}/export`, "_blank")} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            <Download className="h-4 w-4" /> Экспорт
          </button>
          {editable && (
            <button onClick={deleteDoc} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Удалить
            </button>
          )}
        </div>
      </div>

      {editable && (
        <textarea
          defaultValue={doc.note ?? ""}
          placeholder="Комментарий"
          onBlur={(e) => fetch(`/api/inventory/stocktakes/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: e.target.value }) })}
          className="w-full rounded-md border bg-background p-2 text-sm"
        />
      )}

      {editable && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="flex-1">
            <ProductPicker onPick={addProduct} busy={busy} existingIds={doc.items.map((i) => i.productId)} />
          </div>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            disabled={busy}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            Добавить из номенклатуры
          </button>
        </div>
      )}

      {addModalOpen && (
        <AddProductsModal
          stocktakeId={id}
          existingIds={doc.items.map((i) => i.productId)}
          onClose={() => setAddModalOpen(false)}
          onAdded={load}
        />
      )}

      {(() => {
        // Matches real UMAG: Ожидалось (system stock) is shown openly at every
        // stage — the business setting is the only thing that hides it, same as
        // it always was for Прод./Закуп. цена. No phase-based blind-count hiding.
        const hideStockCols = hideStock;
        const hideAmountCols = editable && hideAmounts;
        // UMAG never shows Закупочная цена to Складской работник, regardless of the inventory-hide setting.
        const canSeeCost = role !== "WAREHOUSE";
        const colCount = 3 + (hideStockCols ? 0 : 2) + (hideAmountCols ? 0 : 2) + (editable ? 1 : 0);

        const reconciliation = !editable ? (() => {
          const surplus = doc.items.filter((i) => (i.difference ?? 0) > 0);
          const shortage = doc.items.filter((i) => (i.difference ?? 0) < 0);
          const surplusValue = surplus.reduce((s, i) => s + (i.difference ?? 0) * i.price, 0);
          const shortageValue = shortage.reduce((s, i) => s + Math.abs(i.difference ?? 0) * i.price, 0);
          return { surplusCount: surplus.length, shortageCount: shortage.length, surplusValue, shortageValue };
        })() : null;

        return (
      <>
        {reconciliation && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Посчитано</p>
              <p className="text-lg font-semibold">{doc.items.length}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Без расхождений</p>
              <p className="text-lg font-semibold">{doc.items.length - reconciliation.surplusCount - reconciliation.shortageCount}</p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Излишек</p>
              <p className="text-lg font-semibold text-emerald-600">{reconciliation.surplusCount} <span className="text-sm font-normal">/ {formatCurrency(reconciliation.surplusValue)}</span></p>
            </div>
            <div className="rounded-lg border bg-card p-3">
              <p className="text-xs text-muted-foreground">Недостача</p>
              <p className="text-lg font-semibold text-red-600">{reconciliation.shortageCount} <span className="text-sm font-normal">/ {formatCurrency(reconciliation.shortageValue)}</span></p>
            </div>
          </div>
        )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Товар</th>
              <th className="px-3 py-2 text-left">Время сканирования</th>
              <th className="px-3 py-2 text-right">Сканировано</th>
              {!hideStockCols && <th className="px-3 py-2 text-right">Остаток на время сканирования</th>}
              {!hideStockCols && <th className="px-3 py-2 text-right">Разница</th>}
              {!hideAmountCols && canSeeCost && <th className="px-3 py-2 text-right">Сумма закуп. цены и за ед</th>}
              {!hideAmountCols && <th className="px-3 py-2 text-right">Сумма прод. цены и за ед</th>}
              {editable && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {doc.items.map((item) => {
              // Matches real UMAG: a line not yet actually scanned shows a warning
              // once its (0-default) count leaves a nonzero difference — not "hidden",
              // just openly flagged so it isn't mistaken for a confirmed count.
              const unscanned = item.scannedAt === null;
              const diff = item.difference ?? 0;
              return (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.barcode ?? "—"}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground tabular-nums">
                  {item.scannedAt ? dateTimeFmt(item.scannedAt) : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min="0" step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.countedQty ?? 0}
                      onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit, true); if (v !== null && v !== item.countedQty) updateCounted(item.id, v); }}
                      className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs"
                    />
                  ) : `${item.countedQty ?? 0} ${item.unit}`}
                </td>
                {!hideStockCols && <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.expectedQty} {item.unit}</td>}
                {!hideStockCols && (
                  <td className="px-3 py-2 text-right">
                    <span className={`inline-flex items-center gap-1 font-medium tabular-nums ${diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                      {unscanned && diff !== 0 && <AlertCircle className="h-3.5 w-3.5" />}
                      {diff > 0 ? "+" : ""}{diff}
                    </span>
                  </td>
                )}
                {!hideAmountCols && canSeeCost && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    {item.cost != null ? (
                      <>
                        <span className="block">{formatCurrency(diff * item.cost)}</span>
                        <span className="block text-xs text-muted-foreground">за ед {formatCurrency(item.cost)}</span>
                      </>
                    ) : "—"}
                  </td>
                )}
                {!hideAmountCols && (
                  <td className="px-3 py-2 text-right tabular-nums">
                    <span className="block">{formatCurrency(diff * item.price)}</span>
                    <span className="block text-xs text-muted-foreground">за ед {formatCurrency(item.price)}</span>
                  </td>
                )}
                {editable && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => deleteItem(item.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
              );
            })}
            {doc.items.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
      </>
        );
      })()}
    </div>
  );
}

function ProductPicker({ onPick, busy, existingIds }: { onPick: (p: PickProduct) => void; busy: boolean; existingIds: string[] }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(next: string) {
    if (!next.trim()) { setResults([]); return; }
    setLoading(true);
    fetch(`/api/products/search?q=${encodeURIComponent(next)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then(setResults)
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 250);
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q} onChange={handleChange}
          placeholder="Найти товар и добавить в подсчёт…"
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>
      {q.trim() && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-md border divide-y">
          {loading ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">Поиск…</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-center text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.slice(0, 20).map((p) => {
              const already = existingIds.includes(p.id);
              return (
                <button
                  key={p.id} disabled={busy || already}
                  onClick={() => { onPick(p); setQ(""); setResults([]); }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50"
                >
                  <span className="truncate">{p.name}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted-foreground">{already ? "уже добавлен" : `остаток: ${p.stock}`}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
