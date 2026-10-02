"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";

type Cashbox = { id: string; no: number; name: string; active: boolean };

/** "Касса" pairing indicator for the kiosk top bar. Mirrors UMAG's terminal-pairing
 * flow: the terminal redeems a one-time key generated in Управление кассами to bind
 * itself to a specific Cashbox — no admin login is needed on the terminal itself. */
export function CashboxStatus() {
  const [cashbox, setCashbox] = useState<Cashbox | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"pair" | "unpair">("pair");

  function load() {
    fetch("/api/pos/cashbox")
      .then((r) => (r.ok ? r.json() : { cashbox: null }))
      .then((d) => setCashbox(d.cashbox ?? null))
      .catch(() => setCashbox(null));
  }

  useEffect(load, []);

  function openDialog() {
    setMode(cashbox ? "unpair" : "pair");
    setKey("");
    setPin("");
    setOpen(true);
  }

  async function pair() {
    if (!key.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/pos/cashbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: key.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "Не удалось привязать кассу"); return; }
      setCashbox(data.cashbox);
      setOpen(false);
      toast.success(`Касса привязана: ${data.cashbox.name}`);
    } finally { setBusy(false); }
  }

  async function unpair() {
    setBusy(true);
    try {
      const res = await fetch("/api/pos/cashbox", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: pin.trim() }) });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error === "no_pin_configured" ? "PIN менеджера не настроен" : data.error === "Неверный PIN" ? data.error : "Не удалось отвязать кассу"); return; }
      setCashbox(null);
      setOpen(false);
      toast.success("Касса отвязана от этого устройства");
    } finally { setBusy(false); }
  }

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        title={cashbox ? `Касса: ${cashbox.name}` : "Касса не привязана к этому устройству"}
        className="hidden items-center gap-1 rounded bg-white/15 px-1.5 py-1 text-[10px] font-bold xl:flex"
      >
        <i className={`h-2.5 w-2.5 rounded-full ${cashbox ? "bg-[#82ec6f]" : "bg-red-400"}`} />
        {cashbox ? cashbox.name : "Касса"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-background p-5 text-foreground shadow-2xl normal-case" onClick={(e) => e.stopPropagation()}>
            {mode === "pair" ? (
              <>
                <h2 className="mb-1 font-semibold">Привязать кассу</h2>
                <p className="mb-3 text-xs text-muted-foreground">Введите ключ кассы из Управление → Управление кассами.</p>
                <input
                  autoFocus
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && pair()}
                  placeholder="Ключ"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Отмена</button>
                  <button disabled={busy || !key.trim()} onClick={pair} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Привязать</button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-1 font-semibold">Отвязать кассу «{cashbox?.name}»</h2>
                <p className="mb-3 text-xs text-muted-foreground">Введите PIN менеджера для подтверждения.</p>
                <input
                  autoFocus
                  type="password"
                  inputMode="numeric"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && unpair()}
                  placeholder="PIN менеджера"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                />
                <div className="mt-4 flex justify-end gap-2">
                  <button onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Отмена</button>
                  <button disabled={busy || !pin.trim()} onClick={unpair} className="rounded-lg bg-destructive px-3 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">Отвязать</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
