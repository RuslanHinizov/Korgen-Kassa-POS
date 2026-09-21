"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { ArrowLeft, Check, Loader2, Pencil, Plus, Search, Trash2, Zap, ArrowUp, ArrowDown } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

type Group = { id: string; name: string; sortOrder: number; itemCount: number };
type Item = {
  id: string; groupId: string | null; displayName: string | null; sortOrder: number;
  product: { id: string; name: string; price: number; stock: number; unit: string; barcode: string | null; active: boolean } | null;
};
type PickProduct = { id: string; name: string; price: number; stock: number; unit?: string; barcode?: string | null };

export default function QuickProductsPage() {
  const t = useTranslations("products");
  const [groups, setGroups] = useState<Group[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);
  const [loadingItems, setLoadingItems] = useState(true);
  const [selectedGroup, setSelectedGroup] = useState<string | "all" | null>("all");
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroup, setEditingGroup] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loadGroups = useCallback(async () => {
    setLoadingGroups(true);
    try {
      const r = await fetch("/api/quick-product-groups");
      const d = await r.json();
      setGroups(d.groups ?? []);
    } finally { setLoadingGroups(false); }
  }, []);

  const loadItems = useCallback(async () => {
    setLoadingItems(true);
    try {
      const p = selectedGroup && selectedGroup !== "all" ? `?groupId=${selectedGroup}` : "";
      const r = await fetch(`/api/quick-products${p}`);
      const d = await r.json();
      setItems(d.items ?? []);
    } finally { setLoadingItems(false); }
  }, [selectedGroup]);

  useEffect(() => { loadGroups(); }, [loadGroups]);
  useEffect(() => { loadItems(); }, [loadItems]);

  async function addGroup() {
    const name = newGroupName.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch("/api/quick-product-groups", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      setNewGroupName("");
      loadGroups();
    } finally { setBusy(false); }
  }

  async function renameGroup() {
    if (!editingGroup) return;
    const name = editingGroup.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/quick-product-groups/${editingGroup.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      setEditingGroup(null);
      loadGroups();
    } finally { setBusy(false); }
  }

  async function deleteGroup(g: Group) {
    if (!confirm(`Удалить группу «${g.name}»?\n${g.itemCount} быстрых товаров будут откреплены от группы (товары не удаляются).`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/quick-product-groups/${g.id}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      if (selectedGroup === g.id) setSelectedGroup("all");
      loadGroups(); loadItems();
    } finally { setBusy(false); }
  }

  async function addItem(product: PickProduct) {
    setBusy(true);
    try {
      const r = await fetch("/api/quick-products", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, groupId: selectedGroup !== "all" ? selectedGroup : null }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      loadItems(); loadGroups();
    } finally { setBusy(false); }
  }

  async function renameItem(item: Item, displayName: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/quick-products/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ displayName: displayName.trim() || null }) });
      if (!r.ok) { toast.error("Не удалось сохранить"); return; }
      loadItems();
    } finally { setBusy(false); }
  }

  async function deleteItem(item: Item) {
    setBusy(true);
    try {
      const r = await fetch(`/api/quick-products/${item.id}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      loadItems(); loadGroups();
    } finally { setBusy(false); }
  }

  async function moveItem(index: number, dir: -1 | 1) {
    const other = items[index + dir];
    const current = items[index];
    if (!other || !current) return;
    setBusy(true);
    try {
      await Promise.all([
        fetch(`/api/quick-products/${current.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: other.sortOrder }) }),
        fetch(`/api/quick-products/${other.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sortOrder: current.sortOrder }) }),
      ]);
      loadItems();
    } finally { setBusy(false); }
  }

  const groupTotal = useMemo(() => groups.reduce((s, g) => s + g.itemCount, 0), [groups]);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/products" className="inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-accent transition-colors">
          <ArrowLeft className="h-4 w-4" /> {t("title")}
        </Link>
        <h1 className="text-2xl font-bold flex items-center gap-2"><Zap className="h-6 w-6 text-primary" /> {t("quick_products_link")}</h1>
      </div>
      <p className="text-sm text-muted-foreground -mt-4">
        Кнопки быстрого добавления на экране кассы для товаров без штрихкода (хлеб, яйца, пакет и т.п.).
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_1fr]">
        {/* ---- group list ---- */}
        <div className="rounded-lg border bg-card overflow-hidden h-fit">
          <div className="px-4 py-2.5 border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground flex justify-between">
            <span>{groups.length} групп</span>
            <span>{groupTotal} товаров</span>
          </div>
          {loadingGroups ? (
            <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
          ) : (
            <ul className="divide-y">
              <li>
                <button
                  onClick={() => setSelectedGroup("all")}
                  className={`w-full flex items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-muted/40 ${selectedGroup === "all" ? "bg-primary/10 font-medium text-primary" : ""}`}
                >
                  Все группы <span className="ml-auto text-xs text-muted-foreground tabular-nums">{groupTotal}</span>
                </button>
              </li>
              {groups.map((g) => (
                <li key={g.id} className="group flex items-center gap-2 px-4 py-2.5 hover:bg-muted/40">
                  {editingGroup?.id === g.id ? (
                    <>
                      <input
                        autoFocus value={editingGroup.name}
                        onChange={(e) => setEditingGroup({ ...editingGroup, name: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Enter") renameGroup(); if (e.key === "Escape") setEditingGroup(null); }}
                        className="flex-1 h-8 rounded border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button onClick={renameGroup} disabled={busy} className="rounded p-1.5 text-primary hover:bg-primary/10" aria-label="Сохранить"><Check className="h-4 w-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setSelectedGroup(g.id)} className={`flex-1 truncate text-left text-sm ${selectedGroup === g.id ? "font-medium text-primary" : ""}`}>{g.name}</button>
                      <span className="text-xs text-muted-foreground tabular-nums">{g.itemCount}</span>
                      <button onClick={() => setEditingGroup({ id: g.id, name: g.name })} className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-accent transition-opacity" aria-label="Переименовать"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteGroup(g)} className="rounded p-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-opacity" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 border-t p-3">
            <input
              value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addGroup()}
              placeholder="Название новой группы"
              className="flex-1 h-9 rounded-md border bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button onClick={addGroup} disabled={busy || !newGroupName.trim()} className="inline-flex h-9 items-center gap-1 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ---- items in the selected group ---- */}
        <div className="rounded-lg border bg-card">
          <ProductPicker onPick={addItem} busy={busy} />
          <div className="border-t">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-4 py-2.5 text-left">Название</th>
                  <th className="px-4 py-2.5 text-left">Штрихкод</th>
                  <th className="px-4 py-2.5 text-left">Оригинальное название</th>
                  <th className="px-4 py-2.5 text-right">Цена</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((item, i) => (
                  <QuickProductRow
                    key={item.id} item={item}
                    canUp={i > 0} canDown={i < items.length - 1}
                    onMove={(dir) => moveItem(i, dir)}
                    onRename={(name) => renameItem(item, name)}
                    onDelete={() => deleteItem(item)}
                  />
                ))}
              </tbody>
            </table>
            {loadingItems ? (
              <div className="p-6 text-center text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline" /></div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">В этой группе нет быстрых товаров. Добавьте через поиск выше.</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function QuickProductRow({
  item, canUp, canDown, onMove, onRename, onDelete,
}: {
  item: Item; canUp: boolean; canDown: boolean;
  onMove: (dir: -1 | 1) => void; onRename: (name: string) => void; onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  if (!item.product) return null;

  function commit(value: string) {
    setEditing(false);
    if (!cancelled && value !== (item.displayName ?? "")) onRename(value);
    setCancelled(false);
  }

  return (
    <tr className="group hover:bg-muted/40">
      <td className="px-4 py-2">
        {editing ? (
          <input
            autoFocus defaultValue={item.displayName ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") { setCancelled(true); e.currentTarget.blur(); }
            }}
            onBlur={(e) => commit(e.currentTarget.value)}
            className="h-8 w-full rounded border bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        ) : (
          <button onClick={() => setEditing(true)} className="text-left font-medium hover:underline">
            {item.displayName || item.product.name}
          </button>
        )}
      </td>
      <td className="px-4 py-2 text-muted-foreground tabular-nums">{item.product.barcode ?? "—"}</td>
      <td className="px-4 py-2 text-muted-foreground">{item.product.name}</td>
      <td className="px-4 py-2 text-right font-medium">{formatCurrency(item.product.price)}</td>
      <td className="px-4 py-2">
        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button disabled={!canUp} onClick={() => onMove(-1)} className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Вверх"><ArrowUp className="h-3.5 w-3.5" /></button>
          <button disabled={!canDown} onClick={() => onMove(1)} className="rounded p-1.5 text-muted-foreground hover:bg-accent disabled:opacity-30" aria-label="Вниз"><ArrowDown className="h-3.5 w-3.5" /></button>
          <button onClick={() => setEditing(true)} className="rounded p-1.5 text-muted-foreground hover:bg-accent" aria-label="Переименовать"><Pencil className="h-3.5 w-3.5" /></button>
          <button onClick={onDelete} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      </td>
    </tr>
  );
}

function ProductPicker({ onPick, busy }: { onPick: (p: PickProduct) => void; busy: boolean }) {
  const [q, setQ] = useState("");
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
    <div className="p-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q} onChange={handleChange}
          placeholder="Найдите товар, чтобы добавить как быстрый…"
          className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
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
                <span className="ml-2 shrink-0 text-xs text-muted-foreground">{formatCurrency(p.price)}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
