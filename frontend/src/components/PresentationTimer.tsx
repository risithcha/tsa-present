"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock, Pause, Play, RotateCcw } from "lucide-react";
import type { TimerPresetId } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

interface PresetConfig {
  id: TimerPresetId;
  label: string;
  shortLabel: string;
  minSec: number | null;
  maxSec: number | null;
}

const PRESETS: PresetConfig[] = [
  {
    id: "free",
    label: "Free Practice",
    shortLabel: "Free",
    minSec: null,
    maxSec: null,
  },
  {
    id: "tsa_prepared",
    label: "TSA Prepared (3–5m)",
    shortLabel: "Prepared 3–5m",
    minSec: 180,
    maxSec: 300,
  },
  {
    id: "tsa_extemp",
    label: "TSA Extemp (2–4m)",
    shortLabel: "Extemp 2–4m",
    minSec: 120,
    maxSec: 240,
  },
  {
    id: "custom",
    label: "Custom",
    shortLabel: "Custom",
    minSec: 60,
    maxSec: 180,
  },
];

interface PresentationTimerProps {
  isRecordingActive: boolean;
  recordingElapsedSec: number;
  defaultMinSec?: number | null;
  defaultMaxSec?: number | null;
  onRangeChange?: (minSec: number | null, maxSec: number | null) => void;
}

