"use client";

import { useEffect, useState } from "react";
import { Delete, User } from "lucide-react";

interface Cashier { id: string; name: string; role: string }

/** Blocking "who's working" overlay — tap your name, enter your PIN, land on
 * the register. This is a display/attribution tag only (see src/lib/acting-cashier.ts);
 * it never changes the terminal's real signed-in session. */
export function ActingCashierPicker({ onDone }: { onDone: (cashier: Cashier) => void }) {
  const [cashiers, setCashiers] = useState<Cashier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Cashier | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/pos/cashiers")
      .then((r) => (r.ok ? r.json() : { cashiers: [] }))
      .then((d) => setCashiers(d.cashiers ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function submitPin(value: string) {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pos/acting-cashier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selected.id, pin: value }),
      });
      if (!r.ok) { setError("Неверный PIN"); setPin(""); return; }
      const d = await r.json();
      onDone(d.cashier);
    } finally {
      setBusy(false);
    }
  }

  // A barcode scanner types the digits and presses Enter — the cashier is identified by that code.
  async function submitCode(raw: string) {
    const code = raw.trim();
    if (!code || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/pos/acting-cashier", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) { setError("Кассир с таким кодом не найден"); return; }
      const d = await r.json();
      onDone(d.cashier);
    } finally {
      setBusy(false);
    }
  }

  function press(digit: string) {
    if (busy || pin.length >= 4) return;
    const next = pin + digit;
    setPin(next);
    setError("");
    if (next.length === 4) submitPin(next);
  }
  function backspace() {
    setPin((p) => p.slice(0, -1));
  }

  if (loading || cashiers.length === 0) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background">
      <div className="w-full max-w-sm p-6">
        {!selected ? (
          <>
            <h1 className="mb-4 text-center text-lg font-semibold">Кто работает?</h1>
            <input
              autoFocus
              inputMode="numeric"
              placeholder="Отсканируйте штрихкод кассира"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void submitCode(e.currentTarget.value);
                e.currentTarget.value = "";
              }}
              className="mb-3 h-10 w-full rounded-lg border bg-background px-3 text-center text-sm"
            />
            {error && <p className="mb-3 text-center text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-2 gap-2">
              {cashiers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c)}
                  className="flex flex-col items-center gap-2 rounded-xl border bg-card p-4 hover:border-primary hover:bg-accent"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary"><User className="h-5 w-5" /></span>
                  <span className="text-sm font-medium">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <>
            <button onClick={() => { setSelected(null); setPin(""); setError(""); }} className="mb-3 text-sm text-muted-foreground hover:text-foreground">← Назад</button>
            <h1 className="mb-1 text-center text-lg font-semibold">{selected.name}</h1>
            <p className="mb-4 text-center text-sm text-muted-foreground">Введите PIN</p>
            <div className="mb-4 flex justify-center gap-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={i} className={`h-3 w-3 rounded-full border ${i < pin.length ? "bg-primary border-primary" : "border-muted-foreground/40"}`} />
              ))}
            </div>
            {error && <p className="mb-3 text-center text-sm text-destructive">{error}</p>}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} onClick={() => press(d)} className="h-14 rounded-xl border bg-card text-lg font-medium hover:bg-accent active:scale-95">{d}</button>
              ))}
              <div />
              <button onClick={() => press("0")} className="h-14 rounded-xl border bg-card text-lg font-medium hover:bg-accent active:scale-95">0</button>
              <button onClick={backspace} className="flex h-14 items-center justify-center rounded-xl border bg-card hover:bg-accent active:scale-95"><Delete className="h-5 w-5" /></button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
