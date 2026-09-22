"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { useSession } from "@/lib/auth-client";
import { useStoreId } from "@/components/store/store-provider";
import { formatCurrency } from "@/lib/utils";
import { isFractionalUnit, parseQuantityInput, unitLabel, UNIT_OPTIONS } from "@/lib/units";
import { toast } from "sonner";
import {
  ArrowDown, ArrowUp, ArrowUpDown, Check, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  Loader2, MessageSquarePlus, PackageOpen, Plus, Printer, Settings2, Trash2, Upload, X,
} from "lucide-react";
import { ImportItemsModal } from "@/components/ui/import-items-modal";
import { ProductPickerModal, type PickableProduct } from "@/components/ui/product-picker-modal";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";

type Status = "DRAFT" | "POSTED" | "CANCELLED";
const STATUS_LABEL: Record<Status, string> = { DRAFT: "Черновик", POSTED: "Проведён", CANCELLED: "Удалён" };

interface Item {
  id: string; productId: string; productName: string; barcode: string | null; unit: string;
  currentStock: number; quantity: number; unitCost: number | null; salePrice: number; total: number;
}
interface Doc {
  id: string; documentNo: number; status: Status; comment: string | null;
  createdAt: string; postedAt: string | null; totalAmount: number; userName: string;
  fromStoreName: string; toStoreId: string; toStoreName: string; items: Item[];
}
interface StoreOpt { id: string; name: string }

type SortKey = "quantity" | "currentStock" | "unitCost" | "markup" | "salePrice" | "total";
type ColKey = "barcode" | "stock" | "unit" | "cost" | "markup" | "price";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function markupPct(cost: number | null, price: number) {
  if (!cost || cost <= 0) return 0;
  return ((price - cost) / cost) * 100;
}

