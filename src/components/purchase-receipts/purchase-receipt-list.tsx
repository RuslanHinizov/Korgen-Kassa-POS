"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { useSession } from "@/lib/auth-client";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, Download, Loader2, Pencil, Plus, Printer, ScanLine, Settings2, SlidersHorizontal, X, Zap } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

interface Row {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; createdAt: string;
  supplierName: string | null; userName: string; comment: string | null;
  totalAmount: number; paidAmount: number; remainingAmount: number; saleValue: number;
}
interface Supplier { id: string; name: string }
interface UserOption { id: string; name: string }

function monthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { from, to };
}
function toInputDate(d: Date) { return d.toISOString().slice(0, 10); }
function dayKey(iso: string) { return new Date(iso).toLocaleDateString("ru-RU", { day: "2-digit", month: "long" }); }
function fmtChipDate(d: Date) { return d.toLocaleDateString("ru-RU"); }
function fmtRowDate(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("ru-RU")} ${d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
}

const PRESETS = [
  { key: "yesterday", label: "Вчера" },
  { key: "today", label: "Сегодня" },
  { key: "week", label: "Неделя" },
  { key: "month", label: "Месяц" },
  { key: "3months", label: "Три месяца" },
] as const;

function presetRange(key: (typeof PRESETS)[number]["key"]) {
  const now = new Date();
  const to = new Date(now); to.setHours(23, 59, 59, 999);
  const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (key === "yesterday") { from.setDate(from.getDate() - 1); to.setDate(to.getDate() - 1); to.setHours(23, 59, 59, 999); }
  else if (key === "week") from.setDate(from.getDate() - 6);
  else if (key === "month") from.setDate(from.getDate() - 29);
  else if (key === "3months") from.setDate(from.getDate() - 89);
  return { from, to };
}

