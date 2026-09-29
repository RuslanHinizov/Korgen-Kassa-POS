// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from "vitest";
import { getDeviceSettings, saveDeviceSettings } from "./use-device-settings";

describe("getDeviceSettings", () => {
  beforeEach(() => localStorage.clear());

  it("returns the same object on repeated reads (useSyncExternalStore needs a stable snapshot)", () => {
    saveDeviceSettings({ soundOnSale: true });
    expect(getDeviceSettings()).toBe(getDeviceSettings());
  });

  it("returns a new value after the stored settings change", () => {
    saveDeviceSettings({ soundOnSale: true });
    const before = getDeviceSettings();
    saveDeviceSettings({ soundOnSale: false });
    expect(getDeviceSettings()).not.toBe(before);
    expect(getDeviceSettings().soundOnSale).toBe(false);
  });
});
