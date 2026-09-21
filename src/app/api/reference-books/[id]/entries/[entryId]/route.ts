import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// DELETE /api/reference-books/:id/entries/:entryId — "✕" on a value row
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; entryId: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id, entryId } = await params;
  const storeId = await getStoreId();
  const book = await prisma.referenceBook.findFirst({ where: { id, storeId } });
  if (!book) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  const entry = await prisma.referenceBookEntry.findFirst({ where: { id: entryId, referenceBookId: id } });
  if (!entry) return NextResponse.json({ error: "Не найдено" }, { status: 404 });

  await prisma.referenceBookEntry.delete({ where: { id: entryId } });
  return NextResponse.json({ success: true });
}
