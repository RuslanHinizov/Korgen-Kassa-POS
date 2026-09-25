"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, MessageCircle, Send, X } from "lucide-react";

interface Msg { id: string; sender: "USER" | "ADMIN"; body: string; createdAt: string }

const time = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * «Поддержка» — chat with the platform owner, bottom-left on every page of the app.
 * `compact` (cash register): a small round button so it never covers the till.
 */
export function SupportChat({ compact = false }: { compact?: boolean }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [unread, setUnread] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const loadMessages = useCallback(async () => {
    const r = await fetch("/api/support?markRead=1", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = await r.json();
    setMessages(d.messages);
    setUnread(0);
  }, []);

  // badge: cheap poll while closed
  useEffect(() => {
    if (open) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch("/api/support?summary=1", { cache: "no-store" }).catch(() => null);
      if (!stop && r?.ok) setUnread((await r.json()).unread ?? 0);
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => { stop = true; clearInterval(id); };
  }, [open]);

  // open conversation: refresh every 5 s
  useEffect(() => {
    if (!open) return;
    void loadMessages();
    const id = setInterval(loadMessages, 5_000);
    return () => clearInterval(id);
  }, [open, loadMessages]);

  useEffect(() => {
    if (open && listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  async function send() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/support", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body, pageUrl: pathname }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error ?? "Не удалось отправить"); return; }
      setText("");
      setMessages((m) => [...m, d.message]);
    } finally { setBusy(false); }
  }

  return (
    <div className="print:hidden">
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Поддержка"
          className={`fixed left-3 z-[55] flex items-center gap-2 rounded-full bg-[#15503A] text-white shadow-lg hover:bg-[#1b6248] ${compact ? "bottom-3 h-9 w-9 justify-center opacity-70 hover:opacity-100" : "bottom-4 px-4 py-2.5 sm:left-4"}`}
        >
          <MessageCircle className="h-5 w-5" />
          {!compact && <span className="hidden text-sm font-medium sm:inline">Поддержка</span>}
          {unread > 0 && <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold">{unread}</span>}
        </button>
      )}

      {open && (
        <div className="fixed inset-x-2 bottom-2 z-[60] flex max-h-[80vh] flex-col overflow-hidden rounded-2xl border bg-background shadow-2xl sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-[360px]" role="dialog" aria-label="Поддержка">
          <div className="flex items-center justify-between bg-[#15503A] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Поддержка Korgen Kassa</p>
              <p className="text-xs text-white/75">Опишите проблему — мы ответим здесь</p>
            </div>
            <button onClick={() => setOpen(false)} className="rounded p-1 hover:bg-white/15" aria-label="Закрыть"><X className="h-5 w-5" /></button>
          </div>

          <div ref={listRef} className="min-h-[220px] flex-1 space-y-2 overflow-y-auto bg-muted/30 p-3">
            {messages.length === 0 && (
              <p className="pt-8 text-center text-sm text-muted-foreground">Здравствуйте! Что-то не работает или нужна помощь? Напишите сюда — укажите, что вы делали и что увидели.</p>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.sender === "USER" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${m.sender === "USER" ? "rounded-br-sm bg-[#15503A] text-white" : "rounded-bl-sm border bg-background"}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${m.sender === "USER" ? "text-white/70" : "text-muted-foreground"}`}>{m.sender === "ADMIN" ? "Поддержка · " : ""}{time(m.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t bg-background p-2">
            {error && <p className="px-1 pb-1 text-xs text-red-600">{error}</p>}
            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                rows={2}
                maxLength={2000}
                placeholder="Сообщение…"
                className="min-h-[44px] flex-1 resize-none rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[#15503A]/40"
              />
              <button onClick={() => void send()} disabled={!text.trim() || busy} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#15503A] text-white disabled:opacity-40" aria-label="Отправить">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
