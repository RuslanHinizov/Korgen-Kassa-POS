"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { isFractionalUnit, parseQuantityInput, unitLabel } from "@/lib/units";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, Loader2, MessageSquarePlus, Search, Settings2, SlidersHorizontal, Trash2, X } from "lucide-react";
import { AnchoredPopover, useAnchoredPopover } from "@/components/ui/anchored-popover";
import { BarcodeLabelButton } from "@/components/products/barcode-label-button";

interface Item {
  id: string; productId: string; productName: string; barcode: string | null; unit: string;
  currentStock: number; quantity: number; unitCost: number; catalogCost: number; catalogPrice: number;
  note: string | null; total: number;
}
interface Doc {
  id: string; documentNo: number; status: "DRAFT" | "POSTED" | "DELETED"; stockInDate: string;
  note: string | null; totalCost: number; userName: string; postedAt: string | null; items: Item[];
}
interface PickProduct { id: string; name: string; price: number; stock: number; unit?: string; barcode?: string | null }

interface PriceEditorState { itemId: string; pos: { top: number; left: number }; cost: number; markup: number; price: number }

const STATUS_LABEL: Record<Doc["status"], string> = { DRAFT: "Черновик", POSTED: "Проведён", DELETED: "Удалён" };
const STATUS_BADGE: Record<Doc["status"], string> = {
  DRAFT: "bg-muted text-muted-foreground",
  POSTED: "bg-primary/10 text-primary",
  DELETED: "bg-destructive/10 text-destructive",
};
const COLUMN_DEFS = [
  { key: "quantity", label: "Кол-во" },
  { key: "currentStock", label: "Текущий остаток на складе" },
  { key: "unit", label: "Ед. изм" },
  { key: "cost", label: "Закупочная цена" },
  { key: "markup", label: "Наценка, %" },
  { key: "price", label: "Продажная цена, ₸" },
  { key: "unitCost", label: "Цена" },
  { key: "total", label: "Итого" },
  { key: "comment", label: "Комментарий" },
] as const;
type ColumnKey = (typeof COLUMN_DEFS)[number]["key"];

