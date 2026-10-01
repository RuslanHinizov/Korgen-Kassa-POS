"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

type Cashbox = { id: string; no: number; name: string; active: boolean };

/** "Касса" pairing indicator for the kiosk top bar. Mirrors UMAG's terminal-pairing
 * flow: the terminal redeems a one-time key generated in Управление кассами to bind
 * itself to a specific Cashbox — no admin login is needed on the terminal itself. */
export function CashboxStatus() {
  const pathname = usePathname();
  const [cashbox, setCashbox] = useState<Cashbox | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const fixedTill = pathname.startsWith("/till");

  function load() {
    fetch("/api/pos/cashbox")
      .then((r) => (r.ok ? r.json() : { cashbox: null }))
      .then((d) => setCashbox(d.cashbox ?? null))
      .catch(() => setCashbox(null));
  }

  useEffect(load, []);

  function openDialog() {
    if (fixedTill || cashbox) return;
    setKey("");
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

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={fixedTill || !!cashbox}
        title={fixedTill ? `Касса закреплена: ${cashbox?.name ?? "не привязана"}` : cashbox ? `Касса: ${cashbox.name}` : "Касса не привязана к этому устройству"}
        className={`hidden items-center gap-1 rounded bg-white/15 px-1.5 py-1 text-[10px] font-bold xl:flex ${fixedTill ? "cursor-default" : ""}`}
      >
        <i className={`h-2.5 w-2.5 rounded-full ${cashbox ? "bg-[#82ec6f]" : "bg-red-400"}`} />
        {cashbox ? cashbox.name : "Касса"}
      </button>

      {open && !fixedTill && !cashbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => !busy && setOpen(false)}>
          <div className="w-full max-w-sm rounded-xl border bg-background p-5 text-foreground shadow-2xl normal-case" onClick={(e) => e.stopPropagation()}>
            <>
              <h2 className="mb-1 font-semibold">Привязать кассу</h2>
              <p className="mb-3 text-xs text-muted-foreground">Введите одноразовый код из Управление → Управление кассами.</p>
              <input
                autoFocus
                inputMode="numeric"
                value={key}
                onChange={(e) => setKey(e.target.value.replace(/\D/g, "").slice(0, 8))}
                onKeyDown={(e) => e.key === "Enter" && pair()}
                placeholder="00000000"
                className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-medium hover:bg-muted">Отмена</button>
                <button disabled={busy || key.length !== 8} onClick={pair} className="rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">Привязать</button>
              </div>
            </>
          </div>
        </div>
      )}
    </>
  );
}
