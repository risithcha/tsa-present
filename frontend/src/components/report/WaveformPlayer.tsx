"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
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

  const markerCounts = useMemo(() => {
    const fillers =
      words.filter((w) => w.is_filler && w.filler_type !== "repetition").length +
      audibleEvents.filter((ev) => ev.kind === "vocal_filler").length;
    const pausesStutters =
      pauses.filter((p) => p.classification === "awkward_pause").length +
      words.filter((w) => w.is_filler && w.filler_type === "repetition").length +
      audibleEvents.filter(
        (ev) => ev.kind === "stutter" || ev.kind === "false_start"
      ).length;
    const strengths = moments.filter((m) => m.category === "strength").length;
    return { fillers, pausesStutters, strengths };
  }, [words, pauses, moments, audibleEvents]);

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
            color: "rgba(144, 77, 0, 0.22)",
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
            color: "rgba(144, 77, 0, 0.22)",
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
            color: "rgba(191, 7, 21, 0.24)",
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
            color: "rgba(191, 7, 21, 0.24)",
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
            color: "rgba(191, 7, 21, 0.24)",
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
            color: "rgba(0, 108, 74, 0.22)",
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
          waveColor: "#B7C4FF",
          progressColor: "#0037B0",
          cursorColor: "#004E48",
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
        const clamped = Math.max(
          0,
          Math.min(seconds, ws.getDuration() || seconds)
        );
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
    <section className="no-print rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Volume2 className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-headline-sm text-on-surface">
            Audio Playback &amp; Markers
          </h2>
          <span className="rounded-full bg-surface-container-low px-2.5 py-0.5 font-mono text-mono-sm text-primary tabular-nums">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Region filter toggles */}
        <div
          className="flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label="Timeline marker filters"
        >
          <button
            type="button"
            onClick={() => setShowFillers((v) => !v)}
            aria-pressed={showFillers}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label text-label-sm transition-colors duration-120",
              showFillers
                ? "border-warning/25 bg-warning-container text-on-warning-container"
                : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            <span>Fillers ({markerCounts.fillers})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPausesStutters((v) => !v)}
            aria-pressed={showPausesStutters}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label text-label-sm transition-colors duration-120",
              showPausesStutters
                ? "border-error/25 bg-error-container text-on-error-container"
                : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            <span>Pauses &amp; Stutters ({markerCounts.pausesStutters})</span>
          </button>

          <button
            type="button"
            onClick={() => setShowStrengths((v) => !v)}
            aria-pressed={showStrengths}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-label text-label-sm transition-colors duration-120",
              showStrengths
                ? "border-success/25 bg-success-container text-on-success-container"
                : "border-outline-variant bg-surface-container-low text-on-surface-variant hover:text-on-surface"
            )}
          >
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            <span>Strengths ({markerCounts.strengths})</span>
          </button>
        </div>
      </div>

      {/* Recessed waveform well + transport controls */}
      <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-4">
        <div className="relative">
          {!isReady && !loadError && (
            <div className="flex h-[88px] items-center justify-center font-body text-body-sm text-on-surface-variant">
              Rendering audio waveform...
            </div>
          )}
          {loadError && (
            <div className="flex h-[88px] items-center justify-center font-body text-body-sm text-error">
              {loadError}
            </div>
          )}
          <div
            ref={containerRef}
            className={cn(!isReady && "h-0 overflow-hidden opacity-0")}
          />
        </div>

        {/* Transport bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!isReady}
              onClick={() => skipBy(-5)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-3 font-mono text-mono-sm text-on-surface transition-colors duration-120 hover:bg-surface-container disabled:opacity-40"
              title="Back 5 seconds"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>-5s</span>
            </button>

            <button
              type="button"
              disabled={!isReady}
              onClick={togglePlay}
              aria-label={isPlaying ? "Pause audio" : "Play audio"}
              className="inline-flex h-9 items-center gap-1.5 rounded-full bg-primary px-4 font-label text-label-sm text-on-primary transition-colors duration-120 hover:bg-primary-container disabled:opacity-40"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <Play className="h-4 w-4 fill-current" aria-hidden="true" />
                  <span>Play</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={!isReady}
              onClick={() => skipBy(5)}
              className="inline-flex h-9 items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-3 font-mono text-mono-sm text-on-surface transition-colors duration-120 hover:bg-surface-container disabled:opacity-40"
              title="Forward 5 seconds"
            >
              <span>+5s</span>
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* Playback speed */}
          <div
            className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest p-1"
            role="group"
            aria-label="Playback speed"
          >
            {PLAYBACK_RATES.map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={playbackRate === rate}
                onClick={() => handleRateChange(rate)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 font-mono text-mono-sm transition-colors duration-120",
                  playbackRate === rate
                    ? "bg-primary text-on-primary"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});
