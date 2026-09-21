import { headers } from "next/headers";
import { auth } from "./auth";
import { hasKioskAccess } from "./kiosk-device";

export interface PosActor {
  userId: string;
  role: string;
}

/** Resolves the authenticated cashier responsible for each POS write. */
export async function resolvePosActor(): Promise<PosActor | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !(await hasKioskAccess())) return null;
  return { userId: session.user.id, role: session.user.role ?? "" };
}
