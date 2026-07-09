"use client";

import { Camera, Flashlight, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

const FOCUS_VISIBLE_CLASS =
  "focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2";

type BarcodeScannerButtonProps = {
  disabled: boolean;
  onDetected: (barcode: string) => void;
};

type ScannerControls = {
  stop: () => void;
};

type ExtendedMediaTrackCapabilities = MediaTrackCapabilities & {
  focusMode?: string[];
  torch?: boolean;
};

type ExtendedMediaTrackConstraintSet = MediaTrackConstraintSet & {
  focusMode?: string;
  torch?: boolean;
};

function normalizeBarcode(value: string) {
  return value.trim().replace(/\s/g, "");
}

function isLikelyBarcode(value: string) {
  const normalized = normalizeBarcode(value);

  return /^\d{8,18}$/.test(normalized);
}

export default function BarcodeScannerButton({
  disabled,
  onDetected,
}: BarcodeScannerButtonProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const trackRef = useRef<MediaStreamTrack | null>(null);
  const lastDetectedRef = useRef("");
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  const stopScanner = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    trackRef.current?.stop();
    trackRef.current = null;
    setTorchAvailable(false);
    setTorchOn(false);
  }, []);

  const toggleTorch = useCallback(async () => {
    const track = trackRef.current;

    if (!track) {
      return;
    }

    const nextTorchState = !torchOn;

    try {
      await track.applyConstraints({
        advanced: [
          { torch: nextTorchState } as ExtendedMediaTrackConstraintSet,
        ],
      });
      setTorchOn(nextTorchState);
    } catch {
      setError("이 기기에서는 조명을 켤 수 없습니다.");
      setTorchAvailable(false);
    }
  }, [torchOn]);

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

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 120,
          delayBetweenScanSuccess: 700,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
              frameRate: { ideal: 30 },
              advanced: [
                { focusMode: "continuous" } as ExtendedMediaTrackConstraintSet,
              ],
            },
          },
          videoRef.current,
          (result) => {
            const text = normalizeBarcode(result?.getText() ?? "");

            if (!isLikelyBarcode(text) || lastDetectedRef.current === text) {
              return;
            }

            lastDetectedRef.current = text;
            onDetected(text);
            setOpen(false);
          },
        );

        stopRef.current = () => (controls as ScannerControls).stop();

        const stream = videoRef.current.srcObject;

        if (stream instanceof MediaStream) {
          const [track] = stream.getVideoTracks();
          trackRef.current = track ?? null;

          if (track) {
            const capabilities =
              track.getCapabilities() as ExtendedMediaTrackCapabilities;
            setTorchAvailable(Boolean(capabilities.torch));

            if (capabilities.focusMode?.includes("continuous")) {
              await track.applyConstraints({
                advanced: [
                  {
                    focusMode: "continuous",
                  } as ExtendedMediaTrackConstraintSet,
                ],
              });
            }
          }
        }
      } catch {
        if (!cancelled) {
          setError(
            "카메라를 열 수 없습니다. 브라우저 권한과 HTTPS 접속 여부를 확인해 주세요.",
          );
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
      stopScanner();
    };
  }, [onDetected, open, stopScanner]);

  return (
    <>
      <button
        className={`hidden min-h-14 w-full items-center justify-center gap-2 bg-slate-900 px-5 py-4 text-lg font-semibold text-white disabled:bg-slate-300 [@media(pointer:coarse)]:flex ${FOCUS_VISIBLE_CLASS}`}
        disabled={disabled}
        type="button"
        onClick={() => {
          lastDetectedRef.current = "";
          setOpen(true);
        }}
      >
        <Camera aria-hidden="true" size={22} />
        바코드 촬영
      </button>

      {open ? (
        <div
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-stretch bg-slate-950 text-white"
          role="dialog"
        >
          <div className="flex min-h-dvh w-full flex-col landscape:flex-row">
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

            <div className="relative flex flex-1 items-center justify-center overflow-hidden bg-black landscape:min-w-0">
              <video
                ref={videoRef}
                autoPlay
                className="h-full w-full object-cover"
                muted
                playsInline
              />
              <div className="pointer-events-none absolute left-4 right-4 top-1/2 h-40 -translate-y-1/2 rounded border-2 border-emerald-400 shadow-[0_0_0_9999px_rgba(2,6,23,0.42)] landscape:left-16 landscape:right-16">
                <div className="absolute left-4 right-4 top-1/2 h-0.5 -translate-y-1/2 bg-emerald-300" />
              </div>
            </div>

            <div className="space-y-3 border-t border-white/20 px-4 py-4 landscape:w-72 landscape:border-l landscape:border-t-0">
              {torchAvailable ? (
                <button
                  className={`flex min-h-12 w-full items-center justify-center gap-2 rounded border border-white/30 bg-white/10 px-4 py-3 text-base font-semibold text-white ${FOCUS_VISIBLE_CLASS}`}
                  type="button"
                  onClick={toggleTorch}
                >
                  <Flashlight aria-hidden="true" size={20} />
                  {torchOn ? "조명 끄기" : "조명 켜기"}
                </button>
              ) : null}
              {starting ? (
                <p className="m-0 text-sm text-slate-200">
                  카메라를 여는 중입니다.
                </p>
              ) : null}
              {error ? <p className="m-0 text-sm text-red-200">{error}</p> : null}
              {!starting && !error ? (
                <p className="m-0 text-sm leading-6 text-slate-200">
                  바코드를 가운데 초록 선에 맞추고 10~20cm 정도 떨어뜨려
                  주세요. 어두우면 조명을 켜고, 화면을 천천히 움직이면 더 잘
                  잡힙니다.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
