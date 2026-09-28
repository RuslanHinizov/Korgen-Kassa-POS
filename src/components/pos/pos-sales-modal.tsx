"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Clock, Keyboard, Loader2, Printer, Search, X } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ReceiptModal } from "@/components/receipt/receipt-modal";
import { RefundReceiptModal } from "@/components/receipt/refund-receipt-modal";
import { ReferenceBookFields, useReferenceBooks } from "./reference-book-fields";
import { sendOrQueue } from "@/lib/offline/send";
import { newId, nextReceiptNo } from "@/lib/offline/queue";
import { searchLocal, applyLocalStockDelta } from "@/lib/offline/catalog";
import { getTillAuth } from "@/lib/offline/auth";
import { applyQueuedRefunds, cachedSales, cacheSales, queuedSales } from "@/lib/offline/sales-cache";
import { TouchSearchKeyboard } from "./product-search";

type SaleItem = { id: string; productId: string | null; name: string; quantity: number; returnableQuantity: number; price: number; total: number; unit: string };
type Refund = { id: string; amount: number; reason: string | null; createdAt: string; items: { saleItemId?: string; name: string; quantity: number; price: number; unit?: string }[] };
type Sale = { id: string; documentNo?: number; receiptNo?: string; waiting?: boolean; createdAt: string; subtotal: number; taxAmount: number; total: number; discountAmount: number; paymentMethod: string; amountTendered?: number | null; changeDue?: number | null; status: "COMPLETED" | "VOIDED" | "REFUNDED"; user: { name: string }; referenceValues?: { bookName: string; entryName: string }[] | null; items: SaleItem[]; refunds?: Refund[] };
type Product = { id: string; name: string; price: number; unit: string };

const paymentLabel: Record<string, string> = { CASH: "Наличные", CARD: "Безналичный", OTHER: "Другое", CREDIT: "В долг" };

/** The receipt was made on this till but hasn't reached the server yet (no connection at the time). */
function SyncPendingIcon() {
  return <Clock className="ml-1.5 inline h-3.5 w-3.5 text-amber-500" aria-label="Не отправлен на сервер" />;
}
const today = () => new Date().toISOString().slice(0, 10);
const dateTime = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const receiptNumber = (sale: Sale) => String(sale.documentNo ?? sale.receiptNo ?? "");

/** Product search for the return screen: the server, or this till's own catalogue copy when there is no connection. */
async function searchProducts(q: string): Promise<Product[]> {
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(q)}`);
      if (r.ok) return (await r.json()) as Product[];
    } catch {
      /* fall back to the local copy */
    }
  }
  return (await searchLocal(q, 10)) as unknown as Product[];
}

/** Sales this till can still show without a connection: what it has waiting plus the last ones the server sent. */
async function offlineSales(from: string, to: string, query: string): Promise<Sale[]> {
  const all = (await applyQueuedRefunds([...(await queuedSales()), ...(await cachedSales())])) as unknown as Sale[];
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T23:59:59`).getTime();
  const q = query.trim().toLowerCase();
  return all
    .filter((sale) => {
      const t = new Date(sale.createdAt).getTime();
      return t >= start && t <= end;
    })
    .filter((sale) => !q || String(sale.documentNo ?? "").includes(q) || (sale.receiptNo ?? "").toLowerCase().includes(q) || sale.id.toLowerCase().includes(q))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
const receiptSettings = { name: "Korgen Kassa", logoUrl: null, currency: "₸", currencyDecimals: 2, taxName: "НДС", receiptFooter: "" };

/** Register-only history and returns. It replaces only the content area below the
 * kiosk tabs, so the cashier never loses the POS header or leaves the register. */
