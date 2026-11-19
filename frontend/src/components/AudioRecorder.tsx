"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CheckCircle2,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Square,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

export type RecorderStatus = "idle" | "recording" | "paused" | "recorded";
export type MicLevelStatus = "quiet" | "good" | "loud";

interface AudioRecorderProps {
  disabled?: boolean;
  onAnalyze: (blob: Blob, filename: string, mimeType: string) => void;
  onRecordingStateChange?: (isActive: boolean, elapsedSec: number) => void;
  onMicStatusChange?: (status: RecorderStatus, micLevel: MicLevelStatus) => void;
}

const IDLE_BAR_HEIGHTS = [
  20, 32, 48, 64, 80, 56, 36, 24, 56, 80, 64, 44, 28, 64, 80, 48, 32, 40, 64,
  56, 28, 20, 48, 64, 56, 36, 24, 48,
];

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return undefined;
}

function getExtensionFromMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("wav")) return "wav";
  return "webm";
}

function fillRoundedPill(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const radius = Math.min(width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
}

export function AudioRecorder({
  disabled = false,
  onAnalyze,
  onRecordingStateChange,
  onMicStatusChange,
}: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState<MicLevelStatus>("good");
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>("audio/webm");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [previewPlaying, setPreviewPlaying] = useState(false);
  const [previewCurrentSec, setPreviewCurrentSec] = useState(0);
  const [previewDurationSec, setPreviewDurationSec] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const statusRef = useRef<RecorderStatus>("idle");
  const lastMicLevelRef = useRef<MicLevelStatus>("good");
  const smoothedBarsRef = useRef<number[]>(new Array(32).fill(0.12));

  useEffect(() => {
    statusRef.current = status;
    onMicStatusChange?.(status, micLevel);
  }, [status, micLevel, onMicStatusChange]);

  const stopVisualizationAndStream = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close().catch(() => undefined);
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopVisualizationAndStream();
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl, stopVisualizationAndStream]);

  useEffect(() => {
    const isActive = status === "recording" || status === "paused";
    onRecordingStateChange?.(isActive, elapsedSec);
  }, [status, elapsedSec, onRecordingStateChange]);

  const drawBarMeter = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const timeData = new Uint8Array(analyser.fftSize);
    const freqData = new Uint8Array(analyser.frequencyBinCount);
    const barCount = 32;

    const renderFrame = () => {
      if (!analyserRef.current) return;
      rafRef.current = requestAnimationFrame(renderFrame);

      const isPaused = statusRef.current === "paused";

      if (!isPaused) {
        analyserRef.current.getByteTimeDomainData(timeData);
        analyserRef.current.getByteFrequencyData(freqData);

        let sumSquares = 0;
        for (let i = 0; i < timeData.length; i += 1) {
          const normalized = (timeData[i] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / timeData.length);

        const nextLevel: MicLevelStatus =
          rms < 0.015 ? "quiet" : rms > 0.38 ? "loud" : "good";
        if (nextLevel !== lastMicLevelRef.current) {
          lastMicLevelRef.current = nextLevel;
          setMicLevel(nextLevel);
        }
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width === 0 || height === 0) return;

      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const step = width / barCount;
      const barWidth = Math.max(4, Math.min(7, step * 0.48));
      const maxBarHeight = Math.max(24, height - 24);
      const minBarHeight = 10;

      // Vocal frequency bins (roughly 90 Hz to 3.4 kHz)
      const startBin = 2;
      const usableBins = Math.min(freqData.length - startBin, 64);

      for (let i = 0; i < barCount; i += 1) {
        let target = 0.08;
        if (!isPaused) {
          const binIdx =
            startBin + Math.floor((i / barCount) * Math.max(1, usableBins));
          const energy = (freqData[binIdx] || 0) / 255;
          // Gentle boost for speech dynamics while staying bounded 0..1
          target = Math.min(1, Math.max(0.08, Math.pow(energy, 0.85) * 1.15));
        }

        const prev = smoothedBarsRef.current[i] ?? 0.08;
        const next = prev + (target - prev) * (target > prev ? 0.42 : 0.18);
        smoothedBarsRef.current[i] = next;

        const barHeight =
          minBarHeight + next * (maxBarHeight - minBarHeight);
        const x = i * step + (step - barWidth) / 2;
        const y = (height - barHeight) / 2;

        if (isPaused || next < 0.14) {
          ctx.fillStyle = "#C4C5D7";
        } else if (next > 0.68) {
          ctx.fillStyle = "#004E48"; // Deep teal accent on strong speech peaks
        } else {
          ctx.fillStyle = "#0037B0"; // Cobalt primary active bars
        }

        fillRoundedPill(ctx, x, y, barWidth, barHeight);
      }

      ctx.restore();
    };

    renderFrame();
  }, []);

  const startElapsedClock = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSec(elapsedRef.current);
    }, 1000);
  }, []);

  const handleStart = async () => {
    setError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setError(
        "Microphone recording is not supported in this browser. Try Upload Audio or switch to Chrome, Edge, or Safari."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;

      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const audioCtx = new AudioContextClass();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.82;
      source.connect(analyser);
      analyserRef.current = analyser;

      const mimeType = getSupportedMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const finalMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: finalMime });
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        const url = URL.createObjectURL(blob);
        setRecordedBlob(blob);
        setRecordedMime(finalMime);
        setPreviewUrl(url);
        setPreviewPlaying(false);
        setPreviewCurrentSec(0);
        setPreviewDurationSec(elapsedRef.current);
        setStatus("recorded");
        stopVisualizationAndStream();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      elapsedRef.current = 0;
      setElapsedSec(0);
      setRecordedBlob(null);
      lastMicLevelRef.current = "good";
      setMicLevel("good");
      smoothedBarsRef.current = new Array(32).fill(0.1);
      setStatus("recording");
      startElapsedClock();
      requestAnimationFrame(() => drawBarMeter());
    } catch (err) {
      stopVisualizationAndStream();
      const message =
        err instanceof Error
          ? err.message
          : "Microphone access was denied or unavailable.";
      setError(`Could not access microphone: ${message}`);
    }
  };

  const handlePause = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;
    recorder.pause();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("paused");
  };

  const handleResume = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "paused") return;
    recorder.resume();
    startElapsedClock();
    setStatus("recording");
  };

  const handleStop = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  };

  const handleReset = () => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    stopVisualizationAndStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
    setPreviewPlaying(false);
    setPreviewCurrentSec(0);
    setPreviewDurationSec(0);
    setElapsedSec(0);
    elapsedRef.current = 0;
    setError(null);
    setStatus("idle");
  };

  const handleAnalyzeClick = () => {
    if (!recordedBlob) return;
    const ext = getExtensionFromMime(recordedMime);
    onAnalyze(recordedBlob, `presentation-take.${ext}`, recordedMime);
  };

  const togglePreviewPlayback = () => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const effectiveDuration =
    Number.isFinite(previewDurationSec) && previewDurationSec > 0
      ? previewDurationSec
      : elapsedSec;

  const handlePreviewSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = previewAudioRef.current;
    if (!audio || effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * effectiveDuration;
    setPreviewCurrentSec(audio.currentTime);
  };

  const previewProgressPct =
    effectiveDuration > 0
      ? Math.min(100, (previewCurrentSec / effectiveDuration) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-gutter-md">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-error/30 bg-error-container/70 p-3 text-body-sm text-on-error-container"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {/* Recessed #EFF4FF Waveform / Bar Meter Well */}
      <div
        aria-label="Live microphone waveform"
        className="relative flex h-28 items-center justify-between gap-1 overflow-hidden rounded-lg border border-outline-variant/50 bg-surface-container-low px-gutter-md"
      >
        {status === "recording" || status === "paused" ? (
          <canvas
            ref={canvasRef}
            className="h-full w-full"
            aria-label="Live microphone level meter"
          />
        ) : status === "recorded" ? (
          <>
            <div className="flex w-full items-center justify-between gap-1 opacity-45" aria-hidden="true">
              {IDLE_BAR_HEIGHTS.map((h, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "w-1.5 rounded-full",
                    idx % 4 === 0 ? "bg-tertiary" : "bg-primary"
                  )}
                  style={{ height: `${h}px` }}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest/95 px-3.5 py-1.5 font-label text-label-md text-on-surface">
                <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" />
                Take captured
                {recordedBlob
                  ? ` · ${(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB`
                  : ""}
              </span>
            </div>
          </>
        ) : (
          <>
            <div className="flex w-full items-center justify-between gap-1" aria-hidden="true">
              {IDLE_BAR_HEIGHTS.map((h, idx) => (
                <div
                  key={idx}
                  className="w-1.5 rounded-full bg-outline-variant"
                  style={{ height: `${Math.max(14, Math.round(h * 0.55))}px` }}
                />
              ))}
            </div>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="rounded-full border border-outline-variant/80 bg-surface-container-lowest/95 px-3.5 py-1 font-label text-label-sm text-on-surface-variant">
                Press Start to capture live microphone audio
              </span>
            </div>
          </>
        )}
      </div>

      {/* Controls Row */}
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex flex-wrap items-center gap-gutter-sm">
          {status === "idle" && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleStart}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-label text-label-md text-on-primary transition-colors duration-[120ms] hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span>Start</span>
            </button>
          )}

          {(status === "recording" || status === "paused") && (
            <>
              {status === "recording" ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3.5 py-2 font-label text-label-md text-on-surface transition-colors duration-[120ms] hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Pause className="h-4 w-4" aria-hidden="true" />
                  <span>Pause</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResume}
                  className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-label text-label-md text-on-primary transition-colors duration-[120ms] hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Play className="h-4 w-4" aria-hidden="true" />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleStop}
                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-3.5 py-2 font-label text-label-md text-error transition-colors duration-[120ms] hover:border-error/40 hover:bg-error-container/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Square className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
                <span>Stop</span>
              </button>

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 font-label text-label-md text-on-surface-variant transition-colors duration-[120ms] hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Discard</span>
              </button>
            </>
          )}

          {status === "recorded" && (
            <button
              type="button"
              disabled={disabled}
              onClick={handleReset}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-4 py-2 font-label text-label-md text-on-surface transition-colors duration-[120ms] hover:bg-surface-container disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              <span>Re-record</span>
            </button>
          )}
        </div>

        <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
          {formatTime(elapsedSec)}{" "}
          {status === "recorded"
            ? "captured"
            : status === "idle"
              ? "ready"
              : "elapsed"}
        </span>
      </div>

      {/* Audio Preview Playback */}
      {status === "recorded" && previewUrl && (
        <div className="flex items-center justify-between gap-gutter-md rounded-lg border border-outline-variant/60 bg-surface-container-low px-4 py-3">
          <audio
            ref={previewAudioRef}
            src={previewUrl}
            preload="metadata"
            onLoadedMetadata={(e) => {
              const dur = e.currentTarget.duration;
              if (Number.isFinite(dur) && dur > 0) {
                setPreviewDurationSec(dur);
              }
            }}
            onTimeUpdate={(e) => {
              setPreviewCurrentSec(e.currentTarget.currentTime);
            }}
            onPlay={() => setPreviewPlaying(true)}
            onPause={() => setPreviewPlaying(false)}
            onEnded={() => setPreviewPlaying(false)}
            className="hidden"
          />

          <div className="flex items-center gap-gutter-sm">
            <button
              type="button"
              onClick={togglePreviewPlayback}
              aria-label={previewPlaying ? "Pause recorded preview" : "Play recorded preview"}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-primary transition-colors duration-[120ms] hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              {previewPlaying ? (
                <Pause className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Play className="h-4 w-4 translate-x-0.5" aria-hidden="true" />
              )}
            </button>
            <span className="font-label text-label-md text-on-surface">
              Take Preview
            </span>
          </div>

          <div
            role="slider"
            tabIndex={0}
            aria-label="Recorded take playback position"
            aria-valuemin={0}
            aria-valuemax={Math.round(effectiveDuration)}
            aria-valuenow={Math.round(previewCurrentSec)}
            onClick={handlePreviewSeek}
            className="hidden h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-surface-container-highest sm:block"
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-75"
              style={{ width: `${previewProgressPct}%` }}
            />
          </div>

          <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
            {formatTime(previewCurrentSec)} / {formatTime(effectiveDuration)}
          </span>
        </div>
      )}

      {/* Primary Action */}
      <div className="flex items-center justify-end pt-gutter-sm">
        <button
          type="button"
          disabled={disabled || !recordedBlob}
          onClick={handleAnalyzeClick}
          className="inline-flex w-full items-center justify-center gap-gutter-sm rounded-full bg-primary px-6 py-2.5 font-label text-label-lg text-on-primary transition-colors duration-[120ms] hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          <span>Analyze Presentation</span>
        </button>
      </div>
    </div>
  );
}