export function StockInDetail({ id, canPost = false }: { id: string; canPost?: boolean }) {
  const router = useRouter();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [priceEditor, setPriceEditor] = useState<PriceEditorState | null>(null);
  const [tableSearch, setTableSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [visible, setVisible] = useState<Record<ColumnKey, boolean>>({
    quantity: true, currentStock: true, unit: true, cost: true, markup: true, price: true, unitCost: true, total: true, comment: true,
  });

  const action = useAnchoredPopover();
  const exportMenu = useAnchoredPopover();
  const columns = useAnchoredPopover();

  const load = useCallback(async () => {
    const r = await fetch(`/api/stock-in/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/products/stock-in"); return; }
    const d = await r.json();
    setDoc(d.stockIn);
    setSelected(new Set());
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  const draft = doc?.status === "DRAFT";

  async function addProduct(p: PickProduct) {
    setBusy(true);
    try {
      const r = await fetch(`/api/stock-in/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: p.id, quantity: 1 }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function addByBarcode(barcode: string) {
    if (!barcode.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/stock-in/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ barcode: barcode.trim(), quantity: 1 }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Товар не найден"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function updateItem(itemId: string, patch: { quantity?: number; unitCost?: number; price?: number; note?: string | null }) {
    setBusy(true);
    try {
      const r = await fetch(`/api/stock-in/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      if (patch.unitCost !== undefined && patch.price !== undefined) toast.success("Цена успешно сохранена в номенклатуре");
      load();
    } finally { setBusy(false); }
  }

  function openPriceEditor(item: Item, rect: DOMRect) {
    const markup = item.catalogCost > 0 ? ((item.catalogPrice - item.catalogCost) / item.catalogCost) * 100 : 0;
    setPriceEditor({
      itemId: item.id, pos: { top: rect.bottom + 4, left: rect.left },
      cost: item.unitCost, markup, price: Math.round(item.unitCost * (1 + markup / 100) * 100) / 100,
    });
  }
  function confirmPriceEditor() {
    if (!priceEditor) return;
    updateItem(priceEditor.itemId, { unitCost: priceEditor.cost, price: priceEditor.price });
    setPriceEditor(null);
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/stock-in/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteSelectedItems() {
    if (selected.size === 0) { toast.error("Выберите товары"); return; }
    action.close();
    const ids = [...selected];
    await Promise.all(ids.map((itemId) => fetch(`/api/stock-in/${id}/items/${itemId}`, { method: "DELETE" })));
    toast.success(`Удалено: ${ids.length}`);
    load();
  }
  function printSelectedLabel() {
    action.close();
    if (selected.size !== 1) { toast.error("Выберите один товар для печати"); return; }
    const item = doc?.items.find((i) => i.id === [...selected][0]);
    if (item) window.dispatchEvent(new CustomEvent("print-single-label", { detail: item.productId }));
  }

  async function saveComment() {
    const r = await fetch(`/api/stock-in/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: commentText }) });
    if (!r.ok) { toast.error("Не удалось сохранить комментарий"); return; }
    setCommentOpen(false);
    load();
  }

  async function changeDate(value: string) {
    if (!value) return;
    const r = await fetch(`/api/stock-in/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stockInDate: new Date(value).toISOString() }) });
    if (!r.ok) { toast.error("Не удалось изменить дату"); return; }
    load();
  }

  async function postDoc() {
    if (!doc || doc.items.length === 0) { toast.error("Добавьте хотя бы один товар"); return; }
    if (!confirm(`Провести оприходование №${doc.documentNo} на ${formatCurrency(doc.totalCost)}? Остатки будут увеличены.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/stock-in/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Оприходование проведено");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить черновик оприходования?")) return;
    const r = await fetch(`/api/stock-in/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/products/stock-in");
  }

  function exportCsv() {
    exportMenu.close();
    if (!doc) return;
    const header = ["Название товара", "Штрихкод", "Кол-во", "Ед.изм", "Закупочная цена", "Наценка, %", "Продажная цена", "Цена", "Итого", "Комментарий"];
    const lines = [header.join(";")];
    for (const i of visibleItems) {
      const markup = i.catalogCost > 0 ? ((i.catalogPrice - i.catalogCost) / i.catalogCost) * 100 : 0;
      lines.push(
        [i.productName, i.barcode ?? "", i.quantity, unitLabel(i.unit), i.catalogCost.toFixed(2), markup.toFixed(1), i.catalogPrice.toFixed(2), i.unitCost.toFixed(2), i.total.toFixed(2), i.note ?? ""]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";")
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `oprihodovanie-${doc.documentNo}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  const visibleItems = doc.items.filter((i) => {
    if (!tableSearch.trim()) return true;
    const q = tableSearch.trim().toLowerCase();
    return i.productName.toLowerCase().includes(q) || (i.barcode ?? "").includes(q);
  });

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/products/stock-in" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Оприходование
        </Link>
        <h1 className="text-xl font-bold">Оприходование №{doc.documentNo}</h1>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_BADGE[doc.status]}`}>{STATUS_LABEL[doc.status]}</span>
        <span className="text-xs text-muted-foreground">Создатель: {doc.userName}</span>
        <div className="ml-auto flex items-center gap-2">
          {draft && (
            <>
              <button onClick={() => { setCommentText(doc.note ?? ""); setCommentOpen(true); }} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
                <MessageSquarePlus className="h-4 w-4" /> Добавить комментарий
              </button>
              <button onClick={deleteDoc} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">
                <Trash2 className="h-4 w-4" /> Удалить оприходование
              </button>
            </>
          )}
          <div className="relative">
            <button ref={exportMenu.anchorRef} onClick={exportMenu.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
              <Download className="h-4 w-4" /> Экспорт
            </button>
          </div>
          {draft && canPost && (
            <button onClick={postDoc} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Провести
            </button>
          )}
        </div>
      </div>

      {exportMenu.open && exportMenu.pos && (
        <AnchoredPopover pos={exportMenu.pos} onClose={exportMenu.close} className="w-40 p-1">
          <button onClick={exportCsv} className="block w-full rounded px-2 py-1.5 text-left hover:bg-accent">Экспорт в xls</button>
        </AnchoredPopover>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Дата оприходования *</label>
        <input
          type="datetime-local" disabled={!draft} defaultValue={toLocalInput(doc.stockInDate)}
          onBlur={(e) => e.target.value && changeDate(e.target.value)}
          className="h-9 w-56 rounded-md border bg-background px-2 text-sm disabled:opacity-60"
        />
      </div>

      {doc.note && <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">Комментарий: {doc.note}</p>}
      {draft && !canPost && <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">Когда черновик будет готов, руководитель проверит его и проведёт поступление.</p>}

      {draft && <ProductPicker onPick={addProduct} onScan={addByBarcode} busy={busy} />}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">Товары ({visibleItems.length})</span>
        <button ref={action.anchorRef} onClick={action.toggle} disabled={selected.size === 0} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium hover:bg-accent disabled:opacity-40">
          <span className="flex h-4 min-w-4 items-center justify-center rounded bg-muted px-1">{selected.size}</span> Действие
        </button>
        <div className="relative ml-auto w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} placeholder="Поиск по таблице" className="h-8 w-full rounded-md border bg-background pl-8 pr-2 text-sm" />
        </div>
      </div>

      {action.open && action.pos && draft && (
        <AnchoredPopover pos={action.pos} onClose={action.close} className="w-52 p-1">
          <button onClick={printSelectedLabel} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Печать этикетки</button>
          <button onClick={deleteSelectedItems} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-destructive hover:bg-destructive/10">
            <Trash2 className="h-3.5 w-3.5" /> Удалить выбранные
          </button>
        </AnchoredPopover>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {draft && <th className="w-8 px-3 py-2"></th>}
              <th className="px-3 py-2 text-left">№</th>
              <th className="px-3 py-2 text-left">Название товара</th>
              <th className="px-3 py-2 text-left">Штрихкод</th>
              {visible.quantity && <th className="px-3 py-2 text-right">Кол-во</th>}
              {visible.currentStock && <th className="px-3 py-2 text-right">Текущий остаток на складе</th>}
              {visible.unit && <th className="px-3 py-2 text-left">Ед. изм</th>}
              {visible.unitCost && <th className="px-3 py-2 text-right">Цена</th>}
              {visible.cost && <th className="px-3 py-2 text-right">Закупочная цена</th>}
              {visible.markup && <th className="px-3 py-2 text-right">Наценка, %</th>}
              {visible.price && <th className="px-3 py-2 text-right">Продажная цена, ₸</th>}
              {visible.total && <th className="px-3 py-2 text-right">Итого</th>}
              {visible.comment && <th className="px-3 py-2 text-left">Комментарий</th>}
              {draft && <th className="px-3 py-2"></th>}
              <th className="w-8 px-2 py-2 text-right">
                <button ref={columns.anchorRef} onClick={columns.toggle} className="rounded p-1 hover:bg-accent"><Settings2 className="h-4 w-4" /></button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleItems.map((item, idx) => (
              <StockInRow
                key={item.id} index={idx + 1} item={item} draft={!!draft} visible={visible}
                selected={selected.has(item.id)}
                onToggleSelect={() => setSelected((s) => { const n = new Set(s); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                onUpdate={updateItem} onDelete={deleteItem} onOpenPriceEditor={openPriceEditor}
              />
            ))}
            {visibleItems.length === 0 && (
              <tr><td colSpan={14} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет<br /><span className="text-xs">Добавьте товары с помощью панели выше</span></td></tr>
            )}
          </tbody>
        </table>
        <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
          <span>Итого</span>
          <span>{formatCurrency(doc.totalCost)}</span>
        </div>
      </div>

      {columns.open && columns.pos && (
        <AnchoredPopover pos={columns.pos} onClose={columns.close} className="w-56 space-y-1 p-3">
          <p className="mb-1 text-xs font-semibold">Видимость столбцов</p>
          {COLUMN_DEFS.map((c) => (
            <label key={c.key} className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-accent">
              <input type="checkbox" checked={visible[c.key]} onChange={() => setVisible((v) => ({ ...v, [c.key]: !v[c.key] }))} className="h-3.5 w-3.5 accent-primary" />
              {c.label}
            </label>
          ))}
        </AnchoredPopover>
      )}

      {priceEditor && (
        <AnchoredPopover pos={priceEditor.pos} onClose={() => setPriceEditor(null)} className="w-80 space-y-3">
          <p className="font-semibold">Изменить цену в номенклатуре?</p>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Закупочная цена</label>
              <input type="number" min={0} step="0.01" value={priceEditor.cost}
                onChange={(e) => { const v = Number(e.target.value); setPriceEditor({ ...priceEditor, cost: v, price: Math.round(v * (1 + priceEditor.markup / 100) * 100) / 100 }); }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Наценка, %</label>
              <input type="number" step="0.1" value={Number(priceEditor.markup.toFixed(1))}
                onChange={(e) => { const v = Number(e.target.value); setPriceEditor({ ...priceEditor, markup: v, price: Math.round(priceEditor.cost * (1 + v / 100) * 100) / 100 }); }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Продажная цена</label>
              <input type="number" min={0} step="0.01" value={priceEditor.price}
                onChange={(e) => { const v = Number(e.target.value); setPriceEditor({ ...priceEditor, price: v, markup: priceEditor.cost > 0 ? ((v - priceEditor.cost) / priceEditor.cost) * 100 : 0 }); }}
                className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={confirmPriceEditor} className="inline-flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Check className="h-3.5 w-3.5" /> Сохранить</button>
            <button onClick={() => setPriceEditor(null)} className="inline-flex h-8 items-center rounded-md border px-3 text-xs font-medium hover:bg-accent">Отмена</button>
          </div>
        </AnchoredPopover>
      )}

      {commentOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setCommentOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Добавить комментарий</h3>
              <button onClick={() => setCommentOpen(false)}><X className="h-4 w-4" /></button>
            </div>
            <textarea value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3}
              placeholder="Введите свой комментарий для обозначения данной операции"
              className="w-full rounded-md border bg-background p-2 text-sm" />
            <button onClick={saveComment} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90">Добавить</button>
          </div>
        </div>
      )}

      {/* Hidden per-product barcode-label modal, triggered by the bulk "Печать этикетки" action above. */}
      {doc.items.map((item) => (
        <BarcodeLabelButton key={`label-${item.id}`} productId={item.productId} productName={item.productName} initialBarcode={item.barcode} price={item.catalogPrice} unit={item.unit} iconOnly hidden />
      ))}
    </div>
  );
}

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StockInRow({ index, item, draft, visible, selected, onToggleSelect, onUpdate, onDelete, onOpenPriceEditor }: {
  index: number; item: Item; draft: boolean; visible: Record<ColumnKey, boolean>;
  selected: boolean; onToggleSelect: () => void;
  onUpdate: (itemId: string, patch: { quantity?: number; unitCost?: number; price?: number; note?: string | null }) => void;
  onDelete: (itemId: string) => void;
  onOpenPriceEditor: (item: Item, rect: DOMRect) => void;
}) {
  const markup = item.catalogCost > 0 ? ((item.catalogPrice - item.catalogCost) / item.catalogCost) * 100 : 0;
  return (
    <tr className="hover:bg-muted/40">
      {draft && <td className="px-3 py-2"><input type="checkbox" checked={selected} onChange={onToggleSelect} className="h-4 w-4 accent-primary" /></td>}
      <td className="px-3 py-2 text-muted-foreground">{index}</td>
      <td className="px-3 py-2 font-medium">{item.productName}</td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">{item.barcode ?? "—"}</td>
      {visible.quantity && (
        <td className="px-3 py-2 text-right">
          {draft ? (
            <input
              type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min={isFractionalUnit(item.unit) ? "0.001" : "1"} step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.quantity}
              onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit); if (v !== null && v !== item.quantity) onUpdate(item.id, { quantity: v }); }}
              className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
            />
          ) : `${item.quantity} ${unitLabel(item.unit)}`}
        </td>
      )}
      {visible.currentStock && <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.currentStock} {unitLabel(item.unit)}</td>}
      {visible.unit && <td className="px-3 py-2 text-muted-foreground">{unitLabel(item.unit)}</td>}
      {visible.unitCost && (
        <td className="px-3 py-2 text-right">
          {draft ? (
            <button onClick={(e) => onOpenPriceEditor(item, e.currentTarget.getBoundingClientRect())} className="rounded border px-2 py-1 text-xs tabular-nums hover:bg-accent">
              {formatCurrency(item.unitCost)}
            </button>
          ) : <span className="tabular-nums">{formatCurrency(item.unitCost)}</span>}
        </td>
      )}
      {visible.cost && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.catalogCost)}</td>}
      {visible.markup && <td className="px-3 py-2 text-right tabular-nums">{markup.toFixed(2)}</td>}
      {visible.price && <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(item.catalogPrice)}</td>}
      {visible.total && <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(item.total)}</td>}
      {visible.comment && (
        <td className="px-3 py-2">
          {draft ? (
            <input defaultValue={item.note ?? ""} placeholder="—"
              onBlur={(e) => { if (e.target.value !== (item.note ?? "")) onUpdate(item.id, { note: e.target.value || null }); }}
              className="h-8 w-32 rounded-md border bg-background px-2 text-xs" />
          ) : (item.note ?? "—")}
        </td>
      )}
      {draft && (
        <td className="px-3 py-2 text-right">
          <button onClick={() => onDelete(item.id)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
      <td />
    </tr>
  );
}

function ProductPicker({ onPick, onScan, busy }: { onPick: (p: PickProduct) => void; onScan: (barcode: string) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [barcode, setBarcode] = useState("");
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
    <div className="space-y-2 rounded-lg border p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q} onChange={handleChange}
            placeholder="Поиск по названию"
            className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <input
          value={barcode} onChange={(e) => setBarcode(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { onScan(barcode); setBarcode(""); } }}
          placeholder="Штрихкод"
          className="h-9 w-full rounded-md border bg-background px-3 text-sm sm:w-40 focus:outline-none focus:ring-2 focus:ring-ring"
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
