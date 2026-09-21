import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  parentId: z.string().optional().nullable(),
  sortOrder: z.number().int().optional(),
  imageUrl: z.string().optional().nullable(),
});

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return null;
  return session;
}

// PATCH /api/categories/:id — rename / move / reorder / image; keeps Product.category (name) in sync
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const storeId = await getStoreId();
  const existing = await prisma.category.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  if (data.parentId) {
    const parent = await prisma.category.findFirst({ where: { id: data.parentId, storeId } });
    if (!parent) return NextResponse.json({ error: "Родительская категория не найдена" }, { status: 404 });
  }
  try {
    const category = await prisma.$transaction(async (tx) => {
      const updated = await tx.category.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name.trim() } : {}),
          ...(data.parentId !== undefined ? { parentId: data.parentId || null } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl || null } : {}),
        },
      });
      if (data.name !== undefined) {
        await tx.product.updateMany({ where: { categoryId: id, storeId }, data: { category: updated.name } });
      }
      return updated;
    });
    return NextResponse.json({ category });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Категория с таким названием уже существует" }, { status: 409 });
    }
    throw e;
  }
}

// DELETE /api/categories/:id — products fall back to uncategorised (categoryId NULL, category NULL)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.category.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Категория не найдена" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    await tx.product.updateMany({ where: { categoryId: id, storeId }, data: { categoryId: null, category: null } });
    await tx.category.updateMany({ where: { parentId: id, storeId }, data: { parentId: null } });
    await tx.category.delete({ where: { id } });
  });
  return NextResponse.json({ success: true });
}
