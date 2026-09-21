import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/consultants?activeOnly=1 — list, name ascending
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
  const storeId = await getStoreId();
  const consultants = await prisma.consultant.findMany({
    where: { storeId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ consultants });
}

const createSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional().nullable(),
  photoUrl: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = createSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const storeId = await getStoreId();
  const consultant = await prisma.consultant.create({
    data: { storeId, name: parsed.data.name.trim(), phone: parsed.data.phone?.trim() || null, photoUrl: parsed.data.photoUrl || null },
  });
  return NextResponse.json({ consultant }, { status: 201 });
}