export function POSSalesPanel({ mode, canReturnWithReceipt, canReturnWithoutReceipt }: { mode: "returns" | "history"; canReturnWithReceipt: boolean; canReturnWithoutReceipt: boolean }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offlineNotice, setOfflineNotice] = useState(false);
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [reprintRefund, setReprintRefund] = useState<{ saleId: string; documentNo?: number; refund: Refund } | null>(null);
  const [returnMode, setReturnMode] = useState<"receipt" | "without">(canReturnWithReceipt ? "receipt" : "without");
  const printOriginalSale = (sale: Sale) => setReprintSale(sale);
  const printReturnReceipt = (sale: Sale) => {
    // A partial return keeps its source sale completed; the Returns tab prints that latest return.
    const refund = sale.refunds?.[0];
    if (refund) setReprintRefund({ saleId: sale.id, documentNo: sale.documentNo, refund });
    else setReprintSale(sale);
  };

  const load = useCallback(async (queryOverride?: string) => {
    setLoading(true); setError("");
    try {
      const sp = new URLSearchParams({ pageSize: "50", from: `${from}T00:00:00`, to: `${to}T23:59:59` });
      const searched = (queryOverride ?? query).trim();
      if (searched) sp.set("q", searched);
      let r: Response | null = null;
      try {
        r = await fetch(`/api/pos/sales?${sp}`);
      } catch {
        r = null;
      }
      if (!r) {
        // no connection: show what this till knows
        setSales(await offlineSales(from, to, searched));
        setOfflineNotice(true);
        return;
      }
      setOfflineNotice(false);
      // A signed-out browser gets the login page (HTML) instead of JSON.
      if (r.status === 401 || r.redirected || !(r.headers.get("content-type") ?? "").includes("json")) {
        throw new Error("Сессия завершена. Войдите в кассу заново (страница «Вход для кассира»).");
      }
      if (!r.ok) throw new Error("Не удалось загрузить продажи");
      const data = await r.json();
      const fromServer: Sale[] = data.sales ?? [];
      void cacheSales(fromServer as never);
      // sales made offline that have not reached the server yet belong at the top too
      const waiting = (await queuedSales()) as unknown as Sale[];
      setSales((await applyQueuedRefunds([...waiting, ...fromServer] as never)) as unknown as Sale[]);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить продажи"); }
    finally { setLoading(false); }
  }, [from, query, to]);

  useEffect(() => { if (mode === "history" || returnMode === "receipt") load(); }, [load, mode, returnMode]);
  return <section className="min-h-0 flex-1 overflow-y-auto bg-[#f4f5f6] p-4 text-[#212529] sm:p-6">
    {offlineNotice && <p data-testid="sales-offline-notice" className="mx-auto mb-3 max-w-5xl rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">Нет связи с сервером. Показаны чеки, сохранённые на этой кассе; возвраты отправятся при появлении интернета.</p>}
    {mode === "history" ? <SalesHistory sales={sales} loading={loading} error={error} query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={load} onReprint={printOriginalSale} /> : selectedSale ? <><button onClick={() => setSelectedSale(null)} className="mb-4 flex h-10 items-center gap-1 rounded-lg border bg-white px-4 text-sm font-bold hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> К списку чеков</button><ReceiptReturn sale={selectedSale} onDone={() => { setSelectedSale(null); load(); }} /></> : <ReturnHome returnMode={returnMode} setReturnMode={setReturnMode} canReceipt={canReturnWithReceipt} canWithout={canReturnWithoutReceipt} sales={sales} loading={loading} error={error} query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={load} onSelect={setSelectedSale} onReprint={printReturnReceipt} />}
    {reprintSale && <ReceiptModal open onClose={() => setReprintSale(null)} settings={receiptSettings} data={{ saleId: reprintSale.id, documentNo: reprintSale.documentNo, receiptNo: reprintSale.receiptNo, items: reprintSale.items.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price, total: item.total, unit: item.unit })), subtotal: reprintSale.subtotal, discountAmount: reprintSale.discountAmount, taxAmount: reprintSale.taxAmount, total: reprintSale.total, paymentMethod: reprintSale.paymentMethod, amountTendered: reprintSale.amountTendered ?? undefined, changeDue: reprintSale.changeDue ?? undefined }} />}
    {reprintRefund && <RefundReceiptModal open onClose={() => setReprintRefund(null)} saleId={reprintRefund.saleId} documentNo={reprintRefund.documentNo} items={reprintRefund.refund.items.map((item) => { const quantity = Number(item.quantity); const price = Number(item.price); const source = sales.find((sale) => sale.id === reprintRefund.saleId)?.items.find((saleItem) => saleItem.id === item.saleItemId); return { name: item.name, quantity, price, total: price * quantity, unit: item.unit ?? source?.unit }; })} refundTotal={Number(reprintRefund.refund.amount)} reason={reprintRefund.refund.reason ?? undefined} />}
  </section>;
}

function Filters({ query, setQuery, from, setFrom, to, setTo, onSearch, receiptOnly = false }: { query: string; setQuery: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; onSearch: (value?: string) => void; receiptOnly?: boolean }) {
  return <div className="mb-4 flex flex-wrap items-end gap-2 rounded border bg-white p-3">
    <label className="text-xs font-medium">{receiptOnly ? "Номер чека или штрихкод" : "Поиск по номеру чека"}<input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSearch(e.currentTarget.value)} placeholder="Введите номер или отсканируйте" className="mt-1 block h-9 w-56 rounded border px-2 text-sm" /></label>
    <label className="text-xs font-medium">С<input value={from} type="date" onChange={(e) => setFrom(e.target.value)} className="mt-1 block h-9 rounded border px-2 text-sm" /></label>
    <label className="text-xs font-medium">По<input value={to} type="date" onChange={(e) => setTo(e.target.value)} className="mt-1 block h-9 rounded border px-2 text-sm" /></label>
    <button onClick={() => onSearch()} className="flex h-9 items-center gap-1 rounded bg-[#26877c] px-4 text-xs font-bold text-white hover:bg-[#1e7068]"><Search className="h-3.5 w-3.5" /> Найти</button>
  </div>;
}

