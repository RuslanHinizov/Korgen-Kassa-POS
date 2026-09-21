"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { DEFAULT_STORE_ID } from "@/lib/store-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetupStatus {
  envOk: boolean;
  dbConnected: boolean;
  dbInitialized: boolean;
  hasAdmin: boolean;
  setupComplete: boolean;
  missingEnv: string[];
  dbError?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STEP_KEYS = [
  "welcome",
  "system_check",
  "database",
  "admin_account",
  "business_info",
  "done",
] as const;
const STEP_COUNT = STEP_KEYS.length;

// ─── Small helpers ────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <span className="inline-block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
          ok ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-500"
        }`}
      >
        {ok ? "✓" : "✗"}
      </span>
      <span className={`text-sm ${ok ? "text-gray-700" : "text-red-500"}`}>{label}</span>
    </div>
  );
}

function CopyBlock({ code }: { code: string }) {
  const t = useTranslations("setup");
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative mt-2 rounded-lg bg-gray-900 border border-gray-700">
      <pre className="p-3 pr-16 text-xs text-emerald-400 overflow-x-auto whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute right-2 top-2 px-2 py-1 rounded text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 transition-colors"
      >
        {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}

function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-3 rounded-lg border border-gray-200">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
      >
        <span>{title}</span>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-4 text-sm text-gray-600 border-t border-gray-100">{children}</div>}
    </div>
  );
}

function StepCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-lg rounded-3xl border border-gray-100 bg-white shadow-xl shadow-gray-200/80 overflow-hidden">
      {children}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ step, total }: { step: number; total: number }) {
  const t = useTranslations("setup");
  const pct = Math.round((step / (total - 1)) * 100);
  return (
    <div className="w-full max-w-lg mb-4">
      <div className="flex justify-between text-xs text-gray-400 mb-1">
        <span>
          {t("step_of", { current: step + 1, total })}
        </span>
        <span>{t(`steps.${STEP_KEYS[step]}`)}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-200">
        <div
          className="h-1.5 rounded-full bg-[#22B24C] transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Step 0 — Welcome ─────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  const t = useTranslations("setup.welcome");
  const features = [
    { icon: "📡", text: t("feature_offline") },
    { icon: "🖨️", text: t("feature_receipt") },
    { icon: "👥", text: t("feature_roles") },
    { icon: "📊", text: t("feature_reports") },
    { icon: "🎨", text: t("feature_brand") },
  ];

  return (
    <StepCard>
      <div className="px-8 py-10 text-center">
        <div className="text-5xl mb-4">🏪</div>
        <h1 className="text-2xl font-bold text-[#15503A] mb-2">{t("title")}</h1>
        <p className="text-gray-500 mb-8">
          {t("subtitle")}
        </p>
        <ul className="text-left space-y-3 mb-10">
          {features.map((f) => (
            <li key={f.text} className="flex items-center gap-3 text-sm text-gray-600">
              <span className="text-lg">{f.icon}</span>
              {f.text}
            </li>
          ))}
        </ul>
        <button
          onClick={onNext}
          className="w-full py-3 rounded-xl bg-[#15503A] hover:bg-[#1a6349] text-white font-bold text-sm transition-colors shadow-md shadow-[#15503A]/30"
        >
          {t("get_started")}
        </button>
      </div>
    </StepCard>
  );
}

// ─── Step 1 — System Check ────────────────────────────────────────────────────

function StepSystemCheck({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useTranslations("setup.system_check");
  const ts = useTranslations("setup");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/status");
      const data = await res.json();
      setStatus(data);
    } catch {
      setStatus({
        envOk: false,
        dbConnected: false,
        dbInitialized: false,
        hasAdmin: false,
        setupComplete: false,
        missingEnv: ["DATABASE_URL", "BETTER_AUTH_SECRET"],
        dbError: ts("database.server_unreachable"),
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const missingDbUrl = status?.missingEnv.includes("DATABASE_URL");
  const missingSecret = status?.missingEnv.includes("BETTER_AUTH_SECRET");

  return (
    <StepCard>
      <div className="px-6 pt-8 pb-2">
        <h2 className="text-xl font-bold text-[#15503A] mb-1">{t("title")}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t("subtitle")}
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
            <Spinner /> {t("checking")}
          </div>
        )}

        {!loading && status && (
          <div className="space-y-1">
            <Check
              ok={!missingDbUrl}
              label={missingDbUrl ? t("db_url_missing") : t("db_url_ok")}
            />
            <Check
              ok={!missingSecret}
              label={missingSecret ? t("secret_missing") : t("secret_ok")}
            />
          </div>
        )}

        {!loading && status && !status.envOk && (
          <div className="mt-4 space-y-2">
            <p className="text-xs text-gray-400 uppercase tracking-wider font-semibold">
              {t("how_to_fix")}
            </p>
            <Collapsible title={t("create_env")}>
              <p className="mt-3 mb-2 text-gray-600">
                {t("create_env_body")}
              </p>
              <CopyBlock
                code={`DATABASE_URL="postgresql://olgax:olgax@localhost:5432/olgax_pos"
