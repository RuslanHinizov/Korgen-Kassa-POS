import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { hashPassword } from "better-auth/crypto";
import { prisma } from "@/lib/db";
import { hashPin } from "@/lib/pin";
import { normalizePhone, syntheticEmail } from "@/lib/phone";
import { ROLES, adminStoreIds, newCashierCode, requireAdmin, sharesStore } from "@/lib/employees";

// GET /api/management/employees/:id
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await sharesStore(admin.user.id, id))) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const u = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true, name: true, lastName: true, email: true, phone: true, role: true, firedAt: true,
      allowCashierLogin: true, cashierCode: true, pin: true, storeAssignments: { select: { storeId: true } },
    },
  });
  if (!u) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  return NextResponse.json({
    employee: {
      id: u.id, name: u.name, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, firedAt: u.firedAt,
      allowCashierLogin: u.allowCashierLogin, cashierCode: u.cashierCode, hasPin: Boolean(u.pin),
      storeIds: u.storeAssignments.map((a) => a.storeId),
    },
  });
}

const patchSchema = z.object({
  name: z.string().trim().min(1),
  lastName: z.string().trim().optional().nullable(),
  phone: z.string().trim().min(5),
  email: z.string().trim().email().optional().or(z.literal("")),
  role: z.enum(ROLES),
  storeIds: z.array(z.string()).min(1),
  allowCashierLogin: z.boolean(),
  /** New kassa password (exactly 4 digits); empty leaves it unchanged, null removes it. */
  pin: z.string().regex(/^\d{4}$/).optional().or(z.literal("")).nullable(),
  password: z.string().min(6).optional().or(z.literal("")),
});

// PATCH /api/management/employees/:id
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  if (!(await sharesStore(session.user.id, id))) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте обязательные поля (пароль — от 6 символов, пароль кассы — 4 цифры)" }, { status: 400 });
  }
  const d = parsed.data;

  const existing = await prisma.user.findUnique({ where: { id }, select: { id: true, cashierCode: true, email: true } });
  if (!existing) return NextResponse.json({ error: "Пользователь не найден" }, { status: 404 });
  const existingEmail = existing.email;
  const isSynthetic = existingEmail.endsWith("@phone.korgen");
  if (id === session.user.id && d.role !== "ADMIN") {
    return NextResponse.json({ error: "Нельзя снять с себя роль администратора" }, { status: 400 });
  }
  const phone = normalizePhone(d.phone);
  if (!phone) return NextResponse.json({ error: "Введите корректный номер телефона" }, { status: 400 });
  if (await prisma.user.findFirst({ where: { phone, NOT: { id } } })) {
    return NextResponse.json({ error: "Этот номер телефона уже используется" }, { status: 409 });
  }
  const email = d.email || (isSynthetic ? syntheticEmail(phone) : existingEmail);
  if (await prisma.user.findFirst({ where: { email, NOT: { id } } })) {
    return NextResponse.json({ error: "Эта почта уже используется" }, { status: 409 });
  }
  const myStores = await adminStoreIds(session.user.id);
  if (!d.storeIds.every((sid) => myStores.includes(sid))) return NextResponse.json({ error: "Торговая точка не найдена" }, { status: 400 });

  const cashierCode = existing.cashierCode ? undefined : await newCashierCode();
  const passwordHash = d.password ? await hashPassword(d.password) : null;
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        name: d.name, lastName: d.lastName || null, phone, email, role: d.role,
        allowCashierLogin: d.allowCashierLogin,
        ...(cashierCode ? { cashierCode } : {}),
        ...(d.pin === null ? { pin: null } : d.pin ? { pin: hashPin(d.pin) } : {}),
        storeAssignments: { deleteMany: {}, create: [...new Set(d.storeIds)].map((storeId) => ({ storeId })) },
      },
    });
    if (passwordHash) await tx.account.updateMany({ where: { userId: id, providerId: "credential" }, data: { password: passwordHash } });
  });
  return NextResponse.json({ ok: true });
}
