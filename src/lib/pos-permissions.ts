/** Shared interpretation of Управление → Управление кассами access selectors.
 * Keep this tiny module independent from the database so both route handlers and
 * kiosk UI can apply exactly the same ADMIN / ALL / NOBODY rule. */
export type PosAccessRole = "NOBODY" | "ADMIN" | "ALL";

export function canUsePosAction(
  access: PosAccessRole | string | null | undefined,
  role: string | null | undefined
) {
  if (access === "ALL") return true;
  if (access === "ADMIN") return role === "ADMIN" || role === "MANAGER";
  return false;
}
