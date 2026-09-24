/**
 * Phone numbers are the login identity. Every spelling of the same number
 * ("8 775 989-76-60", "+7 (775) 989 76 60", "7759897660") maps to one canonical form.
 * Kazakhstan/Russia (+7) is the default; anything else is kept as +<digits>.
 */
export function normalizePhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  if (digits.length === 10) return `+7${digits}`;
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8")) return `+7${digits.slice(1)}`;
  return `+${digits}`;
}

/** Internal Better Auth login id for people who have no real e-mail (never shown, never mailed). */
export function syntheticEmail(phone: string): string {
  return `p${phone.replace(/\D/g, "")}@phone.korgen`;
}

export function isSyntheticEmail(email: string | null | undefined): boolean {
  return !!email && email.endsWith("@phone.korgen");
}
