// @vitest-environment jsdom
/** «ПРОВЕРИТЬ ОБНОВЛЕНИЕ»: on the till program it asks the program (and waits for a download); on a browser it does nothing. */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/offline/auth", () => ({ clearTillAuth: vi.fn() }));
vi.mock("@/lib/auth-client", () => ({ signOut: vi.fn() }));

import { checkForProgramUpdate, installProgramUpdate } from "@/lib/till-shell";

const setShell = (s: unknown) => ((window as unknown as { korgenShell?: unknown }).korgenShell = s);

beforeEach(() => {
  vi.useFakeTimers();
  delete (window as unknown as { korgenShell?: unknown }).korgenShell;
});
afterEach(() => vi.useRealTimers());

describe("checkForProgramUpdate", () => {
  it("is null on a browser register (nothing to update there)", async () => {
    expect(await checkForProgramUpdate()).toBeNull();
  });

  it("returns the answer straight away when there is nothing newer", async () => {
    setShell({ checkForUpdate: vi.fn(async () => ({ state: "none", version: null, message: null })), updateStatus: vi.fn() });
    expect((await checkForProgramUpdate())?.state).toBe("none");
  });

  it("waits while a new version downloads, then reports it ready", async () => {
    const updateStatus = vi.fn()
      .mockResolvedValueOnce({ state: "downloading", version: "1.2.0", message: null })
      .mockResolvedValueOnce({ state: "ready", version: "1.2.0", message: null });
    setShell({ checkForUpdate: vi.fn(async () => ({ state: "downloading", version: "1.2.0", message: null })), updateStatus });
    const pending = checkForProgramUpdate();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await pending).toEqual({ state: "ready", version: "1.2.0", message: null });
  });

  it("gives up after about a minute of downloading", async () => {
    setShell({ checkForUpdate: vi.fn(async () => ({ state: "downloading", version: "1.2.0", message: null })), updateStatus: vi.fn(async () => ({ state: "downloading", version: "1.2.0", message: null })) });
    const pending = checkForProgramUpdate();
    await vi.advanceTimersByTimeAsync(70_000);
    expect((await pending)?.state).toBe("downloading");
  });
});

describe("installProgramUpdate", () => {
  it("asks the program to restart into the new version", () => {
    const installUpdate = vi.fn();
    setShell({ installUpdate });
    installProgramUpdate();
    expect(installUpdate).toHaveBeenCalled();
  });
  it("does nothing on a browser", () => {
    expect(() => installProgramUpdate()).not.toThrow();
  });
});
