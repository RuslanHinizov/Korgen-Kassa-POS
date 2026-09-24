import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const createSchema = z.object({ value: z.string().trim().min(1).max(60) });

// POST /api/product-characteristics/:id/values — find-or-create a value (e.g. "S", "Красный")
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректное значение" }, { status: 400 });

  const characteristic = await prisma.productCharacteristic.findFirst({ where: { id, storeId: await getStoreId() } });
  if (!characteristic) return NextResponse.json({ error: "Характеристика не найдена" }, { status: 404 });

  const existing = await prisma.productCharacteristicValue.findUnique({
    where: { characteristicId_value: { characteristicId: id, value: parsed.data.value } },
  });
  if (existing) return NextResponse.json({ value: { id: existing.id, value: existing.value } });

  const created = await prisma.productCharacteristicValue.create({
    data: { characteristicId: id, value: parsed.data.value },
  });
  return NextResponse.json({ value: { id: created.id, value: created.value } }, { status: 201 });
}
