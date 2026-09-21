import { headers } from "next/headers";
import { randomInt } from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Администратор",
  MANAGER: "Менеджер",
  CASHIER: "Кассир",
  WAREHOUSE: "Складской работник",
};
export const ROLES = ["ADMIN", "MANAGER", "CASHIER", "WAREHOUSE"] as const;

/** Employees are managed by administrators only. */
export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || session.user.role !== "ADMIN") return null;
  return session;
}

/** Unique 10-digit number for the printable cashier barcode. */
export async function newCashierCode(): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const code = String(randomInt(1_000_000_000, 9_999_999_999));
    if (!(await prisma.user.findUnique({ where: { cashierCode: code }, select: { id: true } }))) return code;
  }
  throw new Error("Не удалось создать код кассира");
}
