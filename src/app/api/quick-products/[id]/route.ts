import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const updateSchema = z.object({
  groupId: z.string().optional().nullable(),
  displayName: z.string().max(120).optional().nullable(),
  sortOrder: z.number().int().optional(),
});

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// PATCH /api/quick-products/:id — move to another group / rename button / reorder
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  const storeId = await getStoreId();
  const existing = await prisma.quickProduct.findFirst({ where: { id, product: { storeId } } });
  if (!existing) return NextResponse.json({ error: "Кнопка не найдена" }, { status: 404 });
  if (data.groupId) {
    const group = await prisma.quickProductGroup.findFirst({ where: { id: data.groupId, storeId } });
    if (!group) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
  }

  const item = await prisma.quickProduct.update({
    where: { id },
    data: {
      ...(data.groupId !== undefined ? { groupId: data.groupId || null } : {}),
      ...(data.displayName !== undefined ? { displayName: data.displayName?.trim() || null } : {}),
      ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
    },
  });
  return NextResponse.json({ item });
}

// DELETE /api/quick-products/:id — remove the button (the underlying Product is untouched)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.quickProduct.findFirst({ where: { id, product: { storeId } } });
  if (!existing) return NextResponse.json({ error: "Кнопка не найдена" }, { status: 404 });
  await prisma.quickProduct.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
