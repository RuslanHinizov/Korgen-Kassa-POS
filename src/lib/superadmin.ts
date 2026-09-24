import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/** The platform owner only — the account allowed to create, suspend and delete markets. */
export async function requireSuperAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "SUPERADMIN") return null;
  return session;
}
