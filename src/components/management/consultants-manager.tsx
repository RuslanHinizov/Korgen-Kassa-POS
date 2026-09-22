"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Gift, Loader2, Pencil, Plus, Trash2, User } from "lucide-react";
import { toast } from "sonner";

interface Consultant {
  id: string;
  name: string;
  phone: string | null;
  photoUrl: string | null;
  active: boolean;
}

interface Form {
  name: string;
  phone: string;
  photoUrl: string | null;
  active: boolean;
}

const EMPTY_FORM: Form = { name: "", phone: "", photoUrl: null, active: true };

/** Управление → Консультанты: staff members a sale can be attributed to. */
export function ConsultantsManager() {
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Consultant | null>(null);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/consultants");
    const d = await r.json();
    setConsultants(d.consultants ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  }

  function openEdit(c: Consultant) {
    setEditing(c);
    setForm({ name: c.name, phone: c.phone ?? "", photoUrl: c.photoUrl, active: c.active });
    setModalOpen(true);
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/upload", { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось загрузить фото"); return; }
      setForm((f) => ({ ...f, photoUrl: d.url }));
    } finally { setUploading(false); }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const body = { name: form.name.trim(), phone: form.phone.trim() || null, photoUrl: form.photoUrl, active: form.active };
      const res = editing
        ? await fetch(`/api/consultants/${editing.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/consultants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        toast.error(typeof d.error === "string" ? d.error : "Не удалось сохранить");
        return;
      }
      setModalOpen(false);
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Consultant) {
    if (!confirm(`Удалить консультанта «${c.name}»?`)) return;
    await fetch(`/api/consultants/${c.id}`, { method: "DELETE" });
    load();
  }

  const Avatar = ({ url, size }: { url: string | null; size: number }) =>
    url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="" style={{ width: size, height: size }} className="rounded-full object-cover" />
    ) : (
      <span style={{ width: size, height: size }} className="bg-muted text-muted-foreground flex items-center justify-center rounded-full"><User className="h-1/2 w-1/2" /></span>
    );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-muted-foreground text-base">Консультанты</h1>
      <button onClick={openCreate} className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-1.5 rounded-md px-4 text-sm font-medium">
        <Plus className="h-4 w-4" /> Создать консультанта
      </button>

      <div className="bg-card rounded-lg border">
        {loading ? (
          <div className="text-muted-foreground flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : consultants.length === 0 ? (
          <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
            <Gift className="h-10 w-10 opacity-40" />
            <p className="text-foreground font-medium">Тут пока пусто</p>
            <p className="text-xs">Чтобы добавить консультанта, нажмите на кнопку выше</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 text-muted-foreground border-b text-xs font-medium">
                <th className="w-14 px-4 py-2.5" />
                <th className="px-4 py-2.5 text-left">Имя</th>
                <th className="px-4 py-2.5 text-left">Номер телефона</th>
                <th className="px-4 py-2.5 text-left">Статус</th>
                <th className="w-24 px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {consultants.map((c) => (
                <tr key={c.id} className="hover:bg-muted/40">
                  <td className="px-4 py-2"><Avatar url={c.photoUrl} size={32} /></td>
                  <td className="px-4 py-2.5 font-medium">{c.name}</td>
                  <td className="text-muted-foreground px-4 py-2.5">{c.phone ?? "—"}</td>
                  <td className="px-4 py-2.5">{c.active ? "Активен" : "Не активен"}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex justify-end gap-1">
                      <button onClick={() => openEdit(c)} className="text-primary hover:bg-accent rounded p-1.5" aria-label="Изменить"><Pencil className="h-4 w-4" /></button>
                      <button onClick={() => handleDelete(c)} className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded p-1.5" aria-label="Удалить"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-background w-full max-w-sm rounded-xl border p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? "Редактирование консультанта" : "Создание консультанта"}</h2>
              <button onClick={() => setModalOpen(false)} className="text-muted-foreground hover:text-foreground text-xl leading-none" aria-label="Закрыть">×</button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar url={form.photoUrl} size={64} />
                <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPhoto(f); e.target.value = ""; }} />
                <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="hover:bg-accent h-9 flex-1 rounded-md border text-sm disabled:opacity-50">
                  {uploading ? "Загрузка…" : form.photoUrl ? "Заменить фото" : "Добавить фото"}
                </button>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Имя</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Введите имя" className="bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Номер телефона</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 (___) ___-__-__" className="bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              {editing && (
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" className="accent-primary h-4 w-4" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Активен
                </label>
              )}
              <div className="flex gap-2">
                <button type="submit" disabled={saving || !form.name.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 flex-1 rounded-md text-sm font-medium disabled:opacity-50">
                  {saving ? "Сохранение…" : editing ? "Сохранить" : "Создать"}
                </button>
                <button type="button" onClick={() => setModalOpen(false)} className="hover:bg-accent h-9 flex-1 rounded-md border text-sm">Отменить</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
