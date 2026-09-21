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
  if (!session) return null;
  const role = session.user.role ?? "";
  // Administrators and managers act from the admin panel (refunds, manager approval) without a kassa login.
  if (role === "ADMIN" || role === "MANAGER") return { userId: session.user.id, role };
  if (!(await hasKioskAccess())) return null;
  return { userId: session.user.id, role };
}
