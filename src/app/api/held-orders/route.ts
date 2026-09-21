import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeId = await getStoreId();
  const orders = await prisma.heldOrder.findMany({
    where: { storeId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(orders);
}

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const storeId = await getStoreId();
  const order = await prisma.heldOrder.create({
    data: {
      storeId,
      label: body.label ?? null,
      cartSnapshot: body.cartSnapshot,
    },
  });
  return NextResponse.json(order, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await req.json();
  const storeId = await getStoreId();
  const existing = await prisma.heldOrder.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.heldOrder.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
