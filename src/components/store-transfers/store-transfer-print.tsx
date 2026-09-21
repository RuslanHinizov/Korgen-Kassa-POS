"use client";

import { useEffect, useState } from "react";
import { unitLabel } from "@/lib/units";
import { Loader2, Printer } from "lucide-react";

interface Item { id: string; productName: string; barcode: string | null; unit: string; quantity: number }
interface Doc {
  documentNo: number; createdAt: string; comment: string | null;
  fromStoreName: string; toStoreName: string; items: Item[];
}

export function StoreTransferPrint({ id }: { id: string }) {
  const [doc, setDoc] = useState<Doc | null>(null);

  useEffect(() => {
    fetch(`/api/store-transfers/${id}`).then((r) => r.json()).then((d) => setDoc(d.transfer));
  }, [id]);

  if (!doc) return <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>;

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <button onClick={() => window.print()} className="mb-6 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 print:hidden">
        <Printer className="h-4 w-4" /> Печать
      </button>

      <h1 className="text-xl font-bold">Накладная на перемещение № {doc.documentNo}</h1>
      <p className="mt-1 text-sm text-muted-foreground">от {new Date(doc.createdAt).toLocaleString("ru-RU")}</p>
      <p className="mt-1 text-sm">Откуда: <span className="font-medium">{doc.fromStoreName}</span></p>
      <p className="text-sm">Куда: <span className="font-medium">{doc.toStoreName}</span></p>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
            <th className="py-2">№</th>
            <th className="py-2">Название</th>
            <th className="py-2">Штрихкод</th>
            <th className="py-2 text-right">Кол-во</th>
            <th className="py-2">Ед.</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {doc.items.map((item, i) => (
            <tr key={item.id}>
              <td className="py-1.5">{i + 1}</td>
              <td className="py-1.5">{item.productName}</td>
              <td className="py-1.5 text-muted-foreground">{item.barcode ?? "—"}</td>
              <td className="py-1.5 text-right tabular-nums">{item.quantity}</td>
              <td className="py-1.5">{unitLabel(item.unit)}</td>
            </tr>
          ))}
          {doc.items.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Товаров нет</td></tr>
          )}
        </tbody>
      </table>

      {doc.comment && <p className="mt-6 text-sm text-muted-foreground">Комментарий: {doc.comment}</p>}

      <div className="mt-10 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p>Отпустил: _____________________</p>
          <p className="mt-1 text-xs text-muted-foreground">(подпись)</p>
        </div>
        <div>
          <p>Принял: _____________________</p>
          <p className="mt-1 text-xs text-muted-foreground">(подпись)</p>
        </div>
      </div>
    </div>
  );
}
