"use client";

import { useCallback, useEffect, useState } from "react";
import { StoreLink as Link } from "@/components/store/store-link";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";

interface Entry { id: string; name: string }
interface Book { id: string; name: string; modules: string[] }

const MODULE_LABEL: Record<string, string> = { SALE: "Продажа", RETURN: "Возврат" };
const MODULE_OPTIONS = ["SALE", "RETURN"] as const;

export function ReferenceBookDetail({ id }: { id: string }) {
  const router = useRouter();
  const [book, setBook] = useState<Book | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [modules, setModules] = useState<Set<string>>(new Set());
  const [newEntryName, setNewEntryName] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/reference-books/${id}`);
    if (!r.ok) { toast.error("Справочник не найден"); router.push("/management/reference"); return; }
    const d = await r.json();
    setBook(d.referenceBook);
    setName(d.referenceBook.name);
    setModules(new Set(d.referenceBook.modules));
    setEntries(d.referenceBook.entries);
    setLoading(false);
  }, [id, router]);
  useEffect(() => { load(); }, [load]);

  function toggleModule(m: string) {
    setModules((prev) => { const next = new Set(prev); if (next.has(m)) next.delete(m); else next.add(m); return next; });
  }

  async function saveHeader() {
    if (!name.trim() || modules.size === 0) { toast.error("Введите название и выберите модуль"); return; }
    setBusy(true);
    try {
      const r = await fetch(`/api/reference-books/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.trim(), modules: [...modules] }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
      load();
    } finally { setBusy(false); }
  }

  async function deleteBook() {
    if (!confirm(`Удалить справочник «${book?.name}»?`)) return;
    const r = await fetch(`/api/reference-books/${id}`, { method: "DELETE" });
    if (!r.ok) { toast.error("Не удалось удалить"); return; }
    router.push("/management/reference");
  }

  async function addEntry() {
    if (!newEntryName.trim()) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/reference-books/${id}/entries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newEntryName.trim() }) });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось добавить"); return; }
      setNewEntryName("");
      load();
    } finally { setBusy(false); }
  }

  async function deleteEntry(entryId: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/reference-books/${id}/entries/${entryId}`, { method: "DELETE" });
      if (!r.ok) { toast.error("Не удалось удалить"); return; }
      load();
    } finally { setBusy(false); }
  }

  if (loading || !book) {
    return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <h1 className="text-lg font-bold">Редактирование справочника</h1>

      <div className="flex items-center gap-2">
        <button onClick={saveHeader} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
        </button>
        <button onClick={deleteBook} className="inline-flex h-9 items-center rounded-md border border-destructive/30 px-3 text-sm font-medium text-destructive hover:bg-destructive/10">Удалить</button>
        <Link href="/management/reference" className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent">Закрыть</Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 rounded-lg border p-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Название справочника *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Добавить в модуль *</label>
          <div className="flex h-9 items-center gap-4 rounded-md border bg-background px-2 text-sm">
            {MODULE_OPTIONS.map((m) => (
              <label key={m} className="flex items-center gap-1.5">
                <input type="checkbox" checked={modules.has(m)} onChange={() => toggleModule(m)} /> {MODULE_LABEL[m]}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="border-b px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Название</div>
        <div className="divide-y">
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between px-4 py-2">
              <input value={entry.name} readOnly className="h-8 w-full max-w-xs rounded-md border bg-muted/30 px-2 text-sm" />
              <button onClick={() => deleteEntry(entry.id)} className="ml-2 rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive" aria-label="Удалить"><X className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <div className="flex items-center gap-2 px-4 py-2">
            <input
              value={newEntryName} onChange={(e) => setNewEntryName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addEntry(); }}
              placeholder="Введите название"
              className="h-8 w-full max-w-xs rounded-md border bg-background px-2 text-sm"
            />
            <button onClick={addEntry} disabled={busy || !newEntryName.trim()} className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">Сохранить</button>
          </div>
        </div>
      </div>
    </div>
  );
}
