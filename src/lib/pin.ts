import { scryptSync, randomBytes } from "crypto";

/** Hash a manager PIN with scrypt. Returns "saltHex:hashHex". */
export function hashPin(pin: string): string {
  const salt = randomBytes(12).toString("hex");
  const hash = scryptSync(pin, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPin(pin: string, stored: string | null | undefined): boolean {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  try {
    return scryptSync(pin, salt, 32).toString("hex") === hash;
  } catch {
    return false;
  }
}
