import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/superadmin";

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  address: z.string().trim().max(200).nullable().optional(),
  suspended: z.boolean().optional(),
  message: z.string().trim().max(500).nullable().optional(),
});

// PATCH /api/superadmin/stores/:id — rename, or suspend / resume (its users then see the message)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  const d = parsed.data;
  if (!(await prisma.store.findUnique({ where: { id }, select: { id: true } }))) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });

  const store = await prisma.store.update({
    where: { id },
    data: {
      ...(d.name !== undefined ? { name: d.name } : {}),
      ...(d.address !== undefined ? { address: d.address || null } : {}),
      ...(d.suspended === true ? { suspendedAt: new Date(), suspendedMessage: d.message || null } : {}),
      ...(d.suspended === false ? { suspendedAt: null, suspendedMessage: null } : {}),
    },
  });
  if (d.name !== undefined) await prisma.businessSettings.updateMany({ where: { storeId: id }, data: { name: d.name } });
  return NextResponse.json({ store });
}

// DELETE /api/superadmin/stores/:id { confirmName } — permanent. Only a suspended market, and only by typing its name.
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireSuperAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const store = await prisma.store.findUnique({ where: { id } });
  if (!store) return NextResponse.json({ error: "Магазин не найден" }, { status: 404 });
  if (!store.suspendedAt) return NextResponse.json({ error: "Сначала приостановите магазин" }, { status: 400 });
  if (body?.confirmName !== store.name) return NextResponse.json({ error: "Название введено неверно" }, { status: 400 });

  try {
    await prisma.$transaction(async (tx) => {
      // People who worked only in this market go with it (the platform owner never does).
      const orphans = await tx.user.findMany({
        where: { role: { not: "SUPERADMIN" }, storeAssignments: { some: { storeId: id }, none: { storeId: { not: id } } } },
        select: { id: true },
      });
      await tx.store.delete({ where: { id } });
      if (orphans.length) await tx.user.deleteMany({ where: { id: { in: orphans.map((o) => o.id) } } });
    });
  } catch {
    return NextResponse.json({ error: "В магазине есть история (продажи, накладные) — удалить нельзя. Оставьте его приостановленным." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