function SalesHistory(props: { sales: Sale[]; loading: boolean; error: string; query: string; setQuery: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; onSearch: (value?: string) => void; onReprint: (sale: Sale) => void }) {
  const statusLabel = (sale: Sale) => sale.status === "COMPLETED" ? "Проведён" : sale.status === "REFUNDED" ? "Возврат" : "Отменён";
  return <section className="mx-auto max-w-7xl"><Filters {...props} />
    {/* Desktop/tablet table */}
    <div className="hidden sm:block overflow-x-auto rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">№ чека</th><th className="px-3 py-3">Время</th><th className="px-3 py-3">Кассир</th><th className="px-3 py-3 text-right">Скидка</th><th className="px-3 py-3 text-right">Сумма</th><th className="px-3 py-3">Тип оплаты</th><th className="px-3 py-3">Статус</th><th></th></tr></thead><tbody>{props.loading ? <LoadingRow cols={8} /> : props.error ? <ErrorRow cols={8} error={props.error} /> : props.sales.length === 0 ? <EmptyRow cols={8} /> : props.sales.map((sale) => <tr key={sale.id} className="border-t"><td className="px-3 py-2 font-medium">{receiptNumber(sale)}{sale.waiting && <SyncPendingIcon />}</td><td className="px-3 py-2">{dateTime(sale.createdAt)}</td><td className="px-3 py-2">{sale.user.name}</td><td className="px-3 py-2 text-right">{sale.discountAmount ? `−${formatCurrency(sale.discountAmount)}` : "—"}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(sale.total)}</td><td className="px-3 py-2">{paymentLabel[sale.paymentMethod] ?? sale.paymentMethod}</td><td className="px-3 py-2">{sale.status === "COMPLETED" ? "Проведён" : sale.status === "REFUNDED" ? "Возврат" : "Отменён"}</td><td className="px-3 py-2 text-right"><button onClick={() => props.onReprint(sale)} className="inline-flex h-9 items-center gap-1 rounded bg-[#26877c] px-3 text-xs font-bold text-white"><Printer className="h-4 w-4" /> Печать</button></td></tr>)}</tbody></table></div>

    {/* Mobile card list */}
    <div className="sm:hidden space-y-2">
      {props.loading ? (
        <div className="rounded border bg-white p-6 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</div>
      ) : props.error ? (
        <div className="rounded border bg-white p-6 text-center text-sm text-red-600">{props.error}</div>
      ) : props.sales.length === 0 ? (
        <div className="rounded border bg-white p-6 text-center text-sm text-slate-500">Ничего не найдено</div>
      ) : props.sales.map((sale) => (
        <div key={sale.id} className="rounded border bg-white p-3">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-bold text-slate-700">№{receiptNumber(sale)}{sale.waiting && <SyncPendingIcon />}</span>
            <span>{dateTime(sale.createdAt)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="truncate text-slate-600">{sale.user.name} · {paymentLabel[sale.paymentMethod] ?? sale.paymentMethod}</span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span className="text-xs">{statusLabel(sale)}{sale.discountAmount ? ` · скидка −${formatCurrency(sale.discountAmount)}` : ""}</span>
            <span className="font-bold">{formatCurrency(sale.total)}</span>
          </div>
          <button onClick={() => props.onReprint(sale)} className="mt-2 flex h-9 w-full items-center justify-center gap-1 rounded bg-[#26877c] text-xs font-bold text-white"><Printer className="h-4 w-4" /> Печать</button>
        </div>
      ))}
    </div>
  </section>;
}

