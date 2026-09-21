"use client";

import { useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { pluginRegistry, PluginManifest } from "@/lib/plugins";
import { Puzzle, Power } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "olgax_plugin_enabled_map";

function loadEnabledMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveEnabledMap(map: Record<string, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  listeners.forEach((l) => l());
}

function getSnapshot(): PluginManifest[] {
  return pluginRegistry.getPlugins();
}

export function PluginsPanel() {
  const t = useTranslations("settings.plugins");
  const plugins = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Apply persisted enabled-state overrides to the registry once on mount —
  // a mutation of the registry singleton, not component state.
  useEffect(() => {
    const stored = loadEnabledMap();
    for (const p of pluginRegistry.getPlugins()) {
      if (stored[p.id] !== undefined) pluginRegistry.setEnabled(p.id, stored[p.id]);
    }
    notify();
  }, []);

  function toggle(id: string) {
    const next = !pluginRegistry.getPlugins().find((p) => p.id === id)?.enabled;
    pluginRegistry.setEnabled(id, next);
    saveEnabledMap({ ...loadEnabledMap(), [id]: next });
    notify();
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-base font-semibold flex items-center gap-2">
          <Puzzle className="h-4 w-4" />
          {t("title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("subtitle")}
        </p>
      </div>

      {plugins.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Puzzle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          {t("none")}
        </div>
      ) : (
        <div className="rounded-lg border divide-y overflow-hidden">
          {plugins.map((p) => (
            <div key={p.id} className="flex items-start justify-between gap-4 px-4 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{p.name}</span>
                  <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                    v{p.version}
                  </span>
                  {p.author && (
                    <span className="text-[10px] text-muted-foreground">{t("by", { author: p.author })}</span>
                  )}
                </div>
                {p.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                )}
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {p.hooks.map((h) => (
                    <span
                      key={h}
                      className="text-[10px] bg-primary/10 text-primary rounded px-1.5 py-0.5 font-mono"
                    >
                      {h}
                    </span>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggle(p.id)}
                className={cn(
                  "flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                  p.enabled
                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                )}
                aria-label={p.enabled ? t("disable") : t("enable")}
              >
                <Power className="h-3 w-3" />
                {p.enabled ? t("enabled") : t("disabled")}
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
