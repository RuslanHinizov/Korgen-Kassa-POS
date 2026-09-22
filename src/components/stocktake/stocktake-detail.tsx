"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronLeft, Loader2, Search, Trash2 } from "lucide-react";
import { isFractionalUnit, parseQuantityInput } from "@/lib/units";
import { useSession } from "@/lib/auth-client";

type Status = "DRAFT" | "COUNTING" | "REVIEWING" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = {
  DRAFT: "Черновик", COUNTING: "Подсчёт", REVIEWING: "Проведение", POSTED: "Проведён", CANCELLED: "Отменён",
};

interface Item {
  id: string; productId: string; productName: string; barcode: string | null; unit: string;
  currentStock: number; cost: number | null; price: number; expectedQty: number; countedQty: number; difference: number;
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

  const editable = doc?.status === "DRAFT" || doc?.status === "COUNTING";
  const reviewing = doc?.status === "REVIEWING";

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

  async function finishCounting() {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/review`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось завершить подсчёт"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function backToCounting() {
    setBusy(true);
    try {
      const r = await fetch(`/api/inventory/stocktakes/${id}/reopen`, { method: "POST" });
      if (!r.ok) { toast.error("Не удалось вернуться к подсчёту"); return; }
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
          {editable && (
            <button onClick={deleteDoc} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Удалить
            </button>
          )}
          {doc.status === "COUNTING" && doc.items.length > 0 && (
            <button onClick={finishCounting} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Завершить подсчёт
            </button>
          )}
          {reviewing && (
            <>
              <button onClick={backToCounting} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                <ChevronLeft className="h-4 w-4" /> Назад к подсчёту
              </button>
              <button onClick={postDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Провести
              </button>
            </>
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

      {editable && <ProductPicker onPick={addProduct} busy={busy} existingIds={doc.items.map((i) => i.productId)} />}

      {(() => {
        const hideStockCols = editable && hideStock;
        const hideAmountCols = editable && hideAmounts;
        // UMAG never shows Закупочная цена to Складской работник, regardless of the inventory-hide setting.
        const canSeeCost = role !== "WAREHOUSE";
        const colCount = 2 + (hideStockCols ? 0 : 2) + (hideAmountCols ? 0 : 2) + (editable ? 1 : 0);
        return (
      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Товар</th>
              {!hideStockCols && <th className="px-3 py-2 text-right">Ожидалось</th>}
              <th className="px-3 py-2 text-right">Факт</th>
              {!hideStockCols && <th className="px-3 py-2 text-right">Разница</th>}
              {!hideAmountCols && canSeeCost && <th className="px-3 py-2 text-right">Закуп. цена</th>}
              {!hideAmountCols && <th className="px-3 py-2 text-right">Прод. цена</th>}
              {editable && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {doc.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.barcode ?? "—"}</p>
                </td>
                {!hideStockCols && <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.expectedQty} {item.unit}</td>}
                <td className="px-3 py-2 text-right">
                  {editable ? (
                    <input
                      type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min="0" step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.countedQty}
                      onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit, true); if (v !== null && v !== item.countedQty) updateCounted(item.id, v); }}
                      className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs"
                    />
                  ) : `${item.countedQty} ${item.unit}`}
                </td>
                {!hideStockCols && (
                  <td className={`px-3 py-2 text-right font-medium tabular-nums ${item.difference > 0 ? "text-emerald-600" : item.difference < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                    {item.difference > 0 ? "+" : ""}{item.difference}
                  </td>
                )}
                {!hideAmountCols && canSeeCost && <td className="px-3 py-2 text-right tabular-nums">{item.cost != null ? formatCurrency(item.cost) : "—"}</td>}
                {!hideAmountCols && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.price)}</td>}
                {editable && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => deleteItem(item.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {doc.items.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет</td></tr>
            )}
          </tbody>
        </table>
      </div>
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
