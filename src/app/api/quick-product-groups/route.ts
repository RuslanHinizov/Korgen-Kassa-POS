import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { getQuickGroups } from "@/lib/till-data";
import { z } from "zod";

const createSchema = z.object({ name: z.string().min(1).max(120) });

// GET /api/quick-product-groups — flat list, ordered, with item counts
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  return NextResponse.json({ groups: await getQuickGroups(storeId) });
}

// POST /api/quick-product-groups — create
export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER", "WAREHOUSE"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const last = await prisma.quickProductGroup.findFirst({ where: { storeId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
  try {
    const group = await prisma.quickProductGroup.create({
      data: { storeId, name: parsed.data.name.trim(), sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json({ group }, { status: 201 });
  } catch (e: unknown) {
    if ((e as { code?: string }).code === "P2002") {
      return NextResponse.json({ error: "Группа с таким названием уже есть" }, { status: 409 });
    }
    throw e;
  }
}
