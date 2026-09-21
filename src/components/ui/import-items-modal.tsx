"use client";

import { useMemo, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";

/** «Новый импорт товаров»: a file (.xlsx/.csv) or pasted text with Штрихкод + Количество columns. */
type Delimiter = "\t" | " " | ";";

export function ImportItemsModal({ onClose, onImport, busy }: { onClose: () => void; onImport: (rows: { barcode: string; quantity: number }[]) => void; busy: boolean }) {
  const [pastedText, setPastedText] = useState("");
  const [delimiterStep, setDelimiterStep] = useState(false);
  const [delimiter, setDelimiter] = useState<Delimiter>(";");
  const [cols, setCols] = useState<["barcode", "quantity"] | ["quantity", "barcode"]>(["barcode", "quantity"]);
  const [rows, setRows] = useState<string[][]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  function parseWithDelimiter() {
    const parsed = pastedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.split(delimiter).map((c) => c.trim()));
    setRows(parsed);
    setDelimiterStep(false);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 });
    setRows(data.map((r) => r.map((c) => String(c ?? "").trim())).filter((r) => r.some((c) => c)));
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const text = e.clipboardData.getData("text");
    if (text) { setPastedText(text); setDelimiterStep(true); }
  }

  const preview = useMemo(() => {
    const barcodeIdx = cols[0] === "barcode" ? 0 : 1;
    const qtyIdx = cols[0] === "quantity" ? 0 : 1;
    return rows
      .map((r) => ({ barcode: r[barcodeIdx] ?? "", quantity: Number(r[qtyIdx]) || 0 }))
      .filter((r) => r.barcode && r.quantity > 0);
  }, [rows, cols]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl rounded-xl border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b px-5 py-3">
          <h2 className="font-semibold">Новый импорт товаров</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>

        {delimiterStep ? (
          <div className="space-y-3 p-5">
            <p className="text-sm font-medium">Выберите как хотите разделять</p>
            <div className="space-y-2">
              {([["\t", "Табуляция"], [" ", "Пробел"], [";", "Точка с запятой (;)"]] as const).map(([val, label]) => (
                <label key={label} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={delimiter === val} onChange={() => setDelimiter(val)} /> {label}
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={parseWithDelimiter} className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">Продолжить</button>
              <button onClick={() => setDelimiterStep(false)} className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3 p-5">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Столбец 1</label>
                <select value={cols[0]} onChange={(e) => setCols(e.target.value === "barcode" ? ["barcode", "quantity"] : ["quantity", "barcode"])} className="h-9 w-full rounded-md border bg-background px-2 text-sm">
                  <option value="barcode">Штрихкод</option>
                  <option value="quantity">Количество</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Столбец 2</label>
                <select value={cols[1]} disabled className="h-9 w-full rounded-md border bg-muted/30 px-2 text-sm text-muted-foreground">
                  <option>{cols[1] === "barcode" ? "Штрихкод" : "Количество"}</option>
                </select>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                <p>Из Вашей накладной скопируйте нужные столбцы и вставьте комбинацией CTRL+V</p>
                <textarea onPaste={handlePaste} placeholder="Вставьте здесь (Ctrl+V)…" className="mt-3 h-16 w-full resize-none rounded-md border bg-background px-2 py-1.5 text-sm" />
                <p className="mt-2">или перетащите сюда файл для загрузки</p>
                <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFile} />
                <button onClick={() => fileRef.current?.click()} className="mt-2 inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium hover:bg-accent">Загрузить файл</button>
              </div>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/50 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <tr><th className="px-3 py-1.5 text-left">Штрихкод</th><th className="px-3 py-1.5 text-right">Количество</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.map((r, i) => (
                      <tr key={i}><td className="px-3 py-1 tabular-nums">{r.barcode}</td><td className="px-3 py-1 text-right tabular-nums">{r.quantity}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => onImport(preview)} disabled={busy || preview.length === 0} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Импортировать{preview.length > 0 ? ` (${preview.length})` : ""}
              </button>
              {rows.length > 0 && (
                <button onClick={() => { setRows([]); setPastedText(""); }} className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent">Начать заново</button>
              )}
              <button onClick={onClose} className="inline-flex h-9 items-center rounded-md border px-4 text-sm hover:bg-accent">Отмена</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
