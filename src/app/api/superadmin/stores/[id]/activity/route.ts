import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

export type Category = "sale" | "refund" | "cancel" | "cash" | "shift" | "doc" | "settings" | "login" | "device";
const ALL: Category[] = ["sale", "refund", "cancel", "cash", "shift", "doc", "settings", "login", "device"];

const PAYMENT_LABEL: Record<string, string> = { CASH: "Наличные", CARD: "Карта", OTHER: "Другое", CREDIT: "В долг" };
const CASH_TYPE: Record<string, string> = { IN: "Внесение в кассу", OUT: "Изъятие из кассы", PAYOUT: "Выплата из кассы", DROP: "Инкассация" };
const AUDIT_LABEL: Record<string, string> = {
  SETTINGS_UPDATE: "Изменены настройки", PURCHASE_RECEIPT_POST: "Проведена приёмка", PURCHASE_RECEIPT_PAYMENT: "Оплата по приёмке",
  STOCKTAKE_POST: "Проведена инвентаризация", CUSTOMER_RETURN_POST: "Проведён возврат покупателя", CUSTOMER_RETURN_PAYMENT: "Выплата по возврату покупателя",
  SUPPLIER_RETURN_POST: "Проведён возврат поставщику", SUPPLIER_RETURN_PAYMENT: "Оплата по возврату поставщику", STOCK_IN_POST: "Проведено оприходование",
  STOCK_ADJUST: "Корректировка остатка", STORE_TRANSFER_POST: "Проведено перемещение", KIOSK_DEVICE_PAIR: "Привязан кассовый терминал",
  KIOSK_DEVICE_UNPAIR: "Отвязан кассовый терминал", WRITE_OFF_POST: "Проведено списание",
};
const categoryOfAudit = (a: string): Category => (a.startsWith("SETTINGS") ? "settings" : a.startsWith("KIOSK") ? "device" : "doc");

export interface FeedEvent { id: string; t: string; category: Category; title: string; who: string; text: string; amount: number | null }

