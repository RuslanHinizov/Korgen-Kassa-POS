"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  Download,
  FileSpreadsheet,
  History,
  PackageCheck,
  Plus,
  RefreshCw,
  Upload,
  Warehouse,
  Check,
  ChevronDown,
} from "lucide-react";
import * as XLSX from "xlsx";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  OPENING_BALANCE: "Начальный остаток",
  RECEIPT: "Приёмка",
  SALE: "Продажа",
  SALE_RETURN: "Возврат покупателя",
  SUPPLIER_RETURN: "Возврат поставщику",
  DAMAGE: "Порча",
  WASTE: "Списание",
  THEFT: "Кража",
  ADJUSTMENT: "Корректировка",
  STOCKTAKE: "Инвентаризация",
  IMPORT: "Импорт",
  TRANSFER_OUT: "Перемещение (исходящее)",
  TRANSFER_IN: "Перемещение (входящее)",
};

type Product = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  scalePlu?: string | null;
  price: number;
  cost?: number | null;
  stock: number;
  unit: string;
  category?: string | null;
  lowStockThreshold: number;
};
type Supplier = { id: string; name: string };
type Line = {
  productId: string;
  quantity: string;
  unitCost: string;
  lotNumber: string;
  expiresAt: string;
};
type Tab = "ledger" | "receipt" | "excel" | "expiry";
const num = (value: unknown) => Number(value) || 0;

