"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ArrowLeft, Trash2, Plus, MoreHorizontal, X, Check, Pencil, Loader2 } from "lucide-react";
import { generateEan13 } from "@/lib/barcode";

interface CatalogValue { id: string; value: string }
interface CatalogCharacteristic { id: string; name: string; values: CatalogValue[] }
interface CharRow { localId: string; characteristicId: string | null; name: string; locked: boolean; values: CatalogValue[] }
interface VariantRow {
  key: string; valueIds: string[]; label: string;
  productId: string | null; barcode: string; costPrice: number; salePrice: number;
}
interface CategoryOption { id: string; name: string; parentId: string | null }
interface SupplierOption { id: string; name: string }

function cartesian(rows: CharRow[]): { valueIds: string[]; label: string }[] {
  const usable = rows.filter((r) => r.characteristicId && r.values.length > 0);
  if (usable.length === 0) return [];
  let combos: { valueIds: string[]; labels: string[] }[] = [{ valueIds: [], labels: [] }];
  for (const row of usable) {
    const next: typeof combos = [];
    for (const combo of combos) {
      for (const v of row.values) {
        next.push({ valueIds: [...combo.valueIds, v.id], labels: [...combo.labels, v.value] });
      }
    }
    combos = next;
  }
  return combos.map((c) => ({ valueIds: c.valueIds, label: c.labels.join("/") }));
}

