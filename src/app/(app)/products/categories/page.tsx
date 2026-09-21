"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, FolderTree, Loader2, Pencil, Plus, Trash2, Wand2 } from "lucide-react";

type Category = { id: string; name: string; parentId: string | null; sortOrder: number; imageUrl: string | null; productCount: number };
type PickProduct = { id: string; name: string; barcode: string | null; category: string | null; categoryId: string | null; stock: number };

export default function CategoriesPage() {
  const t = useTranslations("products");
  const [cats, setCats] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadCats = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/categories");
      const d = await r.json();
      setCats(d.categories ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadCats(); }, [loadCats]);

  const totalCategorised = useMemo(() => cats.reduce((s, c) => s + c.productCount, 0), [cats]);

  async function addCategory() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/categories", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      setNewName("");
      loadCats();
    } finally { setBusy(false); }
  }

  async function renameCategory() {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/categories/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      setEditing(null);
      loadCats();
    } finally { setBusy(false); }
  }

  async function deleteCategory(c: Category) {
    if (!confirm(`Удалить категорию «${c.name}»?\n${c.productCount} товаров останутся без категории (товары не удаляются).`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/categories/${c.id}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      loadCats();
    } finally { setBusy(false); }
  }

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("title")}
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><FolderTree className="h-6 w-6 text-primary" /> {t("categories_link")}</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        {/* ---- category list ---- */}
        <div className="space-y-4">
          <div className="rounded-lg border bg-card overflow-hidden">
            <div className="px-4 py-2.5 border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground flex justify-between">
              <span>{cats.length} категорий</span>
              <span>{totalCategorised.toLocaleString("ru-RU")} товаров</span>
            </div>
            {loading ? (
              <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
            ) : (
              <ul className="divide-y">
                {cats.filter((c) => !c.parentId).map((c) => (
                  <li key={c.id} className="group flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40">
                    {editing?.id === c.id ? (
                      <>
                        <input
                          autoFocus value={editing.name}
                          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") renameCategory(); if (e.key === "Escape") setEditing(null); }}
                          className="flex-1 h-8 rounded border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <button onClick={renameCategory} disabled={busy} className="rounded p-1.5 text-primary hover:bg-primary/10" aria-label="Сохранить"><Check className="h-4 w-4" /></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm font-medium truncate">{c.name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums">{c.productCount}</span>
                        <button onClick={() => setEditing({ id: c.id, name: c.name })} className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity" aria-label="Переименовать"><Pencil className="h-3.5 w-3.5" /></button>
                        <button onClick={() => deleteCategory(c)} className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2 border-t p-3">
              <input
                value={newName} onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addCategory()}
                placeholder="Название новой категории"
                className="flex-1 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <button onClick={addCategory} disabled={busy || !newName.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                <Plus className="h-4 w-4" /> Добавить
              </button>
            </div>
          </div>
        </div>

        {/* ---- bulk assign ---- */}
        <BulkAssign cats={cats} onDone={loadCats} />
      </div>
    </div>
  );
}

function BulkAssign({ cats, onDone }: { cats: Category[]; onDone: () => void }) {
  const [scope, setScope] = useState<"uncategorized" | "category" | "search">("uncategorized");
  const [scopeCatId, setScopeCatId] = useState("");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<PickProduct[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState("");
  const [assigning, setAssigning] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setSel(new Set());
    const p = new URLSearchParams({ take: "400" });
    if (scope === "uncategorized") p.set("uncategorized", "1");
    if (scope === "category" && scopeCatId) p.set("categoryId", scopeCatId);
    if (q.trim()) p.set("q", q.trim());
    try {
      const r = await fetch(`/api/categories/products?${p}`);
      const d = await r.json();
      setRows(d.products ?? []); setTotal(d.total ?? 0);
    } finally { setLoading(false); }
  }, [scope, scopeCatId, q]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  const allSelected = rows.length > 0 && sel.size === rows.length;
  function toggleAll() { setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id))); }
  function toggle(id: string) { setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }); }

  async function assign() {
    if (!sel.size) return;
    setAssigning(true);
    try {
      const r = await fetch("/api/categories/assign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: target || null, productIds: [...sel] }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d.error ?? "Не удалось назначить"); return; }
      toast.success(`Товаров ${target ? "перенесено в категорию" : "откреплено от категории"}: ${d.updated}`);
      onDone(); load();
    } finally { setAssigning(false); }
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-4 py-3 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">Массовое назначение категории</h2>
        <span className="ml-auto text-xs text-muted-foreground">Чтобы разобрать «Разное»: выберите категорию → выделите всё → назначьте нужную категорию</span>
      </div>

      <div className="p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {([["uncategorized", "Без категории"], ["category", "Из категории"], ["search", "По поиску"]] as const).map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${scope === k ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"}`}>
              {label}
            </button>
          ))}
          {scope === "category" && (
            <select value={scopeCatId} onChange={(e) => setScopeCatId(e.target.value)} className="h-8 rounded-md border bg-background px-2 text-xs">
              <option value="">— выберите категорию —</option>
              {cats.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name} ({c.productCount})</option>)}
            </select>
          )}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Фильтр по названию / штрихкоду"
            className="h-8 flex-1 min-w-[10rem] rounded-md border bg-background px-3 text-xs focus:outline-none focus:ring-2 focus:ring-ring" />
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{loading ? "загрузка…" : `показано ${rows.length} / всего ${total.toLocaleString("ru-RU")}`}</span>
          <button onClick={toggleAll} className="font-medium text-primary hover:underline">{allSelected ? "Снять выбор" : "Выделить всё"}</button>
        </div>

        <div className="max-h-[46vh] overflow-y-auto rounded-md border divide-y">
          {rows.map((r) => (
            <label key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/40 cursor-pointer">
              <input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="h-4 w-4 accent-primary" />
              <span className="flex-1 truncate">{r.name}</span>
              {r.category && <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground shrink-0">{r.category}</span>}
              <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{r.barcode ?? ""}</span>
            </label>
          ))}
          {!loading && rows.length === 0 && <p className="px-3 py-6 text-center text-xs text-muted-foreground">Нет товаров</p>}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <span className="text-sm font-medium">Выбрано: {sel.size} →</span>
          <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
            <option value="">— убрать категорию —</option>
            {cats.filter((c) => !c.parentId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={assign} disabled={!sel.size || assigning}
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            {assigning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Применить
          </button>
        </div>
      </div>
    </div>
  );
}
