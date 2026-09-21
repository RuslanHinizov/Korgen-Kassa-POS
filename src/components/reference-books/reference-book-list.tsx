"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Loader2, Pencil, Plus, X } from "lucide-react";

interface Row { id: string; name: string; modules: string[]; entryCount: number }

export function ReferenceBookList() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/reference-books");
      const d = await r.json();
      setRows(d.referenceBooks ?? []);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function createBook(name: string, modules: string[]) {
    const r = await fetch("/api/reference-books", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, modules }) });
    if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось создать"); return false; }
    setCreateOpen(false);
    load();
    return true;
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-2xl font-bold">Справочник</h1>

      <button onClick={() => setCreateOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
        <Plus className="h-4 w-4" /> Справочник
      </button>

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left w-16">#</th>
              <th className="px-4 py-2.5 text-left">Название</th>
              <th className="px-4 py-2.5 text-left">Кол-во справок</th>
              <th className="w-12 px-2 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>
            ) : pageRows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-muted-foreground">Нет данных</td></tr>
            ) : (
              pageRows.map((row, idx) => (
                <tr key={row.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2.5 text-muted-foreground">{(page - 1) * pageSize + idx + 1}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/management/reference/${row.id}`} className="font-medium text-primary hover:underline">{row.name}</Link>
                  </td>
                  <td className="px-4 py-2.5">{row.entryCount}</td>
                  <td className="px-2 py-2 text-right">
                    <Link href={`/management/reference/${row.id}`} className="inline-flex rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label="Открыть">
                      <Pencil className="h-3.5 w-3.5" />
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-1">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsLeft className="h-4 w-4" /></button>
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronLeft className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">{rows.length === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(page * pageSize, rows.length)} / {rows.length}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronRight className="h-4 w-4" /></button>
          <button disabled={page >= totalPages} onClick={() => setPage(totalPages)} className="rounded p-1.5 hover:bg-accent disabled:opacity-30"><ChevronsRight className="h-4 w-4" /></button>
        </div>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-md border bg-background px-2 text-sm">
          {[25, 50, 100, 500].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} onCreate={createBook} />}
    </div>
  );
}

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (name: string, modules: string[]) => Promise<boolean> }) {
  const [name, setName] = useState("");
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const allChecked = modules.has("SALE") && modules.has("RETURN");

  function toggleAll() {
    setModules(allChecked ? new Set() : new Set(["SALE", "RETURN"]));
  }
  function toggleModule(m: string) {
    setModules((prev) => { const next = new Set(prev); if (next.has(m)) next.delete(m); else next.add(m); return next; });
  }

  async function save() {
    if (!name.trim() || modules.size === 0) return;
    setSaving(true);
    try { await onCreate(name.trim(), [...modules]); } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">Создание дополнительного поля</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-3 p-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Название справочника</label>
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="Введите название" className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Модуль в котором новое поле будет отображаться</label>
            <div className="space-y-1.5 rounded-md border p-2">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allChecked} onChange={toggleAll} /> Все</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modules.has("SALE")} onChange={() => toggleModule("SALE")} /> Продажа</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={modules.has("RETURN")} onChange={() => toggleModule("RETURN")} /> Возврат</label>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={onClose} className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Отменить</button>
            <button onClick={save} disabled={saving || !name.trim() || modules.size === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