BETTER_AUTH_SECRET="${Array.from(crypto.getRandomValues(new Uint8Array(32)))
  .map((b) => b.toString(16).padStart(2, "0"))
  .join("")}"`}
              />
              <p className="mt-3 text-gray-400 text-xs">
                {t("create_env_after")}
              </p>
            </Collapsible>

            <Collapsible title={t("start_pg")}>
              <p className="mt-3 mb-2 text-gray-600">
                {t("start_pg_body")}
              </p>
              <CopyBlock code="docker compose up -d postgres" />
              <p className="mt-2 text-gray-600">
                {t("no_docker")}
              </p>
            </Collapsible>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100 mt-4">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          {ts("back")}
        </button>
        <div className="flex gap-2">
          <button
            onClick={check}
            disabled={loading}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner /> : t("check_again")}
          </button>
          <button
            onClick={onNext}
            disabled={!status?.envOk || loading}
            className="px-5 py-2 rounded-lg bg-[#15503A] hover:bg-[#1a6349] text-white text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
          >
            {ts("continue")}
          </button>
        </div>
      </div>
    </StepCard>
  );
}

// ─── Step 2 — Database ────────────────────────────────────────────────────────

function StepDatabase({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const t = useTranslations("setup.database");
  const ts = useTranslations("setup");
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrateOutput, setMigrateOutput] = useState("");
  const [migrateError, setMigrateError] = useState("");
  const [loading, setLoading] = useState(false);

  const checkStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup/status");
      setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkStatus();
  }, [checkStatus]);

  const runMigrations = async () => {
    setMigrating(true);
    setMigrateOutput("");
    setMigrateError("");
    try {
      const res = await fetch("/api/setup/migrate", { method: "POST" });
      const data = await res.json();
      if (data.ok) {
        setMigrateOutput(data.output || t("initialized_ok"));
        await checkStatus();
      } else {
        setMigrateError(data.error || t("migration_failed"));
      }
    } catch {
      setMigrateError(t("server_unreachable"));
    } finally {
      setMigrating(false);
    }
  };

  const canContinue = status?.dbConnected && status?.dbInitialized;

  return (
    <StepCard>
      <div className="px-6 pt-8 pb-2">
        <h2 className="text-xl font-bold text-[#15503A] mb-1">{t("title")}</h2>
        <p className="text-sm text-gray-500 mb-6">
          {t("subtitle")}
        </p>

        {(loading || migrating) && (
          <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
            <Spinner /> {migrating ? t("running") : t("testing")}
          </div>
        )}

        {!loading && status && (
          <div className="space-y-1">
            {status.dbConnected ? (
              <div className="flex items-center gap-3 py-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">✓</span>
                <span className="text-sm text-gray-700 font-medium">{t("connected")}</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 py-2">
                <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center text-xs font-bold">✗</span>
                <span className="text-sm text-red-500 font-medium">{t("connect_failed")}</span>
              </div>
            )}

            {status.dbConnected && (
              status.dbInitialized ? (
                <div className="flex items-center gap-3 py-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs font-bold">✓</span>
                  <span className="text-sm text-gray-700 font-medium">{t("schema_ok")}</span>
                </div>
              ) : (
                <div className="flex items-center gap-3 py-2">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center text-xs font-bold">!</span>
                  <span className="text-sm text-amber-600 font-medium">{t("schema_pending")}</span>
                </div>
              )
            )}
          </div>
        )}

        {!loading && status?.dbError && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-xs font-semibold text-red-600 mb-1">{t("connection_error")}</p>
            <p className="text-xs text-red-500 font-mono">{status.dbError}</p>
          </div>
        )}

        {migrateOutput && (
          <div className="mt-4 rounded-lg bg-emerald-50 border border-emerald-200 p-3">
            <p className="text-xs text-emerald-700 font-mono whitespace-pre-wrap">{migrateOutput}</p>
          </div>
        )}

        {migrateError && (
          <div className="mt-4 rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-xs font-semibold text-red-600 mb-1">{t("error")}</p>
            <p className="text-xs text-red-500 font-mono whitespace-pre-wrap">{migrateError}</p>
          </div>
        )}

        {!loading && status && !status.dbConnected && (
          <Collapsible title={t("how_to_start_pg")}>
            <p className="mt-3 mb-2 text-gray-600">{t("how_to_start_pg_body")}</p>
            <CopyBlock code="docker compose up -d postgres" />
            <p className="mt-2 text-gray-400 text-xs">
              {t("then_test_again")}
            </p>
          </Collapsible>
        )}

        {!loading && status?.dbConnected && !status.dbInitialized && !migrateOutput && (
          <div className="mt-4 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-800">
              {t("ready_to_init")}
            </p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100 mt-4">
        <button onClick={onBack} className="text-sm text-gray-400 hover:text-gray-700 transition-colors">
          {ts("back")}
        </button>
        <div className="flex gap-2">
          <button
            onClick={checkStatus}
            disabled={loading || migrating}
            className="px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {t("test_connection")}
          </button>
          {status?.dbConnected && !status.dbInitialized && (
            <button
              onClick={runMigrations}
              disabled={migrating}
              className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-sm font-bold transition-colors disabled:opacity-40"
            >
              {migrating ? <Spinner /> : t("initialize_db")}
            </button>
          )}
          <button
            onClick={onNext}
            disabled={!canContinue}
            className="px-5 py-2 rounded-lg bg-[#15503A] hover:bg-[#1a6349] text-white text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed shadow-sm"
          >
            {ts("continue")}
          </button>
        </div>
      </div>
    </StepCard>
  );
}

