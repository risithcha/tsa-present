"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
} from "lucide-react";
import type WaveSurfer from "wavesurfer.js";
import type RegionsPluginType from "wavesurfer.js/dist/plugins/regions.esm.js";
import type {
  AudibleDisfluency,
  PauseEvent,
  TimestampedMoment,
  WordToken,
} from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

export interface WaveformPlayerHandle {
  seekTo: (seconds: number, autoplay?: boolean) => void;
}

interface WaveformPlayerProps {
  audioBlob: Blob;
  words: WordToken[];
  pauses: PauseEvent[];
  moments: TimestampedMoment[];
  audibleEvents?: AudibleDisfluency[];
  durationFallbackSec?: number;
  onTimeUpdate?: (timeSec: number) => void;
}

const PLAYBACK_RATES = [0.75, 1, 1.25, 1.5] as const;

export const WaveformPlayer = forwardRef<
  WaveformPlayerHandle,
  WaveformPlayerProps
>(function WaveformPlayer(
  {
    audioBlob,
    words,
    pauses,
    moments,
    audibleEvents = [],
    durationFallbackSec = 0,
    onTimeUpdate,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<ReturnType<typeof RegionsPluginType.create> | null>(
    null
  );

  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationFallbackSec);
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [showFillers, setShowFillers] = useState(true);
  const [showPausesStutters, setShowPausesStutters] = useState(true);
  const [showStrengths, setShowStrengths] = useState(true);

  const renderRegions = useCallback(() => {
    const regions = regionsRef.current;
    if (!regions) return;
    regions.clearRegions();

    if (showFillers) {
      words.forEach((w, idx) => {
        if (w.is_filler && w.filler_type !== "repetition") {
          const start = Math.max(0, w.start);
          const end = Math.max(start + 0.2, w.end);
          regions.addRegion({
            id: `filler-${idx}`,
            start,
            end,
            color: "rgba(245, 158, 11, 0.30)",
            drag: false,
            resize: false,
          });
        }
      });

      audibleEvents.forEach((ev, idx) => {
        if (ev.kind === "vocal_filler") {
          const start = Math.max(0, ev.start);
          const end = Math.max(start + 0.2, ev.end);
          regions.addRegion({
            id: `audible-filler-${idx}`,
            start,
            end,
            color: "rgba(245, 158, 11, 0.34)",
            drag: false,
            resize: false,
          });
        }
      });
    }

    if (showPausesStutters) {
      pauses.forEach((p, idx) => {
        if (p.classification === "awkward_pause") {
          regions.addRegion({
            id: `awkward-pause-${idx}`,
            start: Math.max(0, p.start),
            end: Math.max(p.start + 0.25, p.end),
            color: "rgba(244, 63, 94, 0.32)",
            drag: false,
            resize: false,
          });
        }
      });

      words.forEach((w, idx) => {
        if (w.is_filler && w.filler_type === "repetition") {
          regions.addRegion({
            id: `stutter-${idx}`,
            start: Math.max(0, w.start),
            end: Math.max(w.start + 0.2, w.end),
            color: "rgba(244, 63, 94, 0.32)",
            drag: false,
            resize: false,
          });
        }
      });

      audibleEvents.forEach((ev, idx) => {
        if (ev.kind === "stutter" || ev.kind === "false_start") {
          const start = Math.max(0, ev.start);
          const end = Math.max(start + 0.2, ev.end);
          regions.addRegion({
            id: `audible-stutter-${idx}`,
            start,
            end,
            color: "rgba(244, 63, 94, 0.36)",
            drag: false,
            resize: false,
          });
        }
      });
    }

    if (showStrengths) {
      moments.forEach((m, idx) => {
        if (m.category === "strength") {
          const start = Math.max(0, m.timestamp_sec);
          const end =
            m.end_sec && m.end_sec > start ? m.end_sec : start + 2.0;
          regions.addRegion({
            id: `strength-${idx}`,
            start,
            end,
            color: "rgba(16, 185, 129, 0.26)",
            drag: false,
            resize: false,
          });
        }
      });
    }
  }, [
    words,
    pauses,
    moments,
    audibleEvents,
    showFillers,
    showPausesStutters,
    showStrengths,
  ]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function initWaveSurfer() {
      if (!containerRef.current) return;
      try {
        setLoadError(null);
        const [{ default: WaveSurferLib }, { default: RegionsPlugin }] =
          await Promise.all([
            import("wavesurfer.js"),
            import("wavesurfer.js/dist/plugins/regions.esm.js"),
          ]);

        if (cancelled || !containerRef.current) return;

        const regionsPlugin = RegionsPlugin.create();
        regionsRef.current = regionsPlugin;

        objectUrl = URL.createObjectURL(audioBlob);

        const ws = WaveSurferLib.create({
          container: containerRef.current,
          waveColor: "rgba(148, 163, 184, 0.4)",
          progressColor: "#22d3ee",
          cursorColor: "#818cf8",
          cursorWidth: 2,
          barWidth: 2,
          barGap: 2,
          barRadius: 3,
          height: 88,
          normalize: true,
          dragToSeek: true,
          url: objectUrl,
          plugins: [regionsPlugin],
        });

        wsRef.current = ws;

        ws.on("ready", (dur) => {
          if (cancelled) return;
          setDuration(dur || durationFallbackSec);
          setIsReady(true);
          renderRegions();
        });

        ws.on("play", () => {
          if (!cancelled) setIsPlaying(true);
        });

        ws.on("pause", () => {
          if (!cancelled) setIsPlaying(false);
        });

        ws.on("finish", () => {
          if (!cancelled) setIsPlaying(false);
        });

        ws.on("timeupdate", (time) => {
          if (cancelled) return;
          setCurrentTime(time);
          onTimeUpdate?.(time);
        });

        ws.on("error", (err) => {
          if (cancelled) return;
          setLoadError(
            err instanceof Error
              ? err.message
              : "Could not render waveform audio."
          );
        });

        regionsPlugin.on("region-clicked", (region, e) => {
          e.stopPropagation();
          ws.setTime(region.start);
          void ws.play();
        });
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err instanceof Error ? err.message : "Waveform failed to load."
          );
        }
      }
    }

    void initWaveSurfer();

    return () => {
      cancelled = true;
      if (wsRef.current) {
        wsRef.current.destroy();
        wsRef.current = null;
      }
      regionsRef.current = null;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioBlob]);

  // Update regions when filter toggles change
  useEffect(() => {
    if (isReady) {
      renderRegions();
    }
  }, [isReady, renderRegions]);

  useImperativeHandle(
    ref,
    () => ({
      seekTo: (seconds: number, autoplay = true) => {
        const ws = wsRef.current;
        if (!ws) return;
        const clamped = Math.max(0, Math.min(seconds, ws.getDuration() || seconds));
        ws.setTime(clamped);
        setCurrentTime(clamped);
        onTimeUpdate?.(clamped);
        if (autoplay) {
          void ws.play();
        }
      },
    }),
    [onTimeUpdate]
  );

  const togglePlay = () => {
    const ws = wsRef.current;
    if (!ws) return;
    void ws.playPause();
  };

  const skipBy = (delta: number) => {
    const ws = wsRef.current;
    if (!ws) return;
    const total = ws.getDuration() || duration;
    const next = Math.max(0, Math.min(total, ws.getCurrentTime() + delta));
    ws.setTime(next);
    setCurrentTime(next);
    onTimeUpdate?.(next);
  };

  const handleRateChange = (rate: number) => {
    setPlaybackRate(rate);
    wsRef.current?.setPlaybackRate(rate);
  };

  return (
    <div className="no-print rounded-2xl border border-white/[0.08] bg-slate-900/65 p-5 backdrop-blur-xl">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Volume2 className="h-4 w-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-white">
            Interactive Waveform &amp; Markers
          </h2>
        </div>

        {/* Region filter toggles */}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setShowFillers((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition",
              showFillers
                ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Fillers
          </button>

          <button
            type="button"
            onClick={() => setShowPausesStutters((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition",
              showPausesStutters
                ? "border-rose-500/40 bg-rose-500/15 text-rose-200"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            Pauses &amp; Stutters
          </button>

          <button
            type="button"
            onClick={() => setShowStrengths((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium transition",
              showStrengths
                ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-200"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Strengths
          </button>
        </div>
      </div>

      {/* Waveform container */}
      <div className="relative rounded-xl border border-white/[0.06] bg-slate-950/80 px-3 py-3">
        {!isReady && !loadError && (
          <div className="flex h-[88px] items-center justify-center text-xs text-slate-400">
            Rendering audio waveform...
          </div>
        )}
        {loadError && (
          <div className="flex h-[88px] items-center justify-center text-xs text-rose-300">
            {loadError}
          </div>
        )}
        <div
          ref={containerRef}
          className={cn(!isReady && "h-0 overflow-hidden opacity-0")}
        />
      </div>

      {/* Transport bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={!isReady}
            onClick={() => skipBy(-5)}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            title="Back 5 seconds"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            5s
          </button>

          <button
            type="button"
            disabled={!isReady}
            onClick={togglePlay}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-4 text-sm font-semibold text-white shadow-md shadow-indigo-500/20 transition hover:brightness-110 disabled:opacity-40"
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4 fill-current" />
                Pause
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                Play
              </>
            )}
          </button>

          <button
            type="button"
            disabled={!isReady}
            onClick={() => skipBy(5)}
            className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-white/5 px-2.5 text-xs font-medium text-slate-300 transition hover:bg-white/10 disabled:opacity-40"
            title="Forward 5 seconds"
          >
            5s
            <RotateCw className="h-3.5 w-3.5" />
          </button>

          <span className="ml-2 font-mono text-xs text-slate-300 tabular-nums">
            {formatTime(currentTime)}{" "}
            <span className="text-slate-500">/ {formatTime(duration)}</span>
          </span>
        </div>

        {/* Playback speed */}
        <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-slate-950/75 p-1">
          {PLAYBACK_RATES.map((rate) => (
            <button
              key={rate}
              type="button"
              onClick={() => handleRateChange(rate)}
              className={cn(
                "rounded-lg px-2.5 py-1 font-mono text-xs font-medium transition",
                playbackRate === rate
                  ? "bg-indigo-500/25 text-white ring-1 ring-indigo-400/40"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              {rate}x
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});
