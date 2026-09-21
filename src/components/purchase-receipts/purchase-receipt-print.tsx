"use client";

import { useEffect, useState } from "react";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";
import { Loader2, Printer } from "lucide-react";

interface Item { id: string; name: string; barcode: string | null; unit: string; quantity: number; costPrice: number; discountPct: number; salePrice: number; total: number }
interface Doc {
  documentNo: number; status: "DRAFT" | "POSTED"; createdAt: string; comment: string | null;
  supplier: { name: string } | null; totalAmount: number; items: Item[];
}

/** Печать → Накладная / с ценами закупки / с продажными ценами. */
export function PurchaseReceiptPrint({ id, variant }: { id: string; variant: "plain" | "cost" | "sale" }) {
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    fetch(`/api/purchase-receipts/${id}`).then((r) => r.json()).then((d) => setDoc(d.receipt));
  }, [id]);

  if (!doc) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  const showCost = variant === "cost";
  const showSale = variant === "sale";
  const saleTotal = doc.items.reduce((s, i) => s + i.quantity * i.salePrice, 0);

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <button onClick={() => window.print()} className="mb-6 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 print:hidden">
        <Printer className="h-4 w-4" /> Печать
      </button>

      <h1 className="text-xl font-bold">Накладная № {doc.documentNo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">от {new Date(doc.createdAt).toLocaleString("ru-RU")}</p>
      <p className="mt-1 text-sm">Поставщик: <span className="font-medium">{doc.supplier?.name ?? "—"}</span></p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="py-2">№</th>
            <th className="py-2">Название</th>
            <th className="py-2">Штрихкод</th>
            <th className="py-2 text-right">Кол-во</th>
            <th className="py-2">Ед.</th>
            {showCost && <th className="py-2 text-right">Цена закупки</th>}
            {showSale && <th className="py-2 text-right">Цена продажи</th>}
            {(showCost || showSale) && <th className="py-2 text-right">Сумма</th>}
          </tr>
        </thead>
        <tbody className="divide-y">
          {doc.items.map((item, i) => (
            <tr key={item.id}>
              <td className="py-1.5">{i + 1}</td>
              <td className="py-1.5">{item.name}</td>
              <td className="py-1.5 text-muted-foreground">{item.barcode ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
              <td className="py-1.5">{unitLabel(item.unit)}</td>
              {showCost && <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.costPrice)}</td>}
              {showSale && <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.salePrice)}</td>}
              {showCost && <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.total)}</td>}
              {showSale && <td className="py-1.5 text-right tabular-nums">{formatCurrency(item.quantity * item.salePrice)}</td>}
            </tr>
          ))}
          {doc.items.length === 0 && (
            <tr><td colSpan={8} className="py-6 text-center text-muted-foreground">Товаров нет</td></tr>
          )}
        </tbody>
      </table>

      {(showCost || showSale) && (
        <div className="mt-4 flex justify-end border-t pt-3 text-sm font-semibold">
          Итого: {formatCurrency(showSale ? saleTotal : doc.totalAmount)}
        </div>
      )}

      {doc.comment && <p className="mt-6 text-sm text-muted-foreground">Комментарий: {doc.comment}</p>}
    </div>
  );
}
