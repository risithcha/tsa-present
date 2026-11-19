"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Award,
  CheckCircle2,
  Download,
  Dumbbell,
  FileAudio,
  Mic,
  Play,
  Printer,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type {
  AnalysisResponse,
  MomentCategory,
  TimestampedMoment,
} from "@/lib/types";
import { cn, formatTime, getTierBadgeClasses } from "@/lib/utils";

interface CoachReportProps {
  sessionTitle: string;
  analysis: AnalysisResponse;
  audioBlob?: Blob;
  audioMimeType?: string;
  onSeek: (seconds: number) => void;
}

function getAudioExtension(mimeType?: string): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return ".mp4";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("webm")) return ".webm";
  return ".webm";
}

function renderInlineBold(text: string) {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

type MomentFilter = "all" | "strengths" | "improvements";

const CATEGORY_STYLE: Record<
  MomentCategory,
  { label: string; badge: string }
> = {
  strength: {
    label: "Strength",
    badge: "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
  },
  hiccup: {
    label: "Hiccup",
    badge: "border-rose-500/35 bg-rose-500/15 text-rose-300",
  },
  pacing: {
    label: "Pacing",
    badge: "border-amber-500/35 bg-amber-500/15 text-amber-300",
  },
  tone: {
    label: "Tone",
    badge: "border-cyan-500/35 bg-cyan-500/15 text-cyan-300",
  },
  structure: {
    label: "Structure",
    badge: "border-indigo-500/35 bg-indigo-500/15 text-indigo-300",
  },
};

export function CoachReport({
  sessionTitle,
  analysis,
  audioBlob,
  audioMimeType,
  onSeek,
}: CoachReportProps) {
  const [momentFilter, setMomentFilter] = useState<MomentFilter>("all");
  const { coaching } = analysis;

  const filteredMoments = useMemo(() => {
    const sorted = [...coaching.timestamped_moments].sort(
      (a, b) => a.timestamp_sec - b.timestamp_sec
    );
    if (momentFilter === "strengths") {
      return sorted.filter((m) => m.category === "strength");
    }
    if (momentFilter === "improvements") {
      return sorted.filter((m) => m.category !== "strength");
    }
    return sorted;
  }, [coaching.timestamped_moments, momentFilter]);

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify(analysis, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tsa-present-${analysis.analysis_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadAudio = () => {
    if (!audioBlob) return;
    const ext = getAudioExtension(audioMimeType || audioBlob.type);
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tsa-present-${analysis.analysis_id}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const nextTakeHref = `/?title=${encodeURIComponent(sessionTitle)}&rubric=${encodeURIComponent(analysis.rubric_id)}`;

  return (
    <div className="space-y-6">
      {/* Rubric Criterion Cards */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Award className="h-4 w-4 text-indigo-400" />
          <h2 className="text-base font-semibold text-white print-text-dark">
            Rubric Breakdown
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {coaching.criterion_scores.map((criterion) => (
            <div
              key={criterion.criterion_id}
              className="print-card flex flex-col justify-between rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-white print-text-dark">
                      {criterion.name}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      Weight: {Math.round(criterion.weight * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        getTierBadgeClasses(criterion.tier)
                      )}
                    >
                      {criterion.tier}
                    </span>
                    <span className="font-mono text-lg font-bold text-white print-text-dark">
                      {Math.round(criterion.score)}
                    </span>
                  </div>
                </div>

                {/* Score bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-950/80 ring-1 ring-white/5">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      criterion.score >= 85
                        ? "bg-emerald-400"
                        : criterion.score >= 70
                          ? "bg-cyan-400"
                          : criterion.score >= 55
                            ? "bg-amber-400"
                            : "bg-rose-500"
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(100, criterion.score))}%`,
                    }}
                  />
                </div>

                <p className="mt-3 text-xs leading-relaxed text-slate-300 print:text-slate-700">
                  {criterion.summary}
                </p>
              </div>

              {criterion.evidence_timestamps.length > 0 && (
                <div className="no-print mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/[0.06] pt-3">
                  <span className="text-[11px] text-slate-500">Evidence:</span>
                  {criterion.evidence_timestamps.map((ts, idx) => (
                    <button
                      key={`${criterion.criterion_id}-ts-${idx}`}
                      type="button"
                      onClick={() => onSeek(ts)}
                      className="inline-flex items-center gap-1 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-2 py-0.5 font-mono text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                    >
                      <Play className="h-2.5 w-2.5 fill-current" />
                      {formatTime(ts)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Timestamped Moments Timeline */}
      <section className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-cyan-400" />
            <h2 className="text-base font-semibold text-white print-text-dark">
              Timestamped Coaching Moments
            </h2>
          </div>

          <div className="no-print inline-flex rounded-xl border border-white/10 bg-slate-950/75 p-1 text-xs">
            {(
              [
                { id: "all", label: "All Moments" },
                { id: "strengths", label: "Strengths" },
                { id: "improvements", label: "Hiccups & Pacing" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setMomentFilter(tab.id)}
                className={cn(
                  "rounded-lg px-3 py-1 font-medium transition",
                  momentFilter === tab.id
                    ? "bg-indigo-500/25 text-white ring-1 ring-indigo-400/40"
                    : "text-slate-400 hover:text-slate-200"
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredMoments.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-400">
            No moments match the selected filter.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredMoments.map((moment: TimestampedMoment, idx: number) => {
              const cat = CATEGORY_STYLE[moment.category];
              return (
                <div
                  key={`${moment.timestamp_sec}-${idx}`}
                  onClick={() => onSeek(moment.timestamp_sec)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSeek(moment.timestamp_sec);
                    }
                  }}
                  className="group cursor-pointer rounded-xl border border-white/[0.07] bg-slate-950/60 p-4 transition hover:border-cyan-400/40 hover:bg-slate-900/80"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center gap-1 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-cyan-300 group-hover:bg-cyan-500/25">
                        <Play className="h-3 w-3 fill-current" />
                        {formatTime(moment.timestamp_sec)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          cat.badge
                        )}
                      >
                        {cat.label}
                      </span>
                      <h3 className="text-sm font-semibold text-white print-text-dark">
                        {moment.title}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-slate-300 print:text-slate-700">
                    {moment.observation}
                  </p>
                  {moment.suggestion && (
                    <p className="mt-1.5 text-xs text-cyan-300/90 print:text-indigo-700">
                      <span className="font-semibold">Tip:</span>{" "}
                      {moment.suggestion}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Top Strengths & Actionable Drills */}
      <section className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="print-card rounded-2xl border border-emerald-500/20 bg-emerald-950/15 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-emerald-400" />
            <h2 className="text-sm font-semibold text-white print-text-dark">
              Top Strengths
            </h2>
          </div>
          <ul className="space-y-2.5">
            {coaching.top_strengths.map((item, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-200 print:text-slate-800"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="print-card rounded-2xl border border-indigo-500/25 bg-indigo-950/20 p-5 backdrop-blur-xl">
          <div className="mb-3 flex items-center gap-2">
            <Dumbbell className="h-4 w-4 text-indigo-400" />
            <h2 className="text-sm font-semibold text-white print-text-dark">
              Next-Take Practice Drills
            </h2>
          </div>
          <ol className="space-y-2.5">
            {coaching.actionable_drills.map((drill, idx) => (
              <li
                key={idx}
                className="flex items-start gap-2.5 text-xs leading-relaxed text-slate-200 print:text-slate-800"
              >
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500/25 font-mono text-[10px] font-bold text-indigo-300">
                  {idx + 1}
                </span>
                <span>{renderInlineBold(drill)}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Action Buttons */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <Download className="h-4 w-4 text-cyan-400" />
            Export JSON
          </button>

          {audioBlob && (
            <button
              type="button"
              onClick={handleDownloadAudio}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
            >
              <FileAudio className="h-4 w-4 text-emerald-400" />
              Download Audio
            </button>
          )}

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-white/10"
          >
            <Printer className="h-4 w-4 text-indigo-400" />
            Print / Save PDF
          </button>
        </div>

        <Link
          href={nextTakeHref}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110"
        >
          <Mic className="h-4 w-4" />
          Record Next Take
        </Link>
      </div>
    </div>
  );
}