export function PresentationTimer({
  isRecordingActive,
  recordingElapsedSec,
  defaultMinSec,
  defaultMaxSec,
  onRangeChange,
}: PresentationTimerProps) {
  const [preset, setPreset] = useState<TimerPresetId>("tsa_prepared");
  const [customMinInput, setCustomMinInput] = useState("1");
  const [customMaxInput, setCustomMaxInput] = useState("3");

  // Standalone stopwatch state when not actively recording
  const [standaloneSec, setStandaloneSec] = useState(0);
  const [standaloneRunning, setStandaloneRunning] = useState(false);

  // Sync default rubric range if provided
  useEffect(() => {
    if (defaultMinSec === 180 && defaultMaxSec === 300) {
      setPreset("tsa_prepared");
    } else if (defaultMinSec === 120 && defaultMaxSec === 240) {
      setPreset("tsa_extemp");
    } else if (defaultMinSec && defaultMaxSec) {
      setPreset("custom");
      setCustomMinInput(String(Math.round((defaultMinSec / 60) * 10) / 10));
      setCustomMaxInput(String(Math.round((defaultMaxSec / 60) * 10) / 10));
    }
  }, [defaultMinSec, defaultMaxSec]);

  useEffect(() => {
    if (!standaloneRunning || isRecordingActive) return;
    const interval = setInterval(() => {
      setStandaloneSec((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [standaloneRunning, isRecordingActive]);

  const { minSec, maxSec } = useMemo(() => {
    if (preset === "free") return { minSec: null, maxSec: null };
    if (preset === "tsa_prepared") return { minSec: 180, maxSec: 300 };
    if (preset === "tsa_extemp") return { minSec: 120, maxSec: 240 };
    const parsedMin = Math.max(0, Math.round(Number(customMinInput || 0) * 60));
    const parsedMax = Math.max(
      parsedMin + 10,
      Math.round(Number(customMaxInput || 0) * 60)
    );
    return {
      minSec: parsedMin > 0 ? parsedMin : null,
      maxSec: parsedMax > 0 ? parsedMax : null,
    };
  }, [preset, customMinInput, customMaxInput]);

  useEffect(() => {
    onRangeChange?.(minSec, maxSec);
  }, [minSec, maxSec, onRangeChange]);

  const displayedSec = isRecordingActive ? recordingElapsedSec : standaloneSec;

  const zone = useMemo(() => {
    if (minSec === null || maxSec === null) {
      return {
        status: "neutral" as const,
        label: "Open Pacing",
        cardClass: "border-white/10 bg-slate-900/60",
        pillClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/30",
        dotClass: "bg-indigo-400",
        timerClass: "text-white",
      };
    }

    const warnStart = Math.max(minSec, maxSec - 30);

    if (displayedSec > maxSec) {
      return {
        status: "red" as const,
        label: "RED CARD • Overtime",
        cardClass:
          "border-rose-500/45 bg-rose-950/35 shadow-[0_0_30px_-8px_rgba(244,63,94,0.4)]",
        pillClass: "bg-rose-500/20 text-rose-200 border-rose-500/40",
        dotClass: "bg-rose-400",
        timerClass: "text-rose-200",
      };
    }

    if (displayedSec >= warnStart) {
      return {
        status: "amber" as const,
        label: "AMBER CARD • Wrap Up Soon",
        cardClass:
          "border-amber-500/45 bg-amber-950/30 shadow-[0_0_30px_-8px_rgba(245,158,11,0.35)]",
        pillClass: "bg-amber-500/20 text-amber-200 border-amber-500/40",
        dotClass: "bg-amber-400",
        timerClass: "text-amber-200",
      };
    }

    if (displayedSec >= minSec) {
      return {
        status: "green" as const,
        label: "GREEN CARD • In Target Window",
        cardClass:
          "border-emerald-500/45 bg-emerald-950/30 shadow-[0_0_30px_-8px_rgba(16,185,129,0.35)]",
        pillClass: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
        dotClass: "bg-emerald-400",
        timerClass: "text-emerald-200",
      };
    }

    return {
      status: "building" as const,
      label: `Target ${formatTime(minSec)}–${formatTime(maxSec)}`,
      cardClass: "border-white/10 bg-slate-900/60",
      pillClass: "bg-slate-800/80 text-slate-300 border-white/10",
      dotClass: "bg-cyan-400",
      timerClass: "text-white",
    };
  }, [displayedSec, minSec, maxSec]);

  const progressPct = useMemo(() => {
    if (!maxSec || maxSec <= 0) return 0;
    return Math.min(100, (displayedSec / maxSec) * 100);
  }, [displayedSec, maxSec]);

  return (
    <div
      className={cn(
        "rounded-2xl border p-4 transition-colors duration-300 sm:p-5",
        zone.cardClass
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-cyan-400" />
          <h3 className="text-sm font-semibold text-slate-100">
            TSA Timekeeper
          </h3>
        </div>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide",
            zone.pillClass
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", zone.dotClass)} />
          {zone.label}
        </span>
      </div>

      {/* Preset selector pills */}
      <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {PRESETS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPreset(item.id)}
            className={cn(
              "rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all",
              preset === item.id
                ? "border-indigo-400/50 bg-indigo-500/20 text-white"
                : "border-white/[0.06] bg-white/[0.03] text-slate-400 hover:bg-white/[0.06] hover:text-slate-200"
            )}
          >
            {item.shortLabel}
          </button>
        ))}
      </div>

      {preset === "custom" && (
        <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl border border-white/[0.06] bg-slate-950/50 p-3">
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            <span>Min (minutes)</span>
            <input
              type="number"
              min="0.5"
              max="30"
              step="0.5"
              value={customMinInput}
              onChange={(e) => setCustomMinInput(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-slate-400">
            <span>Max (minutes)</span>
            <input
              type="number"
              min="0.5"
              max="45"
              step="0.5"
              value={customMaxInput}
              onChange={(e) => setCustomMaxInput(e.target.value)}
              className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:border-cyan-400 focus:outline-none"
            />
          </label>
        </div>
      )}

      {/* Live readout */}
      <div className="mt-4 flex items-center justify-between gap-4">
        <div>
          <div
            className={cn(
              "font-mono text-3xl font-bold tracking-tight tabular-nums sm:text-4xl",
              zone.timerClass
            )}
          >
            {formatTime(displayedSec)}
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {isRecordingActive
              ? "Synced with live microphone recording"
              : minSec && maxSec
                ? `Green at ${formatTime(minSec)} • Amber at ${formatTime(Math.max(minSec, maxSec - 30))} • Red after ${formatTime(maxSec)}`
                : "No strict time limit"}
          </p>
        </div>

        {!isRecordingActive && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStandaloneRunning((r) => !r)}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
              title={standaloneRunning ? "Pause timer" : "Start practice timer"}
            >
              {standaloneRunning ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4" />
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setStandaloneRunning(false);
                setStandaloneSec(0);
              }}
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
              title="Reset timer"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      {/* Target zone progress bar */}
      {minSec !== null && maxSec !== null && (
        <div className="mt-3">
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-white/5">
            {/* Green window marker */}
            <div
              className="absolute inset-y-0 bg-emerald-500/20"
              style={{
                left: `${(minSec / maxSec) * 100}%`,
                right: `${Math.min(100, (30 / maxSec) * 100)}%`,
              }}
            />
            <div
              className={cn(
                "h-full rounded-full transition-all duration-300",
                zone.status === "red" && "bg-rose-500",
                zone.status === "amber" && "bg-amber-400",
                zone.status === "green" && "bg-emerald-400",
                zone.status === "building" && "bg-cyan-400"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
