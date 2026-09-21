import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const MODULE_VALUES = ["SALE", "RETURN"] as const;

// GET /api/reference-books/:id — full record with entries
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();

  const book = await prisma.referenceBook.findFirst({
    where: { id, storeId },
    include: { entries: { orderBy: { createdAt: "asc" } } },
  });
  if (!book) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json({ referenceBook: book });
}

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  modules: z.array(z.enum(MODULE_VALUES)).min(1).optional(),
});

// PATCH /api/reference-books/:id — rename / change modules
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const existing = await prisma.referenceBook.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  if (parsed.data.name && parsed.data.name.toLowerCase() !== existing.name.toLowerCase()) {
    const clash = await prisma.referenceBook.findFirst({ where: { storeId, id: { not: id }, name: { equals: parsed.data.name, mode: "insensitive" } } });
    if (clash) return NextResponse.json({ error: "Справочник с таким названием уже существует" }, { status: 409 });
  }

  const book = await prisma.referenceBook.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.modules !== undefined ? { modules: parsed.data.modules } : {}),
    },
  });
  return NextResponse.json({ referenceBook: book });
}

// DELETE /api/reference-books/:id
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const storeId = await getStoreId();
  const existing = await prisma.referenceBook.findFirst({ where: { id, storeId } });
  if (!existing) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await prisma.referenceBook.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
