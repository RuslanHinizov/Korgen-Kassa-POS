import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const updateSchema = z.object({
  active: z.boolean().optional(),
  startTime: z.string().regex(timeRe).optional(),
  endTime: z.string().regex(timeRe).optional(),
  daysOfWeek: z.string().optional().nullable(),
});

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// PATCH /api/sale-restrictions/:id — toggle active / change the time window
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const storeId = await getStoreId();
  const existing = await prisma.saleRestriction.findFirst({ where: { id, category: { storeId } } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const rule = await prisma.saleRestriction.update({
    where: { id },
    data: {
      ...(data.active !== undefined ? { active: data.active } : {}),
      ...(data.startTime !== undefined ? { startTime: data.startTime } : {}),
      ...(data.endTime !== undefined ? { endTime: data.endTime } : {}),
      ...(data.daysOfWeek !== undefined ? { daysOfWeek: data.daysOfWeek || null } : {}),
    },
  });
  return NextResponse.json({ rule });
}

// DELETE /api/sale-restrictions/:id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.saleRestriction.findFirst({ where: { id, category: { storeId } } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  await prisma.saleRestriction.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