function ReturnHome({ returnMode, setReturnMode, canReceipt, canWithout, sales, loading, error, query, setQuery, from, setFrom, to, setTo, onSearch, onSelect, onReprint }: { returnMode: "receipt" | "without"; setReturnMode: (v: "receipt" | "without") => void; canReceipt: boolean; canWithout: boolean; sales: Sale[]; loading: boolean; error: string; query: string; setQuery: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; onSearch: (value?: string) => void; onSelect: (sale: Sale) => void; onReprint: (sale: Sale) => void }) {
  return <section className="mx-auto max-w-5xl"><div className="mb-4 flex border-b"><Tab active={returnMode === "receipt"} disabled={!canReceipt} onClick={() => setReturnMode("receipt")}>С чеком</Tab><Tab active={returnMode === "without"} disabled={!canWithout} onClick={() => setReturnMode("without")}>Без чека</Tab></div>
    {returnMode === "without" ? <WithoutReceiptReturn /> : <><Filters query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={onSearch} receiptOnly />
      {/* Desktop/tablet table */}
      <div className="hidden sm:block overflow-x-auto rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">№ чека</th><th className="px-3 py-3">Время</th><th className="px-3 py-3">Кассир</th><th className="px-3 py-3 text-right">Сумма</th><th className="px-3 py-3">Статус</th><th className="px-3 py-3"></th></tr></thead><tbody>{loading ? <LoadingRow cols={6} /> : error ? <ErrorRow cols={6} error={error} /> : sales.filter((s) => s.status !== "VOIDED").length === 0 ? <EmptyRow cols={6} /> : sales.filter((s) => s.status !== "VOIDED").map((sale) => <tr key={sale.id} className="border-t"><td className="px-3 py-2 font-medium">{receiptNumber(sale)}{sale.waiting && <SyncPendingIcon />}</td><td className="px-3 py-2">{dateTime(sale.createdAt)}</td><td className="px-3 py-2">{sale.user.name}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(sale.total)}</td><td className="px-3 py-2">{sale.status === "REFUNDED" ? "Возвращён" : sale.items.some((i) => i.returnableQuantity > 0) ? "Можно вернуть" : "Возвратов нет"}</td><td className="flex justify-end gap-2 px-3 py-2"><button onClick={() => onReprint(sale)} className="rounded border px-2.5 py-1.5 text-xs font-bold"><Printer className="inline h-3.5 w-3.5" /> Печать</button>{sale.status === "COMPLETED" && sale.items.some((i) => i.returnableQuantity > 0) && <button onClick={() => onSelect(sale)} className="rounded bg-[#26877c] px-3 py-1.5 text-xs font-bold text-white">Выбрать</button>}</td></tr>)}</tbody></table></div>

      {/* Mobile card list */}
      <div className="sm:hidden space-y-2">
        {loading ? (
          <div className="rounded border bg-white p-6 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</div>
        ) : error ? (
          <div className="rounded border bg-white p-6 text-center text-sm text-red-600">{error}</div>
        ) : sales.filter((s) => s.status !== "VOIDED").length === 0 ? (
          <div className="rounded border bg-white p-6 text-center text-sm text-slate-500">Ничего не найдено</div>
        ) : sales.filter((s) => s.status !== "VOIDED").map((sale) => {
          const canRefund = sale.status === "COMPLETED" && sale.items.some((i) => i.returnableQuantity > 0);
          return (
            <div key={sale.id} className="rounded border bg-white p-3">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-bold text-slate-700">№{receiptNumber(sale)}{sale.waiting && <SyncPendingIcon />}</span>
                <span>{dateTime(sale.createdAt)}</span>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span className="truncate text-slate-600">{sale.user.name}</span>
                <span className="font-bold">{formatCurrency(sale.total)}</span>
              </div>
              <div className="mt-1 text-xs text-slate-500">{sale.status === "REFUNDED" ? "Возвращён" : sale.items.some((i) => i.returnableQuantity > 0) ? "Можно вернуть" : "Возвратов нет"}</div>
              <div className="mt-2 flex gap-2">
                <button onClick={() => onReprint(sale)} className="flex h-9 flex-1 items-center justify-center gap-1 rounded border text-xs font-bold"><Printer className="h-3.5 w-3.5" /> Печать</button>
                {canRefund && <button onClick={() => onSelect(sale)} className="h-9 flex-1 rounded bg-[#26877c] text-xs font-bold text-white">Выбрать</button>}
              </div>
            </div>
          );
        })}
      </div>
    </>}</section>;
}

