"use client";

import { useSyncExternalStore } from "react";

export interface DeviceSettings {
  defaultPaymentMethod: "CASH" | "CARD" | "OTHER";
  soundOnSale: boolean;
  scannerBeepEnabled: boolean;
  printerType: "serial" | "usb" | "none";
  /** Send the ESC/POS drawer-kick pulse after a cash sale. */
  openDrawerOnCash: boolean;
}

const STORAGE_KEY = "olgax-pos-device-settings";

const DEFAULTS: DeviceSettings = {
  defaultPaymentMethod: "CASH",
  soundOnSale: false,
  scannerBeepEnabled: true,
  printerType: "serial",
  openDrawerOnCash: false,
};

// useSyncExternalStore compares snapshots by identity: a fresh object on every read is an endless re-render
// (React error #185), so the parsed value is reused until the stored text actually changes.
let cachedRaw: string | null = null;
let cachedSettings: DeviceSettings = DEFAULTS;

export function getDeviceSettings(): DeviceSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    if (raw !== cachedRaw) {
      cachedSettings = { ...DEFAULTS, ...JSON.parse(raw) };
      cachedRaw = raw;
    }
    return cachedSettings;
  } catch {
    return DEFAULTS;
  }
}

export function saveDeviceSettings(settings: Partial<DeviceSettings>): void {
  const current = getDeviceSettings();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...settings }));
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getServerSnapshot(): DeviceSettings {
  return DEFAULTS;
}

export function useDeviceSettings(): [DeviceSettings, (s: Partial<DeviceSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, getDeviceSettings, getServerSnapshot);

  function update(patch: Partial<DeviceSettings>) {
    saveDeviceSettings({ ...settings, ...patch });
    listeners.forEach((l) => l());
  }

  return [settings, update];
}

/** Play a short beep on sale complete (if soundOnSale is enabled). */
export function playSaleSound(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.25);
  } catch {
    // AudioContext not available
  }
}

/** Play a short low-pitched error beep for scanner not-found. */
export function playErrorBeep(): void {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "square";
    osc.frequency.value = 220;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch {
    // AudioContext not available
  }
}