export function StoreTransferDetail({ id }: { id: string }) {
  // UMAG never shows Закупочная цена/Наценка to Складской работник.
  const canSeeCost = useSession().data?.user.role !== "WAREHOUSE";
  const router = useRouter();
  const currentStoreId = useStoreId();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [stores, setStores] = useState<StoreOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [commentOpen, setCommentOpen] = useState(false);
  const print = useAnchoredPopover();
  const action = useAnchoredPopover();
  const columns = useAnchoredPopover();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [tableQuery, setTableQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [visible, setVisible] = useState<Record<ColKey, boolean>>({ barcode: true, stock: true, unit: true, cost: canSeeCost, markup: canSeeCost, price: true });

  const [catalogPicker, setCatalogPicker] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [nameQuery, setNameQuery] = useState("");
  const [nameResults, setNameResults] = useState<PickableProduct[]>([]);
  const nameDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [barcodeInput, setBarcodeInput] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/store-transfers/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/products/transfer"); return; }
    const d = await r.json();
    setDoc(d.transfer);
    setComment(d.transfer.comment ?? "");
    if (d.transfer.comment) setCommentOpen(true);
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/stores").then((r) => r.json()).then((d) => setStores((d.stores ?? []).filter((s: StoreOpt) => s.id !== currentStoreId)));
  }, [currentStoreId]);

  const draft = doc?.status === "DRAFT";

  async function saveComment() {
    if (comment === (doc?.comment ?? "")) return;
    await fetch(`/api/store-transfers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) });
    load();
  }

  async function saveDate(value: string) {
    if (!value) return;
    const r = await fetch(`/api/store-transfers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ createdAt: new Date(value).toISOString() }) });
    if (!r.ok) { toast.error("Не удалось сохранить дату"); return; }
    load();
  }

  async function changeToStore(toStoreId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toStoreId }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  function manualSave() {
    saveComment();
    toast.success("Сохранено");
  }

  async function addProductById(productId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, quantity: 1 }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function addFromCatalog(products: PickableProduct[]) {
    setCatalogPicker(false);
    setBusy(true);
    try {
      for (const p of products) {
        await fetch(`/api/store-transfers/${id}/items`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId: p.id, quantity: 1 }),
        });
      }
      load();
    } finally { setBusy(false); }
  }

  function handleNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setNameQuery(next);
    if (nameDebounce.current) clearTimeout(nameDebounce.current);
    if (!next.trim()) { setNameResults([]); return; }
    nameDebounce.current = setTimeout(() => {
      fetch(`/api/products/search?q=${encodeURIComponent(next)}`).then((r) => (r.ok ? r.json() : [])).then(setNameResults).catch(() => setNameResults([]));
    }, 250);
  }

  async function addByBarcode() {
    const code = barcodeInput.trim();
    if (!code) return;
    const r = await fetch(`/api/products/search?q=${encodeURIComponent(code)}`);
    const results: { id: string; barcode: string | null }[] = r.ok ? await r.json() : [];
    const match = results.find((p) => p.barcode === code);
    if (!match) { toast.error("Товар с таким штрихкодом не найден"); return; }
    setBarcodeInput("");
    await addProductById(match.id);
  }

  async function updateItemQty(itemId: string, quantity: number) {
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteSelectedItems() {
    if (selected.size === 0) { toast.error("Выберите товары"); return; }
    action.close();
    const ids = [...selected];
    await Promise.all(ids.map((itemId) => fetch(`/api/store-transfers/${id}/items/${itemId}`, { method: "DELETE" })));
    setSelected(new Set());
    toast.success(`Удалено: ${ids.length}`);
    load();
  }

  async function createProduct(data: { name: string; barcode: string; unit: string }) {
    setBusy(true);
    try {
      const r = await fetch("/api/products/quick-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, barcode: data.barcode || undefined, unit: data.unit }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось создать товар"); return; }
      const d = await r.json();
      setCreateOpen(false);
      await addProductById(d.product.id);
    } finally { setBusy(false); }
  }

  async function importItems(rows: { barcode: string; quantity: number }[]) {
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}/items/import`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: rows }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось импортировать"); return; }
      const d = await r.json();
      setImportOpen(false);
      if (d.notFound.length > 0) toast.error(`Добавлено: ${d.added}. Не найдено по штрихкоду: ${d.notFound.length}`);
      else toast.success(`Добавлено товаров: ${d.added}`);
      load();
    } finally { setBusy(false); }
  }

  async function postDoc() {
    if (!doc || doc.items.length === 0) { toast.error("Добавьте хотя бы один товар"); return; }
    if (!confirm(`Провести перемещение №${doc.documentNo} из «${doc.fromStoreName}» в «${doc.toStoreName}»? Остатки будут скорректированы в обоих магазинах.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/store-transfers/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Перемещение проведено");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить это перемещение?")) return;
    const r = await fetch(`/api/store-transfers/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/products/transfer");
  }

  function toggleSort(key: SortKey) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  const filteredItems = useMemo(() => {
    if (!doc) return [];
    const q = tableQuery.trim().toLowerCase();
    let rows = doc.items;
    if (q) rows = rows.filter((i) => i.productName.toLowerCase().includes(q) || (i.barcode ?? "").includes(q));
    if (sort) {
      rows = [...rows].sort((a, b) => {
        const val = (i: Item) => (sort.key === "markup" ? markupPct(i.unitCost, i.salePrice) : sort.key === "unitCost" ? (i.unitCost ?? 0) : i[sort.key]);
        const diff = val(a) - val(b);
        return sort.dir === "asc" ? diff : -diff;
      });
    }
    return rows;
  }, [doc, tableQuery, sort]);

  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const pageItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const sumQty = filteredItems.reduce((s, i) => s + i.quantity, 0);
  const sumTotal = filteredItems.reduce((s, i) => s + i.total, 0);
  const colCount = 4 + Object.values(visible).filter(Boolean).length + (draft ? 1 : 0);

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === pageItems.length ? new Set() : new Set(pageItems.map((i) => i.id))));
  }
  function toggleSelected(itemId: string) {
    setSelected((prev) => { const next = new Set(prev); if (next.has(itemId)) next.delete(itemId); else next.add(itemId); return next; });
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold">Перемещение №{doc.documentNo} <span className="text-sm font-normal text-muted-foreground">| {STATUS_LABEL[doc.status]}</span></h1>
        </div>
        <p className="text-xs text-muted-foreground">Создатель: {doc.userName}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {draft && (
            <button onClick={postDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Провести
            </button>
          )}
          {draft && (
            <button onClick={manualSave} className="inline-flex h-9 items-center rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">Сохранить</button>
          )}
          <Link href="/products/transfer" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">Закрыть</Link>
        </div>
        <div className="flex items-center gap-2">
          {draft && (
            <button onClick={() => setCommentOpen((v) => !v)} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
              <MessageSquarePlus className="h-4 w-4" /> Добавить комментарий
            </button>
          )}
          {draft && (
            <button onClick={deleteDoc} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
              Удалить перемещение
            </button>
          )}
          <button ref={print.anchorRef} onClick={print.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            <Printer className="h-4 w-4" /> Печать
          </button>
        </div>
      </div>

      {print.open && print.pos && (
        <AnchoredPopover pos={print.pos} onClose={print.close} className="w-48 p-1">
          <button onClick={() => { print.close(); window.open(`/products/transfer/${id}/print`, "_blank"); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная</button>
        </AnchoredPopover>
      )}

      {commentOpen && (
        <div className="rounded-lg border p-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
          {draft ? (
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} onBlur={saveComment} rows={2} className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm" />
          ) : (
            <p className="text-sm text-muted-foreground">{doc.comment || "—"}</p>
          )}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3 rounded-lg border p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата перемещения*</label>
          {draft ? (
            <input type="datetime-local" defaultValue={toLocalInput(doc.createdAt)} key={doc.createdAt} onBlur={(e) => saveDate(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          ) : (
            <p className="text-sm">{new Date(doc.createdAt).toLocaleString("ru-RU")}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Откуда</label>
          <p className="flex h-9 items-center rounded-md border bg-muted/30 px-2 text-sm text-muted-foreground">{doc.fromStoreName}</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Куда?</label>
          {draft ? (
            <select value={doc.toStoreId} onChange={(e) => changeToStore(e.target.value)} disabled={busy} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value={doc.toStoreId}>{doc.toStoreName}</option>
              {stores.filter((s) => s.id !== doc.toStoreId).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <p className="text-sm">{doc.toStoreName}</p>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Товары</span>
        <button ref={action.anchorRef} onClick={action.toggle} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent">
          <span className="flex h-5 min-w-5 items-center justify-center rounded bg-muted px-1">{selected.size}</span> Действие
        </button>
        <input value={tableQuery} onChange={(e) => { setTableQuery(e.target.value); setPage(1); }} placeholder="Поиск по таблице" className="h-8 w-56 rounded-md border bg-background px-2 text-xs" />
      </div>

      {action.open && action.pos && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-56 p-1">
          <button onClick={deleteSelectedItems} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" /> Удалить выбранное
          </button>
        </AnchoredPopover>
      )}

      <div className="rounded-lg border bg-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="w-10 px-3 py-2"><input type="checkbox" checked={pageItems.length > 0 && selected.size === pageItems.length} onChange={toggleSelectAll} /></th>
              <th className="px-3 py-2 text-left">№</th>
              <th className="px-3 py-2 text-left">Название товара</th>
              {visible.barcode && <th className="px-3 py-2 text-left">Штрихкод</th>}
              <SortableTh label="Кол-во" active={sort?.key === "quantity"} dir={sort?.key === "quantity" ? sort.dir : undefined} onClick={() => toggleSort("quantity")} />
              {visible.stock && <SortableTh label="Остаток" active={sort?.key === "currentStock"} dir={sort?.key === "currentStock" ? sort.dir : undefined} onClick={() => toggleSort("currentStock")} />}
              {visible.unit && <th className="px-3 py-2 text-left">Ед. изм</th>}
              {canSeeCost && visible.cost && <SortableTh label="Закупочная цена, ₮" active={sort?.key === "unitCost"} dir={sort?.key === "unitCost" ? sort.dir : undefined} onClick={() => toggleSort("unitCost")} />}
              {canSeeCost && visible.markup && <SortableTh label="Наценка, %" active={sort?.key === "markup"} dir={sort?.key === "markup" ? sort.dir : undefined} onClick={() => toggleSort("markup")} />}
              {visible.price && <SortableTh label="Продажная цена, ₮" active={sort?.key === "salePrice"} dir={sort?.key === "salePrice" ? sort.dir : undefined} onClick={() => toggleSort("salePrice")} />}
              {canSeeCost && <SortableTh label="Итого, ₮" active={sort?.key === "total"} dir={sort?.key === "total" ? sort.dir : undefined} onClick={() => toggleSort("total")} />}
              <th className="w-16 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent" aria-label="Настроить столбцы"><Settings2 className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {pageItems.map((item, idx) => (
              <tr key={item.id} className="hover:bg-muted/40">
                <td className="px-3 py-2"><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} /></td>
                <td className="px-3 py-2 text-muted-foreground">{(page - 1) * pageSize + idx + 1}</td>
                <td className="px-3 py-2">
                  <Link href={`/products/${item.productId}/edit`} target="_blank" className="font-medium text-primary hover:underline">{item.productName}</Link>
                </td>
                {visible.barcode && <td className="px-3 py-2 text-muted-foreground tabular-nums">{item.barcode ?? "—"}</td>}
                <td className="px-3 py-2 text-right">
                  {draft ? (
                    <input type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min={isFractionalUnit(item.unit) ? "0.001" : "1"} step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.quantity} key={item.quantity}
                      onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit); if (v !== null && v !== item.quantity) updateItemQty(item.id, v); }}
                      className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs" />
                  ) : item.quantity}
                </td>
                {visible.stock && <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.currentStock}</td>}
                {visible.unit && <td className="px-3 py-2 text-muted-foreground">{unitLabel(item.unit)}</td>}
                {canSeeCost && visible.cost && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.unitCost ?? 0)}</td>}
                {canSeeCost && visible.markup && <td className="px-3 py-2 text-right tabular-nums">{markupPct(item.unitCost, item.salePrice).toFixed(2)}%</td>}
                {visible.price && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.salePrice)}</td>}
                {canSeeCost && <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(item.total)}</td>}
                {draft && (
                  <td className="px-2 py-2 text-right">
                    <button onClick={() => deleteItem(item.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить"><X className="h-3.5 w-3.5" /></button>
                  </td>
                )}
              </tr>
            ))}
            {pageItems.length === 0 && (
              <tr>
                <td colSpan={colCount} className="px-3 py-10 text-center text-muted-foreground">
                  <PackageOpen className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  <p>Тут пока пусто</p>
                  {draft && <p className="text-xs">Добавьте товары с помощью панели ниже</p>}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <span className="text-xs font-medium text-muted-foreground shrink-0">Способы добавления товара</span>
            <div className="relative w-56">
              <input value={nameQuery} onChange={handleNameChange} placeholder="Поиск по названию" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
              {nameResults.length > 0 && (
                <div className="absolute z-10 mt-1 max-h-56 w-72 overflow-y-auto rounded-md border bg-popover shadow-md">
                  {nameResults.slice(0, 20).map((p) => (
                    <button key={p.id} onClick={() => { addProductById(p.id); setNameQuery(""); setNameResults([]); }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/40">
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-xs text-muted-foreground">остаток: {p.stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <input value={barcodeInput} onChange={(e) => setBarcodeInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addByBarcode(); }} placeholder="Штрихкод" className="h-9 w-40 rounded-md border bg-background px-2 text-sm" />
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setCatalogPicker(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">Добавить из номенклатуры</button>
              <button onClick={() => setCreateOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10"><Plus className="h-4 w-4" /> Создать товар</button>
              <button onClick={() => setImportOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10"><Upload className="h-4 w-4" /> Импорт товаров</button>
            </div>
          </div>
        )}
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56">
          <p className="mb-1 font-semibold">Видимость столбцов</p>
          <div className="space-y-1.5">
            {(([["barcode", "Штрихкод"], ["stock", "Остаток"], ["unit", "Ед. изм"], ["cost", "Закупочная цена"], ["markup", "Наценка"], ["price", "Продажная цена"]] as const).filter(([key]) => canSeeCost || (key !== "cost" && key !== "markup"))).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={visible[key]} onChange={(e) => setVisible((v) => ({ ...v, [key]: e.target.checked }))} /> {label}
              </label>
            ))}
          </div>
        </AnchoredPopover>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">{filteredItems.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, filteredItems.length)} / {filteredItems.length}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
            {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="font-semibold">Итого: <span className="tabular-nums">{sumQty}</span>{canSeeCost && <span className="ml-3 tabular-nums">{formatCurrency(sumTotal)}</span>}</div>
      </div>

      {catalogPicker && (
        <ProductPickerModal title="Добавление товаров из номенклатуры" onClose={() => setCatalogPicker(false)} onSelect={addFromCatalog} />
      )}
      {createOpen && <CreateProductModal busy={busy} onClose={() => setCreateOpen(false)} onCreate={createProduct} />}
      {importOpen && <ImportItemsModal busy={busy} onClose={() => setImportOpen(false)} onImport={importItems} />}
    </div>
  );
}

function SortableTh({ label, active, dir, onClick }: { label: string; active?: boolean; dir?: "asc" | "desc"; onClick: () => void }) {
  return (
    <th className="px-3 py-2 text-right">
      <button onClick={onClick} className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}>
        {label}
        {active ? (dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    </th>
  );
}

function CreateProductModal({ onClose, onCreate, busy }: { onClose: () => void; onCreate: (data: { name: string; barcode: string; unit: string }) => void; busy: boolean }) {
  const [name, setName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [unit, setUnit] = useState("pcs");

  function generateBarcode() {
    let code = "2";
    for (let i = 0; i < 11; i++) code += Math.floor(Math.random() * 10);
    let sum = 0;
    for (let i = 0; i < 12; i++) sum += Number(code[i]) * (i % 2 === 0 ? 1 : 3);
    code += String((10 - (sum % 10)) % 10);
    setBarcode(code);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">Создание товара</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Название *</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Единица измерения *</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Штрихкод</label>
            <div className="flex items-center gap-2">
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
              <button onClick={generateBarcode} className="shrink-0 text-xs text-primary hover:underline">Сгенерировать</button>
            </div>
          </div>
          <button
            onClick={() => onCreate({ name: name.trim(), barcode: barcode.trim(), unit })}
            disabled={busy || !name.trim()}
            className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Создать
          </button>
        </div>
      </div>
    </div>
  );
}
