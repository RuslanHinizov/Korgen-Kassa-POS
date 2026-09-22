import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({
  productId: z.string().min(1),
  quantity: z.number().positive(),
  reason: z.enum(["DAMAGED", "EXPIRED", "KITCHEN", "OTHER"]).default("OTHER"),
  note: z.string().max(500).optional(),
});

// POST /api/write-offs/:id/items — add a line to a still-draft document
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id: writeOffId } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const writeOff = await prisma.writeOff.findFirst({ where: { id: writeOffId, storeId }, select: { status: true } });
  if (!writeOff) return NextResponse.json({ error: "Документ не найден" }, { status: 404 });
  if (writeOff.status === "POSTED") return NextResponse.json({ error: "Проведённый документ нельзя изменить" }, { status: 409 });
  const product = await prisma.product.findFirst({ where: { id: parsed.data.productId, storeId, deletedAt: null }, select: { cost: true, price: true } });
  if (!product) return NextResponse.json({ error: "Товар не найден" }, { status: 404 });

  const settings = await prisma.businessSettings.findUnique({ where: { storeId }, select: { mergeSameProducts: true } });
  const shouldMerge = settings?.mergeSameProducts !== false;
  const existing = shouldMerge
    ? await prisma.writeOffItem.findFirst({ where: { writeOffId, productId: parsed.data.productId, reason: parsed.data.reason } })
    : null;

  const item = existing
    ? await prisma.writeOffItem.update({ where: { id: existing.id }, data: { quantity: Number(existing.quantity) + parsed.data.quantity } })
    : await prisma.writeOffItem.create({
        data: {
          writeOffId,
          productId: parsed.data.productId,
          quantity: parsed.data.quantity,
          reason: parsed.data.reason,
          note: parsed.data.note,
          unitCost: product.cost ?? product.price,
        },
      });
  await recomputeTotal(writeOffId);
  return NextResponse.json({ item }, { status: 201 });
}

async function recomputeTotal(writeOffId: string) {
  const items = await prisma.writeOffItem.findMany({ where: { writeOffId }, select: { quantity: true, unitCost: true } });
  const total = items.reduce((s, i) => s + Number(i.quantity) * Number(i.unitCost ?? 0), 0);
  await prisma.writeOff.update({ where: { id: writeOffId }, data: { totalCost: total } });
}
