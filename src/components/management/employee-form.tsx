"use client";

import { PhoneInput } from "@/components/ui/phone-input";
import { formatPhone } from "@/lib/phone";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import JsBarcode from "jsbarcode";
import { Loader2, Printer, X } from "lucide-react";
import { toast } from "sonner";
import { useStorePath } from "@/components/store/store-provider";
import { ROLE_LABEL } from "./employees-list";

interface Store { id: string; name: string }
interface Detail {
  id: string;
  name: string;
  lastName: string | null;
  email: string;
  phone: string | null;
  role: string;
  firedAt: string | null;
  allowCashierLogin: boolean;
  cashierCode: string | null;
  hasPin: boolean;
  storeIds: string[];
}

const EMPTY = { name: "", lastName: "", phone: "", email: "", role: "CASHIER", storeIds: [] as string[], allowCashierLogin: true, pin: "", password: "" };

/** Редактирование / создание пользователя — one page, no popups. */
export function EmployeeForm({ id }: { id?: string }) {
  const router = useRouter();
  const storePath = useStorePath();
  const [form, setForm] = useState(EMPTY);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(Boolean(id));
  const [saving, setSaving] = useState(false);
  const [storesOpen, setStoresOpen] = useState(false);
  const [removePin, setRemovePin] = useState(false);
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/stores").then((r) => (r.ok ? r.json() : { stores: [] })).then((d) => setStores(d.stores ?? [])).catch(() => {});
  }, []);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/management/employees/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.employee) { toast.error("Пользователь не найден"); return; }
        const e: Detail = d.employee;
        setDetail(e);
        setForm({ name: e.name, lastName: e.lastName ?? "", phone: formatPhone(e.phone), email: e.email.endsWith("@phone.korgen") ? "" : e.email, role: e.role, storeIds: e.storeIds, allowCashierLogin: e.allowCashierLogin, pin: "", password: "" });
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (detail?.cashierCode && barcodeRef.current) {
      JsBarcode(barcodeRef.current, detail.cashierCode, { format: "CODE128", displayValue: false, margin: 0, height: 40, width: 1.6 });
    }
  }, [detail?.cashierCode, loading]);

  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setForm((f) => ({ ...f, [k]: v }));
  const back = () => router.push(storePath(detail?.firedAt ? "/management/employees/dismissed" : "/management/employees/working"));

  async function save() {
    if (!form.name.trim() || form.phone.replace(/\D/g, "").length < 10 || form.storeIds.length === 0) {
      toast.error("Заполните обязательные поля: имя, номер телефона (он же логин), торговые точки");
      return;
    }
    if (!id && form.password.length < 6) { toast.error("Пароль должен быть не короче 6 символов"); return; }
    if (form.pin && !/^\d{4}$/.test(form.pin)) { toast.error("Пароль от кассы — 4 цифры"); return; }
    setSaving(true);
    try {
      const body = id
        ? { ...form, pin: removePin ? null : form.pin, password: form.password }
        : { ...form };
      const r = await fetch(id ? `/api/management/employees/${id}` : "/api/management/employees", {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
      back();
    } finally { setSaving(false); }
  }

  async function setFired(fired: boolean) {
    if (!id) return;
    if (fired && !confirm(`Уволить пользователя «${form.name}»? Он потеряет доступ.`)) return;
    const r = await fetch(`/api/management/employees/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fired }) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) { toast.error(d.error ?? "Не удалось изменить статус"); return; }
    toast.success(fired ? "Пользователь уволен" : "Пользователь восстановлен");
    router.push(storePath(fired ? "/management/employees/dismissed" : "/management/employees/working"));
  }

  function printBarcode() {
    if (!detail?.cashierCode) return;
    const svg = barcodeRef.current?.outerHTML ?? "";
    const w = window.open("", "_blank", "width=420,height=320");
    if (!w) return;
    w.document.write(`<html><body style="font-family:sans-serif;text-align:center;padding:16px"><p style="margin:0 0 8px">Идентификационный признак кассира:<br><b>${form.name.replace(/</g, "&lt;")}</b></p>${svg}<p style="font-size:12px;margin-top:4px">${detail.cashierCode}</p><script>window.onload=()=>{window.print();}<\/script></body></html>`);
    w.document.close();
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const input = "bg-background h-9 w-full rounded-md border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  const dismissed = Boolean(detail?.firedAt);

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <h1 className="text-muted-foreground text-base">{id ? "Редактирование пользователя" : "Создание пользователя"}</h1>
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-5 text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
        </button>
        <button onClick={back} className="hover:bg-accent h-9 rounded-md border px-5 text-sm font-medium">Отменить</button>
        {id && !dismissed && (
          <button onClick={() => setFired(true)} className="border-destructive text-destructive hover:bg-destructive/10 h-9 rounded-md border px-5 text-sm font-medium">Уволить</button>
        )}
        {id && dismissed && (
          <button onClick={() => setFired(false)} className="border-primary text-primary hover:bg-primary/10 h-9 rounded-md border px-5 text-sm font-medium">Восстановить</button>
        )}
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div className="bg-card w-full max-w-md space-y-3 rounded-lg border p-5">
          <Field label="Имя" required><input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Введите имя пользователя" className={input} /></Field>
          <Field label="Фамилия"><input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} placeholder="Введите фамилию пользователя" className={input} /></Field>
          <Field label="Телефон" required><PhoneInput value={form.phone} onChange={(v) => set("phone", v)} className={input} /></Field>
          <Field label="Почта (необязательно)"><input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={input} /></Field>
          <Field label={id ? "Новый пароль" : "Пароль"} required={!id}>
            <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} placeholder={id ? "Оставьте пустым, чтобы не менять" : "Не короче 6 символов"} autoComplete="new-password" className={input} />
          </Field>
        </div>

        <div className="bg-card w-full max-w-md space-y-3 rounded-lg border p-5">
          <Field label="Торговые точки" required>
            <div className="relative">
              <button type="button" onClick={() => setStoresOpen((v) => !v)} className={`${input} flex min-h-9 flex-wrap items-center gap-1 text-left`}>
                {form.storeIds.length === 0 && <span className="text-muted-foreground">Выберите торговые точки</span>}
                {form.storeIds.map((sid) => (
                  <span key={sid} className="bg-muted inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs">
                    {stores.find((s) => s.id === sid)?.name ?? sid}
                    <X className="h-3 w-3" onClick={(e) => { e.stopPropagation(); set("storeIds", form.storeIds.filter((x) => x !== sid)); }} />
                  </span>
                ))}
              </button>
              {storesOpen && (
                <div className="bg-card absolute z-10 mt-1 w-full rounded-md border p-1 shadow-lg">
                  {stores.map((s) => (
                    <label key={s.id} className="hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm">
                      <input type="checkbox" className="accent-primary h-4 w-4" checked={form.storeIds.includes(s.id)} onChange={() => set("storeIds", form.storeIds.includes(s.id) ? form.storeIds.filter((x) => x !== s.id) : [...form.storeIds, s.id])} />
                      {s.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </Field>
          <Field label="Роль пользователя">
            <select value={form.role} onChange={(e) => set("role", e.target.value)} className={input}>
              {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="accent-primary h-4 w-4" checked={form.allowCashierLogin} onChange={(e) => set("allowCashierLogin", e.target.checked)} />
            Разрешить вход на кассу
          </label>
          <Field label="Пароль от кассы">
            <input
              inputMode="numeric"
              maxLength={4}
              value={form.pin}
              onChange={(e) => { set("pin", e.target.value.replace(/\D/g, "")); setRemovePin(false); }}
              placeholder={detail?.hasPin && !removePin ? "•••• (задан) — введите новый, чтобы заменить" : "4 цифры"}
              className={input}
            />
            {detail?.hasPin && (
              <label className="text-muted-foreground mt-1 flex cursor-pointer items-center gap-2 text-xs">
                <input type="checkbox" className="accent-primary h-3.5 w-3.5" checked={removePin} onChange={(e) => { setRemovePin(e.target.checked); if (e.target.checked) set("pin", ""); }} />
                Удалить пароль от кассы
              </label>
            )}
          </Field>
          {detail?.cashierCode && (
            <div className="pt-2 text-center">
              <p className="mb-1 text-xs">Идентификационный признак кассира:<br /><b>{form.name}</b></p>
              <svg ref={barcodeRef} className="mx-auto bg-white p-1" />
              <button onClick={printBarcode} className="hover:bg-accent mt-2 inline-flex h-8 items-center gap-1.5 rounded-md border px-4 text-sm"><Printer className="h-4 w-4" /> Печать</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium">{label}{required && <span className="text-destructive"> *</span>}</label>
      {children}
    </div>
  );
}
