import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { createActivationCode } from "@/lib/till-activation";
import { logAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** POST /api/till-package/activation — a fresh one-time activation code for a new till. Office roles only. */
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const storeId = await getStoreId();
  // The register this till will be: its sales, cash in/out and refunds land on that register's accounts.
  const asked = (await req.json().catch(() => null))?.cashboxId;
  const cashbox = typeof asked === "string" && asked ? await prisma.cashbox.findFirst({ where: { id: asked, storeId }, select: { id: true } }) : null;
  if (typeof asked === "string" && asked && !cashbox) return NextResponse.json({ error: "Касса не найдена" }, { status: 400 });
  const { code, expiresAt } = await createActivationCode(storeId, session.user.id, cashbox?.id);
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "ActivationCode", details: { activationCodeCreated: true } }).catch(() => {});
  return NextResponse.json({ code, expiresAt });
}
