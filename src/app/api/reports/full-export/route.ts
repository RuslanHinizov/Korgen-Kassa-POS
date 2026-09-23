import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxMultiSheetResponse } from "@/lib/xlsx-response";

const SECTIONS = [
  "sales", "customerReturns", "purchaseReceipts", "supplierReturns",
  "writeOffs", "storeTransfers", "stocktakes", "cashMovements", "inventoryMovements", "products",
] as const;
type Section = (typeof SECTIONS)[number];

const SALE_STATUS: Record<string, string> = { COMPLETED: "Завершена", VOIDED: "Отменена", REFUNDED: "Возврат" };
const PAYMENT_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое", CREDIT: "В долг" };
const CASH_TYPE: Record<string, string> = { IN: "Внесение", OUT: "Изъятие", PAYOUT: "Выплата", DROP: "Инкассация" };

// GET /api/reports/full-export?from=&to=&sections=sales,writeOffs,... — «Полный отчёт»:
// one multi-sheet Excel with everything that happened in the store over a date range,
// section by section (each sheet reuses the same query shape as that module's own export).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const from = sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = sp.get("to") ? new Date(sp.get("to")!) : null;
  const sectionsParam = sp.get("sections");
  const sections = new Set<Section>(
    sectionsParam ? (sectionsParam.split(",").filter((s): s is Section => (SECTIONS as readonly string[]).includes(s))) : SECTIONS
  );
  const storeId = await getStoreId();
  const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const sheets: { name: string; rows: (string | number | Date | null)[][] }[] = [];
  const summary: [string, number, number | null][] = [];

  if (sections.has("sales")) {
    const sales = await prisma.sale.findMany({
      where: { storeId, createdAt: range }, orderBy: { createdAt: "desc" },
      include: { items: { include: { product: { select: { name: true } } } } },
    });
    sheets.push({
      name: "Продажи",
      rows: [
        ["Номер", "Дата", "Статус", "Способ оплаты", "Промежуточный итог", "Скидка", "Итого", "Товары"],
        ...sales.map((s) => [s.documentNo, s.createdAt, SALE_STATUS[s.status] ?? s.status, PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
          Number(s.subtotal), Number(s.discountAmount), Number(s.total),
          s.items.map((i) => `${i.quantity}x ${i.product?.name ?? i.name}`).join("; ")]),
      ],
    });
    const revenue = sales.filter((s) => s.status === "COMPLETED").reduce((sum, s) => sum + Number(s.total), 0);
    summary.push(["Продажи (выручка)", sales.length, revenue]);
  }

  if (sections.has("customerReturns")) {
    const rows = await prisma.customerReturn.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { customer: { select: { name: true } }, user: { select: { name: true } }, items: true },
    });
    sheets.push({
      name: "Возвраты покупателей",
      rows: [
        ["Номер", "Дата", "Покупатель", "Пользователь", "Итого", "Комментарий"],
        ...rows.map((r) => [r.documentNo, r.postedAt, r.customer?.name ?? "—", r.user.name, Number(r.totalAmount), r.comment ?? ""]),
      ],
    });
    summary.push(["Возвраты покупателей", rows.length, rows.reduce((s, r) => s + Number(r.totalAmount), 0)]);
  }

  if (sections.has("purchaseReceipts")) {
    const rows = await prisma.purchaseReceipt.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { supplier: { select: { name: true } }, user: { select: { name: true } } },
    });
    sheets.push({
      name: "Приёмки",
      rows: [
        ["Номер", "Дата", "Поставщик", "Пользователь", "Сумма", "Комментарий"],
        ...rows.map((r) => [r.documentNo, r.postedAt, r.supplier?.name ?? "—", r.user.name, Number(r.totalAmount), r.comment ?? ""]),
      ],
    });
    summary.push(["Приёмки", rows.length, rows.reduce((s, r) => s + Number(r.totalAmount), 0)]);
  }

  if (sections.has("supplierReturns")) {
    const rows = await prisma.supplierReturn.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { supplier: { select: { name: true } }, user: { select: { name: true } } },
    });
    sheets.push({
      name: "Возвраты поставщикам",
      rows: [
        ["Номер", "Дата", "Поставщик", "Пользователь", "Сумма", "Комментарий"],
        ...rows.map((r) => [r.documentNo, r.postedAt, r.supplier?.name ?? "—", r.user.name, Number(r.totalAmount), r.comment ?? ""]),
      ],
    });
    summary.push(["Возвраты поставщикам", rows.length, rows.reduce((s, r) => s + Number(r.totalAmount), 0)]);
  }

  if (sections.has("writeOffs")) {
    const rows = await prisma.writeOff.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { user: { select: { name: true } }, items: true },
    });
    sheets.push({
      name: "Списания",
      rows: [
        ["Номер", "Дата", "Пользователь", "Сумма", "Позиций", "Комментарий"],
        ...rows.map((r) => [r.documentNo, r.postedAt, r.user.name, Number(r.totalCost), r.items.length, r.note ?? ""]),
      ],
    });
    summary.push(["Списания", rows.length, rows.reduce((s, r) => s + Number(r.totalCost), 0)]);
  }

  if (sections.has("storeTransfers")) {
    const rows = await prisma.storeTransfer.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { toStore: { select: { name: true } }, user: { select: { name: true } } },
    });
    sheets.push({
      name: "Перемещения",
      rows: [
        ["Номер", "Дата", "Куда", "Пользователь", "Сумма", "Комментарий"],
        ...rows.map((r) => [r.documentNo, r.postedAt, r.toStore.name, r.user.name, Number(r.totalAmount), r.comment ?? ""]),
      ],
    });
    summary.push(["Перемещения", rows.length, rows.reduce((s, r) => s + Number(r.totalAmount), 0)]);
  }

  if (sections.has("stocktakes")) {
    const rows = await prisma.stocktake.findMany({
      where: { storeId, status: "POSTED", postedAt: range }, orderBy: { postedAt: "desc" },
      include: { user: { select: { name: true } }, items: { include: { product: { select: { price: true } } } } },
    });
    let stocktakeNetValue = 0;
    sheets.push({
      name: "Инвентаризации",
      rows: [
        ["Номер", "Дата", "Пользователь", "Позиций", "Излишек", "Недостача", "Комментарий"],
        ...rows.map((r) => {
          const surplus = r.items.filter((i) => Number(i.difference ?? 0) > 0).length;
          const shortage = r.items.filter((i) => Number(i.difference ?? 0) < 0).length;
          stocktakeNetValue += r.items.reduce((s, i) => s + Number(i.difference ?? 0) * Number(i.product.price), 0);
          return [r.documentNo, r.postedAt, r.user.name, r.items.length, surplus, shortage, r.note ?? ""];
        }),
      ],
    });
    summary.push(["Инвентаризации (излишек/недостача, ₸)", rows.length, stocktakeNetValue]);
  }

  if (sections.has("cashMovements")) {
    const rows = await prisma.cashMovement.findMany({
      where: { shift: { storeId }, createdAt: range }, orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    sheets.push({
      name: "Движение денег",
      rows: [
        ["Дата", "Тип", "Сумма", "Пользователь", "Причина"],
        ...rows.map((r) => [r.createdAt, CASH_TYPE[r.type] ?? r.type, Number(r.amount), r.user.name, r.reason ?? ""]),
      ],
    });
    const netCash = rows.reduce((s, r) => s + (r.type === "IN" ? Number(r.amount) : -Number(r.amount)), 0);
    summary.push(["Движение денег (нетто, ₸)", rows.length, netCash]);
  }

  if (sections.has("inventoryMovements")) {
    const rows = await prisma.inventoryMovement.findMany({
      where: { product: { storeId }, createdAt: range }, orderBy: { createdAt: "desc" }, take: 20000,
      include: { product: { select: { name: true, barcode: true } }, user: { select: { name: true } } },
    });
    sheets.push({
      name: "Товарные движения",
      rows: [
        ["Дата", "Товар", "Штрихкод", "Тип", "Кол-во", "Остаток после", "Пользователь", "Документ"],
        ...rows.map((r) => [r.createdAt, r.product.name, r.product.barcode ?? "", r.type, Number(r.quantity), Number(r.stockAfter), r.user.name, r.documentNo ?? ""]),
      ],
    });
    summary.push(["Товарные движения", rows.length, null]);
  }

  if (sections.has("products")) {
    const rows = await prisma.product.findMany({
      where: { storeId, deletedAt: null }, orderBy: { name: "asc" },
      select: { name: true, barcode: true, unit: true, stock: true, cost: true, price: true, categoryRef: { select: { name: true } }, supplier: { select: { name: true } } },
    });
    sheets.push({
      name: "Остатки товаров",
      rows: [
        ["Название", "Штрихкод", "Категория", "Поставщик", "Остаток", "Ед.изм", "Закуп. цена", "Прод. цена"],
        ...rows.map((p) => [p.name, p.barcode ?? "", p.categoryRef?.name ?? "", p.supplier?.name ?? "", Number(p.stock), p.unit, Number(p.cost ?? 0), Number(p.price)]),
      ],
    });
    const stockCostValue = rows.reduce((s, p) => s + Number(p.stock) * Number(p.cost ?? 0), 0);
    const stockSaleValue = rows.reduce((s, p) => s + Number(p.stock) * Number(p.price), 0);
    summary.push(["Остатки товаров (по закупочной, ₸)", rows.length, stockCostValue]);
    summary.push(["Остатки товаров (по продажной, ₸)", rows.length, stockSaleValue]);
  }

  sheets.unshift({
    name: "Сводка",
    rows: [
      ["Полный отчёт по магазину"],
      ["Период", from ? from.toLocaleDateString("ru-RU") : "—", "по", to ? to.toLocaleDateString("ru-RU") : "—"],
      [],
      ["Раздел", "Кол-во записей", "Сумма, ₸"],
      ...summary,
    ],
  });

  return xlsxMultiSheetResponse({ filename: `polnyy-otchet-${new Date().toISOString().slice(0, 10)}`, sheets });
}
