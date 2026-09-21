import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { z } from "zod";

// GET /api/finance/expense-types?activeOnly=1 — Управление → Типы расходов,
// and the lookup used by Расход's "Назначение платежа" dropdown (activeOnly=1).
export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();

  const activeOnly = req.nextUrl.searchParams.get("activeOnly") === "1";
  const expenseTypes = await prisma.expenseType.findMany({
    where: { storeId, ...(activeOnly ? { active: true } : {}) },
    orderBy: { sortOrder: "asc" },
  });
  return NextResponse.json({ expenseTypes });
}

const patchSchema = z.object({
  updates: z.array(z.object({ id: z.string(), active: z.boolean() })),
});

// PATCH /api/finance/expense-types — bulk-save Активно toggles (manageable rows only)
export async function PATCH(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const storeId = await getStoreId();

  await prisma.$transaction(
    parsed.data.updates.map((u) => prisma.expenseType.updateMany({ where: { id: u.id, storeId, manageable: true }, data: { active: u.active } }))
  );
  return NextResponse.json({ ok: true });
}
