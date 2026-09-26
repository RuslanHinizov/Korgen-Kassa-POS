"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { getSession, signOut } from "@/lib/auth-client";
import { rememberCashier, setTillAuth, verifyOfflineLogin, type StoredCashier } from "@/lib/offline/auth";
import { bindTillToStore } from "@/lib/offline/clear";

type Store = { id: string; name: string; address: string | null };

/** Dedicated cash-register entrance. It accepts only a CASHIER account and then
 * asks for an assigned work location when the cashier has more than one. */
export default function CashierLoginPage() {
  const [phone, setPhone] = useState(""); const [password, setPassword] = useState("");
  const [show, setShow] = useState(false); const [loading, setLoading] = useState(false);
  const [error, setError] = useState(""); const [stores, setStores] = useState<Store[] | null>(null);
  // set when the cashier signed in without a connection (against the credentials saved on this till)
  const [offlineCashier, setOfflineCashier] = useState<StoredCashier | null>(null);

  async function goToStore(storeId: string) { await bindTillToStore(storeId); window.location.href = `/store/${storeId}/pos`; }
  async function finishOffline(cashier: StoredCashier, storeId: string) {
    await setTillAuth({ userId: cashier.userId, name: cashier.name, role: cashier.role, storeId, at: Date.now(), mode: "offline" });
    window.location.href = `/store/${storeId}/pos`;
  }
  async function offlineSignIn() {
    const result = await verifyOfflineLogin(phone.trim(), password.trim());
    if (!result.ok) {
      setError(result.reason === "locked" ? `Слишком много попыток. Подождите ${Math.ceil((result.waitMs ?? 0) / 60000)} мин.` : result.reason === "unknown" ? "Нет связи с сервером. Этот кассир ещё не входил на этой кассе — войти без интернета нельзя." : result.reason === "unavailable" ? "Нет связи с сервером, а вход без интернета здесь недоступен (нужен защищённый адрес https)." : "Неверный номер телефона или пароль");
      return;
    }
    const cashier = result.cashier;
    if (cashier.stores.length === 1) { await finishOffline(cashier, cashier.stores[0].id); return; }
    setOfflineCashier(cashier); setStores(cashier.stores.map((store) => ({ id: store.id, name: store.name, address: null })));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setLoading(true); setError("");
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) { await offlineSignIn(); return; }
      let result: Response;
      try {
        result = await fetch("/api/login/phone", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: phone.trim(), password: password.trim() }) });
      } catch {
        // the server cannot be reached: sign in against what this till saved
        await offlineSignIn(); return;
      }
      if (!result.ok) throw new Error((await result.json().catch(() => null))?.error ?? "Неверный номер телефона или пароль");
      const session = await getSession();
      if (session.data?.user.role !== "CASHIER") { await signOut(); throw new Error("Этот вход предназначен только для кассиров"); }
      const response = await fetch("/api/me/stores");
      const data = await response.json(); const assigned = data.stores ?? [];
      if (!assigned.length) { await signOut(); throw new Error("Вам не назначен ни один магазин. Обратитесь к администратору."); }
      // saved so this cashier can sign in again on this till when there is no connection
      await rememberCashier(phone.trim(), password.trim(), { id: session.data.user.id, name: session.data.user.name, role: "CASHIER" }, assigned.map((store: Store) => ({ id: store.id, name: store.name })));
      if (assigned.length === 1) { await goToStore(assigned[0].id); return; }
      setStores(assigned);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Не удалось войти"); }
    finally { setLoading(false); }
  }
  if (stores) return <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-7 shadow-xl"><img src="/korgen-kassa-mark.png" alt="Korgen Kassa" className="mx-auto h-14 w-14 rounded-xl object-contain" /><h1 className="mt-3 text-center text-xl font-bold text-[#15503A]">Выберите магазин</h1><p className="mt-1 text-center text-sm text-slate-500">Где вы работаете сегодня?</p><div className="mt-6 space-y-2">{stores.map((store) => <button key={store.id} onClick={() => { if (offlineCashier) void finishOffline(offlineCashier, store.id); else void goToStore(store.id); }} className="w-full rounded-xl border px-4 py-4 text-left transition hover:border-[#22B24C] hover:bg-emerald-50"><b>{store.name}</b>{store.address && <span className="mt-1 block text-xs text-slate-500">{store.address}</span>}</button>)}</div><button onClick={() => signOut().then(() => { window.location.href = "/kasa-giris"; })} className="mt-5 w-full text-sm text-slate-500 underline">Выйти</button></div></div>;
  return <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#e4f6ec] via-white to-slate-100 p-4"><div className="w-full max-w-sm rounded-3xl border bg-white px-8 py-10 shadow-xl"><div className="text-center"><img src="/korgen-kassa-mark.png" alt="Korgen Kassa" className="mx-auto h-16 w-16 rounded-2xl object-contain shadow" /><h1 className="mt-4 text-2xl font-bold text-[#15503A]">Касса</h1><p className="mt-1 text-sm text-slate-500">Вход для кассира</p></div><form onSubmit={submit} className="mt-7 space-y-4"><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Номер телефона<PhoneInput required value={phone} onChange={setPhone} className="mt-1.5 h-11 w-full rounded-xl border bg-slate-50 px-3 text-sm" /></label><label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Пароль<div className="relative mt-1.5"><input autoComplete="current-password" required type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 w-full rounded-xl border bg-slate-50 px-3 pr-10 text-sm" /><button type="button" onClick={() => setShow((value) => !value)} className="absolute right-3 top-3 text-slate-400">{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></label>{error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}<button disabled={loading} className="h-11 w-full rounded-xl bg-[#15503A] text-sm font-bold text-white disabled:opacity-50">{loading ? "Вход…" : "Войти в кассу"}</button></form><p className="mt-6 text-center text-xs text-slate-500">Офисный сотрудник? <a href="/login" className="font-semibold text-[#15503A] underline">Войти в управление</a></p></div></div>;
}