// ─── Step 3 — Admin Account ───────────────────────────────────────────────────

function StepAdminAccount({
  onNext,
  onBack,
  setAdminEmail,
}: {
  onNext: () => void;
  onBack: () => void;
  setAdminEmail: (e: string) => void;
}) {
  const t = useTranslations("setup.admin");
  const ts = useTranslations("setup");
  const ta = useTranslations("auth");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (name.trim().length < 2) return t("err_name");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return t("err_email");
    if (password.length < 8) return t("err_password");
    if (password !== confirm) return t("err_mismatch");
    return null;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), password }),
      });
      const data = await res.json();
      if (data.ok) {
        setAdminEmail(data.email);
        onNext();
      } else {
        setError(typeof data.error === "string" ? data.error : t("err_create"));
      }
    } catch {
      setError(t("err_server"));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-[#15503A] focus:bg-white focus:ring-2 focus:ring-[#15503A]/10";

  return (
    <StepCard>
      <form onSubmit={submit}>
        <div className="px-6 pt-8 pb-2">
          <h2 className="text-xl font-bold text-[#15503A] mb-1">{t("title")}</h2>
          <p className="text-sm text-gray-500 mb-6">
            {t("subtitle")}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{t("full_name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("name_placeholder")}
                autoComplete="name"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{t("email")}</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("email_placeholder")}
                autoComplete="email"
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{t("password")}</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("password_placeholder")}
                  autoComplete="new-password"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? ta("hide_password") : ta("show_password")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                {t("confirm_password")}
              </label>
              <div className="relative">
                <input
                  type={showConfirm ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder={t("confirm_placeholder")}
                  autoComplete="new-password"
                  className={`${inputClass} pr-12`}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showConfirm ? ta("hide_password") : ta("show_password")}
                >
                  {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100 mt-4">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            {ts("back")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-[#15503A] hover:bg-[#1a6349] text-white text-sm font-bold transition-colors disabled:opacity-40 flex items-center gap-2 shadow-sm"
          >
            {loading && <Spinner />} {t("create_account")}
          </button>
        </div>
      </form>
    </StepCard>
  );
}

// ─── Step 4 — Business Settings ───────────────────────────────────────────────

function StepBusinessSettings({
  onNext,
  onBack,
}: {
  onNext: () => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup.business");
  const ts = useTranslations("setup");
  const tcom = useTranslations("common");
  const [businessName, setBusinessName] = useState("");
  const [currency, setCurrency] = useState("$");
  const [currencyDecimals, setCurrencyDecimals] = useState("2");
  const [taxRate, setTaxRate] = useState("0");
  const [taxName, setTaxName] = useState("Tax");
  const [receiptFooter, setReceiptFooter] = useState("Thank you for your purchase!");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!businessName.trim()) { setError(t("err_name")); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/setup/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          businessName: businessName.trim(),
          currency,
          currencyDecimals: Number(currencyDecimals),
          taxRate: Number(taxRate),
          taxName,
          receiptFooter,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        onNext();
      } else {
        setError(typeof data.error === "string" ? data.error : t("err_save"));
      }
    } catch {
      setError(ts("admin.err_server"));
    } finally {
      setLoading(false);
    }
  };

  const inputClass = "flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-[#15503A] focus:bg-white focus:ring-2 focus:ring-[#15503A]/10";

  return (
    <StepCard>
      <form onSubmit={submit}>
        <div className="px-6 pt-8 pb-2">
          <h2 className="text-xl font-bold text-[#15503A] mb-1">{t("title")}</h2>
          <p className="text-sm text-gray-500 mb-6">
            {t("subtitle")}
          </p>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                {t("name")} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder={t("name_placeholder")}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  {t("currency_symbol")}
                </label>
                <input
                  type="text"
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  maxLength={5}
                  placeholder="$"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                  {t("decimal_places")}
                </label>
                <select
                  value={currencyDecimals}
                  onChange={(e) => setCurrencyDecimals(e.target.value)}
                  className={inputClass}
                >
                  <option value="0">0 (e.g. ¥100)</option>
                  <option value="2">2 (e.g. $9.99)</option>
                  <option value="3">3 (e.g. 1.250 KD)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{t("tax_rate")}</label>
                <input
                  type="number"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">{t("tax_name")}</label>
                <input
                  type="text"
                  value={taxName}
                  onChange={(e) => setTaxName(e.target.value)}
                  placeholder={t("tax_name_placeholder")}
                  maxLength={30}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                {t("receipt_footer")} <span className="text-gray-400 font-normal normal-case">({tcom("optional")})</span>
              </label>
              <input
                type="text"
                value={receiptFooter}
                onChange={(e) => setReceiptFooter(e.target.value)}
                maxLength={200}
                placeholder={t("receipt_footer_placeholder")}
                className={inputClass}
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-5 border-t border-gray-100 mt-4">
          <button
            type="button"
            onClick={onBack}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
          >
            {ts("back")}
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2.5 rounded-lg bg-[#15503A] hover:bg-[#1a6349] text-white text-sm font-bold transition-colors disabled:opacity-40 flex items-center gap-2 shadow-sm"
          >
            {loading && <Spinner />} {t("save_launch")}
          </button>
        </div>
      </form>
    </StepCard>
  );
}

// ─── Step 5 — Done! ───────────────────────────────────────────────────────────

function StepDone({ adminEmail }: { adminEmail: string }) {
  const router = useRouter();
  const t = useTranslations("setup.done");

  return (
    <StepCard>
      <div className="px-8 py-12 text-center">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center text-4xl text-emerald-600 mx-auto mb-6">
          ✓
        </div>
        <h2 className="text-2xl font-bold text-[#15503A] mb-2">{t("title")}</h2>
        <p className="text-gray-500 mb-2">{t("subtitle")}</p>
        {adminEmail && (
          <p className="text-sm text-gray-400 mb-8">
            {t("admin_account")}{" "}
            <span className="text-[#15503A] font-semibold">{adminEmail}</span>
          </p>
        )}

        <div className="space-y-3">
          <button
            onClick={() => router.push(`/store/${DEFAULT_STORE_ID}/pos`)}
            className="w-full py-3 rounded-xl bg-[#15503A] hover:bg-[#1a6349] text-white font-bold text-sm transition-colors shadow-md shadow-[#15503A]/30"
          >
            {t("open_pos")}
          </button>
          <button
            onClick={() => router.push(`/store/${DEFAULT_STORE_ID}/products`)}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm transition-colors"
          >
            {t("add_products")}
          </button>
        </div>

        <p className="mt-8 text-xs text-gray-400">
          {t("settings_hint")}
        </p>
      </div>
    </StepCard>
  );
}

// ─── Main Wizard ──────────────────────────────────────────────────────────────

export function SetupWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [adminEmail, setAdminEmail] = useState("");

  // On mount: if already set up, redirect to login
  useEffect(() => {
    fetch("/api/setup/status")
      .then((r) => r.json())
      .then((data: SetupStatus) => {
        if (data.setupComplete) {
          router.replace("/login");
        }
      })
      .catch(() => {});
  }, [router]);

  const next = () => setStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  return (
    <div className="flex flex-col items-center w-full">
      {step < STEP_COUNT - 1 && (
        <ProgressBar step={step} total={STEP_COUNT} />
      )}

      {step === 0 && <StepWelcome onNext={next} />}
      {step === 1 && <StepSystemCheck onNext={next} onBack={back} />}
      {step === 2 && <StepDatabase onNext={next} onBack={back} />}
      {step === 3 && (
        <StepAdminAccount onNext={next} onBack={back} setAdminEmail={setAdminEmail} />
      )}
      {step === 4 && <StepBusinessSettings onNext={next} onBack={back} />}
      {step === 5 && <StepDone adminEmail={adminEmail} />}
    </div>
  );
}
