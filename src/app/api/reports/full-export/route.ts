import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { xlsxMultiSheetResponse } from "@/lib/xlsx-response";

const SECTIONS = [
  "sales", "customerReturns", "purchaseReceipts", "supplierReturns",
  "writeOffs", "storeTransfers", "stocktakes", "cashMovements", "inventoryMovements", "products",
  "shifts", "saleLines", "cancelledItems", "refunds", "auditLog", "logins", "timeline",
] as const;
type Section = (typeof SECTIONS)[number];

const SALE_STATUS: Record<string, string> = { COMPLETED: "Завершена", VOIDED: "Отменена", REFUNDED: "Возврат" };
const PAYMENT_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое", CREDIT: "В долг" };
const CASH_TYPE: Record<string, string> = { DEPOSIT: "Вложения", EXPENSE: "Расходы", DIVIDEND: "Дивиденды" };

// GET /api/reports/full-export?from=&to=&sections=sales,writeOffs,... — «Полный отчёт»:
// one multi-sheet Excel with everything that happened in the store over a date range,
// section by section (each sheet reuses the same query shape as that module's own export).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const sectionsParam = sp.get("sections");
  const sections = new Set<Section>(
    sectionsParam ? (sectionsParam.split(",").filter((s): s is Section => (SECTIONS as readonly string[]).includes(s))) : SECTIONS
  );
  const storeId = await getStoreId();

  // A shiftId scopes Продажи/Движение денег to exactly that shift (not just its
  // time window, which could otherwise leak another cashier's parallel sales in) —
  // the "download this shift's report" button on Смены passes this instead of from/to.
  const shiftId = sp.get("shiftId");
  const shift = shiftId ? await prisma.shift.findFirst({ where: { id: shiftId, storeId }, select: { openedAt: true, closedAt: true } }) : null;
  if (shiftId && !shift) return NextResponse.json({ error: "Смена не найдена" }, { status: 404 });

  const from = shift ? shift.openedAt : sp.get("from") ? new Date(sp.get("from")!) : null;
  const to = shift ? (shift.closedAt ?? new Date()) : sp.get("to") ? new Date(sp.get("to")!) : null;
  const range = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

  const sheets: { name: string; rows: (string | number | Date | null)[][] }[] = [];
  const summary: [string, number, number | null][] = [];

  if (sections.has("sales")) {
    const sales = await prisma.sale.findMany({
      where: shiftId ? { storeId, shiftId } : { storeId, createdAt: range }, orderBy: { createdAt: "desc" },
      include: {
        items: { include: { product: { select: { name: true } } } },
        user: { select: { name: true } }, customer: { select: { name: true } },
        consultant: { select: { name: true } }, cashbox: { select: { name: true } }, shift: { select: { openedAt: true } },
      },
    });
    sheets.push({
      name: "Продажи",
      rows: [
        ["Номер", "Дата и время", "Статус", "Кассир", "Касса", "Смена (открыта)", "Покупатель", "Консультант", "Способ оплаты", "Промежуточный итог", "Скидка", "Итого", "Получено", "Сдача", "Причина отмены", "Товары"],
        ...sales.map((s) => [s.documentNo, s.createdAt, SALE_STATUS[s.status] ?? s.status, s.user.name, s.cashbox?.name ?? "", s.shift?.openedAt ?? "",
          s.customer?.name ?? "", s.consultant?.name ?? "", PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod,
          Number(s.subtotal), Number(s.discountAmount), Number(s.total), s.amountTendered != null ? Number(s.amountTendered) : "", s.changeDue != null ? Number(s.changeDue) : "",
          s.voidReason ?? "", s.items.map((i) => `${i.quantity}x ${i.product?.name ?? i.name}`).join("; ")]),
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
      where: shiftId ? { shiftId } : { shift: { storeId }, createdAt: range }, orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true } } },
    });
    sheets.push({
      name: "Движение денег",
      rows: [
        ["Дата", "Тип", "Сумма", "Пользователь", "Причина"],
        ...rows.map((r) => [r.createdAt, CASH_TYPE[r.type] ?? r.type, Number(r.amount), r.user.name, r.reason ?? ""]),
      ],
    });
    const netCash = rows.reduce((s, r) => s + (r.type === "DEPOSIT" ? Number(r.amount) : -Number(r.amount)), 0);
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

  // ---- "Кто что делал": shifts, line items, cancellations, refunds, audit log, logins, second-by-second timeline ----
  const needsUsers = ["auditLog", "timeline"].some((k) => sections.has(k as Section));
  const userNames = new Map<string, string>();
  if (needsUsers) for (const u of await prisma.user.findMany({ select: { id: true, name: true } })) userNames.set(u.id, u.name);
  const who = (id: string | null | undefined) => (id ? userNames.get(id) ?? id : "");
  const CAP = 20000;

  if (sections.has("shifts")) {
    const rows = await prisma.shift.findMany({
      where: shiftId ? { id: shiftId, storeId } : { storeId, openedAt: range }, orderBy: { openedAt: "desc" },
      include: {
        user: { select: { name: true } },
        sales: { select: { total: true, status: true } },
        cashMovements: { select: { type: true, amount: true } },
      },
    });
    const fmtDuration = (a: Date, b: Date | null) => {
      const sec = Math.max(0, Math.round(((b ?? new Date()).getTime() - a.getTime()) / 1000));
      return `${Math.floor(sec / 3600)}ч ${Math.floor((sec % 3600) / 60)}м ${sec % 60}с`;
    };
    sheets.push({
      name: "Смены",
      rows: [
        ["Кассир", "Открыта", "Закрыта", "Длительность", "Статус", "Нач. остаток", "Чеков", "Выручка", "Внесения", "Изъятия/выплаты/инкассация", "Ожидалось в кассе", "Посчитано", "Расхождение", "Примечание"],
        ...rows.map((s) => {
          const done = s.sales.filter((x) => x.status === "COMPLETED");
          const cashIn = s.cashMovements.filter((m) => m.type === "DEPOSIT").reduce((a, m) => a + Number(m.amount), 0);
          const cashOut = s.cashMovements.filter((m) => m.type !== "DEPOSIT").reduce((a, m) => a + Number(m.amount), 0);
          return [s.user.name, s.openedAt, s.closedAt ?? "", fmtDuration(s.openedAt, s.closedAt), s.status === "OPEN" ? "Открыта" : "Закрыта",
            Number(s.openingFloat), done.length, done.reduce((a, x) => a + Number(x.total), 0), cashIn, cashOut,
            s.expectedCash != null ? Number(s.expectedCash) : "", s.countedCash != null ? Number(s.countedCash) : "", s.difference != null ? Number(s.difference) : "", s.notes ?? ""];
        }),
      ],
    });
    summary.push(["Смены", rows.length, null]);
  }

  if (sections.has("saleLines")) {
    const sales = await prisma.sale.findMany({
      where: shiftId ? { storeId, shiftId } : { storeId, createdAt: range }, orderBy: { createdAt: "asc" }, take: CAP,
      include: { user: { select: { name: true } }, items: { include: { product: { select: { barcode: true } } } } },
    });
    const lines = sales.flatMap((s) => s.items.map((i) => [
      s.createdAt, s.documentNo, s.user.name, SALE_STATUS[s.status] ?? s.status, i.name, i.product?.barcode ?? "",
      Number(i.quantity), i.unit, Number(i.price), Number(i.discountAmount), Number(i.total), i.notes ?? "",
    ]));
    sheets.push({
      name: "Позиции чеков",
      rows: [["Дата и время", "Чек №", "Кассир", "Статус чека", "Товар", "Штрихкод", "Кол-во", "Ед.", "Цена", "Скидка", "Сумма", "Примечание"], ...lines],
    });
    summary.push(["Позиции чеков (строк)", lines.length, null]);
  }

  if (sections.has("cancelledItems")) {
    const rows = await prisma.cancelledItem.findMany({
      where: { storeId, createdAt: range }, orderBy: { createdAt: "asc" }, take: CAP,
      include: { user: { select: { name: true } }, cashbox: { select: { name: true } } },
    });
    sheets.push({
      name: "Отменённые товары",
      rows: [
        ["Дата и время", "Кассир", "Касса", "Товар", "Было", "Стало", "Причина"],
        ...rows.map((r) => [r.createdAt, r.user.name, r.cashbox?.name ?? "", r.productName, Number(r.beforeQty), r.afterQty != null ? Number(r.afterQty) : "удалена", r.reason ?? ""]),
      ],
    });
    summary.push(["Отменённые товары", rows.length, null]);
  }

  if (sections.has("refunds")) {
    const rows = await prisma.refund.findMany({
      where: { sale: { storeId }, createdAt: range }, orderBy: { createdAt: "asc" },
      include: { user: { select: { name: true } }, sale: { select: { documentNo: true } } },
    });
    sheets.push({
      name: "Возвраты по чекам",
      rows: [
        ["Дата и время", "Чек №", "Кто вернул", "Сумма", "Вернуть на склад", "Причина"],
        ...rows.map((r) => [r.createdAt, r.sale.documentNo, r.user.name, Number(r.amount), r.restoreStock ? "да" : "нет", r.reason ?? ""]),
      ],
    });
    summary.push(["Возвраты по чекам", rows.length, rows.reduce((a, r) => a + Number(r.amount), 0)]);
  }

  if (sections.has("auditLog")) {
    const rows = await prisma.auditLog.findMany({ where: { storeId, createdAt: range }, orderBy: { createdAt: "asc" }, take: CAP });
    sheets.push({
      name: "Журнал действий",
      rows: [
        ["Дата и время", "Пользователь", "Действие", "Объект", "ID объекта", "Детали"],
        ...rows.map((r) => [r.createdAt, who(r.userId), r.action, r.entityType ?? "", r.entityId ?? "", r.details ? JSON.stringify(r.details) : ""]),
      ],
    });
    summary.push(["Журнал действий", rows.length, null]);
  }

  if (sections.has("logins")) {
    const rows = await prisma.session.findMany({
      where: { createdAt: range }, orderBy: { createdAt: "asc" }, take: CAP,
      include: { user: { select: { name: true, role: true } } },
    });
    sheets.push({
      name: "Входы в систему",
      rows: [
        ["Дата и время входа", "Пользователь", "Роль", "IP", "Устройство/браузер", "Сессия до"],
        ...rows.map((r) => [r.createdAt, r.user.name, r.user.role, r.ipAddress ?? "", r.userAgent ?? "", r.expiresAt]),
      ],
    });
    summary.push(["Входы в систему", rows.length, null]);
  }

  if (sections.has("timeline")) {
    type Ev = { t: Date; kind: string; who: string; what: string; amount: number | null };
    const ev: Ev[] = [];
    const [tSales, tRefunds, tCash, tShifts, tCancelled, tAudit, tSessions] = await Promise.all([
      prisma.sale.findMany({ where: shiftId ? { storeId, shiftId } : { storeId, createdAt: range }, take: CAP, include: { user: { select: { name: true } } } }),
      prisma.refund.findMany({ where: { sale: { storeId }, createdAt: range }, take: CAP, include: { user: { select: { name: true } }, sale: { select: { documentNo: true } } } }),
      prisma.cashMovement.findMany({ where: shiftId ? { shiftId } : { shift: { storeId }, createdAt: range }, take: CAP, include: { user: { select: { name: true } } } }),
      prisma.shift.findMany({ where: shiftId ? { id: shiftId, storeId } : { storeId, OR: [{ openedAt: range }, { closedAt: range }] }, include: { user: { select: { name: true } } } }),
      prisma.cancelledItem.findMany({ where: { storeId, createdAt: range }, take: CAP, include: { user: { select: { name: true } } } }),
      prisma.auditLog.findMany({ where: { storeId, createdAt: range }, take: CAP }),
      shiftId ? Promise.resolve([]) : prisma.session.findMany({ where: { createdAt: range }, take: CAP, include: { user: { select: { name: true } } } }),
    ]);
    for (const s of tSales) ev.push({ t: s.createdAt, kind: s.status === "VOIDED" ? "Чек отменён" : "Продажа", who: s.user.name, what: `Чек №${s.documentNo} · ${PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod}${s.voidReason ? ` · ${s.voidReason}` : ""}`, amount: Number(s.total) });
    for (const r of tRefunds) ev.push({ t: r.createdAt, kind: "Возврат по чеку", who: r.user.name, what: `Чек №${r.sale.documentNo}${r.reason ? ` · ${r.reason}` : ""}`, amount: -Number(r.amount) });
    for (const m of tCash) ev.push({ t: m.createdAt, kind: `Касса: ${CASH_TYPE[m.type] ?? m.type}`, who: m.user.name, what: m.reason ?? "", amount: m.type === "DEPOSIT" ? Number(m.amount) : -Number(m.amount) });
    for (const s of tShifts) {
      ev.push({ t: s.openedAt, kind: "Смена открыта", who: s.user.name, what: `Нач. остаток ${Number(s.openingFloat)}`, amount: null });
      if (s.closedAt) ev.push({ t: s.closedAt, kind: "Смена закрыта", who: s.user.name, what: `Посчитано ${s.countedCash != null ? Number(s.countedCash) : "—"}, расхождение ${s.difference != null ? Number(s.difference) : "—"}`, amount: null });
    }
    for (const c of tCancelled) ev.push({ t: c.createdAt, kind: "Товар отменён", who: c.user.name, what: `${c.productName}: ${Number(c.beforeQty)} → ${c.afterQty != null ? Number(c.afterQty) : "удалена"}${c.reason ? ` · ${c.reason}` : ""}`, amount: null });
    for (const a of tAudit) ev.push({ t: a.createdAt, kind: `Журнал: ${a.action}`, who: who(a.userId), what: `${a.entityType ?? ""} ${a.entityId ?? ""} ${a.details ? JSON.stringify(a.details) : ""}`.trim(), amount: null });
    for (const s of tSessions) ev.push({ t: s.createdAt, kind: "Вход в систему", who: s.user.name, what: `${s.ipAddress ?? ""} ${s.userAgent ?? ""}`.trim(), amount: null });
    ev.sort((a, b) => a.t.getTime() - b.t.getTime());
    sheets.push({
      name: "Хронология",
      rows: [["Дата и время", "Событие", "Кто", "Что произошло", "Сумма, ₸"], ...ev.map((e) => [e.t, e.kind, e.who, e.what, e.amount])],
    });
    summary.push(["Хронология (событий)", ev.length, null]);
  }

  sheets.unshift({
    name: "Сводка",
    rows: [
      [shift ? "Отчёт по смене" : "Полный отчёт по магазину"],
      ["Период", from ? from.toLocaleString("ru-RU") : "—", "по", to ? to.toLocaleString("ru-RU") : "—"],
      [],
      ["Раздел", "Кол-во записей", "Сумма, ₸"],
      ...summary,
    ],
  });

  const filename = shift ? `smena-otchet-${shift.openedAt.toISOString().slice(0, 10)}` : `polnyy-otchet-${new Date().toISOString().slice(0, 10)}`;
  return xlsxMultiSheetResponse({ filename, sheets });
}
