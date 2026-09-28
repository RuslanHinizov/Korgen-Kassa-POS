"use client";

import { useEffect, useState } from "react";
import { HelpCircle, LogOut } from "lucide-react";
import { CashboxStatus } from "./cashbox-status";
import { APP_VERSION } from "@/lib/app-version";
import { signOut } from "@/lib/auth-client";
import { useOfflineStatus } from "@/lib/offline/use-offline-status";

interface KioskTopBarProps {
  cashierName: string;
  showSalesHistory: boolean;
  onShowShortcuts: () => void;
  /** Opens the cashier's own return screen; it must never leave POS for administration. */
  onShowReturns: () => void;
  /** Opens the cashier's own sales-history screen; it must never leave POS for administration. */
  onShowSalesHistory: () => void;
  /** Opens the full-page СМЕНА screen (docs/kasa-offline-plan.md §6). */
  onShowShift: () => void;
  activeTab: "sales" | "returns" | "history" | "shift";
  onShowSales: () => void;
  hasOpenShift: boolean;
  canReturn?: boolean;
  /** When set, the cashier name becomes clickable — "switch who's working". */
  onSwitchCashier?: () => void;
}

/** Top bar for the kiosk-mode kassa screen, matching UMAG's dedicated kassa header:
 * cashier/time/status on the left, Продажи/Возврат/Смена/История продаж tabs on the right. The bar
 * itself turns red/bordo on the СМЕНА tab, matching UMAG's observed behavior (green everywhere else). */
export function KioskTopBar({
  cashierName,
  showSalesHistory,
  onShowShortcuts,
  onShowReturns,
  onShowSalesHistory,
  onShowShift,
  activeTab,
  onShowSales,
  hasOpenShift,
  canReturn = true,
  onSwitchCashier,
}: KioskTopBarProps) {
  const [now, setNow] = useState(() => new Date());
  const { online } = useOfflineStatus();
  const [printerReady, setPrinterReady] = useState(false);
  const [scannerSeen, setScannerSeen] = useState(false);
  const onShift = activeTab === "shift";

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000 * 30);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const browser = navigator as Navigator & { serial?: { getPorts: () => Promise<unknown[]> }; usb?: { getDevices: () => Promise<unknown[]> } };
    const detectPrinter = async () => {
      try {
        const ports = browser.serial ? await browser.serial.getPorts() : browser.usb ? await browser.usb.getDevices() : [];
        setPrinterReady(ports.length > 0);
      } catch { setPrinterReady(false); }
    };
    void detectPrinter();
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onScan = () => { setScannerSeen(true); if (timer) clearTimeout(timer); timer = setTimeout(() => setScannerSeen(false), 8000); };
    window.addEventListener("pos-scanner-read", onScan);
    return () => { window.removeEventListener("pos-scanner-read", onScan); if (timer) clearTimeout(timer); };
  }, []);

  async function exitCashier() {
    await signOut();
    window.location.href = "/kasa-giris";
  }

  return (
    <div
      className={`flex min-h-10 shrink-0 items-center gap-3 border-b px-3 text-sm font-semibold ${
        onShift ? "border-red-900 bg-[#c0392b] text-white" : "border-emerald-700 bg-[#00bd61] text-[#10281b]"
      }`}
    >
      <span className="hidden text-xs font-bold sm:inline">Учебный</span>
      <span className="font-medium">
        Время:{" "}
        <span className="font-bold">
          {now.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}
        </span>
      </span>
      <span className="font-medium">
        Кассир:{" "}
        {onSwitchCashier ? (
          <button
            onClick={onSwitchCashier}
            className="font-bold underline decoration-dotted underline-offset-2 hover:opacity-80"
          >
            {cashierName}
          </button>
        ) : (
          <span className="font-bold">{cashierName}</span>
        )}
      </span>
      <span className="hidden text-xs font-bold lg:inline">v {APP_VERSION}</span>
      {/* UMAG shows the connection as a dot next to the version: green = connected, red = no connection. */}
      <span
        data-testid="connection-dot"
        title={online ? "Есть связь с сервером" : "Нет связи с сервером — продажи сохраняются на кассе"}
        className={`h-3.5 w-3.5 shrink-0 rounded-full border border-black/30 ${online ? "bg-[#82ec6f]" : "bg-red-600"}`}
      />

      <div className="ml-auto flex items-center gap-1">
        <button type="button" onClick={onShowSales} className={`self-stretch px-3 py-2.5 text-xs font-bold ${activeTab === "sales" ? "bg-white text-[#172b1d]" : "hover:bg-white/15"}`}>
          Продажи
        </button>
        {canReturn && (
          <button
            type="button"
            onClick={onShowReturns}
            className={`self-stretch px-3 py-2.5 text-xs font-bold ${activeTab === "returns" ? "bg-white text-[#172b1d]" : "hover:bg-white/15"}`}
          >
            Возврат
          </button>
        )}
        <button
          type="button"
          onClick={onShowShift}
          className={`self-stretch px-3 py-2.5 text-xs font-bold ${activeTab === "shift" ? "bg-white text-[#172b1d]" : "hover:bg-white/15"}`}
        >
          Смена
        </button>
        {showSalesHistory && (
          <button
            type="button"
            onClick={onShowSalesHistory}
            className={`self-stretch px-3 py-2.5 text-xs font-bold ${activeTab === "history" ? "bg-white text-[#172b1d]" : "hover:bg-white/15"}`}
          >
            История продаж
          </button>
        )}
        <CashboxStatus />
        <DeviceStatus label="Сеть" ok={online} />
        <DeviceStatus label="Принтер" ok={printerReady} offLabel="нет USB" />
        <DeviceStatus label="Сканер" ok={scannerSeen} offLabel="ожидание" />
        <DeviceStatus label="Смена" ok={hasOpenShift} offLabel="закрыта" />
        <button
          onClick={onShowShortcuts}
          className="ml-1 flex h-7 w-7 items-center justify-center text-[#2468a8] hover:bg-white/15"
          aria-label="Помощь"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={() => void exitCashier()}
          className="ml-1 flex h-9 items-center gap-1.5 rounded-md bg-white/90 px-3 text-xs font-bold text-[#9f2636] hover:bg-white"
          aria-label="Выйти из кассы"
        >
          <LogOut className="h-4 w-4" /> Выйти
        </button>
      </div>
    </div>
  );
}

function DeviceStatus({ label, ok, offLabel = "нет" }: { label: string; ok: boolean; offLabel?: string }) {
  return <span title={`${label}: ${ok ? "готов" : offLabel}`} className="hidden items-center gap-1 rounded bg-white/15 px-1.5 py-1 text-[10px] font-bold xl:flex"><i className={`h-2.5 w-2.5 rounded-full ${ok ? "bg-[#82ec6f]" : "bg-red-400"}`} />{label}</span>;
}
