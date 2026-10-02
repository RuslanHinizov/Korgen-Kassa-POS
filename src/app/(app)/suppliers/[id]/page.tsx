"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/utils";
import { useStorePath } from "@/components/store/store-provider";

/**
 * Редактирование поставщика — UMAG's own two-tab page: «Общие данные» (name, phone, comment, ИИН/БИН, type, full name,
 * addresses) and «Товары» (the products tied to this supplier; add by name/barcode, remove with ✕, then «Сохранить»).
 */

interface SupplierData {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  bin: string | null;
  counterpartyType: string | null;
  fullName: string | null;
  legalAddress: string | null;
  actualAddress: string | null;
  contactName: string | null;
  email: string | null;
}

interface SupplierProduct {
  id: string;
  name: string;
  barcode: string | null;
  cost: number | null;
  price: number;
  stock: number;
  unit: string;
}

const TYPES = ["Юридическое лицо", "ИП", "Физическое лицо"];
const PAGE_SIZE = 100;
const input = "h-9 w-full rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
const btn = "inline-flex h-9 items-center justify-center rounded-md px-5 text-sm font-medium";

function stockText(p: SupplierProduct) {
  if (p.stock === 0) return "0";
  return `${Number(p.stock.toFixed(3))} ${p.unit === "kg" ? "кг" : p.unit === "l" ? "л" : p.unit === "m" ? "м" : "шт."}`;
}

