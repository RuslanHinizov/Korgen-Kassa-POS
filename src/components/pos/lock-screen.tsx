"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ManagerGate } from "./manager-gate";

/**
 * ЗАБЛОКИРОВАТЬ КАССУ — locks the till until a manager PIN unlocks it (Доп. функции, UMAG).
 * A full-screen overlay with nothing but the unlock prompt; the sale underneath is untouched.
 */
export function LockScreen({ onUnlock }: { onUnlock: () => void }) {
  const [gateOpen, setGateOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[95] flex flex-col items-center justify-center gap-4 bg-[#172b1d] text-white">
      <Lock className="h-12 w-12 text-white/60" />
      <p className="text-lg font-semibold">Касса заблокирована</p>
      <button
        type="button"
        onClick={() => setGateOpen(true)}
        className="rounded-sm bg-[#24bb69] px-6 py-3 text-sm font-bold text-white hover:bg-[#1fa45c]"
      >
        Разблокировать
      </button>
      <ManagerGate
        open={gateOpen}
        context="unlock_till"
        onAuthorized={() => { setGateOpen(false); onUnlock(); }}
        onCancel={() => setGateOpen(false)}
      />
    </div>
  );
}
