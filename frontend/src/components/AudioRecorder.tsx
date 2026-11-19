"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  Mic,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Volume2,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

type RecorderStatus = "idle" | "recording" | "paused" | "recorded";
type MicLevelStatus = "quiet" | "good" | "loud";

interface AudioRecorderProps {
  disabled?: boolean;
  onAnalyze: (blob: Blob, filename: string, mimeType: string) => void;
  onRecordingStateChange?: (isActive: boolean, elapsedSec: number) => void;
}

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

export function AudioRecorder({
  disabled = false,
  onAnalyze,
  onRecordingStateChange,
}: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micLevel, setMicLevel] = useState<MicLevelStatus>("good");
  const [error, setError] = useState<string | null>(null);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedMime, setRecordedMime] = useState<string>("audio/webm");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);

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

  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.fftSize;
    const dataArray = new Uint8Array(bufferLength);

    const renderFrame = () => {
      if (!analyserRef.current) return;
      rafRef.current = requestAnimationFrame(renderFrame);

      analyserRef.current.getByteTimeDomainData(dataArray);

      // Compute RMS level (0..1)
      let sumSquares = 0;
      for (let i = 0; i < bufferLength; i += 1) {
        const normalized = (dataArray[i] - 128) / 128;
        sumSquares += normalized * normalized;
      }
      const rms = Math.sqrt(sumSquares / bufferLength);

      if (rms < 0.015) {
        setMicLevel("quiet");
      } else if (rms > 0.38) {
        setMicLevel("loud");
      } else {
        setMicLevel("good");
      }

      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Center baseline
      ctx.strokeStyle = "rgba(148, 163, 184, 0.16)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();

      // Gradient waveform
      const grad = ctx.createLinearGradient(0, 0, width, 0);
      grad.addColorStop(0, "#6366f1");
      grad.addColorStop(0.5, "#06b6d4");
      grad.addColorStop(1, "#818cf8");

      ctx.lineWidth = 2.5;
      ctx.strokeStyle = grad;
      ctx.beginPath();

      const sliceWidth = width / bufferLength;
      let x = 0;
      for (let i = 0; i < bufferLength; i += 2) {
        const v = dataArray[i] / 128.0;
        const y = (v * height) / 2;
        if (i === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
        x += sliceWidth * 2;
      }
      ctx.lineTo(width, height / 2);
      ctx.stroke();
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
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;
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
        setStatus("recorded");
        stopVisualizationAndStream();
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);

      elapsedRef.current = 0;
      setElapsedSec(0);
      setRecordedBlob(null);
      setStatus("recording");
      startElapsedClock();
      drawWaveform();
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
    stopVisualizationAndStream();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setRecordedBlob(null);
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

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Waveform / studio meter stage */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.08] bg-slate-950/75 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2.5 w-2.5 rounded-full",
                status === "recording" && "animate-pulse bg-rose-500",
                status === "paused" && "bg-amber-400",
                status === "recorded" && "bg-emerald-400",
                status === "idle" && "bg-slate-600"
              )}
            />
            <span className="text-xs font-medium text-slate-300">
              {status === "idle" && "Microphone Ready"}
              {status === "recording" && "Recording Live"}
              {status === "paused" && "Recording Paused"}
              {status === "recorded" && "Take Captured"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {(status === "recording" || status === "paused") && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                  micLevel === "good" &&
                    "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
                  micLevel === "quiet" &&
                    "border-amber-500/30 bg-amber-500/10 text-amber-300",
                  micLevel === "loud" &&
                    "border-rose-500/30 bg-rose-500/10 text-rose-300"
                )}
              >
                <Volume2 className="h-3 w-3" />
                {micLevel === "good" && "Good level"}
                {micLevel === "quiet" && "Too quiet — move closer"}
                {micLevel === "loud" && "Loud — back up slightly"}
              </span>
            )}
            <span className="font-mono text-sm font-semibold text-slate-200 tabular-nums">
              {formatTime(elapsedSec)}
            </span>
          </div>
        </div>

        <div className="relative h-28 w-full overflow-hidden rounded-xl border border-white/[0.05] bg-slate-900/50">
          {status === "recording" || status === "paused" ? (
            <canvas ref={canvasRef} className="h-full w-full" />
          ) : status === "recorded" && previewUrl ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4">
              <audio
                src={previewUrl}
                controls
                className="w-full max-w-md accent-cyan-400"
              />
              <span className="text-[11px] text-slate-400">
                Preview your take •{" "}
                {recordedBlob
                  ? `${(recordedBlob.size / (1024 * 1024)).toFixed(2)} MB`
                  : ""}
              </span>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
              <Mic className="h-6 w-6 text-indigo-400/70" />
              <p className="text-xs text-slate-400">
                Press <span className="font-medium text-slate-200">Start Recording</span> to capture your speech & live waveform
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {status === "idle" && (
          <button
            type="button"
            disabled={disabled}
            onClick={handleStart}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-4 w-4" />
            Start Recording
          </button>
        )}

        {(status === "recording" || status === "paused") && (
          <>
            <div className="flex items-center gap-2">
              {status === "recording" ? (
                <button
                  type="button"
                  onClick={handlePause}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-white/10"
                >
                  <Pause className="h-4 w-4 text-amber-400" />
                  Pause
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleResume}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/15 px-4 py-2.5 text-sm font-medium text-emerald-200 transition hover:bg-emerald-500/25"
                >
                  <Play className="h-4 w-4" />
                  Resume
                </button>
              )}

              <button
                type="button"
                onClick={handleReset}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3.5 py-2.5 text-sm font-medium text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              >
                <RotateCcw className="h-4 w-4" />
                Discard
              </button>
            </div>

            <button
              type="button"
              onClick={handleStop}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-500 sm:flex-initial"
            >
              <Square className="h-3.5 w-3.5 fill-current" />
              Stop & Review
            </button>
          </>
        )}

        {status === "recorded" && (
          <>
            <button
              type="button"
              disabled={disabled}
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RotateCcw className="h-4 w-4" />
              Re-record
            </button>
            <button
              type="button"
              disabled={disabled || !recordedBlob}
              onClick={handleAnalyzeClick}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              Analyze Presentation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
