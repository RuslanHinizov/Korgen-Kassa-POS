"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, Loader2, Printer, Search } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { ReceiptModal } from "@/components/receipt/receipt-modal";
import { RefundReceiptModal } from "@/components/receipt/refund-receipt-modal";
import { ReferenceBookFields, useReferenceBooks } from "./reference-book-fields";

type SaleItem = { id: string; productId: string | null; name: string; quantity: number; returnableQuantity: number; price: number; total: number; unit: string };
type Refund = { id: string; amount: number; reason: string | null; createdAt: string; items: { saleItemId?: string; name: string; quantity: number; price: number; unit?: string }[] };
type Sale = { id: string; documentNo: number; createdAt: string; subtotal: number; taxAmount: number; total: number; discountAmount: number; paymentMethod: string; amountTendered?: number | null; changeDue?: number | null; status: "COMPLETED" | "VOIDED" | "REFUNDED"; user: { name: string }; referenceValues?: { bookName: string; entryName: string }[] | null; items: SaleItem[]; refunds?: Refund[] };
type Product = { id: string; name: string; price: number; unit: string };

const paymentLabel: Record<string, string> = { CASH: "Наличные", CARD: "Безналичный", OTHER: "Другое", CREDIT: "В долг" };
const today = () => new Date().toISOString().slice(0, 10);
const dateTime = (value: string) => new Date(value).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const receiptNumber = (sale: Sale) => String(sale.documentNo);
const receiptSettings = { name: "Korgen Kassa", logoUrl: null, currency: "₸", currencyDecimals: 2, taxName: "НДС", receiptFooter: "" };

/** Register-only history and returns. It replaces only the content area below the
 * kiosk tabs, so the cashier never loses the POS header or leaves the register. */
export function POSSalesPanel({ mode, canReturnWithReceipt, canReturnWithoutReceipt }: { mode: "returns" | "history"; canReturnWithReceipt: boolean; canReturnWithoutReceipt: boolean }) {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [reprintSale, setReprintSale] = useState<Sale | null>(null);
  const [reprintRefund, setReprintRefund] = useState<{ saleId: string; documentNo: number; refund: Refund } | null>(null);
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
      const r = await fetch(`/api/pos/sales?${sp}`);
      if (!r.ok) throw new Error("Не удалось загрузить продажи");
      const data = await r.json();
      setSales(data.sales ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось загрузить продажи"); }
    finally { setLoading(false); }
  }, [from, query, to]);

  useEffect(() => { if (mode === "history" || returnMode === "receipt") load(); }, [load, mode, returnMode]);
  return <section className="min-h-0 flex-1 overflow-y-auto bg-[#f4f5f6] p-4 text-[#212529] sm:p-6">
    {mode === "history" ? <SalesHistory sales={sales} loading={loading} error={error} query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={load} onReprint={printOriginalSale} /> : selectedSale ? <><button onClick={() => setSelectedSale(null)} className="mb-4 flex h-10 items-center gap-1 rounded-lg border bg-white px-4 text-sm font-bold hover:bg-slate-50"><ChevronLeft className="h-4 w-4" /> К списку чеков</button><ReceiptReturn sale={selectedSale} onDone={() => { setSelectedSale(null); load(); }} /></> : <ReturnHome returnMode={returnMode} setReturnMode={setReturnMode} canReceipt={canReturnWithReceipt} canWithout={canReturnWithoutReceipt} sales={sales} loading={loading} error={error} query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={load} onSelect={setSelectedSale} onReprint={printReturnReceipt} />}
    {reprintSale && <ReceiptModal open onClose={() => setReprintSale(null)} settings={receiptSettings} data={{ saleId: reprintSale.id, documentNo: reprintSale.documentNo, items: reprintSale.items.map((item) => ({ name: item.name, quantity: item.quantity, price: item.price, total: item.total, unit: item.unit })), subtotal: reprintSale.subtotal, discountAmount: reprintSale.discountAmount, taxAmount: reprintSale.taxAmount, total: reprintSale.total, paymentMethod: reprintSale.paymentMethod, amountTendered: reprintSale.amountTendered ?? undefined, changeDue: reprintSale.changeDue ?? undefined }} />}
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
  return <section className="mx-auto max-w-7xl"><Filters {...props} />
    <div className="overflow-hidden rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">№ чека</th><th className="px-3 py-3">Время</th><th className="px-3 py-3">Кассир</th><th className="px-3 py-3 text-right">Скидка</th><th className="px-3 py-3 text-right">Сумма</th><th className="px-3 py-3">Тип оплаты</th><th className="px-3 py-3">Статус</th><th></th></tr></thead><tbody>{props.loading ? <LoadingRow cols={8} /> : props.error ? <ErrorRow cols={8} error={props.error} /> : props.sales.length === 0 ? <EmptyRow cols={8} /> : props.sales.map((sale) => <tr key={sale.id} className="border-t"><td className="px-3 py-2 font-medium">{receiptNumber(sale)}</td><td className="px-3 py-2">{dateTime(sale.createdAt)}</td><td className="px-3 py-2">{sale.user.name}</td><td className="px-3 py-2 text-right">{sale.discountAmount ? `−${formatCurrency(sale.discountAmount)}` : "—"}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(sale.total)}</td><td className="px-3 py-2">{paymentLabel[sale.paymentMethod] ?? sale.paymentMethod}</td><td className="px-3 py-2">{sale.status === "COMPLETED" ? "Проведён" : sale.status === "REFUNDED" ? "Возврат" : "Отменён"}</td><td className="px-3 py-2 text-right"><button onClick={() => props.onReprint(sale)} className="inline-flex h-9 items-center gap-1 rounded bg-[#26877c] px-3 text-xs font-bold text-white"><Printer className="h-4 w-4" /> Печать</button></td></tr>)}</tbody></table></div></section>;
}

