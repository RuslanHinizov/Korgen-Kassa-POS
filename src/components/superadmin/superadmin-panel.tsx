"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, X } from "lucide-react";
import { signOut } from "@/lib/auth-client";

interface StoreRow {
  id: string; name: string; address: string | null; createdAt: string;
  suspendedAt: string | null; suspendedMessage: string | null;
  users: number; products: number; openShifts: number; admins: { name: string; email: string }[];
  todaySales: number; todayRevenue: number; lastSaleAt: string | null;
}

type Dialog =
  | { kind: "create" }
  | { kind: "suspend"; store: StoreRow }
  | { kind: "delete"; store: StoreRow }
  | null;

function randomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(10)), (n) => chars[n % chars.length]).join("");
}

export function SuperAdminPanel({ userName }: { userName: string }) {
  const [stores, setStores] = useState<StoreRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [busy, setBusy] = useState(false);

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [message, setMessage] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [created, setCreated] = useState<{ storeName: string; email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/superadmin/stores");
      if (r.ok) setStores((await r.json()).stores);
      else toast.error("Не удалось загрузить магазины");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  function openCreate() {
    setName(""); setAddress(""); setAdminName(""); setAdminEmail(""); setAdminPassword(randomPassword());
    setDialog({ kind: "create" });
  }

  async function createStore() {
    setBusy(true);
    try {
      const r = await fetch("/api/superadmin/stores", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address: address || undefined, adminName, adminEmail, adminPassword }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось создать магазин"); return; }
      setCreated({ storeName: name, email: adminEmail, password: adminPassword });
      setDialog(null);
      load();
    } finally { setBusy(false); }
  }

  async function patchStore(id: string, body: object, okText: string) {
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/stores/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!r.ok) { toast.error((await r.json().catch(() => ({}))).error ?? "Ошибка"); return; }
      toast.success(okText);
      setDialog(null);
      load();
    } finally { setBusy(false); }
  }

  async function deleteStore(store: StoreRow) {
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/stores/${store.id}`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmName }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось удалить"); return; }
      toast.success("Магазин удалён");
      setDialog(null);
      load();
    } finally { setBusy(false); }
  }

  const input = "h-9 w-full rounded-md border bg-background px-2 text-sm";

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-3 bg-[#15503A] px-6 py-3 text-white">
        <img src="/korgen-kassa-mark.png" alt="" className="h-8 w-8 rounded-lg bg-white object-contain p-0.5" />
        <span className="font-semibold">Korgen Kassa · Super Admin</span>
        <span className="ml-auto text-sm text-white/80">{userName}</span>
        <button onClick={() => signOut().then(() => { window.location.href = "/login"; })} className="rounded-md border border-white/30 px-3 py-1 text-sm hover:bg-white/10">Выйти</button>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">Магазины</h1>
          <span className="text-sm text-muted-foreground">{stores.length}</span>
          <button onClick={load} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-md border bg-white px-3 text-sm hover:bg-accent"><RefreshCw className="h-4 w-4" /> Обновить</button>
          <button onClick={openCreate} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#15503A] px-4 text-sm font-medium text-white hover:bg-[#15503A]/90"><Plus className="h-4 w-4" /> Новый магазин</button>
        </div>

        {created && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-emerald-900">Магазин «{created.storeName}» создан. Передайте владельцу данные для входа:</p>
                <p className="mt-2">Почта: <b className="select-all">{created.email}</b></p>
                <p>Пароль: <b className="select-all">{created.password}</b></p>
                <p className="mt-2 text-xs text-emerald-800">Пароль показывается один раз — сохраните его сейчас. Владелец сможет сменить его в профиле.</p>
              </div>
              <button onClick={() => setCreated(null)} className="rounded p-1 hover:bg-emerald-100"><X className="h-4 w-4" /></button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Магазин</th>
                <th className="px-4 py-3 text-left">Администратор</th>
                <th className="px-4 py-3 text-right">Сотрудники</th>
                <th className="px-4 py-3 text-right">Товары</th>
                <th className="px-4 py-3 text-right">Сегодня</th>
                <th className="px-4 py-3 text-left">Последняя продажа</th>
                <th className="px-4 py-3 text-left">Статус</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center"><Loader2 className="inline h-5 w-5 animate-spin" /></td></tr>
              ) : stores.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Магазинов пока нет</td></tr>
              ) : stores.map((s) => (
                <tr key={s.id} className={s.suspendedAt ? "bg-amber-50/50" : ""}>
                  <td className="px-4 py-3">
                    <p className="font-medium">{s.name}</p>
                    {s.address && <p className="text-xs text-muted-foreground">{s.address}</p>}
                  </td>
                  <td className="px-4 py-3">
                    {s.admins.length === 0 ? <span className="text-muted-foreground">—</span> : s.admins.map((a) => (
                      <p key={a.email}>{a.name} <span className="text-xs text-muted-foreground">{a.email}</span></p>
                    ))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.users}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{s.products}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {Math.round(s.todayRevenue).toLocaleString("ru-RU")} ₸
                    <p className="text-xs text-muted-foreground">{s.todaySales} чеков{s.openShifts > 0 ? ` · смена открыта (${s.openShifts})` : ""}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{s.lastSaleAt ? new Date(s.lastSaleAt).toLocaleString("ru-RU") : "нет продаж"}</td>
                  <td className="px-4 py-3">
                    {s.suspendedAt
                      ? <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Приостановлен</span>
                      : <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">Активен</span>}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {s.suspendedAt ? (
                      <>
                        <button onClick={() => patchStore(s.id, { suspended: false }, "Магазин снова активен")} className="mr-3 text-xs text-primary hover:underline">Возобновить</button>
                        <button onClick={() => { setConfirmName(""); setDialog({ kind: "delete", store: s }); }} className="text-xs text-destructive hover:underline">Удалить</button>
                      </>
                    ) : (
                      <button onClick={() => { setMessage(""); setDialog({ kind: "suspend", store: s }); }} className="text-xs text-amber-700 hover:underline">Приостановить</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>

      {dialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-5 shadow-xl">
            {dialog.kind === "create" && (
              <>
                <h2 className="text-lg font-semibold">Новый магазин</h2>
                <input className={input} placeholder="Название магазина" value={name} onChange={(e) => setName(e.target.value)} />
                <input className={input} placeholder="Адрес (необязательно)" value={address} onChange={(e) => setAddress(e.target.value)} />
                <p className="pt-1 text-xs font-medium text-muted-foreground">Администратор магазина (владелец)</p>
                <input className={input} placeholder="Имя владельца" value={adminName} onChange={(e) => setAdminName(e.target.value)} />
                <input className={input} type="email" placeholder="Почта для входа" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} />
                <div className="flex gap-2">
                  <input className={input} value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} />
                  <button onClick={() => setAdminPassword(randomPassword())} className="h-9 shrink-0 rounded-md border px-3 text-sm hover:bg-accent">Новый</button>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={() => setDialog(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
                  <button onClick={createStore} disabled={busy || !name.trim() || !adminName.trim() || !adminEmail.trim() || adminPassword.length < 6} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#15503A] px-4 text-sm font-medium text-white disabled:opacity-50">
                    {busy && <Loader2 className="h-4 w-4 animate-spin" />} Создать
                  </button>
                </div>
              </>
            )}
            {dialog.kind === "suspend" && (
              <>
                <h2 className="text-lg font-semibold">Приостановить «{dialog.store.name}»?</h2>
                <p className="text-sm text-muted-foreground">Никто из сотрудников магазина не сможет войти. Вместо программы они увидят сообщение. Данные сохраняются.</p>
                <textarea className="w-full rounded-md border p-2 text-sm" rows={3} placeholder="Сообщение сотрудникам (необязательно), например: «Доступ приостановлен за неоплату»" value={message} onChange={(e) => setMessage(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
                  <button onClick={() => patchStore(dialog.store.id, { suspended: true, message: message || null }, "Магазин приостановлен")} disabled={busy} className="h-9 rounded-md bg-amber-600 px-4 text-sm font-medium text-white disabled:opacity-50">Приостановить</button>
                </div>
              </>
            )}
            {dialog.kind === "delete" && (
              <>
                <h2 className="text-lg font-semibold text-destructive">Удалить «{dialog.store.name}» навсегда?</h2>
                <p className="text-sm text-muted-foreground">Это необратимо. Если в магазине уже есть продажи или накладные, удаление будет отклонено — тогда оставьте его приостановленным. Сотрудники, работавшие только здесь, тоже удаляются.</p>
                <input className={input} placeholder="Введите название магазина для подтверждения" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button onClick={() => setDialog(null)} className="h-9 rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
                  <button onClick={() => deleteStore(dialog.store)} disabled={busy || confirmName !== dialog.store.name} className="h-9 rounded-md bg-destructive px-4 text-sm font-medium text-white disabled:opacity-50">Удалить навсегда</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