function ReceiptReturn({ sale, onDone }: { sale: Sale; onDone: () => void }) {
  const available = sale.items.filter((item) => item.returnableQuantity > 0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(available.map((item) => item.id)));
  const [quantities, setQuantities] = useState<Record<string, number>>(() => Object.fromEntries(available.map((item) => [item.id, item.returnableQuantity])));
  const [reason, setReason] = useState("");
  const referenceBooks = useReferenceBooks("RETURN");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [refundReceipt, setRefundReceipt] = useState<{ items: { name: string; quantity: number; price: number; total: number; unit?: string }[]; total: number; reason: string } | null>(null);

  const total = useMemo(() => available.filter((item) => selected.has(item.id)).reduce((sum, item) => sum + (item.total / item.quantity) * (quantities[item.id] ?? 0), 0), [available, quantities, selected]);

  function quantityFor(item: SaleItem, raw: number) {
    const step = item.unit === "pcs" ? 1 : 0.001;
    const rounded = item.unit === "pcs" ? Math.round(raw) : Math.round(raw * 1000) / 1000;
    return Math.min(item.returnableQuantity, Math.max(step, Number.isFinite(rounded) ? rounded : step));
  }

  function changeQuantity(item: SaleItem, delta: number) {
    setQuantities((current) => ({ ...current, [item.id]: quantityFor(item, (current[item.id] ?? item.returnableQuantity) + delta) }));
  }

  async function submit() {
    if (!selected.size) return;
    const missingBook = referenceBooks.missing();
    if (missingBook) { setError(`Выберите значение справочника «${missingBook}»`); return; }
    setBusy(true);
    setError("");
    try {
      const refundId = newId();
      const who = await getTillAuth();
      const sent = await sendOrQueue({
        kind: "refund",
        endpoint: `/api/sales/${sale.id}/refund`,
        clientId: refundId,
        fallbackError: "Не удалось провести возврат",
        payload: {
          id: refundId,
          refundedAt: new Date().toISOString(),
          ...(who ? { cashierUserId: who.userId } : {}),
          reason: reason || undefined,
          referenceValues: referenceBooks.payload(),
          restoreStock: true,
          items: available.filter((item) => selected.has(item.id)).map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] ?? item.returnableQuantity })),
        },
      });
      if (!sent.ok) throw new Error(sent.error);
      if (sent.queued) {
        // No connection: this till restores its own stock copy now; the server does the same when it applies the queued refund.
        await Promise.all(available.filter((item) => selected.has(item.id) && item.productId).map((item) => applyLocalStockDelta(item.productId!, -(quantities[item.id] ?? item.returnableQuantity))));
      }
      setRefundReceipt({
        items: available.filter((item) => selected.has(item.id)).map((item) => {
          const quantity = quantities[item.id] ?? item.returnableQuantity;
          const price = item.total / item.quantity;
          return { name: item.name, quantity, price, total: price * quantity, unit: item.unit };
        }),
        total,
        reason,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось провести возврат");
    } finally {
      setBusy(false);
    }
  }

  return <><section className="mx-auto max-w-5xl"><div className="mb-4 rounded border bg-white p-3 text-sm"><b>Чек №{receiptNumber(sale)}</b><span className="ml-4 text-muted-foreground">{dateTime(sale.createdAt)} · {sale.user.name}</span>{sale.referenceValues?.length ? <span className="ml-4 text-muted-foreground">{sale.referenceValues.map((v) => `${v.bookName}: ${v.entryName}`).join("; ")}</span> : null}</div>{error && <p className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {/* Desktop/tablet table */}
    <div className="hidden sm:block overflow-x-auto rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="w-10 px-3 py-3"></th><th className="px-3 py-3">Товар</th><th className="px-3 py-3 text-right">Цена</th><th className="px-3 py-3 text-right">Количество</th><th className="px-3 py-3 text-right">Сумма</th></tr></thead><tbody>{available.map((item) => { const checked = selected.has(item.id); const quantity = quantities[item.id] ?? item.returnableQuantity; const step = item.unit === "pcs" ? 1 : 0.001; return <tr key={item.id} className="border-t"><td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} /></td><td className="px-3 py-2 font-medium">{item.name}</td><td className="px-3 py-2 text-right">{formatCurrency(item.total / item.quantity)}</td><td className="px-3 py-2 text-right"><div className="inline-flex items-center gap-1"><button type="button" disabled={!checked || quantity <= step} onClick={() => changeQuantity(item, -step)} className="h-10 w-10 rounded-lg border text-xl font-bold disabled:opacity-35">−</button><input disabled={!checked} value={quantity} type="number" min={step} max={item.returnableQuantity} step={step} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: quantityFor(item, Number(event.target.value)) }))} className="h-10 w-24 rounded-lg border px-2 text-right text-base font-semibold" /><button type="button" disabled={!checked || quantity >= item.returnableQuantity} onClick={() => changeQuantity(item, step)} className="h-10 w-10 rounded-lg border text-xl font-bold disabled:opacity-35">+</button></div><span className="ml-1 text-xs text-muted-foreground">{item.unit === "pcs" ? "шт" : item.unit}</span></td><td className="px-3 py-2 text-right font-semibold">{formatCurrency((item.total / item.quantity) * quantity)}</td></tr>; })}</tbody></table><div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3"><span className="font-bold">Сумма возврата</span><span className="text-lg font-bold">{formatCurrency(total)}</span></div></div>

    {/* Mobile card list */}
    <div className="sm:hidden space-y-2">
      {available.map((item) => {
        const checked = selected.has(item.id);
        const quantity = quantities[item.id] ?? item.returnableQuantity;
        const step = item.unit === "pcs" ? 1 : 0.001;
        return (
          <div key={item.id} className={`rounded border bg-white p-3 ${checked ? "" : "opacity-60"}`}>
            <label className="flex items-start gap-2">
              <input type="checkbox" className="mt-0.5" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} />
              <span className="flex-1 text-sm font-medium">{item.name}</span>
              <span className="shrink-0 text-sm font-semibold">{formatCurrency((item.total / item.quantity) * quantity)}</span>
            </label>
            <div className="mt-2 flex items-center justify-between pl-6">
              <span className="text-xs text-muted-foreground">{formatCurrency(item.total / item.quantity)} / {item.unit === "pcs" ? "шт" : item.unit}</span>
              <div className="inline-flex items-center gap-1">
                <button type="button" disabled={!checked || quantity <= step} onClick={() => changeQuantity(item, -step)} className="h-9 w-9 rounded-lg border text-lg font-bold disabled:opacity-35">−</button>
                <input disabled={!checked} value={quantity} type="number" min={step} max={item.returnableQuantity} step={step} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: quantityFor(item, Number(event.target.value)) }))} className="h-9 w-16 rounded-lg border px-1 text-center text-sm font-semibold" />
                <button type="button" disabled={!checked || quantity >= item.returnableQuantity} onClick={() => changeQuantity(item, step)} className="h-9 w-9 rounded-lg border text-lg font-bold disabled:opacity-35">+</button>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex items-center justify-between rounded border bg-slate-50 px-4 py-3"><span className="font-bold">Сумма возврата</span><span className="text-lg font-bold">{formatCurrency(total)}</span></div>
    </div>
    <ReferenceBookFields state={referenceBooks} className="mt-4 max-w-md" /><div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-xs font-medium">Причина<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block h-10 w-full rounded border px-3 text-sm" placeholder="Необязательно" /></label><button disabled={busy || !selected.size} onClick={submit} className="flex h-10 items-center gap-2 rounded bg-[#26877c] px-5 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}<Check className="h-4 w-4" /> Оформить возврат</button></div></section>{refundReceipt && <RefundReceiptModal open onClose={() => { setRefundReceipt(null); onDone(); }} saleId={sale.id} documentNo={sale.documentNo} referenceText={sale.documentNo == null ? `К чеку №${receiptNumber(sale)} (возврат сохранён на кассе)` : undefined} items={refundReceipt.items} refundTotal={refundReceipt.total} reason={refundReceipt.reason} />}</>;
}

