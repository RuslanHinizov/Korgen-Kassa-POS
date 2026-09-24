"use client";

import { signOut } from "@/lib/auth-client";

/** Shown instead of the app when the market is suspended or the account has no market. */
export function StoreBlocked({ title, message }: { title: string; message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-xl">
        <img src="/korgen-kassa-mark.png" alt="Korgen Kassa" className="mx-auto h-14 w-14 rounded-xl object-contain" />
        <h1 className="mt-4 text-xl font-bold text-[#15503A]">{title}</h1>
        <p className="mt-2 whitespace-pre-line text-sm text-slate-600">{message}</p>
        <button
          onClick={() => signOut().then(() => { window.location.href = "/login"; })}
          className="mt-6 text-sm text-slate-500 underline"
        >
          Выйти
        </button>
      </div>
    </div>
  );
}
