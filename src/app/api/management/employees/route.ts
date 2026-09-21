import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { hashPin } from "@/lib/pin";
import { ROLES, newCashierCode, requireAdmin } from "@/lib/employees";

// GET /api/management/employees?status=working|dismissed&q=&role=&storeId=
export async function GET(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const dismissed = sp.get("status") === "dismissed";
  const q = sp.get("q")?.trim();
  const role = sp.get("role");
  const storeId = sp.get("storeId");

  const users = await prisma.user.findMany({
    where: {
      firedAt: dismissed ? { not: null } : null,
      ...(role && (ROLES as readonly string[]).includes(role) ? { role: role as (typeof ROLES)[number] } : {}),
      ...(storeId ? { storeAssignments: { some: { storeId } } } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { lastName: { contains: q, mode: "insensitive" } },
              { email: { contains: q, mode: "insensitive" } },
              { phone: { contains: q } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, lastName: true, email: true, phone: true, role: true, firedAt: true,
      storeAssignments: { select: { store: { select: { id: true, name: true } } } },
    },
  });
  const counts = await prisma.user.groupBy({ by: ["role"], where: { firedAt: null }, _count: { _all: true } });
  return NextResponse.json({
    employees: users.map((u) => ({
      id: u.id, name: u.name, lastName: u.lastName, email: u.email, phone: u.phone, role: u.role, firedAt: u.firedAt,
      stores: u.storeAssignments.map((a) => a.store),
    })),
    positions: ROLES.map((r) => ({ role: r, count: counts.find((c) => c.role === r)?._count._all ?? 0 })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1),
  lastName: z.string().trim().optional(),
  phone: z.string().trim().min(5),
  email: z.string().trim().email(),
  password: z.string().min(6),
  role: z.enum(ROLES),
  storeIds: z.array(z.string()).min(1),
  allowCashierLogin: z.boolean().default(true),
  pin: z.string().regex(/^\d{4}$/).optional().or(z.literal("")),
});

// POST /api/management/employees — «+ Пользователь»
export async function POST(req: NextRequest) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Проверьте обязательные поля (пароль — от 6 символов, пароль кассы — 4 цифры)" }, { status: 400 });
  }
  const d = parsed.data;

  if (await prisma.user.findUnique({ where: { email: d.email } })) {
    return NextResponse.json({ error: "Пользователь с такой почтой уже существует" }, { status: 409 });
  }
  const stores = await prisma.store.count({ where: { id: { in: d.storeIds } } });
  if (stores !== new Set(d.storeIds).size) return NextResponse.json({ error: "Торговая точка не найдена" }, { status: 400 });

  await auth.api.signUpEmail({ body: { name: d.name, email: d.email, password: d.password } });
  const user = await prisma.user.update({
    where: { email: d.email },
    data: {
      role: d.role,
      lastName: d.lastName || null,
      phone: d.phone,
      allowCashierLogin: d.allowCashierLogin,
      cashierCode: await newCashierCode(),
      ...(d.pin ? { pin: hashPin(d.pin) } : {}),
      storeAssignments: { create: [...new Set(d.storeIds)].map((storeId) => ({ storeId })) },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: user.id }, { status: 201 });
}