function DarkSelect({
  value,
  onChange,
  placeholder,
  options,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="bg-background text-foreground hover:bg-accent flex w-full items-center justify-between rounded-md border p-2 text-left text-sm"
      >
        <span className={selected ? "truncate" : "text-muted-foreground"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown className="text-muted-foreground ml-2 h-4 w-4 shrink-0" />
      </button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-md border p-1 shadow-xl">
          {options.length === 0 ? (
            <p className="text-muted-foreground px-2 py-2 text-sm">Нет вариантов</p>
          ) : (
            options.map((option) => (
              <button
                type="button"
                key={option.value}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className="hover:bg-accent flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm"
              >
                <span className="truncate">{option.label}</span>
                {option.value === value && <Check className="text-primary h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function InventoryDashboard() {
  const [tab, setTab] = useState<Tab>("ledger");
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [movements, setMovements] = useState<any[]>([]);
  const [lots, setLots] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [message, setMessage] = useState("");
  const [receipt, setReceipt] = useState({
    supplierId: "",
    documentNo: "",
    deliveredBy: "",
    receivedBy: "",
    note: "",
    lines: [] as Line[],
  });
  async function getJson(url: string) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      return response.ok ? await response.json() : {};
    } catch {
      return {};
    } finally {
      window.clearTimeout(timer);
    }
  }
  async function load() {
    setLoading(true);
    try {
      const [catalog, sups, ledger, expiry] = await Promise.all([
        getJson("/api/inventory/catalog"),
        getJson("/api/suppliers"),
        getJson(
          `/api/inventory/movements?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) })}`
        ),
        getJson("/api/inventory/lots?days=60"),
      ]);
      setProducts(catalog.products ?? []);
      setSuppliers(sups.suppliers ?? []);
      setMovements(ledger.movements ?? []);
      setLots(expiry.lots ?? []);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []); // initial data only
  function exportSheet(rows: Record<string, unknown>[], name: string) {
    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "Данные");
    XLSX.writeFile(book, `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }
  function exportLedger() {
    exportSheet(
      movements.map((m) => ({
        Дата: new Date(m.createdAt).toLocaleString("ru-RU"),
        Тип: MOVEMENT_TYPE_LABELS[m.type] ?? m.type,
        Товар: m.product?.name,
        SKU: m.product?.sku ?? "",
        Штрихкод: m.product?.barcode ?? "",
        "Приход/расход": num(m.quantity),
        Было: num(m.stockBefore),
        Стало: num(m.stockAfter),
        Себестоимость: m.unitCost ?? "",
        Поставщик: m.supplier?.name ?? "",
        Принял: m.receivedBy ?? "",
        Доставил: m.deliveredBy ?? "",
        Пользователь: m.user?.name ?? "",
        Документ: m.documentNo ?? "",
        Партия: m.lotNumber ?? "",
        "Срок годности": m.expiresAt ? new Date(m.expiresAt).toLocaleDateString("ru-RU") : "",
        Примечание: m.note ?? "",
      })),
      "korgen-stok-hareketleri"
    );
  }
  function exportProducts() {
    exportSheet(
      products.map((p) => ({
        name: p.name,
        sku: p.sku ?? "",
        barcode: p.barcode ?? "",
        scalePlu: p.scalePlu ?? "",
        price: p.price,
        cost: p.cost ?? "",
        stock: p.stock,
        unit: p.unit,
        category: p.category ?? "",
        lowStockThreshold: p.lowStockThreshold,
      })),
      "korgen-urun-katalog"
    );
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const book = XLSX.read(await file.arrayBuffer());
      const rows = XLSX.utils
        .sheet_to_json<Record<string, unknown>>(book.Sheets[book.SheetNames[0]], { defval: "" })
        .map((r) => ({
          name: String(r.name ?? r["Название"] ?? "").trim(),
          sku: String(r.sku ?? r["SKU"] ?? "").trim() || null,
          barcode: String(r.barcode ?? r["Штрихкод"] ?? "").trim() || null,
          scalePlu: String(r.scalePlu ?? r["PLU"] ?? "").trim() || null,
          price: num(r.price ?? r["Цена"]),
          cost:
            r.cost === "" || r["Себестоимость"] === "" ? null : num(r.cost ?? r["Себестоимость"]),
          stock: num(r.stock ?? r["Остаток"]),
          unit: String(r.unit ?? r["Ед.изм."] ?? "pcs") === "kg" ? "kg" : "pcs",
          category: String(r.category ?? r["Категория"] ?? "").trim() || null,
          lowStockThreshold: num(r.lowStockThreshold ?? r["Мин.остаток"] ?? 5),
        }));
      const res = await fetch("/api/inventory/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error("Импорт не выполнен");
      setMessage(
        `Импорт: создано ${d.created}, обновлено ${d.updated}${d.restored ? `, восстановлено ${d.restored}` : ""}${d.errors?.length ? `. Ошибок: ${d.errors.length}` : ""}`
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Ошибка импорта");
    }
    event.target.value = "";
  }
  function addReceiptLine() {
    setReceipt((r) => ({
      ...r,
      lines: [
        ...r.lines,
        {
          productId: products[0]?.id ?? "",
          quantity: "",
          unitCost: "",
          lotNumber: "",
          expiresAt: "",
        },
      ],
    }));
  }
  async function submitReceipt() {
    if (!receipt.supplierId || receipt.lines.some((l) => !l.productId || num(l.quantity) <= 0))
      return setMessage("Выберите поставщика и заполните товары с количеством.");
    const res = await fetch("/api/inventory/receipts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...receipt,
        items: receipt.lines.map((l) => ({
          ...l,
          quantity: num(l.quantity),
          unitCost: l.unitCost ? num(l.unitCost) : undefined,
          expiresAt: l.expiresAt || undefined,
        })),
      }),
    });
    if (!res.ok) return setMessage("Не удалось сохранить приёмку.");
    setMessage("Приёмка сохранена, остатки и журнал обновлены.");
    setReceipt({
      supplierId: "",
      documentNo: "",
      deliveredBy: "",
      receivedBy: "",
      note: "",
      lines: [],
    });
    await load();
    setTab("ledger");
  }
  const tabs: { id: Tab; label: string; icon: typeof History }[] = [
    { id: "ledger", label: "Журнал движения", icon: History },
    { id: "receipt", label: "Приёмка", icon: PackageCheck },
    { id: "excel", label: "Excel", icon: FileSpreadsheet },
    { id: "expiry", label: "Сроки годности", icon: Warehouse },
  ];
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Склад и инвентаризация</h1>
          <p className="text-muted-foreground text-sm">
            Приход, расход, документы, партии, сроки годности и инвентаризация.
          </p>
        </div>
        <button
          onClick={load}
          className="hover:bg-accent inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Обновить
        </button>
      </div>
      {message && (
        <div className="border-primary/30 bg-primary/5 rounded-md border px-3 py-2 text-sm">
          {message}
        </div>
      )}
      <div className="flex flex-wrap gap-2 border-b pb-2">
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${tab === id ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>
      {tab === "ledger" && (
        <section className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-sm"
            />
            <button onClick={load} className="rounded-md border px-3 text-sm">
              Применить
            </button>
            <button
              onClick={exportLedger}
              className="ml-auto inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
            >
              <Download className="h-4 w-4" />
              Экспорт в Excel
            </button>
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  {[
                    "Дата",
                    "Тип",
                    "Товар",
                    "Количество",
                    "До / после",
                    "Пользователь",
                    "Поставщик / документ",
                  ].map((h) => (
                    <th key={h} className="px-3 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center">
                      Загрузка…
                    </td>
                  </tr>
                ) : movements.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted-foreground p-8 text-center">
                      Новых движений пока нет. После первой приёмки или продажи они появятся здесь.
                    </td>
                  </tr>
                ) : (
                  movements.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 text-xs">
                        {new Date(m.createdAt).toLocaleString("ru-RU")}
                      </td>
                      <td className="px-3 py-2 text-xs font-medium">{MOVEMENT_TYPE_LABELS[m.type] ?? m.type}</td>
                      <td className="px-3 py-2">{m.product?.name}</td>
                      <td
                        className={`px-3 py-2 font-semibold ${num(m.quantity) >= 0 ? "text-emerald-600" : "text-red-600"}`}
                      >
                        {num(m.quantity) >= 0 ? "+" : ""}
                        {num(m.quantity)} {unitLabel(m.product?.unit)}
                      </td>
                      <td className="px-3 py-2">
                        {num(m.stockBefore)} → {num(m.stockAfter)}
                      </td>
                      <td className="px-3 py-2">
                        {m.user?.name}
                        {m.receivedBy ? ` / ${m.receivedBy}` : ""}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        {m.supplier?.name ?? "—"}
                        {m.documentNo ? ` · ${m.documentNo}` : ""}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {tab === "receipt" && (
        <section className="max-w-5xl space-y-4 rounded-lg border p-4">
          <h2 className="font-semibold">Новая приёмка товара</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DarkSelect
              value={receipt.supplierId}
              onChange={(supplierId) => setReceipt({ ...receipt, supplierId })}
              placeholder="Поставщик *"
              options={suppliers.map((supplier) => ({ value: supplier.id, label: supplier.name }))}
            />
            <input
              value={receipt.documentNo}
              onChange={(e) => setReceipt({ ...receipt, documentNo: e.target.value })}
              placeholder="Номер накладной / счёта"
              className="rounded-md border p-2 text-sm"
            />
            <input
              value={receipt.deliveredBy}
              onChange={(e) => setReceipt({ ...receipt, deliveredBy: e.target.value })}
              placeholder="Кто доставил"
              className="rounded-md border p-2 text-sm"
            />
            <input
              value={receipt.receivedBy}
              onChange={(e) => setReceipt({ ...receipt, receivedBy: e.target.value })}
              placeholder="Кто принял"
              className="rounded-md border p-2 text-sm"
            />
          </div>
          <textarea
            value={receipt.note}
            onChange={(e) => setReceipt({ ...receipt, note: e.target.value })}
            placeholder="Примечание"
            className="w-full rounded-md border p-2 text-sm"
          />
          {receipt.lines.map((line, index) => (
            <div key={index} className="grid gap-2 rounded-md border p-3 sm:grid-cols-5">
              <DarkSelect
                value={line.productId}
                onChange={(productId) => {
                  const lines = [...receipt.lines];
                  lines[index].productId = productId;
                  setReceipt({ ...receipt, lines });
                }}
                placeholder="Товар"
                className="sm:col-span-2"
                options={products.map((product) => ({
                  value: product.id,
                  label: `${product.name} (${product.stock} ${unitLabel(product.unit)})`,
                }))}
              />
              <input
                type="number"
                min="0.001"
                step="0.001"
                value={line.quantity}
                onChange={(e) => {
                  const lines = [...receipt.lines];
                  lines[index].quantity = e.target.value;
                  setReceipt({ ...receipt, lines });
                }}
                placeholder="Количество"
                className="rounded-md border p-2 text-sm"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                value={line.unitCost}
                onChange={(e) => {
                  const lines = [...receipt.lines];
                  lines[index].unitCost = e.target.value;
                  setReceipt({ ...receipt, lines });
                }}
                placeholder="Себестоимость"
                className="rounded-md border p-2 text-sm"
              />
              <div className="flex gap-2">
                <input
                  value={line.lotNumber}
                  onChange={(e) => {
                    const lines = [...receipt.lines];
                    lines[index].lotNumber = e.target.value;
                    setReceipt({ ...receipt, lines });
                  }}
                  placeholder="Партия"
                  className="min-w-0 flex-1 rounded-md border p-2 text-sm"
                />
                <button
                  onClick={() =>
                    setReceipt({ ...receipt, lines: receipt.lines.filter((_, i) => i !== index) })
                  }
                  className="rounded-md border px-2 text-red-600"
                >
                  ×
                </button>
              </div>
              <input
                type="date"
                value={line.expiresAt}
                onChange={(e) => {
                  const lines = [...receipt.lines];
                  lines[index].expiresAt = e.target.value;
                  setReceipt({ ...receipt, lines });
                }}
                title="Срок годности"
                className="rounded-md border p-2 text-sm"
              />
            </div>
          ))}
          <button
            onClick={addReceiptLine}
            className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
          >
            <Plus className="h-4 w-4" />
            Товар
          </button>
          <button
            onClick={submitReceipt}
            className="bg-primary text-primary-foreground ml-2 rounded-md px-4 py-2 text-sm font-medium"
          >
            Провести приёмку
          </button>
        </section>
      )}
      {tab === "excel" && (
        <section className="max-w-3xl space-y-4 rounded-lg border p-5">
          <h2 className="font-semibold">Excel / CSV</h2>
          <p className="text-muted-foreground text-sm">
            Шаблон: name, sku, barcode, scalePlu, price, cost, stock, unit (pcs/kg), category,
            lowStockThreshold. Если совпадает штрихкод или SKU, товар обновится.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={exportProducts}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Download className="h-4 w-4" />
              Экспорт товаров в Excel
            </button>
            <label className="bg-primary text-primary-foreground inline-flex cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-sm font-medium">
              <Upload className="h-4 w-4" />
              Импорт Excel/CSV
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={importFile}
              />
            </label>
          </div>
          <p className="text-xs text-amber-700">
            Импорт записывает расхождение остатков в журнал движений как «IMPORT».
          </p>
        </section>
      )}
      {tab === "expiry" && (
        <section className="overflow-x-auto rounded-lg border">
          <div className="border-b p-4">
            <h2 className="font-semibold">Партии с истекающим сроком годности (в течение 60 дней)</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {["Товар", "Партия", "Остаток", "Срок годности", "Поставщик"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {lots.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-muted-foreground p-8 text-center">
                    Нет партий с истекающим сроком годности.
                  </td>
                </tr>
              ) : (
                lots.map((l) => (
                  <tr key={l.id}>
                    <td className="px-3 py-2">{l.product?.name}</td>
                    <td className="px-3 py-2">{l.lotNumber}</td>
                    <td className="px-3 py-2">
                      {l.availableQty} {unitLabel(l.product?.unit)}
                    </td>
                    <td className="px-3 py-2 text-amber-600">
                      {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString("ru-RU") : "—"}
                    </td>
                    <td className="px-3 py-2">{l.supplier?.name ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
