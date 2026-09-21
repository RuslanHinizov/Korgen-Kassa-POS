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
  holderName: z.string().max(120).optional().nullable(),
  percent: z.number().min(0).max(100).optional(),
  active: z.boolean().optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();
  const existing = await prisma.discountCard.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Карта не найдена" }, { status: 404 });
  const card = await prisma.discountCard.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ card });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.discountCard.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Карта не найдена" }, { status: 404 });
  await prisma.discountCard.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