export default function SupplierEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const storePath = useStorePath();
  const search = useSearchParams();
  const [tab, setTab] = useState<"general" | "products">(search.get("tab") === "products" ? "products" : "general");
  const [supplier, setSupplier] = useState<SupplierData | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", notes: "", bin: "", counterpartyType: "", fullName: "", legalAddress: "", actualAddress: "" });
  const [showComment, setShowComment] = useState(false);
  const [saving, setSaving] = useState(false);
  const [missing, setMissing] = useState(false);

  const back = () => router.push(storePath("/suppliers"));

  const load = useCallback(async () => {
    const res = await fetch(`/api/suppliers/${id}`);
    if (!res.ok) { setMissing(true); return; }
    const s = (await res.json()).supplier as SupplierData;
    setSupplier(s);
    setForm({ name: s.name, phone: s.phone ?? "", notes: s.notes ?? "", bin: s.bin ?? "", counterpartyType: s.counterpartyType ?? "", fullName: s.fullName ?? "", legalAddress: s.legalAddress ?? "", actualAddress: s.actualAddress ?? "" });
    setShowComment(Boolean(s.notes));
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function saveGeneral() {
    if (!form.name.trim()) { toast.error("Введите имя поставщика"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/suppliers/${id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name.trim(), phone: form.phone.trim(), notes: form.notes.trim(), bin: form.bin.trim(), counterpartyType: form.counterpartyType, fullName: form.fullName.trim(), legalAddress: form.legalAddress.trim(), actualAddress: form.actualAddress.trim() }),
      });
      if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
      void load();
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!supplier || !window.confirm(`Удалить поставщика «${supplier.name}»?`)) return;
    const res = await fetch(`/api/suppliers/${id}`, { method: "DELETE" });
    if (!res.ok) { toast.error((await res.json().catch(() => null))?.error ?? "Не удалось удалить"); return; }
    toast.success("Поставщик удалён");
    back();
  }

  if (missing) return <div className="p-6 text-sm text-muted-foreground">Поставщик не найден.</div>;
  if (!supplier) return <div className="p-6 text-sm text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</div>;

  const tabBtn = (key: "general" | "products", label: string) => (
    <button onClick={() => setTab(key)} className={`px-5 py-2.5 text-sm font-semibold ${tab === key ? "border border-emerald-500 bg-background text-emerald-700" : "text-muted-foreground"}`}>{label}</button>
  );

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-3 flex">{tabBtn("general", "Общие данные")}{tabBtn("products", "Товары")}</div>

      {tab === "general" ? (
        <div className="rounded-md border bg-card p-5">
          <div className="mb-4 flex gap-2">
            <button onClick={() => void saveGeneral()} disabled={saving} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60`}>{saving ? "…" : "Сохранить"}</button>
            <button onClick={back} className={`${btn} bg-muted text-foreground hover:bg-muted/70`}>Закрыть</button>
            <button onClick={() => void remove()} className={`${btn} border border-red-400 text-red-600 hover:bg-red-50`}>Удалить</button>
          </div>
          <h1 className="mb-6 text-sm font-semibold">Редактирование поставщика {supplier.name}</h1>
          <div className="grid max-w-5xl gap-x-16 gap-y-4 lg:grid-cols-2">
            <div className="space-y-4">
              <label className="grid grid-cols-[10rem_1fr] items-center gap-3 text-sm">Имя поставщика *<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} /></label>
              <label className="grid grid-cols-[10rem_1fr] items-center gap-3 text-sm">Телефон<input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 (___) ___-__-__" className={input} /></label>
              <div className="grid grid-cols-[10rem_1fr] items-start gap-3 text-sm">
                <span className="pt-2">Комментарий</span>
                {showComment
                  ? <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
                  : <button type="button" onClick={() => setShowComment(true)} className="justify-self-end rounded p-1 text-sky-500 hover:bg-accent" aria-label="Добавить комментарий"><Plus className="h-5 w-5" /></button>}
              </div>
            </div>
            <div className="space-y-4">
              <label className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">ИИН/БИН<input value={form.bin} onChange={(e) => setForm({ ...form, bin: e.target.value })} placeholder="ИИН" className={input} /></label>
              <label className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">Тип контрагента
                <select value={form.counterpartyType} onChange={(e) => setForm({ ...form, counterpartyType: e.target.value })} className={input}>
                  <option value="">Выберите значение</option>
                  {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">Полное наименование<input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} placeholder="Полное наименование" className={input} /></label>
              <label className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">Юридический адрес<input value={form.legalAddress} onChange={(e) => setForm({ ...form, legalAddress: e.target.value })} placeholder="Юридический адрес" className={input} /></label>
              <label className="grid grid-cols-[12rem_1fr] items-center gap-3 text-sm">Фактический адрес<input value={form.actualAddress} onChange={(e) => setForm({ ...form, actualAddress: e.target.value })} placeholder="Фактический адрес" className={input} /></label>
            </div>
          </div>
        </div>
      ) : (
        <ProductsTab supplierId={id} supplierName={supplier.name} />
      )}
    </div>
  );
}

function ProductsTab({ supplierId, supplierName }: { supplierId: string; supplierName: string }) {
  const [rows, setRows] = useState<SupplierProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<SupplierProduct[]>([]);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<SupplierProduct[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (p: number, f: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/suppliers/${supplierId}/products?page=${p}&pageSize=${PAGE_SIZE}&q=${encodeURIComponent(f)}`);
      if (!res.ok) { toast.error("Не удалось загрузить товары"); return; }
      const d = await res.json();
      setRows(d.products); setTotal(d.total);
    } finally { setLoading(false); }
  }, [supplierId]);
  useEffect(() => { void load(page, filter); }, [load, page, filter]);

  // «Добавление по названию/штрихкоду»
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setFound([]); return; }
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) return;
      const list = (await res.json()) as { id: string; name: string; barcode: string | null; price: number; stock: number; unit?: string; cost?: number | null }[];
      setFound(list.slice(0, 8).map((p) => ({ id: p.id, name: p.name, barcode: p.barcode, cost: p.cost ?? null, price: p.price, stock: p.stock, unit: p.unit ?? "pcs" })));
    }, 250);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const visible = [...added.filter((a) => !rows.some((r) => r.id === a.id)), ...rows].filter((r) => !removed.has(r.id));
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const dirty = removed.size > 0 || added.length > 0;

  function addProduct(p: SupplierProduct) {
    if (visible.some((r) => r.id === p.id)) { toast.info("Этот товар уже у поставщика"); return; }
    setRemoved((s) => { const n = new Set(s); n.delete(p.id); return n; });
    setAdded((a) => (a.some((x) => x.id === p.id) ? a : [p, ...a]));
    setQ(""); setFound([]);
  }
  function removeProduct(p: SupplierProduct) {
    if (added.some((a) => a.id === p.id)) setAdded((a) => a.filter((x) => x.id !== p.id));
    else setRemoved((s) => new Set(s).add(p.id));
  }

  async function save() {
    setSaving(true);
    try {
      for (const p of added) {
        const r = await fetch(`/api/suppliers/${supplierId}/products`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: p.id }) });
        if (!r.ok) { toast.error(`Не удалось добавить «${p.name}»`); return; }
      }
      for (const pid of removed) {
        const r = await fetch(`/api/suppliers/${supplierId}/products?productId=${encodeURIComponent(pid)}`, { method: "DELETE" });
        if (!r.ok) { toast.error("Не удалось убрать товар"); return; }
      }
      toast.success("Сохранено");
      setAdded([]); setRemoved(new Set());
      void load(page, filter);
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-md border bg-card p-5">
      <h2 className="mb-3 text-sm font-semibold">Товары поставщика «{supplierName}»</h2>
      <div className="mb-4 flex flex-wrap items-start gap-4">
        <button onClick={() => void save()} disabled={saving || !dirty} className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50`}>{saving ? "…" : "Сохранить"}</button>
        <div className="relative">
          <label className="flex items-center gap-2 text-sm">Добавление по названию/штрихкоду
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Введите имя продукта или штрихкод" className="h-9 w-72 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </label>
          {found.length > 0 && (
            <div className="absolute right-0 z-20 mt-1 w-[28rem] max-w-[90vw] overflow-hidden rounded-md border bg-card shadow-lg">
              {found.map((p) => (
                <button key={p.id} onClick={() => addProduct(p)} className="flex w-full items-center justify-between gap-3 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent">
                  <span className="min-w-0"><span className="block truncate">{p.name}</span><span className="block text-xs text-muted-foreground">{p.barcode ?? "без штрихкода"}</span></span>
                  <span className="shrink-0 tabular-nums">{formatCurrency(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <input value={filter} onChange={(e) => { setFilter(e.target.value); setPage(1); }} placeholder="Поиск в списке" className="ml-auto h-9 w-56 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left font-semibold">
            <tr>
              <th className="w-12 px-3 py-2.5">№</th><th className="px-3 py-2.5">Название</th><th className="px-3 py-2.5">Штрихкод</th>
              <th className="px-3 py-2.5">Закупочная цена</th><th className="px-3 py-2.5">Маржа</th><th className="px-3 py-2.5">Продажная цена</th><th className="px-3 py-2.5">Осталось</th><th className="w-14" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Загрузка…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">Нет товаров</td></tr>
            ) : visible.map((p, i) => {
              const margin = p.cost != null && p.price > 0 ? Math.round(((p.price - p.cost) / p.price) * 10000) / 100 : null;
              const isNew = added.some((a) => a.id === p.id);
              return (
                <tr key={p.id} className={`border-b ${isNew ? "bg-emerald-50 dark:bg-emerald-950/30" : ""}`}>
                  <td className="px-3 py-2">{(page - 1) * PAGE_SIZE + i + 1}</td>
                  <td className="px-3 py-2">{p.name}</td>
                  <td className="px-3 py-2 tabular-nums">{p.barcode ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{p.cost == null ? "—" : formatCurrency(p.cost)}</td>
                  <td className="px-3 py-2 tabular-nums">{margin == null ? "—" : `${margin}%`}</td>
                  <td className="px-3 py-2 tabular-nums">{formatCurrency(p.price)}</td>
                  <td className="px-3 py-2 tabular-nums">{stockText(p)}</td>
                  <td className="px-3 py-2 text-right"><button onClick={() => removeProduct(p)} aria-label="Убрать" className="inline-flex h-8 w-8 items-center justify-center rounded bg-sky-500 text-white hover:bg-sky-600"><X className="h-4 w-4" /></button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>Всего: {total}{dirty ? " · есть несохранённые изменения" : ""}</span>
        <span className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded border px-3 py-1 disabled:opacity-40">‹</button>
          {page} / {pages}
          <button disabled={page >= pages} onClick={() => setPage(page + 1)} className="rounded border px-3 py-1 disabled:opacity-40">›</button>
        </span>
      </div>
    </div>
  );
}