// GET /api/superadmin/stores/:id/activity?limit=60&before=ISO&categories=sale,refund — live feed, newest first
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await prisma.store.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });
  const sp = req.nextUrl.searchParams;
  const limit = Math.min(200, Math.max(10, Number(sp.get("limit")) || 60));
  const before = sp.get("before") ? new Date(sp.get("before")!) : null;
  const wanted = new Set<Category>((sp.get("categories")?.split(",") ?? ALL).filter((c): c is Category => (ALL as string[]).includes(c)));
  const when = (field = "createdAt") => (before ? { [field]: { lt: before } } : {});
  const events: FeedEvent[] = [];

  const jobs: Promise<void>[] = [];

  if (wanted.has("sale")) jobs.push(prisma.sale.findMany({
    where: { storeId: id, ...when() }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, documentNo: true, total: true, status: true, paymentMethod: true, voidReason: true, user: { select: { name: true } }, customer: { select: { name: true } }, _count: { select: { items: true } } },
  }).then((rows) => { for (const s of rows) events.push({
    id: `sale-${s.id}`, t: s.createdAt.toISOString(), category: "sale",
    title: s.status === "VOIDED" ? "Чек отменён" : s.status === "REFUNDED" ? "Чек (возвращён)" : "Продажа",
    who: s.user.name.trim(),
    text: `Чек №${s.documentNo} · ${PAYMENT_LABEL[s.paymentMethod] ?? s.paymentMethod} · ${s._count.items} поз.${s.customer ? ` · ${s.customer.name}` : ""}${s.voidReason ? ` · ${s.voidReason}` : ""}`,
    amount: Number(s.total),
  }); }));

  if (wanted.has("refund")) jobs.push(prisma.refund.findMany({
    where: { sale: { storeId: id }, ...when() }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, amount: true, reason: true, restoreStock: true, sale: { select: { documentNo: true } }, user: { select: { name: true } } },
  }).then((rows) => { for (const r of rows) events.push({
    id: `refund-${r.id}`, t: r.createdAt.toISOString(), category: "refund", title: "Возврат по чеку", who: r.user.name.trim(),
    text: `Чек №${r.sale.documentNo}${r.restoreStock ? " · товар вернулся на склад" : " · без возврата на склад"}${r.reason ? ` · ${r.reason}` : ""}`, amount: -Number(r.amount),
  }); }));

  if (wanted.has("cancel")) jobs.push(prisma.cancelledItem.findMany({
    where: { storeId: id, ...when() }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, productName: true, beforeQty: true, afterQty: true, reason: true, user: { select: { name: true } } },
  }).then((rows) => { for (const c of rows) events.push({
    id: `cancel-${c.id}`, t: c.createdAt.toISOString(), category: "cancel", title: c.afterQty == null ? "Товар удалён из чека" : "Количество уменьшено", who: c.user.name.trim(),
    text: `${c.productName}: ${Number(c.beforeQty)} → ${c.afterQty == null ? "убран" : Number(c.afterQty)}${c.reason ? ` · ${c.reason}` : ""}`, amount: null,
  }); }));

  if (wanted.has("cash")) jobs.push(prisma.cashMovement.findMany({
    where: { shift: { storeId: id }, ...when() }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, type: true, amount: true, reason: true, user: { select: { name: true } } },
  }).then((rows) => { for (const m of rows) events.push({
    id: `cash-${m.id}`, t: m.createdAt.toISOString(), category: "cash", title: CASH_TYPE[m.type] ?? m.type, who: m.user.name.trim(),
    text: m.reason ?? "", amount: m.type === "IN" ? Number(m.amount) : -Number(m.amount),
  }); }));

  if (wanted.has("shift")) {
    jobs.push(prisma.shift.findMany({
      where: { storeId: id, ...when("openedAt") }, orderBy: { openedAt: "desc" }, take: limit,
      select: { id: true, openedAt: true, openingFloat: true, user: { select: { name: true } } },
    }).then((rows) => { for (const s of rows) events.push({
      id: `shift-open-${s.id}`, t: s.openedAt.toISOString(), category: "shift", title: "Смена открыта", who: s.user.name.trim(),
      text: `Начальный остаток ${Number(s.openingFloat).toLocaleString("ru-RU")} ₸`, amount: null,
    }); }));
    jobs.push(prisma.shift.findMany({
      where: { storeId: id, closedAt: before ? { lt: before } : { not: null } }, orderBy: { closedAt: "desc" }, take: limit,
      select: { id: true, closedAt: true, expectedCash: true, countedCash: true, difference: true, user: { select: { name: true } } },
    }).then((rows) => { for (const s of rows) if (s.closedAt) events.push({
      id: `shift-close-${s.id}`, t: s.closedAt.toISOString(), category: "shift", title: "Смена закрыта", who: s.user.name.trim(),
      text: `Ожидалось ${s.expectedCash != null ? Number(s.expectedCash).toLocaleString("ru-RU") : "—"} ₸ · посчитано ${s.countedCash != null ? Number(s.countedCash).toLocaleString("ru-RU") : "—"} ₸ · расхождение ${s.difference != null ? Number(s.difference).toLocaleString("ru-RU") : "—"} ₸`, amount: null,
    }); }));
  }

  const auditCats = (["doc", "settings", "device"] as Category[]).filter((c) => wanted.has(c));
  if (auditCats.length) jobs.push(prisma.auditLog.findMany({
    where: { storeId: id, action: { notIn: ["SALE_REFUND", "SHIFT_OPEN", "SHIFT_CLOSE"] }, ...when() }, orderBy: { createdAt: "desc" }, take: limit * 2,
  }).then(async (rows) => {
    const users = await prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, name: true } });
    const names = new Map(users.map((u) => [u.id, u.name]));
    for (const a of rows) {
      const cat = categoryOfAudit(a.action);
      if (!wanted.has(cat)) continue;
      const det = a.details && typeof a.details === "object" ? Object.entries(a.details as Record<string, unknown>).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`).join(", ") : "";
      events.push({ id: `audit-${a.id}`, t: a.createdAt.toISOString(), category: cat, title: AUDIT_LABEL[a.action] ?? a.action, who: (names.get(a.userId) ?? "—").trim(), text: det.slice(0, 200), amount: null });
    }
  }));

  if (wanted.has("login")) jobs.push(prisma.session.findMany({
    where: { user: { storeAssignments: { some: { storeId: id } } }, ...when() }, orderBy: { createdAt: "desc" }, take: limit,
    select: { id: true, createdAt: true, userAgent: true, user: { select: { name: true, role: true } } },
  }).then((rows) => { for (const s of rows) events.push({
    id: `login-${s.id}`, t: s.createdAt.toISOString(), category: "login", title: "Вход в систему", who: s.user.name.trim(),
    text: `${s.user.role}${s.userAgent ? ` · ${s.userAgent.slice(0, 60)}` : ""}`, amount: null,
  }); }));

  await Promise.all(jobs);
  events.sort((a, b) => b.t.localeCompare(a.t));
  const page = events.slice(0, limit);
  // A source that filled its own quota may still have older rows, even if the merged list is short.
  const perSource = new Map<string, number>();
  for (const e of events) { const k = e.id.replace(/-[^-]*$/, ""); perSource.set(k, (perSource.get(k) ?? 0) + 1); }
  const truncated = [...perSource.entries()].some(([k, n]) => n >= (k === "audit" ? limit * 2 : limit));
  return NextResponse.json({ events: page, hasMore: events.length > limit || truncated, nextBefore: page.length ? page[page.length - 1].t : null });
}
