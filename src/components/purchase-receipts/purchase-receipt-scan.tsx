"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStorePath } from "@/components/store/store-provider";
import { formatCurrency } from "@/lib/utils";
import { unitLabel } from "@/lib/units";
import { Camera, CameraOff, CheckCircle2, Loader2, Minus, Plus, ScanLine, Trash2, X, XCircle } from "lucide-react";
import { CameraScanner } from "@/components/scan/camera-scanner";
import { CreateProductModal } from "@/components/pos/create-product-modal";
import type { ProductResult } from "@/components/pos/product-search";
import { toast } from "sonner";

interface Item {
  id: string; productId: string | null; name: string; barcode: string | null; unit: string;
  quantity: number; salePrice: number;
}
interface Doc {
  id: string; documentNo: number; status: "DRAFT" | "POSTED"; supplier: { id: string; name: string } | null; items: Item[];
}
/** `code` = a barcode that matched nothing: the worker may create the product right here */
type Feedback = { kind: "ok" | "missing"; text: string; code?: string } | null;

/** A short synth beep — no audio asset needed, works offline. */
function beep(freq: number, ms: number) {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + ms / 1000);
    osc.onended = () => ctx.close();
  } catch {
    // Audio may be blocked before any user gesture — scanning still works, just silent.
  }
}

/** Quantity you can type: scan a product once, then tap the number and enter how many really arrived. */
function QtyInput({ value, onCommit }: { value: number; onCommit: (n: number) => void }) {
  const [text, setText] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (!editing) setText(String(value)); }, [value, editing]);
  function commit() {
    setEditing(false);
    const n = Number(text.replace(",", ".").trim());
    if (!Number.isFinite(n) || n < 0) { setText(String(value)); return; }
    if (n !== value) onCommit(n);
  }
  return (
    <input
      inputMode="decimal"
      value={text}
      onFocus={(e) => { setEditing(true); e.currentTarget.select(); }}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      aria-label="Количество"
      className="h-10 w-20 rounded-md border bg-background px-1 text-center text-base font-semibold tabular-nums focus:border-primary focus:outline-none"
    />
  );
}

/**
 * Приёмка → Сканирование: a dedicated, distraction-free full-screen scan mode for
 * "mal kabul" at the loading dock — a warehouse worker scans a whole batch of goods
 * with a plain USB/Bluetooth barcode scanner (acts like a keyboard, sends the code + Enter),
 * same style device as the kassa's own scanner. Mirrors UMAG's "Ввод через коллектор" idea
 * but live, one scan at a time, with audio/visual confirmation per item.
 */
