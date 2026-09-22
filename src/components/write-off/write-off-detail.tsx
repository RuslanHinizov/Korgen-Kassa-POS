"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Search, Trash2 } from "lucide-react";
import { isFractionalUnit, parseQuantityInput } from "@/lib/units";

type Reason = "DAMAGED" | "EXPIRED" | "KITCHEN" | "OTHER";
const REASON_LABEL: Record<Reason, string> = { DAMAGED: "Испорчено", EXPIRED: "Просрочено", KITCHEN: "Кухня", OTHER: "Другое" };

interface Item {
  id: string; productId: string; productName: string; barcode: string | null; unit: string;
  currentStock: number; quantity: number; reason: Reason; unitCost: number | null; note: string | null; total: number | null;
}
interface Doc {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; writeOffDate: string;
  note: string | null; totalCost: number; userName: string; postedAt: string | null; items: Item[];
}
interface PickProduct { id: string; name: string; price: number; stock: number; unit?: string; barcode?: string | null }

export function WriteOffDetail({ id, canSeeCost = true }: { id: string; canSeeCost?: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/write-offs/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/products/write-off"); return; }
    const d = await r.json();
    setDoc(d.writeOff);
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  const draft = doc?.status === "DRAFT";

  async function addProduct(p: PickProduct) {
    setBusy(true);
    try {
      const r = await fetch(`/api/write-offs/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, quantity: 1, reason: "OTHER" }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function updateItem(itemId: string, patch: { quantity?: number; reason?: Reason }) {
    setBusy(true);
    try {
      const r = await fetch(`/api/write-offs/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/write-offs/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function postDoc() {
    if (!doc || doc.items.length === 0) { toast.error("Добавьте хотя бы один товар"); return; }
    if (!confirm(`Провести списание №${doc.documentNo} на ${formatCurrency(doc.totalCost)}? Остатки будут уменьшены.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/write-offs/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Списание проведено");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить черновик списания?")) return;
    const r = await fetch(`/api/write-offs/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/products/write-off");
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/products/write-off" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Списания
        </Link>
        <h1 className="text-xl font-bold">Списание №{doc.documentNo}</h1>
        <span className={doc.status === "POSTED" ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>
          {doc.status === "POSTED" ? "Проведён" : "Черновик"}
        </span>
        <span className="text-xs text-muted-foreground">Создатель: {doc.userName}</span>
        <div className="ml-auto flex items-center gap-2">
          {draft && (
            <>
              <button onClick={deleteDoc} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Удалить
              </button>
              <button onClick={postDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Провести
              </button>
            </>
          )}
        </div>
      </div>

      {draft && <ProductPicker onPick={addProduct} busy={busy} />}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Товар</th>
              <th className="px-3 py-2 text-left">Причина</th>
              <th className="px-3 py-2 text-right">Кол-во</th>
              <th className="px-3 py-2 text-right">Тек. ост.</th>
              {canSeeCost && <th className="px-3 py-2 text-right">Цена</th>}
              {canSeeCost && <th className="px-3 py-2 text-right">Итого</th>}
              {draft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {doc.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.barcode ?? "—"}</p>
                </td>
                <td className="px-3 py-2">
                  {draft ? (
                    <select
                      value={item.reason}
                      onChange={(e) => updateItem(item.id, { reason: e.target.value as Reason })}
                      className="h-8 rounded-md border bg-background px-2 text-xs"
                    >
                      {(Object.keys(REASON_LABEL) as Reason[]).map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
                    </select>
                  ) : REASON_LABEL[item.reason]}
                </td>
                <td className="px-3 py-2 text-right">
                  {draft ? (
                    <input
                      type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min={isFractionalUnit(item.unit) ? "0.001" : "1"} step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.quantity}
                      onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit); if (v !== null && v !== item.quantity) updateItem(item.id, { quantity: v }); }}
                      className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
                    />
                  ) : `${item.quantity} ${item.unit}`}
                </td>
                <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.currentStock} {item.unit}</td>
                {canSeeCost && <td className="px-3 py-2 text-right tabular-nums">{item.unitCost != null ? formatCurrency(item.unitCost) : "—"}</td>}
                {canSeeCost && <td className="px-3 py-2 text-right font-medium tabular-nums">{item.total != null ? formatCurrency(item.total) : "—"}</td>}
                {draft && (
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => deleteItem(item.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {doc.items.length === 0 && (
              <tr><td colSpan={draft ? 7 : 6} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет</td></tr>
            )}
          </tbody>
        </table>
        {canSeeCost && (
          <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
            <span>Итого</span>
            <span>{formatCurrency(doc.totalCost)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProductPicker({ onPick, busy }: { onPick: (p: PickProduct) => void; busy: boolean }) {
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
          placeholder="Найти товар и добавить в списание…"
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
            results.slice(0, 20).map((p) => (
              <button
                key={p.id} disabled={busy}
                onClick={() => { onPick(p); setQ(""); setResults([]); }}
                className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40 disabled:opacity-50"
              >
                <span className="truncate">{p.name}</span>
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">остаток: {p.stock}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
