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

/** "+7 (776) 422-33-44" — masks whatever is typed or pasted; the "+7" prefix can never be erased. */
export function formatPhoneInput(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  // Our own prefix, or a pasted "8…"/"7…" full number, carries a leading country digit.
  if (raw.trim().startsWith("+7") || (digits.length >= 11 && (digits[0] === "7" || digits[0] === "8"))) digits = digits.slice(1);
  digits = digits.slice(0, 10);
  let out = "+7";
  if (digits.length > 0) out += ` (${digits.slice(0, 3)}`;
  if (digits.length > 3) out += `) ${digits.slice(3, 6)}`;
  if (digits.length > 6) out += `-${digits.slice(6, 8)}`;
  if (digits.length > 8) out += `-${digits.slice(8, 10)}`;
  return out;
}

/** Display form of a stored number (+77759897660 → +7 (775) 989-76-60); other formats pass through. */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.startsWith("+7") && phone.replace(/\D/g, "").length === 11 ? formatPhoneInput(phone) : phone;
}
