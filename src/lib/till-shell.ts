/**
 * What "Выйти", "ВЫХОД ИЗ ПРОГРАММЫ" and "СВЕРНУТЬ" mean on the two kinds of till: the browser register (/pos, a server
 * session) and the till program (/till, no server session, wrapped by the Electron program in till-app/ which offers
 * `window.korgenShell`). On the program none of them may go to the server: it may not be reachable.
 */

import { signOut } from "@/lib/auth-client";
import { clearTillAuth } from "@/lib/offline/auth";

interface KorgenShell {
  minimize: () => void;
  quit: () => void;
  info: () => Promise<{ version: string; serverUrl: string }>;
  checkForUpdate?: () => Promise<UpdateStatus>;
  updateStatus?: () => Promise<UpdateStatus>;
  installUpdate?: () => void;
}

export interface UpdateStatus {
  state: "idle" | "none" | "downloading" | "ready" | "error";
  version: string | null;
  message: string | null;
}

function shell(): KorgenShell | undefined {
  return typeof window === "undefined" ? undefined : (window as unknown as { korgenShell?: KorgenShell }).korgenShell;
}

export function onTillProgram(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/till");
}

/** «Выйти»: this cashier leaves; the next one signs in. */
export async function leaveCashier(): Promise<void> {
  if (onTillProgram()) {
    await clearTillAuth();
    window.location.href = "/till"; // back to the PIN screen, served from the program itself
    return;
  }
  await signOut();
  window.location.href = "/kasa-giris";
}

/** «ВЫХОД ИЗ ПРОГРАММЫ»: close the program (a browser register just signs the cashier out). */
export async function exitProgram(): Promise<void> {
  const s = shell();
  if (s) {
    s.quit();
    return;
  }
  await leaveCashier();
}

/** «СВЕРНУТЬ»: minimise the program window; in a browser, toggle full screen instead. */
export function collapseWindow(): void {
  const s = shell();
  if (s) {
    s.minimize();
    return;
  }
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

/**
 * «ПРОВЕРИТЬ ОБНОВЛЕНИЕ» on the till program: ask the program to look for a newer version now and wait (up to a minute)
 * for a download in progress. Returns null on a browser register, which has nothing to update (the page just reloads).
 */
export async function checkForProgramUpdate(): Promise<UpdateStatus | null> {
  const s = shell();
  if (!s?.checkForUpdate || !s.updateStatus) return null;
  let status = await s.checkForUpdate();
  for (let i = 0; i < 30 && status.state === "downloading"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    status = await s.updateStatus();
  }
  return status;
}

/** Restart the program into the downloaded version (the caller asks the cashier first). */
export function installProgramUpdate(): void {
  shell()?.installUpdate?.();
}
