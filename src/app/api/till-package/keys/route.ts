import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";

export const dynamic = "force-dynamic";

/** GET /api/till-package/keys — the upload keys issued with market packages (and Hub keys) that are still valid. Office roles only. */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const keys = await prisma.hubToken.findMany({
    where: { storeId: await getStoreId(), revokedAt: null },
    orderBy: { createdAt: "desc" },
    select: { id: true, label: true, createdAt: true, lastSeenAt: true },
  });
  return NextResponse.json({ keys });
}
