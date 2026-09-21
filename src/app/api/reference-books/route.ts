import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

const MAX_REFERENCE_BOOKS = 3;
const MODULE_VALUES = ["SALE", "RETURN"] as const;

// GET /api/reference-books — list, with entry counts
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const storeId = await getStoreId();
  const books = await prisma.referenceBook.findMany({
    where: { storeId },
    orderBy: { createdAt: "asc" },
    include: { _count: { select: { entries: true } } },
  });
  return NextResponse.json({
    referenceBooks: books.map((b) => ({ id: b.id, name: b.name, modules: b.modules, entryCount: b._count.entries })),
  });
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  modules: z.array(z.enum(MODULE_VALUES)).min(1),
});

// POST /api/reference-books — "+ Справочник"
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();

  const count = await prisma.referenceBook.count({ where: { storeId } });
  if (count >= MAX_REFERENCE_BOOKS) {
    return NextResponse.json({ error: "Вы можете создавать не более трех справочников" }, { status: 400 });
  }

  const existing = await prisma.referenceBook.findFirst({ where: { storeId, name: { equals: parsed.data.name, mode: "insensitive" } } });
  if (existing) return NextResponse.json({ error: "Справочник с таким названием уже существует" }, { status: 409 });

  const book = await prisma.referenceBook.create({
    data: { storeId, name: parsed.data.name, modules: parsed.data.modules },
  });
  return NextResponse.json({ referenceBook: book }, { status: 201 });
}
