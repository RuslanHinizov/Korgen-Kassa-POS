"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { getSession } from "@/lib/auth-client";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const t = useTranslations("auth");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const res = await fetch("/api/login/phone", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phone.trim(), password: password.trim() }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? t("sign_in_failed"));
      setLoading(false);
      return;
    }

    const session = await getSession();
    // This is the office/account entrance. Cashiers may use it to view their
    // own profile, but the dedicated /kasa-giris screen is the only entrance
    // to the cash register itself.
    window.location.href = session.data?.user.role === "CASHIER" ? "/profile" : "/";
  }

  const inputClass =
    "flex h-11 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2 text-sm text-gray-900 placeholder:text-gray-400 outline-none transition-all focus:border-[#15503A] focus:bg-white focus:ring-2 focus:ring-[#15503A]/10 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-slate-50 px-4">
      {/* Soft decorative blob */}
      <div
        className="pointer-events-none fixed top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #15503A 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #22B24C 0%, transparent 70%)" }}
      />

      <div className="relative w-full max-w-sm">
        {/* Card */}
        <div className="rounded-3xl border border-gray-100 bg-white px-8 py-10 shadow-xl shadow-gray-200/80 space-y-7">
          {/* Logo / Brand */}
          <div className="flex flex-col items-center space-y-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/korgen-kassa-mark.png"
              alt="Korgen Kassa POS"
              className="h-16 w-16 rounded-2xl shadow-md shadow-gray-200 bg-white object-contain"
            />
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-[#15503A]">Korgen Kassa POS</h1>
              <p className="text-sm text-gray-500 mt-0.5">Вход в офис и управление</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="phone" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Номер телефона
              </label>
              <input
                id="phone"
                type="tel"
                required
                autoComplete="tel"
                inputMode="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className={inputClass}
                placeholder="+7 775 000 00 00"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {t("password")}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors p-1"
                  tabIndex={-1}
                  aria-label={showPassword ? t("hide_password") : t("show_password")}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-red-600 text-sm font-medium">{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#15503A] px-4 py-2 text-sm font-bold text-white shadow-md shadow-[#15503A]/30 transition-all hover:bg-[#1a6349] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22B24C] disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? t("signing_in") : t("sign_in")}
            </button>
          </form>
        </div>

        <p className="mt-4 text-center text-xs text-gray-500">Вы кассир? <a className="font-semibold text-[#15503A] underline" href="/kasa-giris">Перейти ко входу в кассу</a></p>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          {t("footer")}
        </p>
      </div>
    </div>
  );
}