function WithoutReceiptReturn() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Product[]>([]); const [items, setItems] = useState<Product[]>([]); const [qty, setQty] = useState<Record<string, number>>({}); const [reason, setReason] = useState(""); const referenceBooks = useReferenceBooks("RETURN"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [refundReceipt, setRefundReceipt] = useState<{ items: { name: string; quantity: number; price: number; total: number; unit?: string }[]; total: number; reason?: string; referenceText: string } | null>(null); const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [markingFor, setMarkingFor] = useState<Product | null | undefined>(undefined);
  const [markingCodes, setMarkingCodes] = useState<Record<string, string>>({});
  const [markingDraft, setMarkingDraft] = useState("");
  const [touchKeyboardOpen, setTouchKeyboardOpen] = useState(false);
  function find(value: string) { setQuery(value); if (debounce.current) clearTimeout(debounce.current); debounce.current = setTimeout(() => { if (!value.trim()) { setResults([]); return; } searchProducts(value).then((d) => setResults(d.slice(0, 10))).catch(() => setResults([])); }, 200); }
  function addProduct(product: Product) {
    if (!items.some((item) => item.id === product.id)) {
      setItems((current) => [...current, product]);
      setQty((current) => ({ ...current, [product.id]: 1 }));
    }
    setSelectedItemId(product.id);
    setQuery("");
    setResults([]);
  }
  function openMarking() {
    const selected = items.find((item) => item.id === selectedItemId);
    if (!selected) { setMarkingFor(null); return; }
    setMarkingDraft(markingCodes[selected.id] ?? "");
    setMarkingFor(selected);
  }
  function saveMarking() {
    if (!markingFor || !markingDraft.trim()) return;
    setMarkingCodes((current) => ({ ...current, [markingFor.id]: markingDraft.trim() }));
    setMarkingFor(undefined);
  }
  function updateQuantity(item: Product, raw: number) { const step = item.unit === "pcs" ? 1 : 0.001; const rounded = item.unit === "pcs" ? Math.round(raw) : Math.round(raw * 1000) / 1000; return Math.max(step, Number.isFinite(rounded) ? rounded : step); }
  const total = items.reduce((sum, item) => sum + item.price * (qty[item.id] ?? 1), 0);
  async function submit() { if (!items.length) return; const missingBook = referenceBooks.missing(); if (missingBook) { setMessage(`Выберите значение справочника «${missingBook}»`); return; } setBusy(true); setMessage(""); try { const returnId = newId(); const who = await getTillAuth(); const sent = await sendOrQueue({ kind: "return", endpoint: "/api/pos/returns/without-receipt", clientId: returnId, fallbackError: "Не удалось провести возврат", payload: { id: returnId, returnedAt: new Date().toISOString(), ...(who ? { cashierUserId: who.userId } : {}), reason: reason || undefined, referenceValues: referenceBooks.payload(), items: items.map((item) => ({ productId: item.id, quantity: qty[item.id] ?? 1, ...(markingCodes[item.id] ? { markingCode: markingCodes[item.id] } : {}) })) }, decorateForQueue: async (p) => ({ ...p, receiptNo: await nextReceiptNo() }) }); if (!sent.ok) throw new Error(sent.error); if (sent.queued) await Promise.all(items.map((item) => applyLocalStockDelta(item.id, -(qty[item.id] ?? 1)))); const data = (sent.queued ? {} : sent.data) as { customerReturn?: { documentNo?: number; id?: string } }; const queuedNo = sent.queued ? String(sent.payload.receiptNo) : undefined; const receiptItems = items.map((item) => { const quantity = qty[item.id] ?? 1; return { name: item.name, quantity, price: item.price, total: item.price * quantity, unit: item.unit }; }); const documentNo = data.customerReturn?.documentNo ?? data.customerReturn?.id?.slice(-8).toUpperCase() ?? queuedNo; setRefundReceipt({ items: receiptItems, total, reason: reason || undefined, referenceText: documentNo ? `Возврат без чека №${documentNo}` : "Возврат без чека" }); setItems([]); setQty({}); setMarkingCodes({}); setSelectedItemId(null); setReason(""); referenceBooks.reset(); setMessage(sent.queued ? "Нет связи с сервером: возврат сохранён на кассе и будет отправлен при появлении интернета." : "Возврат проведён. Остатки увеличены."); } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось провести возврат"); } finally { setBusy(false); } }
  return <><div className="mx-auto max-w-3xl"><div className="relative mb-4 rounded border bg-white p-3"><label className="text-xs font-medium">Найти товар<div className="relative mt-1"><input autoFocus value={query} onChange={(e) => find(e.target.value)} placeholder="Название или штрихкод" className="block h-10 w-full rounded border px-3 pr-12 text-sm" /><button type="button" onClick={() => setTouchKeyboardOpen(true)} className="absolute right-1 top-1 grid h-8 w-9 place-items-center rounded hover:bg-slate-100" aria-label="Экранная клавиатура"><Keyboard className="h-4 w-4" /></button></div></label>{results.length > 0 && <div className="absolute left-3 right-3 z-10 mt-1 overflow-hidden rounded border bg-white shadow-lg">{results.map((product) => <button key={product.id} onClick={() => addProduct(product)} className="flex w-full justify-between border-b px-3 py-2 text-left text-sm hover:bg-slate-50"><span>{product.name}</span><span>{formatCurrency(product.price)}</span></button>)}</div>}</div>{message && <p className="mb-3 rounded border bg-white p-3 text-sm">{message}</p>}
    {/* Desktop/tablet table */}
    <div className="hidden sm:block overflow-x-auto rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">Товар</th><th className="px-3 py-3 text-right">Цена</th><th className="px-3 py-3 text-right">Количество</th><th className="px-3 py-3 text-right">Сумма</th><th></th></tr></thead><tbody>{items.length === 0 ? <EmptyRow cols={5} /> : items.map((item) => { const step = item.unit === "pcs" ? 1 : 0.001; const selected = selectedItemId === item.id; return <tr key={item.id} onClick={() => setSelectedItemId(item.id)} className={`cursor-pointer border-t ${selected ? "bg-[#fff4c8]" : "hover:bg-slate-50"}`}><td className="px-3 py-2 font-medium">{item.name}{markingCodes[item.id] && <span className="ml-2 text-xs font-normal text-emerald-700">Маркирован</span>}</td><td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td><td className="px-3 py-2 text-right"><input value={qty[item.id] ?? 1} type="number" min={step} step={step} onClick={(event) => event.stopPropagation()} onChange={(e) => setQty((p) => ({ ...p, [item.id]: updateQuantity(item, Number(e.target.value)) }))} className="h-8 w-20 rounded border px-2 text-right" /><span className="ml-1 text-xs text-muted-foreground">{item.unit === "pcs" ? "шт" : item.unit}</span></td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.price * (qty[item.id] ?? 1))}</td><td className="px-3 py-2"><button onClick={(event) => { event.stopPropagation(); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setSelectedItemId((current) => current === item.id ? null : current); setMarkingCodes((current) => { const next = { ...current }; delete next[item.id]; return next; }); }} className="text-red-600">Удалить</button></td></tr>; })}</tbody></table><div className="flex justify-between border-t bg-slate-50 px-4 py-3 font-bold"><span>Сумма возврата</span><span>{formatCurrency(total)}</span></div></div>

    {/* Mobile card list */}
    <div className="sm:hidden space-y-2">
      {items.length === 0 ? (
        <div className="rounded border bg-white p-6 text-center text-sm text-slate-500">Ничего не найдено</div>
      ) : items.map((item) => {
        const step = item.unit === "pcs" ? 1 : 0.001;
        return (
          <div key={item.id} onClick={() => setSelectedItemId(item.id)} className={`rounded border bg-white p-3 ${selectedItemId === item.id ? "border-[#c88d00] bg-[#fff9e1]" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <span className="flex-1 text-sm font-medium">{item.name}{markingCodes[item.id] && <span className="ml-2 text-xs font-normal text-emerald-700">Маркирован</span>}</span>
              <button onClick={(event) => { event.stopPropagation(); setItems((current) => current.filter((candidate) => candidate.id !== item.id)); setSelectedItemId((current) => current === item.id ? null : current); }} className="shrink-0 text-xs text-red-600">Удалить</button>
            </div>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{formatCurrency(item.price)} / {item.unit === "pcs" ? "шт" : item.unit}</span>
              <div className="flex items-center gap-2">
                <input value={qty[item.id] ?? 1} type="number" min={step} step={step} onChange={(e) => setQty((p) => ({ ...p, [item.id]: updateQuantity(item, Number(e.target.value)) }))} className="h-9 w-16 rounded border px-1 text-center text-sm" />
                <span className="text-sm font-semibold">{formatCurrency(item.price * (qty[item.id] ?? 1))}</span>
              </div>
            </div>
          </div>
        );
      })}
      <div className="flex justify-between rounded border bg-slate-50 px-4 py-3 font-bold"><span>Сумма возврата</span><span>{formatCurrency(total)}</span></div>
    </div>
    <ReferenceBookFields state={referenceBooks} className="mt-4" /><div className="mt-4 flex flex-wrap gap-3"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (необязательно)" className="h-10 min-w-48 flex-1 rounded border px-3 text-sm" /><button type="button" onClick={openMarking} className="h-10 rounded border border-[#b3b3b3] bg-white px-4 text-xs font-bold">МАРКИРОВКА ТОВАРА</button><button disabled={busy || !items.length} onClick={submit} className="h-10 rounded bg-[#26877c] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "…" : "Оформить возврат"}</button></div></div>{touchKeyboardOpen && <TouchSearchKeyboard value={query} onChange={find} onSubmit={() => { find(query); setTouchKeyboardOpen(false); }} onClose={() => setTouchKeyboardOpen(false)} />}{markingFor === null && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-md rounded-2xl bg-white p-9 shadow-2xl"><h2 className="text-2xl font-bold">Выберите продукт</h2><p className="mt-9 text-lg">Не выбран продукт</p><div className="mt-16 flex justify-end"><button type="button" onClick={() => setMarkingFor(undefined)} className="h-16 min-w-44 rounded-lg border text-xl">OK</button></div></div></div>}{markingFor && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-2xl"><div className="flex items-start justify-between"><div><h2 className="text-2xl font-bold">Маркировка товара</h2><p className="mt-1 text-sm text-slate-600">{markingFor.name}</p></div><button type="button" onClick={() => setMarkingFor(undefined)} className="rounded p-1" aria-label="Закрыть"><X className="h-5 w-5" /></button></div><label className="mt-6 block text-sm font-medium">Код маркировки<input autoFocus value={markingDraft} onChange={(event) => setMarkingDraft(event.target.value)} placeholder="Отсканируйте или введите код" className="mt-2 h-12 w-full rounded-lg border px-3 text-base" /></label><div className="mt-6 flex justify-end gap-3"><button type="button" onClick={() => setMarkingFor(undefined)} className="h-11 rounded border px-5 font-semibold">Отмена</button><button type="button" disabled={!markingDraft.trim()} onClick={saveMarking} className="h-11 rounded bg-[#26877c] px-5 font-semibold text-white disabled:opacity-50">Сохранить</button></div></div></div>}{refundReceipt && <RefundReceiptModal open onClose={() => setRefundReceipt(null)} items={refundReceipt.items} refundTotal={refundReceipt.total} reason={refundReceipt.reason} referenceText={refundReceipt.referenceText} />}</>;
}

function Tab({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) { return <button disabled={disabled} onClick={onClick} className={`border-b-2 px-4 py-2 text-sm font-bold ${active ? "border-[#26877c] text-[#1e7068]" : "border-transparent text-slate-500"} disabled:opacity-40`}>{children}</button>; }
function LoadingRow({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</td></tr>; }
function EmptyRow({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-slate-500">Ничего не найдено</td></tr>; }
function ErrorRow({ cols, error }: { cols: number; error: string }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-red-600">{error}</td></tr>; }
