import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/product-characteristics — reusable characteristic names + their known values,
// used by the Артикул create/edit form's "choose from list or add new" fields.
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const characteristics = await prisma.productCharacteristic.findMany({
    where: { storeId: await getStoreId() },
    orderBy: { name: "asc" },
    include: { values: { orderBy: { value: "asc" } } },
  });
  return NextResponse.json({
    characteristics: characteristics.map((c) => ({
      id: c.id,
      name: c.name,
      values: c.values.map((v) => ({ id: v.id, value: v.value })),
    })),
  });
}

const createSchema = z.object({ name: z.string().trim().min(1).max(60) });

// POST /api/product-characteristics — find-or-create by name (e.g. "Цвет", "Размер")
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Некорректное название" }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.productCharacteristic.findUnique({ where: { storeId_name: { storeId, name: parsed.data.name } } });
  if (existing) return NextResponse.json({ characteristic: { id: existing.id, name: existing.name, values: [] } });

  const created = await prisma.productCharacteristic.create({ data: { storeId, name: parsed.data.name } });
  return NextResponse.json({ characteristic: { id: created.id, name: created.name, values: [] } }, { status: 201 });
}
