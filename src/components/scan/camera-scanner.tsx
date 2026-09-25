"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, SwitchCamera, Zap, ZapOff } from "lucide-react";

interface Props {
  /** Called once per barcode: a code that stays in view is counted once; it counts again only after it left the picture. */
  onScan: (code: string) => void;
  /** how long a code must be out of view before the same code counts again */
  gapMs?: number;
}

type NativeDetector = { detect: (source: CanvasImageSource) => Promise<{ rawValue: string }[]> };
const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "itf", "qr_code"];

/**
 * Live camera barcode reader for phones and tablets (a warehouse worker scanning goods with the
 * phone instead of a hardware scanner). Uses the browser's built-in BarcodeDetector where it exists
 * (Chrome/Android — fast) and falls back to ZXing (iPhone/Safari, desktop). Needs HTTPS or localhost.
 */
export function CameraScanner({ onScan, gapMs = 1200 }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const onScanRef = useRef(onScan);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [error, setError] = useState("");
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [flash, setFlash] = useState(false);

  useEffect(() => { onScanRef.current = onScan; }, [onScan]);

  const handleCode = useCallback((raw: string) => {
    const code = raw.trim();
    if (!code) return;
    const now = Date.now();
    const prev = lastRef.current;
    lastRef.current = { code, at: now }; // "last time this code was seen"
    if (code === prev.code && now - prev.at < gapMs) return; // still in front of the camera: already counted
    try { navigator.vibrate?.(60); } catch { /* not supported */ }
    setFlash(true);
    setTimeout(() => setFlash(false), 250);
    onScanRef.current(code);
  }, [gapMs]);

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function start() {
      setStatus("starting"); setError(""); setTorchOn(false);
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setStatus("error"); setError("Камера работает только по защищённому адресу (https://). Откройте сайт по https."); return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        setStatus("error");
        setError(name === "NotAllowedError" ? "Доступ к камере запрещён. Разрешите камеру для этого сайта в настройках браузера и повторите."
          : name === "NotFoundError" ? "Камера не найдена на этом устройстве." : "Не удалось включить камеру.");
        return;
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      video.setAttribute("playsinline", "true"); // iOS: no fullscreen takeover
      await video.play().catch(() => {});
      const caps = (stream.getVideoTracks()[0]?.getCapabilities?.() ?? {}) as { torch?: boolean };
      setTorchAvailable(Boolean(caps.torch));
      setStatus("scanning");

      // decoder: native if the browser has one, else ZXing (loaded on demand)
      let native: NativeDetector | null = null;
      const Detector = (window as unknown as { BarcodeDetector?: { new (o?: { formats: string[] }): NativeDetector; getSupportedFormats?: () => Promise<string[]> } }).BarcodeDetector;
      if (Detector) {
        try {
          const supported = (await Detector.getSupportedFormats?.()) ?? FORMATS;
          native = new Detector({ formats: FORMATS.filter((f) => supported.includes(f)) });
        } catch { native = null; }
      }
      let zx: { decode: (canvas: HTMLCanvasElement) => string | null } | null = null;
      if (!native) {
        const [{ BrowserMultiFormatReader }, lib] = await Promise.all([import("@zxing/browser"), import("@zxing/library")]);
        const hints = new Map();
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [
          lib.BarcodeFormat.EAN_13, lib.BarcodeFormat.EAN_8, lib.BarcodeFormat.UPC_A, lib.BarcodeFormat.UPC_E,
          lib.BarcodeFormat.CODE_128, lib.BarcodeFormat.CODE_39, lib.BarcodeFormat.ITF, lib.BarcodeFormat.QR_CODE,
        ]);
        hints.set(lib.DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        zx = { decode: (canvas) => { try { return reader.decodeFromCanvas(canvas).getText(); } catch { return null; } } };
      }
      if (stopped) return;

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const tick = async () => {
        if (stopped) return;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0) {
            if (native) {
              const found = await native.detect(video);
              if (found[0]?.rawValue) handleCode(found[0].rawValue);
            } else if (zx && ctx) {
              const scale = Math.min(1, 960 / video.videoWidth);
              canvas.width = Math.round(video.videoWidth * scale);
              canvas.height = Math.round(video.videoHeight * scale);
              ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
              const text = zx.decode(canvas);
              if (text) handleCode(text);
            }
          }
        } catch { /* a frame that cannot be read is skipped */ }
        timer = setTimeout(tick, native ? 120 : 180);
      };
      void tick();
    }

    void start();

    // save battery when the page is hidden
    const onVisibility = () => { streamRef.current?.getVideoTracks().forEach((t) => { t.enabled = !document.hidden; }); };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [facing, handleCode]);

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch { /* torch not controllable on this device */ }
  }

  return (
    <div className="relative aspect-[4/3] max-h-[42vh] w-full overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />

      {/* aiming frame */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className={`h-[38%] w-[78%] rounded-lg border-2 transition-colors ${flash ? "border-green-400 bg-green-400/20" : "border-white/80"}`}>
          <div className="absolute inset-x-[11%] top-1/2 h-0.5 -translate-y-1/2 bg-red-500/80" />
        </div>
      </div>

      {status === "starting" && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm text-white"><Loader2 className="h-5 w-5 animate-spin" /> Включаем камеру…</div>
      )}
      {status === "error" && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 p-6 text-center text-sm text-white">{error}</div>
      )}

      {status === "scanning" && (
        <div className="absolute bottom-2 right-2 flex gap-2">
          {torchAvailable && (
            <button onClick={toggleTorch} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Фонарик">
              {torchOn ? <Zap className="h-5 w-5 text-yellow-300" /> : <ZapOff className="h-5 w-5" />}
            </button>
          )}
          <button onClick={() => setFacing((f) => (f === "environment" ? "user" : "environment"))} className="flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white" aria-label="Другая камера">
            <SwitchCamera className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
