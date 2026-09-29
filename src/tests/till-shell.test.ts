// @vitest-environment jsdom
/** On the till program nothing may go to the server: Выйти returns to the PIN screen, ВЫХОД closes the program, СВЕРНУТЬ minimises. */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { clearTillAuth, signOut } = vi.hoisted(() => ({
  clearTillAuth: vi.fn(async () => undefined),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("@/lib/offline/auth", () => ({ clearTillAuth }));
vi.mock("@/lib/auth-client", () => ({ signOut }));

import { leaveCashier, exitProgram, collapseWindow, onTillProgram } from "@/lib/till-shell";

const at = (pathname: string) => Object.defineProperty(window, "location", { value: { pathname, href: "" }, writable: true, configurable: true });
const shell = { minimize: vi.fn(), quit: vi.fn(), info: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  delete (window as unknown as { korgenShell?: unknown }).korgenShell;
});

describe("on the till program (/till)", () => {
  it("Выйти forgets the cashier and goes back to the PIN screen, without calling the server", async () => {
    at("/till");
    expect(onTillProgram()).toBe(true);
    await leaveCashier();
    expect(clearTillAuth).toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/till");
  });

  it("ВЫХОД ИЗ ПРОГРАММЫ closes the program through the shell", async () => {
    at("/till");
    (window as unknown as { korgenShell: unknown }).korgenShell = shell;
    await exitProgram();
    expect(shell.quit).toHaveBeenCalled();
    expect(signOut).not.toHaveBeenCalled();
  });

  it("СВЕРНУТЬ minimises the program window", () => {
    at("/till");
    (window as unknown as { korgenShell: unknown }).korgenShell = shell;
    collapseWindow();
    expect(shell.minimize).toHaveBeenCalled();
  });
});

describe("on the browser register (/pos)", () => {
  it("Выйти signs the server session out and goes to the cashier login", async () => {
    at("/store/s1/pos");
    await leaveCashier();
    expect(signOut).toHaveBeenCalled();
    expect(clearTillAuth).not.toHaveBeenCalled();
    expect(window.location.href).toBe("/kasa-giris");
  });

  it("ВЫХОД without the program shell behaves like Выйти", async () => {
    at("/store/s1/pos");
    await exitProgram();
    expect(signOut).toHaveBeenCalled();
  });
});
