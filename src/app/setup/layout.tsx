import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
  title: "Настройка — Korgen Kassa POS",
  description: "Мастер первичной настройки Korgen Kassa POS",
};

export default async function SetupLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("setup");
  return (
    <div className="relative min-h-screen bg-gradient-to-br from-slate-100 via-white to-slate-50 flex flex-col items-center justify-center p-4">
      {/* Soft decorative blobs */}
      <div
        className="pointer-events-none fixed top-0 right-0 -translate-y-1/2 translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-20"
        style={{ background: "radial-gradient(circle, #15503A 0%, transparent 70%)" }}
      />
      <div
        className="pointer-events-none fixed bottom-0 left-0 translate-y-1/2 -translate-x-1/2 w-[500px] h-[500px] rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #22B24C 0%, transparent 70%)" }}
      />
      <header className="relative mb-8 text-center select-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/korgen-kassa-mark.png"
          alt="Korgen Kassa POS"
          className="w-14 h-14 rounded-2xl shadow-md shadow-gray-200 mx-auto mb-3 bg-white object-contain"
        />
        <div className="text-[#15503A] font-bold text-xl tracking-tight">Korgen Kassa POS</div>
        <p className="mt-0.5 text-gray-500 text-sm">{t("wizard")}</p>
      </header>
      <div className="relative w-full">
        {children}
      </div>
    </div>
  );
}
