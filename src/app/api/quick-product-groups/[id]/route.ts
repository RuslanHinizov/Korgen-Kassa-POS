import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
});

async function requirePrivileged() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) return null;
  return session;
}

// PATCH /api/quick-product-groups/:id — rename / reorder
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = updateSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const data = parsed.data;
  const storeId = await getStoreId();
  const existing = await prisma.quickProductGroup.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
  try {
    const group = await prisma.quickProductGroup.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
    });
    return NextResponse.json({ group });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Группа с таким названием уже есть" }, { status: 409 });
    }
    throw e;
  }
}

// DELETE /api/quick-product-groups/:id — items fall back to ungrouped (groupId NULL)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requirePrivileged())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.quickProductGroup.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Группа не найдена" }, { status: 404 });
  await prisma.$transaction([
    prisma.quickProduct.updateMany({ where: { groupId: id }, data: { groupId: null } }),
    prisma.quickProductGroup.delete({ where: { id } }),
  ]);
  return NextResponse.json({ success: true });
}
