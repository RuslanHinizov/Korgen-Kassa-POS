"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import {
  cashMovementOfflineAware,
  closeShiftOfflineAware,
  loadCurrentShift,
  openShiftOfflineAware,
  type ShiftInfo,
} from "@/lib/offline/shift";
import { ShiftReportModal } from "./shift-bar";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Report = any;

/**
 * Full-page СМЕНА screen — matches UMAG exactly (docs/kasa-offline-plan.md §6, live-observed
 * 2026-09-27): red/bordo bar, 3 tabs (КУПЮРЫ/СУММА open inline, ВНОС-ВЫНОС opens a dialog on top),
 * a persistent "all fields required" warning, and a fixed СДАТЬ СМЕНУ button. Replaces the old
 * popover-modal ShiftBar for the kiosk screen (that component is still used nowhere else).
 *
 * Not observed live (UMAG login blocked further progress — see plan): the exact close-confirmation/
 * Z-report screen. Korgen's own shift report (below) is used there, per explicit product decision.
 */

const BILL_DENOMINATIONS = [20000, 10000, 5000, 2000, 1000, 500, 200];
const COIN_DENOMINATIONS = [100, 50, 20, 10, 5];
const FIELD_ORDER = [...BILL_DENOMINATIONS, ...COIN_DENOMINATIONS].map((d) => `d${d}`);

type ContentTab = "bills" | "amount";

export function ShiftScreen({ onDone, onShiftChange, cashMovementEnabled = true }: { onDone: () => void; onShiftChange?: () => void; cashMovementEnabled?: boolean }) {
  const [shift, setShift] = useState<ShiftInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrentShift().then(({ shift }) => { setShift(shift); setLoading(false); });
  }, []);

  if (loading) return null;
  if (!shift) return <OpenShiftPrompt onDone={onDone} onOpened={(s) => { setShift(s); onShiftChange?.(); }} />;
  return <ShiftCloseScreen shift={shift} onDone={onDone} onShiftChange={onShiftChange} cashMovementEnabled={cashMovementEnabled} />;
}

/** Not observed live in UMAG (blocked before reaching a shift-less state) — kept simple: one field, one button. */
function OpenShiftPrompt({ onDone, onOpened }: { onDone: () => void; onOpened: (s: ShiftInfo) => void }) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [float, setFloat] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const result = await openShiftOfflineAware(parseFloat(float) || 0, t("err_open"));
      if (!result.ok) throw new Error(result.error);
      const { shift } = await loadCurrentShift();
      if (shift) onOpened(shift);
      else onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_open"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-4 bg-white">
      <div className="w-full max-w-xs space-y-3">
        <p className="text-center text-lg font-semibold text-[#172b1d]">{t("closed")}</p>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("opening_float")}</label>
          <input
            type="number" min={0} step="0.01" autoFocus
            value={float}
            onChange={(e) => setFloat(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <p className="text-xs text-muted-foreground">{t("opening_float_hint")}</p>
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button
          onClick={submit}
          disabled={busy}
          className="w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {busy ? tc("loading") : t("open_shift")}
        </button>
      </div>
    </div>
  );
}

