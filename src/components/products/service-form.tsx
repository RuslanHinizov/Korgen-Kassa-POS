"use client";

import { useEffect, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Wrench } from "lucide-react";
import { generateEan13 } from "@/lib/barcode";
import { UNIT_OPTIONS } from "@/lib/units";

interface CategoryOption { id: string; name: string; parentId: string | null }

export function ServiceForm({ serviceId }: { serviceId?: string }) {
  const router = useRouter();
  const editing = Boolean(serviceId);

  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState<"pcs" | "kg" | "l" | "m">("pcs");
  const [barcode, setBarcode] = useState("");
  const [additionalCode, setAdditionalCode] = useState("");
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [categoryId, setCategoryId] = useState("");
  const [subcategoryId, setSubcategoryId] = useState("");
  const [price, setPrice] = useState(0);

  useEffect(() => {
    fetch("/api/categories").then((r) => r.json()).then((d) => setCategories(d.categories ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editing) return;
    fetch(`/api/products/service/${serviceId}`).then((r) => r.json()).then((d) => {
      if (d.error) { toast.error(d.error); router.push("/products"); return; }
      const p = d.product;
      setName(p.name); setUnit(p.unit); setBarcode(p.barcode ?? ""); setAdditionalCode(p.additionalCode ?? ""); setPrice(p.price);
      if (p.categoryId) {
        const cat = categories.find((c: CategoryOption) => c.id === p.categoryId);
        if (cat?.parentId) { setCategoryId(cat.parentId); setSubcategoryId(cat.id); } else setCategoryId(p.categoryId);
      }
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceId, categories.length]);

  const topCategories = categories.filter((c) => !c.parentId);
  const subCategories = categories.filter((c) => c.parentId === categoryId);

  async function save() {
    if (!name.trim()) { toast.error("Введите название услуги"); return; }
    setSaving(true);
    try {
      const finalCategoryId = subcategoryId || categoryId || null;
      const body = { name: name.trim(), unit, barcode: barcode.trim() || undefined, additionalCode: additionalCode.trim() || null, categoryId: finalCategoryId, price };
      const r = await fetch(editing ? `/api/products/service/${serviceId}` : "/api/products/service", {
        method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Не удалось сохранить услугу"); return; }
      toast.success(editing ? "Услуга обновлена" : "Услуга создана");
      router.push("/products");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-xl">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent"><ArrowLeft className="h-4 w-4" /> Товары</Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Wrench className="h-6 w-6 text-primary" /> {editing ? "Редактирование услуги" : "Создание услуги"}</h1>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Основная информация</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Название *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Введите название услуги" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Единица измерения *</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value as "pcs" | "kg" | "l" | "m")} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
            {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Штрихкод *</label>
          <div className="flex gap-2">
            <input value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Введите штрихкод" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            <button type="button" onClick={() => setBarcode(generateEan13())} className="shrink-0 text-sm font-medium text-primary hover:underline">Сгенерировать</button>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Доп. код</label>
          <div className="flex gap-2">
            <input value={additionalCode} onChange={(e) => setAdditionalCode(e.target.value)} placeholder="Введите доп.код" className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
            <button type="button" onClick={() => setAdditionalCode(generateEan13())} className="shrink-0 text-sm font-medium text-primary hover:underline">Сгенерировать</button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Категория</label>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(""); }} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
              <option value="">Укажите категорию</option>
              {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Подкатегория</label>
            <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)} disabled={!categoryId || subCategories.length === 0} className="h-9 w-full rounded-md border bg-background px-2 text-sm disabled:opacity-50">
              <option value="">Укажите подкатегорию</option>
              {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="font-semibold">Цены</h2>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Продажная цена</label>
          <input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(Math.max(0, Number(e.target.value)))} className="h-9 w-full rounded-md border bg-background px-3 text-sm" />
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-1.5 rounded-md bg-primary px-6 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {editing ? "Сохранить" : "Создать"}
        </button>
        <Link href="/products" className="inline-flex h-10 items-center rounded-md border px-6 text-sm font-medium hover:bg-accent">Отменить</Link>
      </div>
    </div>
  );
}
