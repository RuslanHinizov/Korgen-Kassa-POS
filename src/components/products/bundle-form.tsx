"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Package, Trash2 } from "lucide-react";
import { generateEan13 } from "@/lib/barcode";
import { formatCurrency } from "@/lib/utils";
import { UNIT_OPTIONS, unitLabel } from "@/lib/units";
import { ProductPickerModal, type PickableProduct } from "@/components/ui/product-picker-modal";

interface CategoryOption { id: string; name: string; parentId: string | null }
interface ComponentRow { productId: string; quantity: number; name: string; barcode: string | null; unit: string; cost: number; price: number }

export function BundleForm({ bundleId }: { bundleId?: string }) {
  const router = useRouter();
  const editing = Boolean(bundleId);

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"pcs" | "kg" | "l" | "m">("pcs");
  const [barcode, setBarcode] = useState("");
  const [additionalCode, setAdditionalCode] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [components, setComponents] = useState<ComponentRow[]>([]);
  const [extraCost, setExtraCost] = useState(0);
  const [price, setPrice] = useState(0);
  const [wholesalePrice, setWholesalePrice] = useState<number | "">("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [suggestions, setSuggestions] = useState<PickableProduct[]>([]);
  const searchReq = useRef(0);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    fetch(`/api/products/bundle/${bundleId}`).then((r) => r.json()).then((d) => {
      if (d.error) { toast.error(d.error); router.push("/products"); return; }
      const p = d.product;
      setName(p.name); setUnit(p.unit); setBarcode(p.barcode ?? ""); setAdditionalCode(p.additionalCode ?? "");
      setExtraCost(p.extraCost); setPrice(p.price); setWholesalePrice(p.wholesalePrice ?? "");
      setComponents(p.components);
      if (p.categoryId) {
        const cat = categories.find((c: CategoryOption) => c.id === p.categoryId);
        if (cat?.parentId) { setCategoryId(cat.parentId); setSubcategoryId(cat.id); } else setCategoryId(p.categoryId);
      }
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundleId, categories.length]);

  const topCategories = categories.filter((c) => !c.parentId);
  const subCategories = categories.filter((c) => c.parentId === categoryId);

  useEffect(() => {
    const thisReq = ++searchReq.current;
    if (!search.trim()) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/products/admin-search?type=REGULAR&q=${encodeURIComponent(search.trim())}&pageSize=8`);
      const d = await r.json();
      if (thisReq === searchReq.current) setSuggestions(d.products ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  function addComponent(p: PickableProduct) {
    setComponents((rows) => {
      const existing = rows.find((r) => r.productId === p.id);
      if (existing) return rows.map((r) => (r.productId === p.id ? { ...r, quantity: r.quantity + 1 } : r));
      return [...rows, { productId: p.id, quantity: 1, name: p.name, barcode: p.barcode, unit: p.unit, cost: p.cost ?? 0, price: p.price }];
    });
    setSearch(""); setSuggestions([]);
  }
  function addMany(list: PickableProduct[]) {
    for (const p of list) addComponent(p);
    setPickerOpen(false);
  }
  function removeComponent(productId: string) {
    setComponents((rows) => rows.filter((r) => r.productId !== productId));
  }
  function setQuantity(productId: string, quantity: number) {
    setComponents((rows) => rows.map((r) => (r.productId === productId ? { ...r, quantity } : r)));
  }

  const cost = components.reduce((sum, c) => sum + c.cost * c.quantity, 0) + (extraCost || 0);
  const markup = cost > 0 ? ((price - cost) / cost) * 100 : 0;

  async function save() {
    if (!name.trim()) { toast.error("Введите название комплекта"); return; }
    if (components.length === 0) { toast.error("Добавьте хотя бы один товар в комплект"); return; }
    setSaving(true);
    try {
      const finalCategoryId = subcategoryId || categoryId || null;
      const body = {
        name: name.trim(), unit, barcode: barcode.trim() || undefined, additionalCode: additionalCode.trim() || null,
        categoryId: finalCategoryId,
        components: components.map((c) => ({ productId: c.productId, quantity: c.quantity })),
        extraCost: extraCost || 0, price, wholesalePrice: wholesalePrice === "" ? null : Number(wholesalePrice),
      };
      const r = await fetch(editing ? `/api/products/bundle/${bundleId}` : "/api/products/bundle", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Не удалось сохранить комплект"); return; }
      toast.success(editing ? "Комплект обновлён" : "Комплект создан");
      router.push("/products");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><ArrowLeft className="h-4 w-4" /> Товары</Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Package className="h-6 w-6 text-primary" /> {editing ? "Редактирование комплекта" : "Создание комплекта"}</h1>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Основная информация</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Название *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Введите название комплекта" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Единица измерения *</label>
            <select value={unit} onChange={(e) => setUnit(e.target.value as "pcs" | "kg" | "l" | "m")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </div>
          <div />
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Штрихкод *</label>
            <div className="flex gap-2">
              <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Введите штрихкод" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
              <button type="button" onClick={() => setBarcode(generateEan13())} className="shrink-0 text-sm font-medium text-primary hover:underline">Сгенерировать</button>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Дополнительный код</label>
            <div className="flex gap-2">
              <input value={additionalCode} onChange={(e) => setAdditionalCode(e.target.value)} placeholder="Введите доп. штрихкод" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
              <button type="button" onClick={() => setAdditionalCode(generateEan13())} className="shrink-0 text-sm font-medium text-primary hover:underline">Сгенерировать</button>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <div>
          <h2 className="font-semibold">Состав комплекта</h2>
          <p className="text-xs text-muted-foreground">Соберите комплект из нужных Вам товаров</p>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left">Название</th>
                <th className="px-3 py-2 text-left">Штрихкод</th>
                <th className="px-3 py-2 text-right">Кол-во</th>
                <th className="px-3 py-2 text-left">Ед. изм</th>
                <th className="px-3 py-2 text-right">Закуп. цена</th>
                <th className="px-3 py-2 text-right">Прод. цена</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {components.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">Тут пока пусто<br /><span className="text-xs">Добавьте товары в комплект</span></td></tr>
              ) : components.map((c) => (
                <tr key={c.productId}>
                  <td className="px-3 py-2">{c.name}</td>
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{c.barcode ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min={0.001} step="0.001" value={c.quantity}
                      onChange={(e) => setQuantity(c.productId, Math.max(0.001, Number(e.target.value)))}
                      className="h-8 w-20 rounded border bg-background px-2 text-right text-sm" />
                  </td>
                  <td className="px-3 py-2">{unitLabel(c.unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(c.cost)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(c.price)}</td>
                  <td className="px-3 py-2"><button onClick={() => removeComponent(c.productId)} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-64">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Поиск по названию" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            {suggestions.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg">
                {suggestions.map((p) => (
                  <button key={p.id} onClick={() => addComponent(p)} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-muted">{p.name}</button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setPickerOpen(true)} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Номенклатура</button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 border-t pt-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Дополнительные расходы</label>
            <input type="number" min={0} step="0.01" value={extraCost} onChange={(e) => setExtraCost(Math.max(0, Number(e.target.value)))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div className="flex items-end text-sm text-muted-foreground">Себестоимость комплекта: <span className="ml-1 font-medium text-foreground">{formatCurrency(cost)}</span></div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Цена на весь комплект</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Наценка (%)</label>
            <input type="number" step="0.1" value={cost > 0 ? Number(markup.toFixed(1)) : 0}
              onChange={(e) => { const v = Number(e.target.value); if (cost > 0 && !Number.isNaN(v)) setPrice(Math.round(cost * (1 + v / 100) * 100) / 100); }}
              className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Продажная цена</label>
            <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Оптовая цена</label>
            <input type="number" min={0} step="0.01" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value === "" ? "" : Math.max(0, Number(e.target.value)))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Категории</h2>
        <div className="grid gap-4 sm:grid-cols-2">
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
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editing ? "Сохранить" : "Создать"}
        </button>
        <Link href="/products" className="inline-flex h-10 items-center rounded-md border px-6 text-sm font-medium hover:bg-accent">Отменить</Link>
      </div>

      {pickerOpen && <ProductPickerModal title="Номенклатура" type="REGULAR" onClose={() => setPickerOpen(false)} onSelect={addMany} />}
    </div>
  );
}