function ShiftCloseScreen({
  shift,
  onDone,
  onShiftChange,
  cashMovementEnabled,
}: {
  shift: ShiftInfo;
  onDone: () => void;
  onShiftChange?: () => void;
  cashMovementEnabled: boolean;
}) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");

  const [tab, setTab] = useState<ContentTab>("bills");
  const [vnosOpen, setVnosOpen] = useState(false);
  const [bills, setBills] = useState<Record<string, string>>(() => Object.fromEntries(FIELD_ORDER.map((id) => [id, "0"])));
  const [amount, setAmount] = useState("0");
  const [focused, setFocused] = useState<string>(FIELD_ORDER[0]);

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [closedOffline, setClosedOffline] = useState(false);
  const [report, setReport] = useState<Report | null>(null);

  const billsTotal = useMemo(
    () => [...BILL_DENOMINATIONS, ...COIN_DENOMINATIONS].reduce((sum, d) => sum + d * (parseFloat(bills[`d${d}`]) || 0), 0),
    [bills]
  );
  const countedCash = tab === "bills" ? billsTotal : parseFloat(amount) || 0;

  function focusedValue(): string {
    return tab === "bills" ? (bills[focused] ?? "0") : amount;
  }
  function setFocusedValue(v: string) {
    if (tab === "bills") setBills((prev) => ({ ...prev, [focused]: v }));
    else setAmount(v);
  }

  function tapDigit(d: string) {
    const cur = focusedValue();
    if (d === ".") {
      if (cur.includes(".")) return;
      setFocusedValue(cur + ".");
      return;
    }
    setFocusedValue(cur === "0" ? d : cur + d);
  }
  function tapDelete() {
    const cur = focusedValue();
    setFocusedValue(cur.length > 1 ? cur.slice(0, -1) : "0");
  }
  function tapPrev() {
    if (tab !== "bills") return;
    const i = FIELD_ORDER.indexOf(focused);
    if (i > 0) setFocused(FIELD_ORDER[i - 1]);
  }
  function tapNext() {
    if (tab !== "bills") return;
    const i = FIELD_ORDER.indexOf(focused);
    if (i < FIELD_ORDER.length - 1) setFocused(FIELD_ORDER[i + 1]);
  }

  async function handOverShift() {
    setBusy(true);
    setErr("");
    try {
      const result = await closeShiftOfflineAware(shift.id, countedCash, undefined, t("err_close"));
      if (!result.ok) throw new Error(result.error);
      if (result.queued) setClosedOffline(true);
      else setReport(result.report as Report);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_close"));
    } finally {
      setBusy(false);
    }
  }

  if (report) {
    return <ShiftReportModal report={report} kind="Z" onClose={onDone} />;
  }
  if (closedOffline) {
    return (
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center gap-3 bg-white text-sm">
        <p className="font-medium" data-testid="shift-closed-offline">Смена закрыта на кассе.</p>
        <p className="max-w-xs text-center text-muted-foreground">Нет связи с сервером. Закрытие и Z-отчёт будут отправлены автоматически, когда появится интернет.</p>
        <button onClick={onDone} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">OK</button>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 flex-col bg-white text-[#172b1d]">
      <div className="shrink-0 bg-[#c0392b]/10 px-4 py-2 text-center text-sm font-bold text-[#c0392b]">
        {t("all_fields_required")}
      </div>

      <div className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 gap-10 overflow-y-auto p-6">
        <div className="flex-1">
          <div className="mb-6 flex gap-2">
            <TabButton active={tab === "bills"} onClick={() => setTab("bills")}>{t("tab_bills")}</TabButton>
            <TabButton active={tab === "amount"} onClick={() => setTab("amount")}>{t("tab_amount")}</TabButton>
            {cashMovementEnabled && <TabButton active={false} onClick={() => setVnosOpen(true)}>{t("tab_cash_movement")}</TabButton>}
          </div>

          {tab === "bills" ? (
            <div className="flex gap-12">
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-500">{t("bills_count")}</p>
                <div className="space-y-2">
                  {BILL_DENOMINATIONS.map((d) => (
                    <DenomField key={d} label={`${d} тг`} value={bills[`d${d}`] ?? "0"} active={focused === `d${d}`} onFocus={() => setFocused(`d${d}`)} />
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold text-slate-500">{t("coins_count")}</p>
                <div className="space-y-2">
                  {COIN_DENOMINATIONS.map((d) => (
                    <DenomField key={d} label={`${d} тг`} value={bills[`d${d}`] ?? "0"} active={focused === `d${d}`} onFocus={() => setFocused(`d${d}`)} />
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="max-w-xs">
              <p className="mb-2 text-sm font-semibold text-slate-500">{t("tab_amount")}</p>
              <input readOnly value={amount} className="w-full rounded-md border px-3 py-2 text-lg tabular-nums" />
            </div>
          )}
        </div>

        <ShiftKeypad onDigit={tapDigit} onDelete={tapDelete} onPrev={tapPrev} onNext={tapNext} navDisabled={tab !== "bills"} />
      </div>

      {tab === "bills" && (
        <div className="shrink-0 border-t px-6 py-2 text-sm text-muted-foreground">
          {t("counted_cash")}: <span className="font-semibold text-[#172b1d] tabular-nums">{formatCurrency(billsTotal)}</span>
        </div>
      )}
      {err && <p className="shrink-0 px-6 pb-2 text-xs text-destructive">{err}</p>}

      <div className="flex shrink-0 justify-end p-4">
        <button
          onClick={handOverShift}
          disabled={busy}
          className="rounded-md bg-[#1abc9c] px-6 py-3 text-sm font-bold text-white hover:bg-[#17a589] disabled:opacity-50 transition-colors"
        >
          {busy ? tc("loading") : t("hand_over_shift")}
        </button>
      </div>

      {vnosOpen && (
        <CashMovementDialog
          onClose={() => setVnosOpen(false)}
          onSaved={() => { setVnosOpen(false); onShiftChange?.(); }}
        />
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-4 py-2 text-sm font-semibold transition-colors",
        active ? "bg-slate-100 text-[#1abc9c] underline decoration-2 underline-offset-4" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      )}
    >
      {children}
    </button>
  );
}

function DenomField({ label, value, active, onFocus }: { label: string; value: string; active: boolean; onFocus: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 text-sm text-slate-600">{label}</span>
      <button
        type="button"
        onClick={onFocus}
        className={cn(
          "w-40 rounded-md border px-3 py-1.5 text-left text-sm tabular-nums",
          active ? "border-[#1abc9c] ring-1 ring-[#1abc9c]" : "border-slate-300"
        )}
      >
        {value}
      </button>
    </div>
  );
}

/** Same layout observed for both КУПЮРЫ and СУММА: 7-8-9/delete, 4-5-6/prev, 1-2-3/next, 0-. */
function ShiftKeypad({
  onDigit,
  onDelete,
  onPrev,
  onNext,
  navDisabled,
}: {
  onDigit: (d: string) => void;
  onDelete: () => void;
  onPrev: () => void;
  onNext: () => void;
  navDisabled: boolean;
}) {
  const tc = useTranslations("common");
  const keyClass = "flex h-16 w-20 items-center justify-center rounded-md bg-slate-100 text-lg font-medium hover:bg-slate-200 active:bg-slate-300 transition-colors";
  const navClass = "flex h-16 w-20 items-center justify-center rounded-md bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-40 transition-colors";
  return (
    <div className="grid shrink-0 grid-cols-4 content-start gap-2 self-start">
      <button className={keyClass} onClick={() => onDigit("7")}>7</button>
      <button className={keyClass} onClick={() => onDigit("8")}>8</button>
      <button className={keyClass} onClick={() => onDigit("9")}>9</button>
      <button className="flex h-16 w-20 items-center justify-center rounded-md bg-[#c0392b] text-xs font-bold text-white hover:bg-[#a5321f] transition-colors" onClick={onDelete} title={tc("delete")}>
        {tc("delete").slice(0, 3).toUpperCase()}.
      </button>
      <button className={keyClass} onClick={() => onDigit("4")}>4</button>
      <button className={keyClass} onClick={() => onDigit("5")}>5</button>
      <button className={keyClass} onClick={() => onDigit("6")}>6</button>
      <button className={navClass} onClick={onPrev} disabled={navDisabled}>&lt;&lt;</button>
      <button className={keyClass} onClick={() => onDigit("1")}>1</button>
      <button className={keyClass} onClick={() => onDigit("2")}>2</button>
      <button className={keyClass} onClick={() => onDigit("3")}>3</button>
      <button className={navClass} onClick={onNext} disabled={navDisabled}>&gt;&gt;</button>
      <button className={keyClass} onClick={() => onDigit("0")}>0</button>
      <button className={keyClass} onClick={() => onDigit(".")}>.</button>
    </div>
  );
}

const MOVEMENT_TYPES = ["DEPOSIT", "EXPENSE", "DIVIDEND"] as const;
/** UMAG's purposes for a Вынос of type Расходы. */
const EXPENSE_KINDS = ["Другое", "Закуп мелочей", "Заработная плата", "Коммунальные расходы", "Инкассация"] as const;

/** UMAG's ВНОС,ВЫНОС СРЕДСТВ dialog: type dropdown (defaults to the first — Вложения), amount, comment. */
function CashMovementDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useTranslations("shift");
  const tc = useTranslations("common");
  const [type, setType] = useState<(typeof MOVEMENT_TYPES)[number]>("DEPOSIT");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [expenseType, setExpenseType] = useState<(typeof EXPENSE_KINDS)[number]>("Другое");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function save() {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setErr(t("err_amount")); return; }
    setBusy(true);
    setErr("");
    try {
      const result = await cashMovementOfflineAware({ type, amount: amt, reason: reason || undefined, ...(type === "EXPENSE" ? { expenseType } : {}) }, t("err_cash"));
      if (!result.ok) throw new Error(result.error);
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : t("err_cash"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-sm rounded-xl border bg-background p-5 shadow-2xl space-y-3">
        <select
          value={type}
          onChange={(e) => setType(e.target.value as (typeof MOVEMENT_TYPES)[number])}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {MOVEMENT_TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(`movement_${tp.toLowerCase()}` as "movement_deposit")}</option>
          ))}
        </select>
        {type === "EXPENSE" && (
          <select
            value={expenseType}
            onChange={(e) => setExpenseType(e.target.value as (typeof EXPENSE_KINDS)[number])}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {EXPENSE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        )}
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("amount")}</label>
          <input
            type="number" min={0} step="0.01" autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">{t("comment")}</label>
          <textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
          />
        </div>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md bg-[#c0392b] py-2 text-sm font-medium text-white hover:bg-[#a5321f] transition-colors">
            {tc("close")}
          </button>
          <button
            onClick={save}
            disabled={busy || !amount}
            className="flex-1 rounded-md bg-[#1abc9c] py-2 text-sm font-medium text-white hover:bg-[#17a589] disabled:opacity-50 transition-colors"
          >
            {busy ? tc("loading") : tc("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
