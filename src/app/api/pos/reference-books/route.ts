import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

// GET /api/pos/reference-books?module=SALE|RETURN — the books (with entries) the kassa must ask about.
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const mod = req.nextUrl.searchParams.get("module");
  if (mod !== "SALE" && mod !== "RETURN") return NextResponse.json({ error: "Некорректный модуль" }, { status: 400 });

  const storeId = await getStoreId();
  const books = await prisma.referenceBook.findMany({
    where: { storeId, modules: { has: mod } },
    orderBy: { createdAt: "asc" },
    include: { entries: { orderBy: { createdAt: "asc" }, select: { id: true, name: true } } },
  });
  return NextResponse.json({ books: books.filter((b) => b.entries.length > 0).map((b) => ({ id: b.id, name: b.name, entries: b.entries })) });
}
