import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  quantity: z.number().positive().optional(),
  reason: z.enum(["DAMAGED", "EXPIRED", "KITCHEN", "OTHER"]).optional(),
  note: z.string().max(500).optional().nullable(),
});

async function requireDraft(writeOffId: string, storeId: string) {
  const writeOff = await prisma.writeOff.findFirst({ where: { id: writeOffId, storeId }, select: { status: true } });
  if (!writeOff) return { error: NextResponse.json({ error: "Документ не найден" }, { status: 404 }) };
  if (writeOff.status === "POSTED") return { error: NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 }) };
  return { error: null };
}

async function recomputeTotal(writeOffId: string) {
  const items = await prisma.writeOffItem.findMany({ where: { writeOffId }, select: { quantity: true, unitCost: true } });
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost ?? 0), 0);
  await prisma.writeOff.update({ where: { id: writeOffId }, data: { totalCost: total } });
}

// PATCH /api/write-offs/:id/items/:itemId — edit a line (qty/reason/note)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: writeOffId, itemId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { error } = await requireDraft(writeOffId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.writeOffItem.findFirst({ where: { id: itemId, writeOffId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  const item = await prisma.writeOffItem.update({
    where: { id: itemId },
    data: {
      ...(parsed.data.quantity !== undefined ? { quantity: parsed.data.quantity } : {}),
      ...(parsed.data.reason !== undefined ? { reason: parsed.data.reason } : {}),
      ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
    },
  });
  await recomputeTotal(writeOffId);
  return NextResponse.json({ item });
}

// DELETE /api/write-offs/:id/items/:itemId
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: writeOffId, itemId } = await params;
  const { error } = await requireDraft(writeOffId, await getStoreId());
  if (error) return error;

  const existingItem = await prisma.writeOffItem.findFirst({ where: { id: itemId, writeOffId } });
  if (!existingItem) return NextResponse.json({ error: "Строка не найдена" }, { status: 404 });

  await prisma.writeOffItem.delete({ where: { id: itemId } });
  await recomputeTotal(writeOffId);
  return NextResponse.json({ success: true });
}
