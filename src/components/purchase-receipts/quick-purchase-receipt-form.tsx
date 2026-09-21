"use client";

import { useRef, useState } from "react";
import { useStoreRouter as useRouter } from "@/components/store/use-store-router";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";

interface Supplier { id: string; name: string }

/** Оформление быстрой приёмки — a lump-sum debt entry to a supplier with no
 * line items (no stock effect), for when itemising isn't worth the time. */
function nowLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function QuickPurchaseReceiptForm() {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [receiptDate, setReceiptDate] = useState(nowLocal);
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [comment, setComment] = useState("");
  const [isConsignment, setIsConsignment] = useState(false);
  const [busy, setBusy] = useState(false);

  async function accept() {
    const value = Number(amount);
    if (!value || value <= 0) { toast.error("Введите сумму"); return; }
    if (!supplier) { toast.error("Выберите поставщика"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/purchase-receipts/quick", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId: supplier.id, amount: value, comment: comment || undefined, isConsignment, createdAt: new Date(receiptDate).toISOString() }),
      });
      if (!r.ok) { toast.error((await r.json()).error ?? "Не удалось принять"); return; }
      const d = await r.json();
      toast.success("Приёмка принята");
      router.push(`/purchases/${d.receipt.id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-lg space-y-4">
      <h1 className="text-xl font-bold">Оформление быстрой приёмки</h1>

      <button onClick={accept} disabled={busy} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Принять
      </button>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={isConsignment} onChange={(e) => setIsConsignment(e.target.checked)} /> Консигнация
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium">Сумма</label>
        <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Дата приемки</label>
        <input type="datetime-local" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Поставщик *</label>
        <SupplierField supplier={supplier} onPick={setSupplier} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Комментарий</label>
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Счет</label>
        <select disabled className="h-10 w-full rounded-md border bg-background px-3 text-sm text-muted-foreground">
          <option>Сейф - 1</option>
        </select>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" disabled className="h-4 w-4" /> Под консигнацию
      </label>
    </div>
  );
}

function SupplierField({ supplier, onPick }: { supplier: Supplier | null; onPick: (s: Supplier | null) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Supplier[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function search(next: string) {
    fetch(`/api/suppliers?q=${encodeURIComponent(next)}`).then((r) => (r.ok ? r.json() : { suppliers: [] })).then((d) => setResults(d.suppliers ?? [])).catch(() => setResults([]));
  }
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setQ(next);
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(next), 250);
  }

  async function createSupplier() {
    if (!newName.trim()) return;
    const r = await fetch("/api/suppliers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
    if (!r.ok) { toast.error("Не удалось создать поставщика"); return; }
    const d = await r.json();
    onPick(d.supplier);
    setCreating(false); setNewName("");
  }

  if (creating) {
    return (
      <div className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Название поставщика" className="h-10 flex-1 rounded-md border bg-background px-3 text-sm" autoFocus />
        <button onClick={createSupplier} className="inline-flex h-10 items-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90">Создать</button>
        <button onClick={() => setCreating(false)} className="text-sm text-muted-foreground hover:underline">Отмена</button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2">
      <input
        value={open ? q : (supplier?.name ?? "")} onChange={handleChange} onFocus={() => { setOpen(true); setQ(""); search(""); }}
        placeholder="Выберите поставщика" className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
      />
      <button onClick={() => setCreating(true)} className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground hover:bg-primary/90" aria-label="Новый поставщик">
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute z-10 top-11 max-h-48 w-[calc(100%-3rem)] overflow-y-auto rounded-md border bg-popover shadow-md">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">Ничего не найдено</p>
          ) : (
            results.map((s) => (
              <button key={s.id} onClick={() => { onPick(s); setOpen(false); setQ(""); }} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted/40">{s.name}</button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
