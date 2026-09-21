import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const schema = z.object({ name: z.string().trim().min(1).max(200) });

// POST /api/reference-books/:id/entries — add a value ("Сохранить" on the entry-name row)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const book = await prisma.referenceBook.findFirst({ where: { id, storeId } });
  if (!book) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const clash = await prisma.referenceBookEntry.findFirst({ where: { referenceBookId: id, name: { equals: parsed.data.name, mode: "insensitive" } } });
  if (clash) return NextResponse.json({ error: "Справки с одинаковыми названиями создавать нельзя" }, { status: 409 });

  const entry = await prisma.referenceBookEntry.create({ data: { referenceBookId: id, name: parsed.data.name } });
  return NextResponse.json({ entry }, { status: 201 });
}
