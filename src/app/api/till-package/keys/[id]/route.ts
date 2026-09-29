import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getStoreId } from "@/lib/store-context";
import { logAudit } from "@/lib/audit";

/** DELETE /api/till-package/keys/:id — revoke one key (a lost flash drive). Tills using it stop uploading at once. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const storeId = await getStoreId();
  const key = await prisma.hubToken.findFirst({ where: { id, storeId, revokedAt: null } });
  if (!key) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.hubToken.update({ where: { id }, data: { revokedAt: new Date() } });
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "HubToken", entityId: id, details: { revokedTillKey: key.label } }).catch(() => {});
  return NextResponse.json({ ok: true });
}
