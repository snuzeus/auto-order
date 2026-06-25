"use client";

import { Camera, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

type BarcodeScannerButtonProps = {
  disabled: boolean;
  onDetected: (barcode: string) => void;
};

export default function BarcodeScannerButton({
  disabled,
  onDetected,
}: BarcodeScannerButtonProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function startScanner() {
      setStarting(true);
      setError("");

      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");

        if (cancelled || !videoRef.current) {
          return;
        }

        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
            },
          },
          videoRef.current,
          (result) => {
            const text = result?.getText().trim();

            if (!text) {
              return;
            }

            onDetected(text);
            setOpen(false);
          },
        );

        stopRef.current = () => controls.stop();
      } catch {
        if (!cancelled) {
          setError("카메라를 열 수 없습니다. 권한을 허용했는지 확인해 주세요.");
        }
      } finally {
        if (!cancelled) {
          setStarting(false);
        }
      }
    }

    startScanner();

    return () => {
      cancelled = true;
      stopRef.current?.();
      stopRef.current = null;
    };
  }, [onDetected, open]);

  return (
    <>
      <button
        className={`flex min-h-14 w-full items-center justify-center gap-2 bg-slate-900 px-5 py-4 text-lg font-semibold text-white disabled:bg-slate-300 sm:hidden ${FOCUS_VISIBLE_CLASS}`}
        disabled={disabled}
        type="button"
        onClick={() => setOpen(true)}
      >
        <Camera aria-hidden="true" size={22} />
        바코드 촬영
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-stretch bg-slate-950 text-white sm:hidden"
          role="dialog"
        >
          <div className="flex min-h-dvh w-full flex-col">
            <div className="flex items-center justify-between border-b border-white/20 px-4 py-3">
              <h2 className="m-0 text-lg font-bold">바코드 촬영</h2>
              <button
                aria-label="바코드 촬영 닫기"
                className={`min-h-11 min-w-11 rounded-full border border-white/30 bg-white/10 p-2 ${FOCUS_VISIBLE_CLASS}`}
                type="button"
                onClick={() => setOpen(false)}
              >
                <X aria-hidden="true" size={22} />
              </button>
            </div>

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute left-6 right-6 top-1/2 h-32 -translate-y-1/2 border-2 border-emerald-400" />
            </div>

            <div className="border-t border-white/20 px-4 py-4">
              {starting ? <p className="m-0 text-sm text-slate-200">카메라를 여는 중입니다.</p> : null}
              {error ? <p className="m-0 text-sm text-red-200">{error}</p> : null}
              {!starting && !error ? (
                <p className="m-0 text-sm text-slate-200">바코드를 화면 중앙 박스 안에 맞춰 주세요.</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
