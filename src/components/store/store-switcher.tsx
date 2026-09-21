"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Store as StoreIcon, Plus, Loader2 } from "lucide-react";
import { useAnchoredPopover, AnchoredPopover } from "@/components/ui/anchored-popover";
import { useStoreId } from "./store-provider";

interface Store { id: string; name: string }

export function StoreSwitcher({ currentPath, businessName }: { currentPath: string; businessName: string }) {
  const storeId = useStoreId();
  const popover = useAnchoredPopover<HTMLButtonElement>();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!popover.open) return;
    setLoading(true);
    fetch("/api/stores").then((r) => r.json()).then((d) => setStores(d.stores ?? [])).finally(() => setLoading(false));
  }, [popover.open]);

  function switchTo(id: string) {
    popover.close();
    if (id === storeId) return;
    window.location.href = `/store/${id}${currentPath}`;
  }

  async function createStore() {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch("/api/stores", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName.trim() }) });
      if (!r.ok) { toast.error("Не удалось создать магазин"); return; }
      const d = await r.json();
      setNewName("");
      switchTo(d.store.id);
    } finally { setCreating(false); }
  }

  const current = stores.find((s) => s.id === storeId);

  return (
    <>
      <button
        ref={popover.anchorRef}
        onClick={popover.toggle}
        className="hidden items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-accent md:inline-flex"
      >
        <StoreIcon className="h-3.5 w-3.5" />
        {current?.name ?? businessName}
      </button>

      {popover.open && popover.pos && (
        <AnchoredPopover pos={popover.pos} onClose={popover.close} className="w-56 space-y-1">
          {loading ? (
            <div className="p-2"><Loader2 className="h-4 w-4 animate-spin" /></div>
          ) : (
            stores.map((s) => (
              <button
                key={s.id}
                onClick={() => switchTo(s.id)}
                className={`block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-accent ${s.id === storeId ? "font-medium text-primary" : ""}`}
              >
                {s.name}
              </button>
            ))
          )}
          <div className="flex items-center gap-1 border-t pt-2">
            <input
              value={newName} onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createStore(); }}
              placeholder="Новый магазин"
              className="h-8 flex-1 rounded-md border bg-background px-2 text-xs"
            />
            <button onClick={createStore} disabled={creating} className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50">
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>
        </AnchoredPopover>
      )}
    </>
  );
}
