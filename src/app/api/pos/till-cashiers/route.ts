import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getStoreId } from "@/lib/store-context";
import { listPackageCashiers } from "@/lib/till-package";

export const dynamic = "force-dynamic";

/**
 * GET /api/pos/till-cashiers — the current staff list with PIN hashes, for an offline till program to refresh its copy
 * when it is online (new employee, changed PIN, someone fired). Only a device-token session (src/lib/device-access.ts):
 * a cashier's own browser session never receives other people's PIN hashes.
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !session.session.id.startsWith("device:")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ cashiers: await listPackageCashiers(await getStoreId()) });
}
