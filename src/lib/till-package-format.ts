/**
 * The market package: one file that carries everything a till needs to work for one market with no internet at all
 * (plan §12, stage A2). Made by the office (src/lib/till-package.ts), loaded on the till (src/lib/offline/package-import.ts).
 *
 * File = `{ format, version, checksum, body }`. `checksum` is the SHA-256 of `JSON.stringify(body)`: it catches a
 * truncated or damaged copy (a flash drive pulled too early), NOT tampering. The file carries each cashier's PIN hash
 * (a 4-digit PIN can be brute-forced from it), so it is handed only to ADMIN/MANAGER and should be treated like a key. This file is isomorphic: it runs on the server and in the till's browser.
 */

import type { LocalProduct } from "@/lib/offline/catalog";

export const PACKAGE_FORMAT = "korgen-till-package";
export const PACKAGE_VERSION = 1;

export interface PackageCashier {
  id: string;
  name: string;
  role: string;
  /** the employee's kiosk PIN as the server stores it (scrypt "salt:hash", src/lib/pin.ts); null = no PIN, cannot sign in offline */
  pin?: string | null;
}

export interface TillPackageBody {
  generatedAt: string;
  store: { id: string; name: string };
  settings: Record<string, unknown>;
  promotions: unknown[];
  quickGroups: unknown[];
  quickItems: unknown[];
  cashiers: PackageCashier[];
  products: LocalProduct[];
  /** store-scoped Bearer token the offline till uploads with (made per download, revocable); see offline/device-token.ts */
  deviceToken?: string;
}

export interface TillPackageFile {
  format: typeof PACKAGE_FORMAT;
  version: number;
  checksum: string;
  body: TillPackageBody;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Serialise a package. The body text is exactly what the checksum covers. */
export async function serializePackage(body: TillPackageBody): Promise<string> {
  const bodyText = JSON.stringify(body);
  const checksum = await sha256Hex(bodyText);
  return `{"format":"${PACKAGE_FORMAT}","version":${PACKAGE_VERSION},"checksum":"${checksum}","body":${bodyText}}`;
}

export type ParseResult = { ok: true; pkg: TillPackageFile } | { ok: false; reason: "not-json" | "not-a-package" | "newer-version" | "damaged" };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export async function parsePackage(text: string): Promise<ParseResult> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not-json" };
  }
  if (!isObj(raw) || raw.format !== PACKAGE_FORMAT || typeof raw.version !== "number" || typeof raw.checksum !== "string" || !isObj(raw.body)) {
    return { ok: false, reason: "not-a-package" };
  }
  if (raw.version > PACKAGE_VERSION) return { ok: false, reason: "newer-version" };

  const b = raw.body;
  const shapeOk =
    typeof b.generatedAt === "string" &&
    isObj(b.store) && typeof b.store.id === "string" && typeof b.store.name === "string" &&
    isObj(b.settings) &&
    Array.isArray(b.promotions) && Array.isArray(b.quickGroups) && Array.isArray(b.quickItems) &&
    Array.isArray(b.cashiers) && Array.isArray(b.products);
  if (!shapeOk) return { ok: false, reason: "damaged" };

  if ((await sha256Hex(JSON.stringify(b))) !== raw.checksum) return { ok: false, reason: "damaged" };
  return { ok: true, pkg: raw as unknown as TillPackageFile };
}
