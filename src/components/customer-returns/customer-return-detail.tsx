"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Search, Trash2 } from "lucide-react";
import { isFractionalUnit, parseQuantityInput, unitLabel } from "@/lib/units";

interface Item { id: string; productId: string | null; name: string; barcode: string | null; unit: string; quantity: number; price: number; total: number }
interface Payment { id: string; amount: number; method: string; note: string | null; createdAt: string; userName: string }
interface Doc {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; createdAt: string; postedAt: string | null;
  comment: string | null; referenceValues?: { bookName: string; entryName: string }[] | null; userName: string; customer: { id: string; name: string } | null;
  totalAmount: number; paidAmount: number; remainingAmount: number; items: Item[]; payments: Payment[];
}
interface PickProduct { id: string; name: string; price: number; stock: number; unit?: string; barcode?: string | null }
interface PickCustomer { id: string; name: string }

const METHOD_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Безналичный", OTHER: "Другое" };

export function CustomerReturnDetail({ id }: { id: string }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/customer-returns/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/sales/returns"); return; }
    const d = await r.json();
    setDoc(d.customerReturn);
    setComment(d.customerReturn.comment ?? "");
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  const draft = doc?.status === "DRAFT";

  async function addProduct(p: PickProduct) {
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, quantity: 1 }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function updateItem(itemId: string, patch: { quantity?: number; price?: number }) {
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function pickCustomer(c: PickCustomer | null) {
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ customerId: c?.id ?? null }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function saveComment() {
    if (comment === (doc?.comment ?? "")) return;
    await fetch(`/api/customer-returns/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) });
    load();
  }

  async function postDoc() {
    if (!doc || doc.items.length === 0) { toast.error("Добавьте хотя бы один товар"); return; }
    if (!confirm(`Провести возврат №${doc.documentNo} на ${formatCurrency(doc.totalAmount)}? Остатки будут увеличены.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Возврат проведён");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить черновик возврата?")) return;
    const r = await fetch(`/api/customer-returns/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/sales/returns");
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/sales/returns" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Возвраты
        </Link>
        <h1 className="text-xl font-bold">Возврат №{doc.documentNo}</h1>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Контрагент</label>
          {draft ? (
            <CustomerPicker current={doc.customer} onPick={pickCustomer} busy={busy} />
          ) : (
            <p className="text-sm">{doc.customer?.name ?? "Розничный покупатель"}</p>
          )}
        </div>
        <div className="rounded-lg border p-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
          {draft ? (
            <input
              value={comment} onChange={(e) => setComment(e.target.value)} onBlur={saveComment}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm"
              placeholder="Комментарий к возврату"
            />
          ) : (
            <p className="text-sm text-muted-foreground">{doc.comment || "—"}</p>
          )}
          {doc.referenceValues?.length ? <p className="mt-1 text-xs text-muted-foreground">{doc.referenceValues.map((v) => `${v.bookName}: ${v.entryName}`).join("; ")}</p> : null}
        </div>
      </div>

      {draft && <ProductPicker onPick={addProduct} busy={busy} />}

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">Товар</th>
              <th className="px-3 py-2 text-right">Кол-во</th>
              <th className="px-3 py-2 text-right">Цена</th>
              <th className="px-3 py-2 text-right">Сумма</th>
              {draft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {doc.items.map((item) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-3 py-2">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted-foreground tabular-nums">{item.barcode ?? "—"}</p>
                </td>
                <td className="px-3 py-2 text-right">
                  {draft ? (
                    <input
                      type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min={isFractionalUnit(item.unit) ? "0.001" : "1"} step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.quantity}
                      onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit); if (v !== null && v !== item.quantity) updateItem(item.id, { quantity: v }); }}
                      className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
                    />
                  ) : `${item.quantity} ${unitLabel(item.unit)}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {draft ? (
                    <input
                      type="number" min="0" step="0.01" defaultValue={item.price}
                      onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== item.price) updateItem(item.id, { price: v }); }}
                      className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs"
                    />
                  ) : formatCurrency(item.price)}
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(item.total)}</td>
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
              <tr><td colSpan={draft ? 5 : 4} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет</td></tr>
            )}
          </tbody>
        </table>
        <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
          <span>Сумма</span>
          <span>{formatCurrency(doc.totalAmount)}</span>
        </div>
      </div>

      {doc.status === "POSTED" && (
        <PaymentsSection doc={doc} onPaid={load} />
      )}
    </div>
  );
}

function PaymentsSection({ doc, onPaid }: { doc: Doc; onPaid: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function addPayment() {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("Введите сумму"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/customer-returns/${doc.id}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, method, note: note || undefined }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить оплату"); return; }
      setAmount(""); setNote("");
      toast.success("Оплата добавлена");
      onPaid();
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex flex-wrap gap-6 text-sm">
        <div><p className="text-xs text-muted-foreground">Сумма</p><p className="font-semibold">{formatCurrency(doc.totalAmount)}</p></div>
        <div><p className="text-xs text-muted-foreground">Оплачено</p><p className="font-semibold text-primary">{formatCurrency(doc.paidAmount)}</p></div>
        <div><p className="text-xs text-muted-foreground">Осталось</p><p className="font-semibold text-destructive">{formatCurrency(doc.remainingAmount)}</p></div>
      </div>

      {doc.remainingAmount > 0.009 && (
        <div className="flex flex-wrap items-end gap-2 border-t pt-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Сумма оплаты</label>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0" step="0.01" className="h-9 w-32 rounded-md border bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Способ</label>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className="h-9 w-32 rounded-md border bg-background px-2 text-sm">
              {Object.entries(METHOD_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[10rem]">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <button onClick={addPayment} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Добавить оплату
          </button>
        </div>
      )}

      {doc.payments.length > 0 && (
        <div className="border-t pt-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-1 text-left">Дата</th>
                <th className="px-3 py-1 text-left">Способ</th>
                <th className="px-3 py-1 text-right">Сумма</th>
                <th className="px-3 py-1 text-left">Кто</th>
                <th className="px-3 py-1 text-left">Комментарий</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {doc.payments.map((p) => (
                <tr key={p.id}>
                  <td className="px-3 py-1.5 text-muted-foreground">{new Date(p.createdAt).toLocaleString("ru-RU")}</td>
                  <td className="px-3 py-1.5">{METHOD_LABEL[p.method] ?? p.method}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(p.amount)}</td>
                  <td className="px-3 py-1.5">{p.userName}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{p.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomerPicker({ current, onPick, busy }: { current: { id: string; name: string } | null; onPick: (c: PickCustomer | null) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickCustomer[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(next: string) {
    if (!next.trim()) { setResults([]); return; }
    fetch(`/api/customers?q=${encodeURIComponent(next)}`)
      .then((r) => (r.ok ? r.json() : { customers: [] }))
      .then((d) => setResults(d.customers ?? []))
      .catch(() => setResults([]));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 250);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          value={open ? q : (current?.name ?? "")} onChange={handleChange} onFocus={() => { setOpen(true); setQ(""); }}
          placeholder="Розничный покупатель (поиск...)"
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        />
        {current && (
          <button disabled={busy} onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-destructive">Сбросить</button>
        )}
      </div>
      {open && q.trim() && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.map((c) => (
              <button key={c.id} disabled={busy} onClick={() => { onPick(c); setOpen(false); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40">
                {c.name}
              </button>
            ))
          )}
        </div>
      )}
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
          placeholder="Найти товар и добавить в возврат…"
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
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">цена: {formatCurrency(p.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
