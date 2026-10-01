import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { createHubToken } from "@/lib/hub-auth";
import { prisma } from "@/lib/db";
import { buildTillPackageBody } from "@/lib/till-package";
import { serializePackage } from "@/lib/till-package-format";

export const dynamic = "force-dynamic";

/** GET /api/till-package — the current market's package for an offline till (plan §12, A2). Office roles only. */
export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !["ADMIN", "MANAGER"].includes(session.user.role ?? "")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storeId = await getStoreId();
  const body = await buildTillPackageBody(storeId);
  if (!body) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  const asked = new URL(req.url).searchParams.get("cashboxId");
  const cashbox = asked ? await prisma.cashbox.findFirst({ where: { id: asked, storeId }, select: { id: true } }) : null;
  // every download gets its own revocable upload key, so one lost package can be cut off without touching the others
  body.deviceToken = await createHubToken(storeId, `Пакет кассы ${body.generatedAt.slice(0, 16).replace("T", " ")} · ${session.user.name}`, cashbox?.id);

  const stamp = body.generatedAt.slice(0, 16).replace(/[-:T]/g, "");
  return new NextResponse(await serializePackage(body), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="korgen-till-${stamp}.kassapack"`,
      "Cache-Control": "no-store",
    },
  });
}
