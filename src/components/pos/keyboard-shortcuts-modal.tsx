"use client";

import { useTranslations } from "next-intl";
import { X, Keyboard } from "lucide-react";

interface KeyboardShortcutsModalProps {
  onClose: () => void;
}

export function KeyboardShortcutsModal({ onClose }: KeyboardShortcutsModalProps) {
  const t = useTranslations("pos.shortcuts");
  const SHORTCUTS = [
    { key: "/ or F2", description: t("focus_search") },
    { key: "F4", description: t("open_held") },
    { key: "F8", description: t("open_payment") },
    { key: "Enter", description: t("add_first") },
    { key: "Escape", description: t("close_modal") },
    { key: "?", description: t("show_cheatsheet") },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-xl border bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div className="flex items-center gap-2">
            <Keyboard className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">{t("title")}</h2>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-5">
          <table className="w-full text-sm">
            <tbody className="divide-y">
              {SHORTCUTS.map(({ key, description }) => (
                <tr key={key} className="py-2">
                  <td className="py-2.5 pr-4">
                    <kbd className="inline-flex items-center rounded border bg-muted px-2 py-0.5 text-xs font-mono font-medium">
                      {key}
                    </kbd>
                  </td>
                  <td className="py-2.5 text-muted-foreground">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-4 text-[11px] text-muted-foreground text-center">
            {t("toggle_hint")}
          </p>
        </div>
      </div>
    </div>
  );
}
