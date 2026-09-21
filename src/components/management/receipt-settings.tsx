"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CircleHelp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useStorePath } from "@/components/store/store-provider";

/** Управление → Управление чеком: text printed above and below every receipt. */
export function ReceiptSettings() {
  const router = useRouter();
  const storePath = useStorePath();
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [printVat, setPrintVat] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/management/receipt")
      .then((r) => r.json())
      .then((d) => { setHeader(d.receiptHeader ?? ""); setFooter(d.receiptFooter ?? ""); setPrintVat(d.receiptPrintVat !== false); })
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/management/receipt", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiptHeader: header, receiptFooter: footer, receiptPrintVat: printVat }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d.error ?? "Не удалось сохранить"); return; }
      toast.success("Сохранено");
    } finally { setSaving(false); }
  }

  if (loading) return <div className="p-6"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  const box = "bg-background w-full resize-y rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex gap-2">
        <button onClick={save} disabled={saving} className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-5 text-sm font-medium disabled:opacity-50">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} Сохранить
        </button>
        <button onClick={() => router.push(storePath("/"))} className="hover:bg-accent h-9 rounded-md border px-5 text-sm font-medium">Закрыть</button>
      </div>

      <h1 className="text-lg font-semibold">Управление чеком</h1>

      <div className="w-full max-w-xs space-y-3">
        <div>
          <label className="mb-1 flex items-center gap-1 text-sm">
            Верхняя часть чека <span title="Текст печатается в самом верху каждого чека — например, название магазина и адрес." className="text-primary"><CircleHelp className="h-3.5 w-3.5" /></span>
            <span className="text-muted-foreground">( длина: {header.length}/240 )</span>
          </label>
          <textarea value={header} maxLength={240} rows={3} onChange={(e) => setHeader(e.target.value)} className={box} />
        </div>

        <div className="bg-muted/40 text-muted-foreground rounded-md border p-3 font-mono text-xs leading-relaxed" aria-label="Пример чека">
          <p className="border-b border-dashed pb-1">{header || "—"}</p>
          <p className="pt-1">Рис 1кг.<br />1,000 кг × 240 = <span className="float-right">240 тг</span></p>
          <p className="clear-both">Помидоры 1кг.<br />1,000 кг × 350 = <span className="float-right">350 тг</span></p>
          <p className="clear-both">Хлеб<br />1 шт × 70 = <span className="float-right">70 тг</span></p>
          <p className="clear-both mt-1 border-t border-dashed pt-1">ИТОГО: <span className="float-right">660 тг</span></p>
          <p className="clear-both">НАЛИЧНЫМИ: <span className="float-right">700 тг</span></p>
          <p className="clear-both">СДАЧА: <span className="float-right">40 тг</span></p>
          {printVat && <p className="clear-both">в т.ч. НДС: <span className="float-right">—</span></p>}
          <p className="clear-both mt-1 border-t border-dashed pt-1 text-center">{footer || "—"}</p>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input type="checkbox" checked={printVat} onChange={(e) => setPrintVat(e.target.checked)} className="accent-primary h-4 w-4" />
          Печатать НДС в чеке
        </label>

        <div>
          <label className="mb-1 block text-sm">Нижняя часть чека <span className="text-muted-foreground">( длина: {footer.length}/2000 )</span></label>
          <textarea value={footer} maxLength={2000} rows={3} onChange={(e) => setFooter(e.target.value)} className={box} />
        </div>
      </div>
    </div>
  );
}
