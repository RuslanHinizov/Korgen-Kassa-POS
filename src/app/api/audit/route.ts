import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { serialize } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const action = req.nextUrl.searchParams.get("action") || undefined;
  const take = Math.min(200, Number(req.nextUrl.searchParams.get("take") || 100));
  const cursor = req.nextUrl.searchParams.get("cursor") || undefined;

  const storeId = await getStoreId();
  const logs = await prisma.auditLog.findMany({
    where: { storeId, ...(action ? { action } : {}) },
    orderBy: { createdAt: "desc" },
    take: take + 1,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    include: { user: { select: { name: true, email: true } } },
  });

  const hasMore = logs.length > take;
  const page = hasMore ? logs.slice(0, take) : logs;

  return NextResponse.json({
    logs: serialize(page),
    nextCursor: hasMore ? page[page.length - 1].id : null,
  });
}