export function PurchaseReceiptScan({ id }: { id: string }) {
  const router = useRouter();
  const storePath = useStorePath();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Phone / tablet: scan with the camera instead of a hardware scanner. Remembered per device.
  const [newProductCode, setNewProductCode] = useState<string | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  useEffect(() => { try { if (localStorage.getItem("receipt-scan-camera") === "1") setCameraOn(true); } catch { /* private mode */ } }, []);
  function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    try { localStorage.setItem("receipt-scan-camera", next ? "1" : "0"); } catch { /* ignore */ }
  }
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const r = await fetch(`/api/purchase-receipts/${id}`);
    if (!r.ok) { toast.error("Документ не найден"); router.push(storePath("/purchases")); return; }
    const d = await r.json();
    setDoc(d.receipt);
    setLoading(false);
  }, [id, router, storePath]);
  useEffect(() => { load(); }, [load]);

  // with the camera on, do not grab focus: it would pop up the phone keyboard over the camera
  const focusInput = useCallback(() => { if (!cameraOn) inputRef.current?.focus(); }, [cameraOn]);
  useEffect(() => { focusInput(); }, [focusInput]);

  function flash(next: Feedback) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(next);
    if (next?.kind === "missing" && next.code) return; // stays until the worker acts on it or scans something else
    feedbackTimer.current = setTimeout(() => setFeedback(null), 2200);
  }

  async function submitScan(fromCamera?: string) {
    const raw = (fromCamera ?? code).trim();
    if (!raw || busy) return;
    if (fromCamera === undefined) setCode("");
    setBusy(true);
    try {
      const r = await fetch(`/api/products/search?q=${encodeURIComponent(raw)}`);
      const results: { id: string; barcode: string | null; name: string; unit?: string; scanQuantity?: number }[] = r.ok ? await r.json() : [];
      const match = results.find((p) => p.barcode === raw) ?? results[0];
      if (!match) {
        beep(220, 220);
        flash({ kind: "missing", text: `Товар не найден: ${raw}`, code: raw });
        return;
      }
      const quantity = match.scanQuantity ?? 1;
      const ar = await fetch(`/api/purchase-receipts/${id}/items`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: match.id, quantity }),
      });
      if (!ar.ok) {
        beep(220, 220);
        flash({ kind: "missing", text: (await ar.json()).error ?? "Не удалось добавить" });
        return;
      }
      beep(880, 120);
      flash({ kind: "ok", text: `${match.name} × ${quantity} ${unitLabel(match.unit, true)}` });
      await load();
    } finally {
      setBusy(false);
      focusInput();
    }
  }

  /** A product the worker just created on the spot: put it on the document (quantity 1, then type the real one). */
  async function addCreated(product: ProductResult) {
    setNewProductCode(null);
    const ar = await fetch(`/api/purchase-receipts/${id}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: product.id, quantity: 1 }),
    });
    if (!ar.ok) { beep(220, 220); flash({ kind: "missing", text: "Товар создан, но не добавился в приёмку — отсканируйте его ещё раз" }); return; }
    beep(880, 120);
    flash({ kind: "ok", text: `Новый товар: ${product.name} × 1 ${unitLabel(product.unit ?? "pcs", true)}` });
    await load();
    focusInput();
  }

  async function changeQty(itemId: string, delta: number) {
    const item = doc?.items.find((i) => i.id === itemId);
    if (!item) return;
    const next = Math.max(0, item.quantity + delta);
    if (next === 0) { await removeItem(itemId); return; }
    await fetch(`/api/purchase-receipts/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: next }) });
    load();
    focusInput();
  }

  async function setQty(itemId: string, next: number) {
    if (next === 0) { await removeItem(itemId); return; }
    const r = await fetch(`/api/purchase-receipts/${id}/items/${itemId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quantity: next }) });
    if (!r.ok) toast.error("Не удалось изменить количество");
    await load();
    focusInput();
  }

  async function removeItem(itemId: string) {
    await fetch(`/api/purchase-receipts/${id}/items/${itemId}`, { method: "DELETE" });
    load();
    focusInput();
  }

  if (loading || !doc) {
    return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const totalQty = doc.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-semibold">Приёмка №{doc.documentNo} — Сканирование</h1>
          <p className="text-muted-foreground text-sm">{doc.supplier?.name ?? "Поставщик не выбран"}</p>
        </div>
        <button onClick={() => router.push(storePath(`/purchases/${id}`))} className="hover:bg-accent inline-flex h-10 items-center gap-1.5 rounded-md border px-4 text-sm font-medium">
          <X className="h-4 w-4" /> Завершить сканирование
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center overflow-y-auto p-4 sm:p-8">
        <div className="w-full max-w-xl space-y-3">
          <button
            onClick={toggleCamera}
            className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 text-base font-medium ${cameraOn ? "border-primary/40 bg-primary/10 text-primary" : "hover:bg-accent"}`}
          >
            {cameraOn ? <><CameraOff className="h-5 w-5" /> Выключить камеру</> : <><Camera className="h-5 w-5" /> Сканировать камерой телефона</>}
          </button>
          {cameraOn && <CameraScanner onScan={(c) => void submitScan(c)} />}

          <div className="relative">
            <ScanLine className="text-muted-foreground absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2" />
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitScan(); }}
              onBlur={(e) => { if (e.relatedTarget instanceof HTMLInputElement) return; focusInput(); }}
              autoFocus={!cameraOn}
              placeholder={cameraOn ? "Или введите штрихкод вручную…" : "Отсканируйте штрихкод…"}
              className="h-16 w-full rounded-xl border-2 bg-background pl-12 pr-4 text-xl font-medium focus:border-primary focus:outline-none"
            />
          </div>

          {feedback && (
            <div className={`flex items-center gap-2 rounded-lg border p-3 text-sm font-medium ${feedback.kind === "ok" ? "border-primary/40 bg-primary/10 text-primary" : "border-destructive/40 bg-destructive/10 text-destructive"}`}>
              {feedback.kind === "ok" ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
              <span className="min-w-0 flex-1 break-words">{feedback.text}</span>
              {feedback.code && (
                <>
                  <button onClick={() => setNewProductCode(feedback.code ?? "")} className="shrink-0 rounded-md bg-red-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-red-700">Создать товар</button>
                  <button onClick={() => setFeedback(null)} className="shrink-0 rounded p-1 hover:bg-black/10" aria-label="Закрыть"><X className="h-4 w-4" /></button>
                </>
              )}
            </div>
          )}

          <div className="text-muted-foreground flex items-center justify-between text-sm">
            <span>Позиций: {doc.items.length}</span>
            <span>Всего единиц: {totalQty}</span>
          </div>

          <div className="divide-y rounded-lg border">
            {doc.items.length === 0 ? (
              <p className="text-muted-foreground p-6 text-center text-sm">Пока ничего не отсканировано</p>
            ) : (
              [...doc.items].reverse().map((item) => (
                <div key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                  <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-0">
                    <p className="truncate text-sm font-medium">{item.name}</p>
                    <p className="text-muted-foreground text-xs">{item.barcode ?? "без штрихкода"}</p>
                  </div>
                  <button onClick={() => removeItem(item.id)} className="hover:bg-destructive/10 hover:text-destructive text-muted-foreground shrink-0 self-start rounded-md p-2 sm:order-last sm:self-center" aria-label="Удалить"><Trash2 className="h-4 w-4" /></button>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button onClick={() => changeQty(item.id, -1)} className="hover:bg-accent flex h-10 w-10 items-center justify-center rounded-md border" aria-label="Уменьшить"><Minus className="h-3.5 w-3.5" /></button>
                    <QtyInput value={item.quantity} onCommit={(n) => void setQty(item.id, n)} />
                    <span className="text-muted-foreground w-8 text-xs">{unitLabel(item.unit, true)}</span>
                    <button onClick={() => changeQty(item.id, 1)} className="hover:bg-accent flex h-10 w-10 items-center justify-center rounded-md border" aria-label="Увеличить"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <span className="text-muted-foreground ml-auto shrink-0 text-right text-sm tabular-nums sm:w-24">{formatCurrency(item.salePrice * item.quantity)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      {newProductCode !== null && (
        <CreateProductModal
          initialBarcode={newProductCode}
          withCost
          hideStock
          submitLabel="Создать и добавить в приёмку"
          overlayClass="z-[110]"
          onClose={() => setNewProductCode(null)}
          onCreated={(p) => void addCreated(p)}
        />
      )}
    </div>
  );
}
