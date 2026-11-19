"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
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
    label: "TSA Prepared 3–5m",
    shortLabel: "TSA Prepared 3–5m",
    minSec: 180,
    maxSec: 300,
  },
  {
    id: "tsa_extemp",
    label: "TSA Extemp 2–4m",
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
        label: "Open pacing",
        statusClass: "text-on-surface-variant",
        timerClass: "text-on-surface",
      };
    }

    const warnStart = Math.max(minSec, maxSec - 30);

    if (displayedSec > maxSec) {
      return {
        status: "red" as const,
        label: `Overtime · Max ${formatTime(maxSec)}`,
        statusClass: "text-error",
        timerClass: "text-error",
      };
    }

    if (displayedSec >= warnStart) {
      return {
        status: "amber" as const,
        label: `Wrap up soon · Max ${formatTime(maxSec)}`,
        statusClass: "text-warning",
        timerClass: "text-warning",
      };
    }

    if (displayedSec >= minSec) {
      return {
        status: "green" as const,
        label: `In target window (${formatTime(minSec)}–${formatTime(maxSec)})`,
        statusClass: "text-success",
        timerClass: "text-on-surface",
      };
    }

    return {
      status: "building" as const,
      label: `Target window ${formatTime(minSec)}–${formatTime(maxSec)}`,
      statusClass: "text-on-surface-variant",
      timerClass: "text-on-surface",
    };
  }, [displayedSec, minSec, maxSec]);

  const progressPct = useMemo(() => {
    if (!maxSec || maxSec <= 0) return 0;
    return Math.min(100, (displayedSec / maxSec) * 100);
  }, [displayedSec, maxSec]);

  const targetWindowStyle = useMemo(() => {
    if (!minSec || !maxSec || maxSec <= 0) return null;
    const warnStart = Math.max(minSec, maxSec - 30);
    const leftPct = Math.min(100, Math.max(0, (minSec / maxSec) * 100));
    const widthPct = Math.max(0, Math.min(100 - leftPct, ((warnStart - minSec) / maxSec) * 100));
    return {
      left: `${leftPct}%`,
      width: `${widthPct}%`,
    };
  }, [minSec, maxSec]);

  return (
    <section
      aria-label="Presentation Timekeeper"
      className="flex flex-col gap-gutter-md"
    >
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex flex-wrap items-center gap-gutter-md">
          <div className="flex items-center gap-gutter-sm">
            <div
              className={cn(
                "font-mono text-mono-lg-mobile sm:text-mono-lg tabular-nums transition-colors duration-[120ms]",
                zone.timerClass
              )}
            >
              {formatTime(displayedSec)}
            </div>

            {!isRecordingActive && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setStandaloneRunning((r) => !r)}
                  aria-label={standaloneRunning ? "Pause practice timer" : "Start practice timer"}
                  title={standaloneRunning ? "Pause timer" : "Start practice timer"}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface transition-colors duration-[120ms] hover:bg-surface-container-low focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {standaloneRunning ? (
                    <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStandaloneRunning(false);
                    setStandaloneSec(0);
                  }}
                  aria-label="Reset practice timer"
                  title="Reset timer"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors duration-[120ms] hover:bg-surface-container-low hover:text-on-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-label text-label-md",
              zone.statusClass
            )}
          >
            {zone.status === "green" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : zone.status === "red" || zone.status === "amber" ? (
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            ) : (
              <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{zone.label}</span>
          </span>
        </div>

        <div
          role="group"
          aria-label="Timekeeper presets"
          className="inline-flex flex-wrap items-center gap-1"
        >
          {PRESETS.map((item) => {
            const active = preset === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={active}
                onClick={() => setPreset(item.id)}
                className={cn(
                  "rounded-full px-3 py-1 font-label text-label-sm transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  active
                    ? "border border-outline-variant bg-surface-container-lowest text-primary"
                    : "border border-transparent text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                )}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </div>
      </div>

      {preset === "custom" && (
        <div className="grid grid-cols-2 gap-3 rounded-md border border-outline-variant bg-surface-container-low p-3 sm:max-w-sm">
          <label className="flex flex-col gap-1 font-label text-label-sm text-on-surface-variant">
            <span>Min (minutes)</span>
            <input
              type="number"
              min="0.5"
              max="30"
              step="0.5"
              value={customMinInput}
              onChange={(e) => setCustomMinInput(e.target.value)}
              className="rounded border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-mono text-mono-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 font-label text-label-sm text-on-surface-variant">
            <span>Max (minutes)</span>
            <input
              type="number"
              min="0.5"
              max="45"
              step="0.5"
              value={customMaxInput}
              onChange={(e) => setCustomMaxInput(e.target.value)}
              className="rounded border border-outline-variant bg-surface-container-lowest px-2.5 py-1.5 font-mono text-mono-sm text-on-surface focus:border-primary focus:outline-none"
            />
          </label>
        </div>
      )}

      {minSec !== null && maxSec !== null ? (
        <div className="flex flex-col gap-1.5">
          <div className="relative h-3 overflow-hidden rounded-full bg-surface-container-high">
            {targetWindowStyle && (
              <div
                className="absolute inset-y-0 bg-success-container"
                style={targetWindowStyle}
              />
            )}
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
                zone.status === "red" && "bg-error",
                zone.status === "amber" && "bg-warning",
                zone.status === "green" && "bg-success",
                zone.status === "building" && "bg-primary"
              )}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <div className="flex items-center justify-between font-mono text-mono-sm text-on-surface-variant tabular-nums">
            <span>0:00</span>
            <span>Min {formatTime(minSec)}</span>
            <span>Max {formatTime(maxSec)}</span>
          </div>
        </div>
      ) : (
        <p className="font-body text-body-sm text-on-surface-variant">
          {isRecordingActive
            ? "Synced with live microphone recording · Open time limit."
            : "Open pacing mode — practice freely with no strict target cutoff."}
        </p>
      )}
    </section>
  );
}
