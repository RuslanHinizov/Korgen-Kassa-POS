import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.consultant.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Консультант не найден" }, { status: 404 });

  const consultant = await prisma.consultant.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ consultant });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.consultant.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Консультант не найден" }, { status: 404 });
  await prisma.consultant.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
