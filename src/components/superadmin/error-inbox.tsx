"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, ChevronDown, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { reportClientError } from "@/components/support/error-reporter";
import { formatPhone } from "@/lib/phone";

interface Row {
  id: string; source: "CLIENT" | "SERVER" | "API"; message: string; stack: string | null; path: string | null; method: string | null;
  count: number; status: "OPEN" | "RESOLVED"; firstSeenAt: string; lastSeenAt: string;
  lastStoreName: string | null; lastUserName: string | null; lastUserRole: string | null; lastUserPhone: string | null; lastUserAgent: string | null;
  storeIds: string[];
}

const SOURCE: Record<Row["source"], { label: string; cls: string }> = {
  CLIENT: { label: "Браузер", cls: "bg-amber-100 text-amber-800" },
  SERVER: { label: "Сервер (страница)", cls: "bg-red-100 text-red-800" },
  API: { label: "Сервер (API)", cls: "bg-rose-100 text-rose-800" },
};
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function ErrorInbox() {
  const [rows, setRows] = useState<Row[]>([]);
  const [status, setStatus] = useState<"OPEN" | "RESOLVED">("OPEN");
  const [open, setOpen] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await fetch(`/api/superadmin/errors?status=${status}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setRows((await r.json()).errors);
    setLoading(false);
  }, [status]);
  // initial + periodic fetch: state is set after the awaited request, not synchronously (lint rule cannot see that)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); const id = setInterval(load, 15_000); return () => clearInterval(id); }, [load]);

  async function mark(id: string, to: "OPEN" | "RESOLVED") {
    await fetch("/api/superadmin/errors", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status: to }) });
    await load();
  }
  async function testServer() {
    const r = await fetch("/api/superadmin/errors/test", { method: "POST" });
    toast[r.status === 500 ? "success" : "error"](r.status === 500 ? "Тестовая ошибка сервера отправлена — она появится в списке" : `Неожиданный ответ ${r.status}`);
    setTimeout(load, 1500);
  }
  function testClient() {
    reportClientError(new Error("Тестовая ошибка браузера (проверка системы уведомлений)"), { kind: "window" });
    toast.success("Тестовая ошибка браузера отправлена — она появится в списке");
    setTimeout(load, 1500);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-3 bg-[#15503A] px-6 py-3 text-white">
        <Link href="/superadmin" className="flex items-center gap-2 text-sm hover:underline"><ArrowLeft className="h-4 w-4" /> Магазины</Link>
        <span className="font-semibold">Ошибки системы</span>
      </header>

      <main className="mx-auto max-w-6xl space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["OPEN", "RESOLVED"] as const).map((s) => (
            <button key={s} onClick={() => { setLoading(true); setStatus(s); }} className={`rounded-md px-4 py-1.5 text-sm ${status === s ? "bg-[#15503A] text-white" : "border bg-white hover:bg-slate-50"}`}>{s === "OPEN" ? "Открытые" : "Исправленные"}</button>
          ))}
          <span className="ml-auto text-xs text-slate-500">Проверка системы:</span>
          <button onClick={testClient} className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-slate-50">Ошибка браузера</button>
          <button onClick={testServer} className="rounded-md border bg-white px-3 py-1.5 text-xs hover:bg-slate-50">Ошибка сервера</button>
        </div>

        <p className="text-xs text-slate-500">Одинаковые ошибки складываются в одну строку со счётчиком. Ошибка, отмеченная исправленной, вернётся в «Открытые», если повторится.</p>

        <div className="overflow-hidden rounded-xl border bg-white">
          {loading ? <p className="p-8 text-center text-sm text-slate-500">Загрузка…</p>
            : rows.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">{status === "OPEN" ? "Открытых ошибок нет 🎉" : "Пока пусто"}</p>
            : rows.map((e) => (
              <div key={e.id} className="border-b last:border-b-0">
                <button onClick={() => setOpen(open === e.id ? null : e.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-slate-50">
                  {open === e.id ? <ChevronDown className="mt-1 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-1 h-4 w-4 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${SOURCE[e.source].cls}`}>{SOURCE[e.source].label}</span>
                      {e.path && <span className="truncate font-mono text-xs text-slate-600">{e.method ? `${e.method} ` : ""}{e.path}</span>}
                    </div>
                    <p className="mt-1 break-words text-sm font-medium">{e.message}</p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {e.lastStoreName ? `${e.lastStoreName} · ` : ""}{e.lastUserName ?? "не вошёл"}{e.lastUserRole ? ` (${e.lastUserRole})` : ""} · последний раз {when(e.lastSeenAt)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-bold text-white">×{e.count}</span>
                    {e.storeIds.length > 1 && <p className="mt-1 text-[11px] text-slate-500">{e.storeIds.length} магазинов</p>}
                  </div>
                </button>

                {open === e.id && (
                  <div className="space-y-2 border-t bg-slate-50 px-4 py-3 text-xs">
                    <p><b>Первый раз:</b> {when(e.firstSeenAt)} · <b>Последний:</b> {when(e.lastSeenAt)}</p>
                    {e.lastUserPhone && <p><b>Пользователь:</b> {e.lastUserName} · {formatPhone(e.lastUserPhone)}</p>}
                    {e.lastUserAgent && <p className="break-all"><b>Браузер:</b> {e.lastUserAgent}</p>}
                    {e.stack && <pre className="max-h-64 overflow-auto rounded-md border bg-white p-2 font-mono text-[11px] leading-snug">{e.stack}</pre>}
                    <div className="flex gap-2 pt-1">
                      {e.status === "OPEN"
                        ? <button onClick={() => mark(e.id, "RESOLVED")} className="inline-flex items-center gap-1.5 rounded-md bg-[#15503A] px-3 py-1.5 text-white"><CheckCircle2 className="h-4 w-4" /> Отметить исправленной</button>
                        : <button onClick={() => mark(e.id, "OPEN")} className="inline-flex items-center gap-1.5 rounded-md border bg-white px-3 py-1.5"><RotateCcw className="h-4 w-4" /> Открыть снова</button>}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </main>
    </div>
  );
}
