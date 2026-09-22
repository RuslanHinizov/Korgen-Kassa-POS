"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { formatCurrency } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, Check, Download, ExternalLink, Loader2, Package, Plus, Printer, ScanLine, Trash2, Upload } from "lucide-react";
import { ImportItemsModal } from "@/components/ui/import-items-modal";
import { ProductPickerModal, type PickableProduct } from "@/components/ui/product-picker-modal";
import { isFractionalUnit, parseQuantityInput, unitLabel } from "@/lib/units";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";
import { useSession } from "@/lib/auth-client";

interface Item {
  id: string; productId: string | null; name: string; barcode: string | null; unit: string;
  quantity: number; stock: number | null; costPrice: number; discountPct: number; salePrice: number; total: number;
}
interface Payment { id: string; amount: number; method: string; note: string | null; createdAt: string; userName: string; accountName: string }
interface Doc {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; createdAt: string; postedAt: string | null;
  comment: string | null; isConsignment: boolean; userName: string; supplier: { id: string; name: string } | null; supplierBalance: number | null;
  totalAmount: number; paidAmount: number; remainingAmount: number; items: Item[]; payments: Payment[];
}
interface PickSupplier { id: string; name: string }

const METHOD_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Безналичный", OTHER: "Другое" };

function toLocalInput(iso: string) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function PurchaseReceiptDetail({ id }: { id: string }) {
  const router = useRouter();
  // UMAG never shows Закупочная цена/Наценка to Складской работник.
  const canSeeCost = useSession().data?.user.role !== "WAREHOUSE";
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [comment, setComment] = useState("");
  const [picker, setPicker] = useState<"supplier" | "catalog" | null>(null);
  const [scan, setScan] = useState("");
  const scanRef = useRef<HTMLInputElement>(null);
  const print = useAnchoredPopover();
  const [importOpen, setImportOpen] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductBarcode, setNewProductBarcode] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/purchase-receipts/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push("/purchases"); return; }
    const d = await r.json();
    setDoc(d.receipt);
    setComment(d.receipt.comment ?? "");
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  // "Автосохранение приемки" — periodically persist the draft comment even
  // without a blur, so typing isn't lost if the browser closes mid-edit.
  const [autosave, setAutosave] = useState(false);
  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setAutosave(Boolean(d?.autosaveReceiptDraft))).catch(() => {});
  }, []);
  useEffect(() => {
    if (!autosave || doc?.status !== "DRAFT") return;
    const timer = setInterval(() => { saveComment(); }, 2 * 60 * 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosave, doc?.status, comment]);

  const draft = doc?.status === "DRAFT";

  async function importItems(rows: { barcode: string; quantity: number }[]) {
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}/items/import`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: rows }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось импортировать"); return; }
      setImportOpen(false);
      const restored = d.restored ? `, восстановлено удалённых: ${d.restored}` : "";
      if (d.notFound.length > 0) toast.error(`Добавлено: ${d.added}${restored}. Не найдено по штрихкоду/артикулу: ${d.notFound.length}`);
      else toast.success(`Добавлено товаров: ${d.added}${restored}`);
      load();
    } finally { setBusy(false); }
  }

  async function toggleConsignment(next: boolean) {
    setDoc((d) => (d ? { ...d, isConsignment: next } : d));
    const r = await fetch(`/api/purchase-receipts/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isConsignment: next }),
    });
    if (!r.ok) { toast.error("Не удалось изменить тип приёмки"); load(); }
  }

  async function addProducts(products: PickableProduct[]) {
    setPicker(null);
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: products.map((p) => ({ productId: p.id, quantity: 1 })) }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function addByBarcode() {
    const code = scan.trim();
    if (!code) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(code)}`);
      const results: { id: string; barcode: string | null }[] = r.ok ? await r.json() : [];
      const match = results.find((p) => p.barcode === code) ?? results[0];
      if (!match) { toast.error("Товар с таким штрихкодом не найден"); return; }
      const ar = await fetch(`/api/purchase-receipts/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: match.id, quantity: 1 }),
      });
      if (!ar.ok) { toast.error((await ar.json()).error ?? "Не удалось добавить"); return; }
      setScan("");
      load();
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  async function updateItem(itemId: string, patch: { quantity?: number; costPrice?: number; discountPct?: number; salePrice?: number }) {
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function deleteItem(itemId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}/items/${itemId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function pickSupplier(s: PickSupplier | null) {
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ supplierId: s?.id ?? null }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      load();
    } finally { setBusy(false); }
  }

  async function saveComment() {
    if (comment === (doc?.comment ?? "")) return;
    await fetch(`/api/purchase-receipts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comment }) });
    load();
  }

  async function saveDate(value: string) {
    if (!value) return;
    const r = await fetch(`/api/purchase-receipts/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ createdAt: new Date(value).toISOString() }) });
    if (!r.ok) { toast.error("Не удалось сохранить дату"); return; }
    load();
  }

  async function createProduct() {
    if (!newProductName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch("/api/products/quick-create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newProductName.trim(), barcode: newProductBarcode.trim() || undefined }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось создать товар"); return; }
      const d = await r.json();
      const ar = await fetch(`/api/purchase-receipts/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: d.product.id, quantity: 1 }),
      });
      if (!ar.ok) { toast.error("Товар создан, но не добавлен в приёмку"); return; }
      setNewProductName(""); setNewProductBarcode("");
      load();
    } finally { setBusy(false); }
  }

  function exportItemsCsv() {
    if (!doc) return;
    const header = ["№", "Название", "Штрихкод", "Кол-во", "Ед.изм", "Цена по накладной", "Скидка %", "Продажная цена", "Итого"];
    const lines = [header.join(";")];
    doc.items.forEach((i, idx) => {
      lines.push([idx + 1, i.name, i.barcode ?? "", i.quantity, i.unit, i.costPrice.toFixed(2), i.discountPct, i.salePrice.toFixed(2), i.total.toFixed(2)]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
    });
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `priemka-${doc.documentNo}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  async function postDoc() {
    if (!doc) return;
    if (!doc.supplier) { toast.error("Выберите поставщика"); return; }
    if (doc.items.length === 0) { toast.error("Добавьте хотя бы один товар"); return; }
    if (!confirm(`Провести приёмку №${doc.documentNo} на ${formatCurrency(doc.totalAmount)}? Остатки и цены товаров будут обновлены.`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${id}/post`, { method: "POST" });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось провести"); return; }
      toast.success("Приёмка проведена");
      load();
    } finally { setBusy(false); }
  }

  async function deleteDoc() {
    if (!confirm("Удалить черновик приёмки?")) return;
    const r = await fetch(`/api/purchase-receipts/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/purchases");
  }

  if (loading || !doc) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/purchases" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> Приёмки
        </Link>
        <h1 className="text-xl font-bold">Приёмка №{doc.documentNo}</h1>
        <span className={doc.status === "POSTED" ? "rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary" : "rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground"}>
          {doc.status === "POSTED" ? "Проведён" : "Черновик"}
        </span>
        {draft ? (
          <input
            type="datetime-local" defaultValue={toLocalInput(doc.createdAt)} key={doc.createdAt}
            onBlur={(e) => saveDate(e.target.value)}
            className="h-8 rounded-md border bg-background px-2 text-xs"
          />
        ) : (
          <span className="text-xs text-muted-foreground">{new Date(doc.createdAt).toLocaleString("ru-RU")}</span>
        )}
        <span className="text-xs text-muted-foreground">Создатель: {doc.userName}</span>
        <div className="ml-auto flex items-center gap-2">
          <button ref={print.anchorRef} onClick={print.toggle} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent">
            <Printer className="h-4 w-4" /> Печать
          </button>
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

      {print.open && print.pos && (
        <AnchoredPopover pos={print.pos} onClose={print.close} className="w-56 p-1">
          <button onClick={() => { print.close(); window.open(`/purchases/${id}/print?variant=plain`, "_blank"); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная</button>
          <button onClick={() => { print.close(); window.open(`/purchases/${id}/print?variant=cost`, "_blank"); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная с ценами закупки</button>
          <button onClick={() => { print.close(); window.open(`/purchases/${id}/print?variant=sale`, "_blank"); }} className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-accent">Накладная с продажными ценами</button>
        </AnchoredPopover>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-3">
        <div className="grid flex-1 gap-3 sm:grid-cols-2 min-w-[16rem]">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Поставщик *</label>
            {draft ? (
              <SupplierPicker current={doc.supplier} onPick={pickSupplier} busy={busy} />
            ) : (
              <p className="text-sm">{doc.supplier?.name ?? "—"}</p>
            )}
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input
                type="checkbox" checked={doc.isConsignment} disabled={!draft}
                onChange={(e) => toggleConsignment(e.target.checked)}
              />
              Консигнация <span className="text-xs text-muted-foreground">(товар на реализации, оплата поставщику позже)</span>
            </label>
            {doc.supplier && doc.supplierBalance != null && (
              <p className="mt-1 text-xs text-muted-foreground">
                Баланс: <span className={doc.supplierBalance > 0.009 ? "font-medium text-destructive" : "font-medium"}>{formatCurrency(doc.supplierBalance)}</span>
              </p>
            )}
          </div>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Итого к оплате</p>
          <p className="text-xl font-bold">{formatCurrency(doc.totalAmount)}</p>
          <p className="text-xs text-destructive">Оплачено: {formatCurrency(doc.paidAmount)}</p>
        </div>
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
          <button onClick={() => setPicker("supplier")} disabled={!doc.supplier} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40" title={!doc.supplier ? "Сначала выберите поставщика" : ""}>
            <Package className="h-4 w-4" /> Товары поставщика
          </button>
          <button onClick={() => setPicker("catalog")} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">
            <Package className="h-4 w-4" /> Номенклатура
          </button>
          <div className="flex flex-1 min-w-[14rem] items-center gap-2">
            <ScanLine className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              ref={scanRef} value={scan} onChange={(e) => setScan(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addByBarcode(); }}
              placeholder="Штрихкод/кол-во (сканер)…"
              className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
            />
            <button onClick={addByBarcode} disabled={busy || !scan.trim()} className="inline-flex h-9 items-center rounded-md border px-3 text-sm hover:bg-accent disabled:opacity-40">Добавить</button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2">
        {draft && (
          <Link href={`/purchases/${id}/scan`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">
            <ScanLine className="h-4 w-4" /> Сканирование
          </Link>
        )}
        {draft && (
          <button onClick={() => setImportOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10">
            <Upload className="h-4 w-4" /> Импорт товаров
          </button>
        )}
        <button onClick={exportItemsCsv} disabled={doc.items.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium hover:bg-accent disabled:opacity-40">
          <Download className="h-4 w-4" /> Выгрузить в Excel
        </button>
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2 text-left">№</th>
              <th className="px-3 py-2 text-left">Название</th>
              <th className="px-3 py-2 text-left">Штрихкод</th>
              <th className="px-3 py-2 text-right">Кол-во</th>
              <th className="px-3 py-2 text-right">Остаток</th>
              <th className="px-3 py-2 text-left">Ед. изм</th>
              {canSeeCost && <th className="px-3 py-2 text-right">Цена по накладной</th>}
              <th className="px-3 py-2 text-right">Скидка %</th>
              {canSeeCost && <th className="px-3 py-2 text-right">Наценка %</th>}
              <th className="px-3 py-2 text-right">Продажная цена</th>
              <th className="px-3 py-2 text-right">Итого</th>
              {draft && <th className="px-3 py-2"></th>}
            </tr>
          </thead>
          <tbody className="divide-y">
            {doc.items.map((item, idx) => (
              <PurchaseReceiptItemRow key={item.id} index={idx + 1} item={item} draft={draft} canSeeCost={canSeeCost} onChange={(patch) => updateItem(item.id, patch)} onDelete={() => deleteItem(item.id)} />
            ))}
            {doc.items.length === 0 && (
              <tr><td colSpan={(draft ? 12 : 11) - (canSeeCost ? 0 : 2)} className="px-3 py-8 text-center text-muted-foreground">Товаров пока нет</td></tr>
            )}
          </tbody>
        </table>
        {draft && (
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder="Введите название" className="h-9 flex-1 min-w-[10rem] rounded-md border bg-background px-2 text-sm" />
            <input value={newProductBarcode} onChange={(e) => setNewProductBarcode(e.target.value)} placeholder="Штрихкод" className="h-9 w-40 rounded-md border bg-background px-2 text-sm" />
            <button onClick={createProduct} disabled={busy || !newProductName.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-primary px-3 text-sm font-medium text-primary hover:bg-primary/10 disabled:opacity-40">
              <Plus className="h-4 w-4" /> Создать товар
            </button>
          </div>
        )}
        <div className="flex justify-between border-t px-4 py-2.5 text-sm font-semibold">
          <span>Сумма</span>
          <span>{formatCurrency(doc.totalAmount)}</span>
        </div>
      </div>

      <div className="rounded-lg border p-3">
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Комментарий</label>
        {draft ? (
          <textarea
            value={comment} onChange={(e) => setComment(e.target.value)} onBlur={saveComment} rows={2}
            className="w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm"
            placeholder="Комментарий к приёмке"
          />
        ) : (
          <p className="text-sm text-muted-foreground">{doc.comment || "—"}</p>
        )}
      </div>

      {doc.status === "POSTED" && (
        <PaymentsSection doc={doc} onPaid={load} />
      )}

      {picker && (
        <ProductPickerModal
          title={picker === "supplier" ? "Товары поставщика" : "Номенклатура"}
          supplierId={picker === "supplier" ? doc.supplier?.id : undefined}
          onClose={() => setPicker(null)}
          onSelect={addProducts}
        />
      )}
      {importOpen && <ImportItemsModal busy={busy} onClose={() => setImportOpen(false)} onImport={importItems} />}
    </div>
  );
}

function PurchaseReceiptItemRow({ item, index, draft, canSeeCost, onChange, onDelete }: {
  item: Item; index: number; draft: boolean; canSeeCost: boolean;
  onChange: (patch: { quantity?: number; costPrice?: number; discountPct?: number; salePrice?: number }) => void;
  onDelete: () => void;
}) {
  const markupPct = item.costPrice > 0 ? ((item.salePrice - item.costPrice) / item.costPrice) * 100 : 0;

  return (
    <tr className="hover:bg-muted/40">
      <td className="px-3 py-2 text-muted-foreground">{index}</td>
      <td className="px-3 py-2">
        {item.productId ? (
          <Link href={`/products/${item.productId}/edit`} target="_blank" className="font-medium text-primary hover:underline inline-flex items-center gap-1">
            {item.name} <ExternalLink className="h-3 w-3 opacity-50" />
          </Link>
        ) : <span className="font-medium">{item.name}</span>}
      </td>
      <td className="px-3 py-2 text-muted-foreground tabular-nums">{item.barcode ?? "—"}</td>
      <td className="px-3 py-2 text-right">
        {draft ? (
          <input
            type="number" inputMode={isFractionalUnit(item.unit) ? "decimal" : "numeric"} min={isFractionalUnit(item.unit) ? "0.001" : "1"} step={isFractionalUnit(item.unit) ? "0.001" : "1"} defaultValue={item.quantity} key={item.quantity}
            onBlur={(e) => { const v = parseQuantityInput(e.target.value, item.unit); if (v !== null && v !== item.quantity) onChange({ quantity: v }); }}
            className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
          />
        ) : item.quantity}
      </td>
      <td className="px-3 py-2 text-right text-muted-foreground tabular-nums">{item.stock != null ? item.stock : "—"}</td>
      <td className="px-3 py-2 text-muted-foreground">{unitLabel(item.unit)}</td>
      {canSeeCost && (
        <td className="px-3 py-2 text-right">
          {draft ? (
            <input
              type="number" min="0" step="0.01" defaultValue={item.costPrice} key={item.costPrice}
              onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== item.costPrice) onChange({ costPrice: v }); }}
              className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs"
            />
          ) : formatCurrency(item.costPrice)}
        </td>
      )}
      <td className="px-3 py-2 text-right">
        {draft ? (
          <input
            type="number" min="0" max="100" step="0.01" defaultValue={item.discountPct} key={item.discountPct}
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== item.discountPct) onChange({ discountPct: v }); }}
            className="h-8 w-16 rounded-md border bg-background px-2 text-right text-xs"
          />
        ) : `${item.discountPct}%`}
      </td>
      {canSeeCost && (
        <td className="px-3 py-2 text-right">
          {draft ? (
            <input
              type="number" step="0.01" defaultValue={markupPct.toFixed(2)} key={markupPct}
              onBlur={(e) => {
                const v = Number(e.target.value);
                if (Number.isNaN(v) || Math.abs(v - markupPct) < 0.005) return;
                onChange({ salePrice: Math.round(item.costPrice * (1 + v / 100) * 100) / 100 });
              }}
              className="h-8 w-20 rounded-md border bg-background px-2 text-right text-xs"
            />
          ) : `${markupPct.toFixed(2)}%`}
        </td>
      )}
      <td className="px-3 py-2 text-right">
        {draft ? (
          <input
            type="number" min="0" step="0.01" defaultValue={item.salePrice} key={item.salePrice}
            onBlur={(e) => { const v = Number(e.target.value); if (v >= 0 && v !== item.salePrice) onChange({ salePrice: v }); }}
            className="h-8 w-24 rounded-md border bg-background px-2 text-right text-xs"
          />
        ) : formatCurrency(item.salePrice)}
      </td>
      <td className="px-3 py-2 text-right font-medium tabular-nums">{formatCurrency(item.total)}</td>
      {draft && (
        <td className="px-3 py-2 text-right">
          <button onClick={onDelete} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </td>
      )}
    </tr>
  );
}

function PaymentsSection({ doc, onPaid }: { doc: Doc; onPaid: () => void }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CASH");
  const [accountId, setAccountId] = useState("");
  const [accounts, setAccounts] = useState<{ id: string; name: string }[]>([]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/finance/accounts").then((r) => r.json()).then((d) => {
      setAccounts(d.accounts ?? []);
      if (d.accounts?.[0]) setAccountId((prev) => prev || d.accounts[0].id);
    });
  }, []);

  async function addPayment() {
    const val = Number(amount);
    if (!val || val <= 0) { toast.error("Введите сумму"); return; }
    if (!accountId) { toast.error("Выберите счет"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/purchase-receipts/${doc.id}/payments`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: val, method, accountId, note: note || undefined }),
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
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Со счета</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 w-40 rounded-md border bg-background px-2 text-sm">
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
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
                <th className="px-3 py-1 text-left">Со счета</th>
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
                  <td className="px-3 py-1.5 text-muted-foreground">{p.accountName}</td>
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

function SupplierPicker({ current, onPick, busy }: { current: { id: string; name: string } | null; onPick: (s: PickSupplier | null) => void; busy: boolean }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PickSupplier[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(next: string) {
    fetch(`/api/suppliers?q=${encodeURIComponent(next)}`)
      .then((r) => (r.ok ? r.json() : { suppliers: [] }))
      .then((d) => setResults(d.suppliers ?? []))
      .catch(() => setResults([]));
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 250);
  }

  async function createSupplier() {
    if (!newName.trim()) return;
    const r = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
    if (!r.ok) { toast.error("Не удалось создать поставщика"); return; }
    const d = await r.json();
    onPick(d.supplier);
    setCreating(false); setNewName("");
  }

  if (creating) {
    return (
      <div className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название поставщика" className="h-9 flex-1 rounded-md border bg-background px-2 text-sm" autoFocus />
        <button onClick={createSupplier} className="inline-flex h-9 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Создать</button>
        <button onClick={() => setCreating(false)} className="text-sm text-muted-foreground hover:underline">Отмена</button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <input
          value={open ? q : (current?.name ?? "")} onChange={handleChange} onFocus={() => { setOpen(true); setQ(""); search(""); }}
          placeholder="Поиск поставщика…"
          className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        />
        <button onClick={() => setCreating(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90" aria-label="Новый поставщик">
          <Plus className="h-4 w-4" />
        </button>
        {current && (
          <button disabled={busy} onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-destructive">Сбросить</button>
        )}
      </div>
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-[calc(100%-2.75rem)] overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.map((s) => (
              <button key={s.id} disabled={busy} onClick={() => { onPick(s); setOpen(false); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40">
                {s.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
