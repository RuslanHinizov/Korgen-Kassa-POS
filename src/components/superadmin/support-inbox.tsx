"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { formatPhone } from "@/lib/phone";

interface ThreadRow {
  id: string; status: "OPEN" | "CLOSED"; lastMessageAt: string; storeId: string; storeName: string;
  userName: string; userPhone: string | null; userRole: string; lastBody: string; lastSender: "USER" | "ADMIN"; unread: number;
}
interface Msg { id: string; sender: "USER" | "ADMIN"; body: string; pageUrl?: string | null; userAgent?: string | null; createdAt: string }
interface Detail { thread: { id: string; status: "OPEN" | "CLOSED"; store: { id: string; name: string }; user: { name: string; phone: string | null; role: string } }; messages: Msg[] }

const ROLE: Record<string, string> = { ADMIN: "Администратор", MANAGER: "Менеджер", CASHIER: "Кассир", WAREHOUSE: "Складской работник" };
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export function SupportInbox() {
  const [threads, setThreads] = useState<ThreadRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "open">("all");
  const listRef = useRef<HTMLDivElement>(null);

  const loadThreads = useCallback(async () => {
    const r = await fetch("/api/superadmin/support", { cache: "no-store" }).catch(() => null);
    if (r?.ok) setThreads((await r.json()).threads);
  }, []);
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/superadmin/support/${id}`, { cache: "no-store" }).catch(() => null);
    if (r?.ok) setDetail(await r.json());
  }, []);

  useEffect(() => { void loadThreads(); const id = setInterval(loadThreads, 10_000); return () => clearInterval(id); }, [loadThreads]);
  useEffect(() => {
    if (!selected) { setDetail(null); return; }
    void loadDetail(selected);
    const id = setInterval(() => loadDetail(selected), 5_000);
    return () => clearInterval(id);
  }, [selected, loadDetail]);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight; }, [detail?.messages.length]);

  async function reply() {
    const body = text.trim();
    if (!body || !selected || busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/superadmin/support/${selected}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      if (!r.ok) { toast.error("Не удалось отправить"); return; }
      setText("");
      await Promise.all([loadDetail(selected), loadThreads()]);
    } finally { setBusy(false); }
  }
  async function setStatus(status: "OPEN" | "CLOSED") {
    if (!selected) return;
    await fetch(`/api/superadmin/support/${selected}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    await Promise.all([loadDetail(selected), loadThreads()]);
  }

  const shown = threads.filter((t) => filter === "all" ? true : filter === "unread" ? t.unread > 0 : t.status === "OPEN");
  const lastUser = detail ? [...detail.messages].reverse().find((m) => m.sender === "USER") : undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="flex items-center gap-3 bg-[#15503A] px-6 py-3 text-white">
        <Link href="/superadmin" className="flex items-center gap-2 text-sm hover:underline"><ArrowLeft className="h-4 w-4" /> Магазины</Link>
        <span className="font-semibold">Поддержка · обращения</span>
      </header>

      <main className="mx-auto grid max-w-7xl gap-4 p-4 md:grid-cols-[340px_1fr]">
        <section className={`rounded-xl border bg-white ${selected ? "hidden md:block" : ""}`}>
          <div className="flex gap-1 border-b p-2 text-xs">
            {([["all", "Все"], ["unread", "Непрочитанные"], ["open", "Открытые"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-md px-3 py-1.5 ${filter === k ? "bg-[#15503A] text-white" : "hover:bg-slate-100"}`}>{label}</button>
            ))}
          </div>
          <div className="max-h-[75vh] divide-y overflow-y-auto">
            {shown.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Обращений нет</p>}
            {shown.map((t) => (
              <button key={t.id} onClick={() => setSelected(t.id)} className={`block w-full px-3 py-3 text-left hover:bg-slate-50 ${selected === t.id ? "bg-slate-100" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{t.storeName}</span>
                  <span className="shrink-0 text-[11px] text-slate-500">{when(t.lastMessageAt)}</span>
                </div>
                <p className="truncate text-xs text-slate-600">{t.userName}{t.userPhone ? ` · ${formatPhone(t.userPhone)}` : ""} · {ROLE[t.userRole] ?? t.userRole}</p>
                <div className="mt-1 flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-xs text-slate-500">{t.lastSender === "ADMIN" ? "Вы: " : ""}{t.lastBody}</p>
                  {t.status === "CLOSED" && <span className="rounded bg-slate-200 px-1.5 text-[10px]">закрыто</span>}
                  {t.unread > 0 && <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{t.unread}</span>}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className={`flex min-h-[60vh] flex-col rounded-xl border bg-white ${selected ? "" : "hidden md:flex"}`}>
          {!detail ? (
            <div className="flex flex-1 items-center justify-center text-sm text-slate-500">{selected ? <Loader2 className="h-5 w-5 animate-spin" /> : "Выберите обращение слева"}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
                <button onClick={() => setSelected(null)} className="md:hidden" aria-label="Назад"><ArrowLeft className="h-5 w-5" /></button>
                <div className="min-w-0">
                  <Link href={`/superadmin/stores/${detail.thread.store.id}`} className="font-semibold text-[#15503A] hover:underline">{detail.thread.store.name}</Link>
                  <p className="text-xs text-slate-600">{detail.thread.user.name.trim()}{detail.thread.user.phone ? ` · ${formatPhone(detail.thread.user.phone)}` : ""} · {ROLE[detail.thread.user.role] ?? detail.thread.user.role}</p>
                </div>
                <button onClick={() => setStatus(detail.thread.status === "OPEN" ? "CLOSED" : "OPEN")} className="ml-auto rounded-md border px-3 py-1 text-xs hover:bg-slate-50">
                  {detail.thread.status === "OPEN" ? "Закрыть обращение" : "Открыть снова"}
                </button>
              </div>

              <div ref={listRef} className="max-h-[55vh] flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.sender === "ADMIN" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.sender === "ADMIN" ? "rounded-br-sm bg-[#15503A] text-white" : "rounded-bl-sm border bg-white"}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body}</p>
                      <p className={`mt-1 text-[10px] ${m.sender === "ADMIN" ? "text-white/70" : "text-slate-500"}`}>{when(m.createdAt)}{m.pageUrl ? ` · ${m.pageUrl}` : ""}</p>
                    </div>
                  </div>
                ))}
              </div>

              {lastUser?.userAgent && <p className="truncate border-t px-4 py-1.5 text-[11px] text-slate-500">Браузер: {lastUser.userAgent}</p>}
              <div className="flex items-end gap-2 border-t p-3">
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Ответ…"
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void reply(); } }}
                  className="min-h-[44px] flex-1 resize-none rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#15503A]/40" />
                <button onClick={() => void reply()} disabled={!text.trim() || busy} className="flex h-11 items-center gap-2 rounded-lg bg-[#15503A] px-4 text-sm font-medium text-white disabled:opacity-40">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Отправить
                </button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