function ReturnHome({ returnMode, setReturnMode, canReceipt, canWithout, sales, loading, error, query, setQuery, from, setFrom, to, setTo, onSearch, onSelect, onReprint }: { returnMode: "receipt" | "without"; setReturnMode: (v: "receipt" | "without") => void; canReceipt: boolean; canWithout: boolean; sales: Sale[]; loading: boolean; error: string; query: string; setQuery: (v: string) => void; from: string; setFrom: (v: string) => void; to: string; setTo: (v: string) => void; onSearch: (value?: string) => void; onSelect: (sale: Sale) => void; onReprint: (sale: Sale) => void }) {
  return <section className="mx-auto max-w-5xl"><div className="mb-4 flex border-b"><Tab active={returnMode === "receipt"} disabled={!canReceipt} onClick={() => setReturnMode("receipt")}>С чеком</Tab><Tab active={returnMode === "without"} disabled={!canWithout} onClick={() => setReturnMode("without")}>Без чека</Tab></div>
    {returnMode === "without" ? <WithoutReceiptReturn /> : <><Filters query={query} setQuery={setQuery} from={from} setFrom={setFrom} to={to} setTo={setTo} onSearch={onSearch} receiptOnly />
      <div className="overflow-hidden rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">№ чека</th><th className="px-3 py-3">Время</th><th className="px-3 py-3">Кассир</th><th className="px-3 py-3 text-right">Сумма</th><th className="px-3 py-3">Статус</th><th className="px-3 py-3"></th></tr></thead><tbody>{loading ? <LoadingRow cols={6} /> : error ? <ErrorRow cols={6} error={error} /> : sales.filter((s) => s.status !== "VOIDED").length === 0 ? <EmptyRow cols={6} /> : sales.filter((s) => s.status !== "VOIDED").map((sale) => <tr key={sale.id} className="border-t"><td className="px-3 py-2 font-medium">{receiptNumber(sale)}</td><td className="px-3 py-2">{dateTime(sale.createdAt)}</td><td className="px-3 py-2">{sale.user.name}</td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(sale.total)}</td><td className="px-3 py-2">{sale.status === "REFUNDED" ? "Возвращён" : sale.items.some((i) => i.returnableQuantity > 0) ? "Можно вернуть" : "Возвратов нет"}</td><td className="flex justify-end gap-2 px-3 py-2"><button onClick={() => onReprint(sale)} className="rounded border px-2.5 py-1.5 text-xs font-bold"><Printer className="inline h-3.5 w-3.5" /> Печать</button>{sale.status === "COMPLETED" && sale.items.some((i) => i.returnableQuantity > 0) && <button onClick={() => onSelect(sale)} className="rounded bg-[#26877c] px-3 py-1.5 text-xs font-bold text-white">Выбрать</button>}</td></tr>)}</tbody></table></div></>}</section>;
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
      const response = await fetch(`/api/sales/${sale.id}/refund`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason: reason || undefined,
          referenceValues: referenceBooks.payload(),
          restoreStock: true,
          items: available.filter((item) => selected.has(item.id)).map((item) => ({ saleItemId: item.id, quantity: quantities[item.id] ?? item.returnableQuantity })),
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error ?? "Не удалось провести возврат");
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

  return <><section className="mx-auto max-w-5xl"><div className="mb-4 rounded border bg-white p-3 text-sm"><b>Чек №{receiptNumber(sale)}</b><span className="ml-4 text-muted-foreground">{dateTime(sale.createdAt)} · {sale.user.name}</span>{sale.referenceValues?.length ? <span className="ml-4 text-muted-foreground">{sale.referenceValues.map((v) => `${v.bookName}: ${v.entryName}`).join("; ")}</span> : null}</div>{error && <p className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}<div className="overflow-hidden rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="w-10 px-3 py-3"></th><th className="px-3 py-3">Товар</th><th className="px-3 py-3 text-right">Цена</th><th className="px-3 py-3 text-right">Количество</th><th className="px-3 py-3 text-right">Сумма</th></tr></thead><tbody>{available.map((item) => { const checked = selected.has(item.id); const quantity = quantities[item.id] ?? item.returnableQuantity; const step = item.unit === "pcs" ? 1 : 0.001; return <tr key={item.id} className="border-t"><td className="px-3 py-2"><input type="checkbox" checked={checked} onChange={() => setSelected((current) => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })} /></td><td className="px-3 py-2 font-medium">{item.name}</td><td className="px-3 py-2 text-right">{formatCurrency(item.total / item.quantity)}</td><td className="px-3 py-2 text-right"><div className="inline-flex items-center gap-1"><button type="button" disabled={!checked || quantity <= step} onClick={() => changeQuantity(item, -step)} className="h-10 w-10 rounded-lg border text-xl font-bold disabled:opacity-35">−</button><input disabled={!checked} value={quantity} type="number" min={step} max={item.returnableQuantity} step={step} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: quantityFor(item, Number(event.target.value)) }))} className="h-10 w-24 rounded-lg border px-2 text-right text-base font-semibold" /><button type="button" disabled={!checked || quantity >= item.returnableQuantity} onClick={() => changeQuantity(item, step)} className="h-10 w-10 rounded-lg border text-xl font-bold disabled:opacity-35">+</button></div><span className="ml-1 text-xs text-muted-foreground">{item.unit === "pcs" ? "шт" : item.unit}</span></td><td className="px-3 py-2 text-right font-semibold">{formatCurrency((item.total / item.quantity) * quantity)}</td></tr>; })}</tbody></table><div className="flex items-center justify-between border-t bg-slate-50 px-4 py-3"><span className="font-bold">Сумма возврата</span><span className="text-lg font-bold">{formatCurrency(total)}</span></div></div><ReferenceBookFields state={referenceBooks} className="mt-4 max-w-md" /><div className="mt-4 flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-xs font-medium">Причина<input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 block h-10 w-full rounded border px-3 text-sm" placeholder="Необязательно" /></label><button disabled={busy || !selected.size} onClick={submit} className="flex h-10 items-center gap-2 rounded bg-[#26877c] px-5 text-sm font-bold text-white disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}<Check className="h-4 w-4" /> Оформить возврат</button></div></section>{refundReceipt && <RefundReceiptModal open onClose={() => { setRefundReceipt(null); onDone(); }} saleId={sale.id} documentNo={sale.documentNo} items={refundReceipt.items} refundTotal={refundReceipt.total} reason={refundReceipt.reason} />}</>;
}

