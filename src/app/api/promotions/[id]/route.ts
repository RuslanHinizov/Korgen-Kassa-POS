import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  active: z.boolean().optional(),
  priority: z.number().int().optional(),
  percent: z.number().min(0).max(100).optional().nullable(),
  amount: z.number().min(0).optional().nullable(),
  buyQty: z.number().int().min(1).optional().nullable(),
  getQty: z.number().int().min(1).optional().nullable(),
  getPercent: z.number().min(0).max(100).optional().nullable(),
  minSubtotal: z.number().min(0).optional().nullable(),
  startsAt: z.coerce.date().optional().nullable(),
  endsAt: z.coerce.date().optional().nullable(),
  daysOfWeek: z.string().regex(/^[1-7](,[1-7])*$/).optional().nullable(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();
  const existing = await prisma.promotion.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Акция не найдена" }, { status: 404 });
  const promotion = await prisma.promotion.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ promotion });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.promotion.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Акция не найдена" }, { status: 404 });
  await prisma.promotion.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