export function PurchaseReceiptList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({ totalAmount: 0, paidAmount: 0, remainingAmount: 0, saleValue: 0 });

  const [preset, setPreset] = useState<string | null>("month");
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [status, setStatus] = useState("");
  const [supplierQuery, setSupplierQuery] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [supplierResults, setSupplierResults] = useState<Supplier[]>([]);
  const [q, setQ] = useState("");
  const [userId, setUserId] = useState("");
  const [users, setUsers] = useState<UserOption[]>([]);
  const [appliedFilters, setAppliedFilters] = useState({ from, to, status: "", supplierId: "", userId: "", q: "" });

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const filter = useAnchoredPopover();
  const action = useAnchoredPopover();
  const print = useAnchoredPopover();
  const columns = useAnchoredPopover();
  // UMAG never shows Складской работник "Сумма по закупочной" (the same number as "Сумма" restated).
  const canSeeCost = useSession().data?.user.role !== "WAREHOUSE";
  const [visible, setVisible] = useState({ supplier: true, account: true, total: true, paid: true, remaining: true, purchaseValue: canSeeCost, saleValue: true, comment: true });

  const buildParams = useCallback((extra?: Record<string, string>) => {
    const sp = new URLSearchParams({ from: appliedFilters.from.toISOString(), to: appliedFilters.to.toISOString(), ...extra });
    if (appliedFilters.status) sp.set("status", appliedFilters.status);
    if (appliedFilters.supplierId) sp.set("supplierId", appliedFilters.supplierId);
    if (appliedFilters.userId) sp.set("userId", appliedFilters.userId);
    if (appliedFilters.q) sp.set("q", appliedFilters.q);
    return sp;
  }, [appliedFilters]);

  useEffect(() => {
    fetch("/api/reports/statistics/filters").then((r) => (r.ok ? r.json() : { users: [] })).then((d) => setUsers(d.users ?? [])).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setSelected(new Set());
    const sp = buildParams({ page: String(page), pageSize: String(pageSize) });
    try {
      const r = await fetch(`/api/purchase-receipts?${sp.toString()}`);
      const d = await r.json();
      setRows(d.receipts ?? []);
      setTotal(d.total ?? 0);
      setTotals(d.totals ?? { totalAmount: 0, paidAmount: 0, remainingAmount: 0, saleValue: 0 });
    } finally {
      setLoading(false);
    }
  }, [buildParams, page, pageSize]);
  useEffect(() => { load(); }, [load]);

  function applyFilters() { setPage(1); setAppliedFilters({ from, to, status, supplierId, userId, q }); filter.close(); }
  function resetFilters() {
    const r = monthRange();
    setPreset("month"); setRange(r); setStatus(""); setSupplierId(""); setSupplierQuery(""); setUserId(""); setQ("");
    setPage(1);
    setAppliedFilters({ from: r.from, to: r.to, status: "", supplierId: "", userId: "", q: "" });
    filter.close();
  }
  function applyPreset(key: (typeof PRESETS)[number]["key"]) { setPreset(key); setRange(presetRange(key)); }

  const supplierDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleSupplierQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setSupplierQuery(next);
    setSupplierId("");
    if (supplierDebounce.current) clearTimeout(supplierDebounce.current);
    if (!next.trim()) { setSupplierResults([]); return; }
    supplierDebounce.current = setTimeout(() => {
      fetch(`/api/suppliers?q=${encodeURIComponent(next)}`).then((r) => r.json()).then((d) => setSupplierResults(d.suppliers ?? [])).catch(() => setSupplierResults([]));
    }, 250);
  }

  const qDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleQChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    if (qDebounce.current) clearTimeout(qDebounce.current);
    qDebounce.current = setTimeout(() => { setPage(1); setAppliedFilters((prev) => ({ ...prev, q: next })); }, 400);
  }

  async function createDraft() {
    const r = await fetch("/api/purchase-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!r.ok) { toast.error("Не удалось создать документ"); return; }
    const d = await r.json();
    router.push(`/purchases/${d.receipt.id}`);
  }

  async function startScan() {
    const r = await fetch("/api/purchase-receipts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    if (!r.ok) { toast.error("Не удалось создать документ"); return; }
    const d = await r.json();
    router.push(`/purchases/${d.receipt.id}/scan`);
  }

  async function duplicateSelected() {
    if (selected.size === 0) { toast.error("Выберите приёмки для копирования"); return; }
    action.close();
    const ids = [...selected];
    const results = await Promise.all(ids.map((id) => fetch(`/api/purchase-receipts/${id}/duplicate`, { method: "POST" })));
    const okCount = results.filter((r) => r.ok).length;
    if (okCount === 0) { toast.error("Не удалось скопировать"); return; }
    toast.success(`Скопировано: ${okCount}`);
    load();
  }

  function toggleSelected(id: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }
  function toggleSelectAll() {
    setSelected((prev) => (prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id))));
  }

  function exportCsv() {
    const sp = buildParams({ export: "xlsx" });
    window.open(`/api/purchase-receipts?${sp.toString()}`, "_blank");
  }

  function openPrint(variant: "plain" | "cost" | "sale") {
    print.close();
    if (selected.size !== 1) { toast.error("Выберите одну приёмку для печати"); return; }
    window.open(`/purchases/${[...selected][0]}/print?variant=${variant}`, "_blank");
  }

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const row of rows) {
      const key = dayKey(row.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(row);
    }
    return [...map.entries()];
  }, [rows]);

  const lastIndex = Math.min(page * pageSize, total);
  const firstIndex = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const colCount = 5 + Object.values(visible).filter(Boolean).length;

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Список приёмок</h1>

      <div className="flex flex-wrap items-center gap-2">
        <button onClick={createDraft} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4" /> Приёмка
        </button>
        <Link href="/purchases/quick" className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">
          <Zap className="h-4 w-4" /> Быстрая приёмка
        </Link>
        <button onClick={startScan} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">
          <ScanLine className="h-4 w-4" /> Сканирование
        </button>
        <button ref={filter.anchorRef} onClick={filter.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <SlidersHorizontal className="h-4 w-4" /> Фильтр
        </button>
        <button ref={action.anchorRef} onClick={action.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1 text-xs">{selected.size}</span> Действие
        </button>
        <button ref={print.anchorRef} onClick={print.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Printer className="h-4 w-4" /> Печать
        </button>
        <div className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground">
          С {fmtChipDate(appliedFilters.from)} по {fmtChipDate(appliedFilters.to)}
          <button onClick={resetFilters} aria-label="Сбросить период" className="rounded p-0.5 hover:bg-accent hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
        </div>
        <button onClick={exportCsv} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
          <Download className="h-4 w-4" /> Экспорт
        </button>
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-52 p-1">
          <button onClick={duplicateSelected} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">
            <Copy className="h-3.5 w-3.5" /> Копировать
          </button>
        </AnchoredPopover>
      )}

      {print.open && print.pos && (
        <AnchoredPopover pos={print.pos} onClose={print.close} className="w-56 p-1">
          <button onClick={() => openPrint("plain")} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная</button>
          <button onClick={() => openPrint("cost")} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная с ценами закупки</button>
          <button onClick={() => openPrint("sale")} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная с продажными ценами</button>
        </AnchoredPopover>
      )}

      {filter.open && filter.pos && (
        <AnchoredPopover pos={filter.pos} onClose={filter.close} className="w-80 space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата создания</label>
            <div className="flex gap-2 text-xs mb-1.5 flex-wrap">
              {PRESETS.map((p) => (
                <button key={p.key} onClick={() => applyPreset(p.key)} className={preset === p.key ? "font-semibold text-primary underline" : "text-primary hover:underline"}>{p.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <input type="date" value={toInputDate(from)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, from: new Date(e.target.value + "T00:00:00") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
              <span className="text-muted-foreground">—</span>
              <input type="date" value={toInputDate(to)} onChange={(e) => { setPreset(null); setRange((r) => ({ ...r, to: new Date(e.target.value + "T23:59:59") })); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Статус приёмки</label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Все</option>
              <option value="DRAFT">Черновик</option>
              <option value="POSTED">Проведён</option>
            </select>
          </div>
          <div className="relative">
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Поставщик</label>
            <input value={supplierQuery} onChange={handleSupplierQueryChange} placeholder="Введите название" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            {supplierResults.length > 0 && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-md border bg-popover shadow-md">
                {supplierResults.map((s) => (
                  <button key={s.id} onClick={() => { setSupplierId(s.id); setSupplierQuery(s.name); setSupplierResults([]); }} className="block w-full px-4 py-2.5 text-left text-sm hover:bg-muted/40">
                    {s.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Тип</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Выберите пользователя</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Код продукта/название</label>
            <input value={q} onChange={handleQChange} placeholder="Введите название или штрихкод" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={resetFilters} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Очистить</button>
            <button onClick={applyFilters} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Применить</button>
          </div>
        </AnchoredPopover>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-4 py-2.5">
                <input type="checkbox" checked={rows.length > 0 && selected.size === rows.length} onChange={toggleSelectAll} />
              </th>
              <th className="px-4 py-2.5 text-left">Номер</th>
              <th className="px-4 py-2.5 text-left">Дата</th>
              <th className="px-4 py-2.5 text-left">Пользователь</th>
              {visible.supplier && <th className="px-4 py-2.5 text-left">Поставщик</th>}
              {visible.account && <th className="px-4 py-2.5 text-left">Счет</th>}
              {visible.total && <th className="px-4 py-2.5 text-right">Сумма, ₸</th>}
              {visible.paid && <th className="px-4 py-2.5 text-right">Оплачено, ₸</th>}
              {visible.remaining && <th className="px-4 py-2.5 text-right">Осталось, ₸</th>}
              {canSeeCost && visible.purchaseValue && <th className="px-4 py-2.5 text-right">Сумма по закупочной, ₸</th>}
              {visible.saleValue && <th className="px-4 py-2.5 text-right">Сумма по продажной, ₸</th>}
              {visible.comment && <th className="px-4 py-2.5 text-left">Комментарий</th>}
              <th className="w-16 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы">
                  <Settings2 className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          {loading ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr></tbody>
          ) : rows.length === 0 ? (
            <tbody><tr><td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">
              <p className="font-medium text-foreground">Тут пока пусто</p>
              <p>Создайте новый документ</p>
            </td></tr></tbody>
          ) : (
            groups.map(([day, dayRows]) => {
              const dayTotal = dayRows.reduce((s, r) => s + r.totalAmount, 0);
              return (
                <tbody key={day}>
                  {dayRows.map((row) => { const draft = row.status === "DRAFT"; return (
                    <tr key={row.id} className={`hover:bg-muted/40 border-b ${draft ? "text-muted-foreground" : ""}`}>
                      <td className="px-4 py-2.5"><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelected(row.id)} /></td>
                      <td className="px-4 py-2.5">
                        <Link href={`/purchases/${row.id}`} className={draft ? "font-medium hover:underline" : "font-medium text-primary hover:underline"}>№{row.documentNo}</Link>
                      </td>
                      <td className="px-4 py-2.5">{fmtRowDate(row.createdAt)}</td>
                      <td className="px-4 py-2.5">{row.userName}</td>
                      {visible.supplier && <td className="px-4 py-2.5">{row.supplierName ?? "—"}</td>}
                      {visible.account && <td className="px-4 py-2.5">{draft ? "" : "Сейф - 1"}</td>}
                      {visible.total && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.totalAmount)}</td>}
                      {visible.paid && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.paidAmount)}</td>}
                      {visible.remaining && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.remainingAmount)}</td>}
                      {canSeeCost && visible.purchaseValue && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.totalAmount)}</td>}
                      {visible.saleValue && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(row.saleValue)}</td>}
                      {visible.comment && <td className="px-4 py-2.5 text-muted-foreground truncate max-w-[12rem]">{row.comment ?? ""}</td>}
                      <td className="px-2 py-2 text-right">
                        <Link href={`/purchases/${row.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Открыть">
                          <Pencil className="h-3.5 w-3.5" />
                        </Link>
                      </td>
                    </tr>
                  );})}
                  <tr className="bg-muted/30 text-xs font-medium text-muted-foreground">
                    <td colSpan={colCount - 1} className="px-3 py-1.5">Итого {day}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatCurrency(dayTotal)}</td>
                  </tr>
                </tbody>
              );
            })
          )}
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t bg-muted/30 text-sm font-semibold">
                <td className="px-4 py-2.5" colSpan={4}>Итого</td>
                {visible.supplier && <td></td>}
                {visible.account && <td></td>}
                {visible.total && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.totalAmount)}</td>}
                {visible.paid && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.paidAmount)}</td>}
                {visible.remaining && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.remainingAmount)}</td>}
                {canSeeCost && visible.purchaseValue && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.totalAmount)}</td>}
                {visible.saleValue && <td className="px-4 py-2.5 text-right tabular-nums">{formatCurrency(totals.saleValue)}</td>}
                {visible.comment && <td></td>}
                <td></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <p className="mb-2 text-xs text-muted-foreground">Настройте таблицу под себя и ваш выбор сохранится</p>
          <div className="space-y-1.5">
            {(([
              ["supplier", "Поставщик"], ["account", "Счет"], ["total", "Сумма"], ["paid", "Оплачено"],
              ["remaining", "Осталось"], ["purchaseValue", "Сумма по закупочной"], ["saleValue", "Сумма по продажной"], ["comment", "Комментарий"],
            ] as const).filter(([key]) => canSeeCost || key !== "purchaseValue")).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={visible[key]} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))} /> {label}
              </label>
            ))}
          </div>
        </AnchoredPopover>
      )}

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">{firstIndex}-{lastIndex} / {total}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
        </div>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
    </div>
  );
}