function WithoutReceiptReturn() {
  const [query, setQuery] = useState(""); const [results, setResults] = useState<Product[]>([]); const [items, setItems] = useState<Product[]>([]); const [qty, setQty] = useState<Record<string, number>>({}); const [reason, setReason] = useState(""); const referenceBooks = useReferenceBooks("RETURN"); const [busy, setBusy] = useState(false); const [message, setMessage] = useState(""); const [refundReceipt, setRefundReceipt] = useState<{ items: { name: string; quantity: number; price: number; total: number; unit?: string }[]; total: number; reason?: string; referenceText: string } | null>(null); const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function find(value: string) { setQuery(value); if (debounce.current) clearTimeout(debounce.current); debounce.current = setTimeout(() => { if (!value.trim()) { setResults([]); return; } fetch(`/api/products/search?q=${encodeURIComponent(value)}`).then((r) => r.ok ? r.json() : []).then((d) => setResults(d.slice(0, 10))).catch(() => setResults([])); }, 200); }
  function updateQuantity(item: Product, raw: number) { const step = item.unit === "pcs" ? 1 : 0.001; const rounded = item.unit === "pcs" ? Math.round(raw) : Math.round(raw * 1000) / 1000; return Math.max(step, Number.isFinite(rounded) ? rounded : step); }
  const total = items.reduce((sum, item) => sum + item.price * (qty[item.id] ?? 1), 0);
  async function submit() { if (!items.length) return; const missingBook = referenceBooks.missing(); if (missingBook) { setMessage(`Выберите значение справочника «${missingBook}»`); return; } setBusy(true); setMessage(""); try { const r = await fetch("/api/pos/returns/without-receipt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason: reason || undefined, referenceValues: referenceBooks.payload(), items: items.map((item) => ({ productId: item.id, quantity: qty[item.id] ?? 1 })) }) }); const data = await r.json(); if (!r.ok) throw new Error(data.error ?? "Не удалось провести возврат"); const receiptItems = items.map((item) => { const quantity = qty[item.id] ?? 1; return { name: item.name, quantity, price: item.price, total: item.price * quantity, unit: item.unit }; }); const documentNo = data.customerReturn?.documentNo ?? data.customerReturn?.id?.slice(-8).toUpperCase(); setRefundReceipt({ items: receiptItems, total, reason: reason || undefined, referenceText: documentNo ? `Возврат без чека №${documentNo}` : "Возврат без чека" }); setItems([]); setQty({}); setReason(""); referenceBooks.reset(); setMessage("Возврат проведён. Остатки увеличены."); } catch (e) { setMessage(e instanceof Error ? e.message : "Не удалось провести возврат"); } finally { setBusy(false); } }
  return <><div className="mx-auto max-w-3xl"><div className="relative mb-4 rounded border bg-white p-3"><label className="text-xs font-medium">Найти товар<input autoFocus value={query} onChange={(e) => find(e.target.value)} placeholder="Название или штрихкод" className="mt-1 block h-10 w-full rounded border px-3 text-sm" /></label>{results.length > 0 && <div className="absolute left-3 right-3 z-10 mt-1 overflow-hidden rounded border bg-white shadow-lg">{results.map((product) => <button key={product.id} onClick={() => { if (!items.some((i) => i.id === product.id)) { setItems((p) => [...p, product]); setQty((p) => ({ ...p, [product.id]: 1 })); } setQuery(""); setResults([]); }} className="flex w-full justify-between border-b px-3 py-2 text-left text-sm hover:bg-slate-50"><span>{product.name}</span><span>{formatCurrency(product.price)}</span></button>)}</div>}</div>{message && <p className="mb-3 rounded border bg-white p-3 text-sm">{message}</p>}<div className="overflow-hidden rounded border bg-white"><table className="w-full text-sm"><thead className="bg-[#e9ecef] text-left text-xs font-bold uppercase text-slate-600"><tr><th className="px-3 py-3">Товар</th><th className="px-3 py-3 text-right">Цена</th><th className="px-3 py-3 text-right">Количество</th><th className="px-3 py-3 text-right">Сумма</th><th></th></tr></thead><tbody>{items.length === 0 ? <EmptyRow cols={5} /> : items.map((item) => { const step = item.unit === "pcs" ? 1 : 0.001; return <tr key={item.id} className="border-t"><td className="px-3 py-2 font-medium">{item.name}</td><td className="px-3 py-2 text-right">{formatCurrency(item.price)}</td><td className="px-3 py-2 text-right"><input value={qty[item.id] ?? 1} type="number" min={step} step={step} onChange={(e) => setQty((p) => ({ ...p, [item.id]: updateQuantity(item, Number(e.target.value)) }))} className="h-8 w-20 rounded border px-2 text-right" /><span className="ml-1 text-xs text-muted-foreground">{item.unit === "pcs" ? "шт" : item.unit}</span></td><td className="px-3 py-2 text-right font-semibold">{formatCurrency(item.price * (qty[item.id] ?? 1))}</td><td className="px-3 py-2"><button onClick={() => setItems((p) => p.filter((i) => i.id !== item.id))} className="text-red-600">Удалить</button></td></tr>; })}</tbody></table><div className="flex justify-between border-t bg-slate-50 px-4 py-3 font-bold"><span>Сумма возврата</span><span>{formatCurrency(total)}</span></div></div><ReferenceBookFields state={referenceBooks} className="mt-4" /><div className="mt-4 flex gap-3"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Причина (необязательно)" className="h-10 flex-1 rounded border px-3 text-sm" /><button disabled={busy || !items.length} onClick={submit} className="h-10 rounded bg-[#26877c] px-5 text-sm font-bold text-white disabled:opacity-50">{busy ? "…" : "Оформить возврат"}</button></div></div>{refundReceipt && <RefundReceiptModal open onClose={() => setRefundReceipt(null)} items={refundReceipt.items} refundTotal={refundReceipt.total} reason={refundReceipt.reason} referenceText={refundReceipt.referenceText} />}</>;
}

function Tab({ active, disabled, onClick, children }: { active: boolean; disabled: boolean; onClick: () => void; children: React.ReactNode }) { return <button disabled={disabled} onClick={onClick} className={`border-b-2 px-4 py-2 text-sm font-bold ${active ? "border-[#26877c] text-[#1e7068]" : "border-transparent text-slate-500"} disabled:opacity-40`}>{children}</button>; }
function LoadingRow({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-slate-500"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</td></tr>; }
function EmptyRow({ cols }: { cols: number }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-slate-500">Ничего не найдено</td></tr>; }
function ErrorRow({ cols, error }: { cols: number; error: string }) { return <tr><td colSpan={cols} className="px-3 py-12 text-center text-sm text-red-600">{error}</td></tr>; }