export function ProductArticleForm({ articleId }: { articleId?: string }) {
  const router = useRouter();
  const editing = Boolean(articleId);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [rows, setRows] = useState<CharRow[]>([{ localId: crypto.randomUUID(), characteristicId: null, name: "", locked: false, values: [] }]);
  const [catalog, setCatalog] = useState<CatalogCharacteristic[]>([]);
  const [editingCharacteristics, setEditingCharacteristics] = useState(!editing);
  const [generated, setGenerated] = useState(false);
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [rawCategoryId, setRawCategoryId] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [bulkModal, setBulkModal] = useState<"cost" | "sale" | null>(null);
  const [bulkValue, setBulkValue] = useState("");

  const reloadCatalog = useCallback(() => {
    fetch("/api/product-characteristics").then((r) => r.json()).then((d) => setCatalog(d.characteristics ?? [])).catch(() => {});
  }, []);
  useEffect(() => { reloadCatalog(); }, [reloadCatalog]);
  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!articleId) return;
    fetch(`/api/product-articles/${articleId}`)
      .then((r) => r.json())
      .then((d) => {
        const a = d.article;
        setName(a.name); setCode(a.code);
        setRows(a.characteristics.map((c: { characteristicId: string; name: string; values: CatalogValue[] }) => ({
          localId: c.characteristicId, characteristicId: c.characteristicId, name: c.name, locked: true, values: c.values,
        })));
        setVariants(a.products.map((p: { id: string; name: string; barcode: string | null; costPrice: number; salePrice: number; valueIds: string[] }) => ({
          key: [...p.valueIds].sort().join(","), valueIds: p.valueIds, label: p.name.includes(": ") ? p.name.slice(p.name.indexOf(": ") + 2) : p.name,
          productId: p.id, barcode: p.barcode ?? "", costPrice: p.costPrice, salePrice: p.salePrice,
        })));
        setGenerated(a.products.length > 0);
        setRawCategoryId(a.categoryId);
        if (a.supplierId) setSupplier({ id: a.supplierId, name: a.supplierName });
      })
      .finally(() => setLoading(false));
  }, [articleId]);

  // Once categories are known, split a loaded category into top-level + subcategory.
  useEffect(() => {
    if (!rawCategoryId || categories.length === 0) return;
    const cat = categories.find((c) => c.id === rawCategoryId);
    if (!cat) return;
    if (cat.parentId) { setCategoryId(cat.parentId); setSubcategoryId(cat.id); }
    else { setCategoryId(cat.id); setSubcategoryId(""); }
  }, [rawCategoryId, categories]);

  const topCategories = categories.filter((c) => !c.parentId);
  const subCategories = categories.filter((c) => c.parentId === categoryId);

  function addRow() {
    setRows((r) => [...r, { localId: crypto.randomUUID(), characteristicId: null, name: "", locked: false, values: [] }]);
  }
  function removeRow(localId: string) {
    setRows((r) => r.filter((row) => row.localId !== localId));
  }
  function updateRow(localId: string, patch: Partial<CharRow>) {
    setRows((r) => r.map((row) => (row.localId === localId ? { ...row, ...patch } : row)));
  }

  async function resolveCharacteristic(localId: string, typedName: string) {
    const trimmed = typedName.trim();
    if (!trimmed) return;
    const existing = catalog.find((c) => c.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) { updateRow(localId, { characteristicId: existing.id, name: existing.name }); return; }
    const r = await fetch("/api/product-characteristics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: trimmed }) });
    if (!r.ok) { toast.error("Не удалось создать характеристику"); return; }
    const d = await r.json();
    updateRow(localId, { characteristicId: d.characteristic.id, name: d.characteristic.name });
    reloadCatalog();
  }

  async function addValue(localId: string, row: CharRow, typedValue: string) {
    const trimmed = typedValue.trim();
    if (!trimmed || !row.characteristicId) return;
    if (row.values.some((v) => v.value.toLowerCase() === trimmed.toLowerCase())) return;
    const catEntry = catalog.find((c) => c.id === row.characteristicId);
    const existing = catEntry?.values.find((v) => v.value.toLowerCase() === trimmed.toLowerCase());
    if (existing) { updateRow(localId, { values: [...row.values, existing] }); return; }
    const r = await fetch(`/api/product-characteristics/${row.characteristicId}/values`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ value: trimmed }) });
    if (!r.ok) { toast.error("Не удалось добавить значение"); return; }
    const d = await r.json();
    updateRow(localId, { values: [...row.values, d.value] });
    reloadCatalog();
  }

  function removeValue(localId: string, row: CharRow, valueId: string) {
    const inUse = variants.some((v) => v.productId && v.valueIds.includes(valueId));
    if (inUse) { toast.error("Нельзя удалить значение — оно уже используется товаром"); return; }
    updateRow(localId, { values: row.values.filter((v) => v.id !== valueId) });
  }

  function generateGrid() {
    const combos = cartesian(rows);
    if (combos.length === 0) { toast.error("Добавьте хотя бы одну характеристику со значениями"); return; }
    setVariants((prev) => {
      const byKey = new Map(prev.map((v) => [v.key, v]));
      return combos.map((c) => {
        const key = [...c.valueIds].sort().join(",");
        const existingRow = byKey.get(key);
        if (existingRow) return existingRow;
        return { key, valueIds: c.valueIds, label: c.label, productId: null, barcode: generateEan13(), costPrice: 0, salePrice: 0 };
      });
    });
    setGenerated(true);
    setEditingCharacteristics(false);
  }

  function updateVariant(key: string, patch: Partial<VariantRow>) {
    setVariants((vs) => vs.map((v) => (v.key === key ? { ...v, ...patch } : v)));
  }

  function toggleSelected(key: string) {
    setSelected((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }
  function toggleSelectAll() {
    setSelected((s) => (s.size === variants.length ? new Set() : new Set(variants.map((v) => v.key))));
  }

  async function removeVariant(v: VariantRow) {
    if (!v.productId) { setVariants((vs) => vs.filter((x) => x.key !== v.key)); return; }
    if (!confirm(`Удалить товар «${v.label}»?`)) return;
    const r = await fetch(`/api/product-articles/${articleId}/products/${v.productId}`, { method: "DELETE" });
    if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось удалить"); return; }
    setVariants((vs) => vs.filter((x) => x.key !== v.key));
  }

  async function addToQuickProducts(v: VariantRow) {
    if (!v.productId) { toast.error("Сначала сохраните артикул"); return; }
    const r = await fetch("/api/quick-products", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: v.productId }) });
    if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
    toast.success("Добавлено в «Быстрые товары»");
  }

  async function applyBulkPrice() {
    const value = Number(bulkValue);
    if (Number.isNaN(value) || value < 0) return;
    const field = bulkModal;
    setBulkModal(null); setBulkValue("");
    setVariants((vs) => vs.map((v) => {
      if (!selected.has(v.key)) return v;
      if (field === "cost") {
        const salePrice = v.salePrice === 0 && v.costPrice === 0 ? value : v.salePrice;
        return { ...v, costPrice: value, salePrice };
      }
      return { ...v, salePrice: value };
    }));
    // Persist immediately for already-saved rows.
    const targets = variants.filter((v) => selected.has(v.key) && v.productId);
    if (targets.length > 0 && articleId) {
      await Promise.all(targets.map((v) => fetch(`/api/product-articles/${articleId}/products/${v.productId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(field === "cost" ? { costPrice: value } : { salePrice: value }),
      })));
    }
  }

  async function savePriceEdit(v: VariantRow, patch: { costPrice?: number; salePrice?: number }) {
    updateVariant(v.key, patch);
    if (!v.productId || !articleId) return;
    await fetch(`/api/product-articles/${articleId}/products/${v.productId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
  }

  async function handleSave() {
    if (!name.trim() || !code.trim()) { toast.error("Заполните название и артикул"); return; }
    if (variants.length === 0) { toast.error("Сформируйте товарную сетку"); return; }
    const finalCategoryId = subcategoryId || categoryId || null;
    setSaving(true);
    try {
      if (!editing) {
        const r = await fetch("/api/product-articles", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(), code: code.trim(),
            characteristicIds: rows.filter((r) => r.characteristicId).map((r) => r.characteristicId),
            variants: variants.map((v) => ({ valueIds: v.valueIds, barcode: v.barcode, costPrice: v.costPrice, salePrice: v.salePrice })),
            categoryId: finalCategoryId, supplierId: supplier?.id ?? null,
          }),
        });
        if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
        toast.success("Артикул создан");
      } else {
        const newRows = rows.filter((row) => row.characteristicId);
        const newVariants = variants.filter((v) => !v.productId);
        if (newVariants.length > 0) {
          const r = await fetch(`/api/product-articles/${articleId}/variants`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              characteristicIds: newRows.map((r) => r.characteristicId),
              variants: newVariants.map((v) => ({ valueIds: v.valueIds, barcode: v.barcode, costPrice: v.costPrice, salePrice: v.salePrice })),
            }),
          });
          if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось обновить таблицу"); return; }
        }
        await fetch(`/api/product-articles/${articleId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name.trim(), categoryId: finalCategoryId, supplierId: supplier?.id ?? null }),
        });
        toast.success("Изменения успешно сохранены");
      }
      router.push("/products/sku");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteArticle() {
    if (!articleId) return;
    if (!confirm("Удалить артикул? Сами товары останутся, но перестанут быть сгруппированы.")) return;
    const r = await fetch(`/api/product-articles/${articleId}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/products/sku");
  }

  const [menuOpenKey, setMenuOpenKey] = useState<string | null>(null);

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/products/sku" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-2xl font-bold">{editing ? "Редактирование артикула" : "Создание артикула"}</h1>
        </div>
        {editing && (
          <button onClick={handleDeleteArticle} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить товар">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Основная информация</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Название товара *</label>
          <input value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="Введите название" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          <p className="mt-1 text-right text-xs text-muted-foreground">{name.length} / 50</p>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Артикул *</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} disabled={editing} placeholder="Введите артикул" className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60" />
        </div>
      </div>

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Характеристики и значения</h2>
          {editing && !editingCharacteristics && (
            <button onClick={() => setEditingCharacteristics(true)} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
              <Pencil className="h-3.5 w-3.5" /> Редактировать
            </button>
          )}
        </div>

        {!editingCharacteristics ? (
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.localId} className="rounded-md border overflow-hidden">
                <div className="bg-muted/50 px-3 py-1.5 text-sm font-medium">{row.name}</div>
                <div className="flex flex-wrap gap-2 p-3">
                  {row.values.map((v) => (
                    <span key={v.id} className="rounded-full bg-muted px-3 py-1 text-xs">{v.value}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <>
            {rows.map((row) => (
              <CharacteristicRowEditor
                key={row.localId}
                row={row}
                catalog={catalog}
                otherUsedIds={rows.filter((r) => r.localId !== row.localId).map((r) => r.characteristicId).filter(Boolean) as string[]}
                onResolveName={(v) => resolveCharacteristic(row.localId, v)}
                onAddValue={(v) => addValue(row.localId, row, v)}
                onRemoveValue={(id) => removeValue(row.localId, row, id)}
                onRemoveRow={rows.length > 1 ? () => removeRow(row.localId) : undefined}
              />
            ))}
            <button onClick={addRow} className="flex w-full items-center justify-center gap-1.5 rounded-md bg-muted py-2 text-sm font-medium hover:bg-accent">
              <Plus className="h-4 w-4" /> Добавить характеристику
            </button>
            <button
              onClick={generateGrid}
              className="inline-flex h-9 items-center rounded-md bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700"
            >
              {generated ? "Обновить таблицу" : "Сформировать товарную сетку"}
            </button>
          </>
        )}
      </div>

      {generated && variants.length > 0 && (
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-sm font-semibold">Товары</h2>
          {selected.size > 0 && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <span>Выбрано: {selected.size}</span>
              <button onClick={() => setBulkModal("cost")} className="text-primary hover:underline">Изменить цену закупки</button>
              <button onClick={() => setBulkModal("sale")} className="text-primary hover:underline">Изменить цену продажи</button>
              <button
                onClick={async () => {
                  if (!confirm(`Удалить ${selected.size} товар(ов)?`)) return;
                  for (const v of variants) if (selected.has(v.key)) await removeVariant(v);
                  setSelected(new Set());
                }}
                className="text-destructive hover:underline"
              >
                Удалить
              </button>
            </div>
          )}
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 px-3 py-2"><input type="checkbox" checked={selected.size === variants.length && variants.length > 0} onChange={toggleSelectAll} className="h-4 w-4 accent-primary" /></th>
                  <th className="px-3 py-2 text-left">Наименование</th>
                  <th className="px-3 py-2 text-left">Штрихкод</th>
                  <th className="px-3 py-2 text-right">Цена закупки, ₸</th>
                  <th className="px-3 py-2 text-right">Цена продажи, ₸</th>
                  <th className="px-3 py-2 text-right">Наценка, %</th>
                  <th className="w-8 px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {variants.map((v) => {
                  const markup = v.costPrice > 0 ? ((v.salePrice - v.costPrice) / v.costPrice) * 100 : 0;
                  return (
                    <tr key={v.key} className="hover:bg-muted/30">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(v.key)} onChange={() => toggleSelected(v.key)} className="h-4 w-4 accent-primary" /></td>
                      <td className="px-3 py-2 font-medium">{v.label}</td>
                      <td className="px-3 py-2 text-muted-foreground tabular-nums">{v.barcode}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" min="0" step="0.01" defaultValue={v.costPrice} key={`cost-${v.key}-${v.costPrice}`}
                          onBlur={(e) => { const val = Number(e.target.value); if (val >= 0 && val !== v.costPrice) savePriceEdit(v, { costPrice: val }); }}
                          className="h-8 w-24 rounded border bg-background px-2 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" min="0" step="0.01" defaultValue={v.salePrice} key={`sale-${v.key}-${v.salePrice}`}
                          onBlur={(e) => { const val = Number(e.target.value); if (val >= 0 && val !== v.salePrice) savePriceEdit(v, { salePrice: val }); }}
                          className="h-8 w-24 rounded border bg-background px-2 text-right text-sm"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number" step="0.01" defaultValue={markup.toFixed(1)} key={`markup-${v.key}-${markup}`}
                          onBlur={(e) => {
                            const val = Number(e.target.value);
                            if (Number.isNaN(val) || Math.abs(val - markup) < 0.05 || v.costPrice <= 0) return;
                            savePriceEdit(v, { salePrice: Math.round(v.costPrice * (1 + val / 100) * 100) / 100 });
                          }}
                          className="h-8 w-20 rounded border bg-background px-2 text-right text-sm"
                        />
                      </td>
                      <td className="relative px-3 py-2">
                        <button onClick={() => setMenuOpenKey(menuOpenKey === v.key ? null : v.key)} className="rounded p-1 hover:bg-accent">
                          <MoreHorizontal className="h-4 w-4" />
                        </button>
                        {menuOpenKey === v.key && (
                          <div className="absolute right-0 top-8 z-10 w-52 rounded-md border bg-popover p-1 shadow-md">
                            <button onClick={() => { setMenuOpenKey(null); addToQuickProducts(v); }} className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent">Добавить в «Быстрые товары»</button>
                            <button onClick={() => { setMenuOpenKey(null); removeVariant(v); }} className="block w-full rounded px-2 py-1.5 text-left text-sm text-destructive hover:bg-destructive/10">Удалить товар</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold">Дополнительная информация</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Категория</label>
          <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Выберите категорию</option>
            {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Подкатегория</label>
          <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId || subCategories.length === 0} className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50">
            <option value="">Выберите подкатегорию</option>
            {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Поставщик</label>
          <SupplierField current={supplier} onPick={setSupplier} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link href="/products/sku" className="text-sm text-muted-foreground hover:underline">Отменить</Link>
        <button onClick={handleSave} disabled={saving} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Сохранить"}
        </button>
      </div>

      {bulkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setBulkModal(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-lg border bg-card p-5 shadow-lg space-y-4">
            <h3 className="text-lg font-semibold">{bulkModal === "cost" ? "Изменение цены закупки" : "Изменение цены продажи"}</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">{bulkModal === "cost" ? "Новая цена закупки *" : "Новая цена продажи *"}</label>
              <input autoFocus type="number" min="0" step="0.01" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder="Введите цену" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            </div>
            <button onClick={applyBulkPrice} disabled={!bulkValue} className="h-10 w-full rounded-md bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Сохранить</button>
          </div>
        </div>
      )}
    </div>
  );
}

function CharacteristicRowEditor({
  row, catalog, otherUsedIds, onResolveName, onAddValue, onRemoveValue, onRemoveRow,
}: {
  row: CharRow; catalog: CatalogCharacteristic[]; otherUsedIds: string[];
  onResolveName: (name: string) => void; onAddValue: (value: string) => void; onRemoveValue: (id: string) => void; onRemoveRow?: () => void;
}) {
  const [nameQuery, setNameQuery] = useState(row.name);
  const [nameOpen, setNameOpen] = useState(false);
  const [valueQuery, setValueQuery] = useState("");
  const [valueOpen, setValueOpen] = useState(false);
  const valueInputRef = useRef<HTMLInputElement>(null);

  const nameSuggestions = catalog.filter((c) => !otherUsedIds.includes(c.id) && c.id !== row.characteristicId && c.name.toLowerCase().includes(nameQuery.trim().toLowerCase()));
  const exactNameMatch = catalog.some((c) => c.name.toLowerCase() === nameQuery.trim().toLowerCase());

  const catalogValues = catalog.find((c) => c.id === row.characteristicId)?.values ?? [];
  const valueSuggestions = catalogValues.filter((v) => !row.values.some((x) => x.id === v.id) && v.value.toLowerCase().includes(valueQuery.trim().toLowerCase()));
  const exactValueMatch = row.values.some((v) => v.value.toLowerCase() === valueQuery.trim().toLowerCase());

  return (
    <div className="space-y-3 border-b pb-3 last:border-b-0 last:pb-0">
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Характеристика *</label>
          <div className="relative">
            <input
              value={row.locked ? row.name : nameQuery}
              disabled={row.locked}
              onChange={(e) => { setNameQuery(e.target.value); setNameOpen(true); }}
              onFocus={() => setNameOpen(true)}
              placeholder="Выберите из списка или добавьте новую"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-60"
            />
            {nameOpen && !row.locked && nameQuery.trim() && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
                {nameSuggestions.map((c) => (
                  <button key={c.id} onClick={() => { onResolveName(c.name); setNameOpen(false); setTimeout(() => valueInputRef.current?.focus(), 0); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40">{c.name}</button>
                ))}
                {!exactNameMatch && (
                  <button onClick={() => { onResolveName(nameQuery); setNameOpen(false); setTimeout(() => valueInputRef.current?.focus(), 0); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-muted/40">
                    <Plus className="h-3.5 w-3.5" /> Добавить {nameQuery.trim()}
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Например «Цвет» или «Размер»</p>
        </div>
        {onRemoveRow && (
          <button onClick={onRemoveRow} className="mt-6 rounded-md border p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить характеристику">
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">Значения *</label>
        <div className="relative">
          <div className="flex min-h-9 flex-wrap items-center gap-1.5 rounded-md border bg-background px-2 py-1.5">
            {row.values.map((v) => (
              <span key={v.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-xs">
                {v.value}
                <button onClick={() => onRemoveValue(v.id)} aria-label={`Удалить ${v.value}`}><X className="h-3 w-3" /></button>
              </span>
            ))}
            <input
              ref={valueInputRef}
              value={valueQuery}
              disabled={!row.characteristicId}
              onChange={(e) => { setValueQuery(e.target.value); setValueOpen(true); }}
              onFocus={() => setValueOpen(true)}
              onKeyDown={(e) => { if (e.key === "Enter" && valueQuery.trim()) { onAddValue(valueQuery.trim()); setValueQuery(""); } }}
              placeholder="Введите значения через enter"
              className="h-7 flex-1 min-w-[6rem] border-none bg-transparent text-sm outline-none disabled:opacity-60"
            />
          </div>
          {valueOpen && valueQuery.trim() && row.characteristicId && (
            <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md">
              {valueSuggestions.map((v) => (
                <button key={v.id} onClick={() => { onAddValue(v.value); setValueQuery(""); setValueOpen(false); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-muted/40"><Check className="h-3.5 w-3.5" /> {v.value}</button>
              ))}
              {!exactValueMatch && (
                <button onClick={() => { onAddValue(valueQuery); setValueQuery(""); setValueOpen(false); }} className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-sm hover:bg-muted/40">
                  <Plus className="h-3.5 w-3.5" /> Добавить {valueQuery.trim()}
                </button>
              )}
            </div>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Например: «Желтый», «Красный» или «S», «M», «40»</p>
      </div>
    </div>
  );
}

function SupplierField({ current, onPick }: { current: SupplierOption | null; onPick: (s: SupplierOption | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SupplierOption[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(next: string) {
    fetch(`/api/suppliers?q=${encodeURIComponent(next)}`).then((r) => (r.ok ? r.json() : { suppliers: [] })).then((d) => setResults(d.suppliers ?? [])).catch(() => setResults([]));
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next); setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 250);
  }
  async function createSupplier() {
    if (!newName.trim()) return;
    const r = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
    if (!r.ok) { toast.error("Не удалось создать поставщика"); return; }
    const d = await r.json();
    onPick(d.supplier); setCreating(false); setNewName("");
  }

  if (creating) {
    return (
      <div className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название поставщика" autoFocus className="h-9 flex-1 rounded-md border bg-background px-2 text-sm" />
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
          placeholder="Выберите или введите поставщика" className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
        />
        <button onClick={() => setCreating(true)} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90" aria-label="Новый поставщик">
          <Plus className="h-4 w-4" />
        </button>
        {current && <button onClick={() => onPick(null)} className="text-xs text-muted-foreground hover:text-destructive">Сбросить</button>}
      </div>
      {open && (
        <div className="absolute z-10 mt-1 max-h-48 w-[calc(100%-2.75rem)] overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.map((s) => (
              <button key={s.id} onClick={() => { onPick(s); setOpen(false); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40">{s.name}</button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
