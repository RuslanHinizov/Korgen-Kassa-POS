import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { createActivationCode } from "@/lib/till-activation";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** POST /api/till-package/activation — a fresh one-time activation code for a new till. Office roles only. */
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { code, expiresAt } = await createActivationCode(await getStoreId(), session.user.id);
  await logAudit({ userId: session.user.id, action: "SETTINGS_UPDATE", entityType: "ActivationCode", details: { activationCodeCreated: true } }).catch(() => {});
  return NextResponse.json({ code, expiresAt });
}
