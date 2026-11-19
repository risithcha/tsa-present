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
        <strong key={idx} className="font-semibold text-on-surface">
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
    badge: "border-success/20 bg-success-container text-on-success-container",
  },
  hiccup: {
    label: "Hiccup",
    badge: "border-error/20 bg-error-container text-on-error-container",
  },
  pacing: {
    label: "Pacing",
    badge: "border-warning/20 bg-warning-container text-on-warning-container",
  },
  tone: {
    label: "Tone",
    badge:
      "border-secondary/20 bg-secondary-container text-on-secondary-container",
  },
  structure: {
    label: "Structure",
    badge: "border-primary/20 bg-surface-container text-primary",
  },
};

function getScoreBarClass(score: number): string {
  if (score >= 85) return "bg-success";
  if (score >= 70) return "bg-primary";
  if (score >= 55) return "bg-warning";
  return "bg-error";
}

function getScoreTextClass(score: number): string {
  if (score >= 85) return "text-success";
  if (score >= 70) return "text-primary";
  if (score >= 55) return "text-warning";
  return "text-error";
}

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
          <Award className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-headline-sm text-on-surface print-text-dark">
            Rubric Breakdown
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {coaching.criterion_scores.map((criterion) => (
            <article
              key={criterion.criterion_id}
              className="print-card flex flex-col justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-5"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-title text-title-md text-on-surface print-text-dark">
                      {criterion.name}
                    </h3>
                    <span className="font-label text-label-sm text-on-surface-variant">
                      Weight: {Math.round(criterion.weight * 100)}%
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 font-label text-label-sm",
                        getTierBadgeClasses(criterion.tier)
                      )}
                    >
                      {criterion.tier}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-mono-md font-bold tabular-nums",
                        getScoreTextClass(criterion.score)
                      )}
                    >
                      {Math.round(criterion.score)}/100
                    </span>
                  </div>
                </div>

                {/* Score progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-surface-container">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      getScoreBarClass(criterion.score)
                    )}
                    style={{
                      width: `${Math.max(0, Math.min(100, criterion.score))}%`,
                    }}
                  />
                </div>

                <p className="mt-3 font-body text-body-sm leading-relaxed text-on-surface-variant">
                  {criterion.summary}
                </p>
              </div>

              {criterion.evidence_timestamps.length > 0 && (
                <div className="no-print flex flex-wrap items-center gap-1.5 border-t border-outline-variant/60 pt-3">
                  <span className="font-label text-label-sm text-on-surface-variant">
                    Evidence:
                  </span>
                  {criterion.evidence_timestamps.map((ts, idx) => (
                    <button
                      key={`${criterion.criterion_id}-ts-${idx}`}
                      type="button"
                      onClick={() => onSeek(ts)}
                      className="inline-flex items-center gap-1 rounded-full border border-outline-variant/70 bg-surface-container-low px-2.5 py-0.5 font-mono text-mono-sm text-primary transition-colors duration-120 hover:bg-surface-container"
                    >
                      <Play className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                      <span>{formatTime(ts)}</span>
                    </button>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* Timestamped Moments + Top Strengths & Actionable Drills */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        {/* Timestamped Coaching Moments */}
        <article className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 lg:col-span-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-tertiary" aria-hidden="true" />
              <h2 className="font-headline text-headline-sm text-on-surface print-text-dark">
                Timestamped Coaching Moments
              </h2>
            </div>

            <div
              role="tablist"
              aria-label="Coaching moments filter"
              className="no-print inline-flex gap-1 rounded-full border border-outline-variant/60 bg-surface-container-low p-1"
            >
              {(
                [
                  { id: "all", label: "All" },
                  { id: "improvements", label: "Improvements" },
                  { id: "strengths", label: "Strengths" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  role="tab"
                  type="button"
                  aria-selected={momentFilter === tab.id}
                  onClick={() => setMomentFilter(tab.id)}
                  className={cn(
                    "rounded-full px-3 py-1 font-label text-label-sm transition-colors duration-120",
                    momentFilter === tab.id
                      ? "bg-surface-container-lowest text-on-surface shadow-xs"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {filteredMoments.length === 0 ? (
            <p className="rounded-lg border border-outline-variant/60 bg-surface-container-low py-6 text-center font-body text-body-sm text-on-surface-variant">
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
                    className="group cursor-pointer rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 transition-colors duration-120 hover:border-primary/40 hover:bg-surface-container/60"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-2.5 py-0.5 font-mono text-mono-sm font-medium text-primary group-hover:border-primary/40">
                        <Play
                          className="h-2.5 w-2.5 fill-current"
                          aria-hidden="true"
                        />
                        <span>{formatTime(moment.timestamp_sec)}</span>
                      </span>
                      <span
                        className={cn(
                          "rounded-full border px-2.5 py-0.5 font-label text-label-sm",
                          cat.badge
                        )}
                      >
                        {cat.label}
                      </span>
                      <h3 className="font-title text-title-md text-on-surface print-text-dark">
                        {moment.title}
                      </h3>
                    </div>

                    <p className="mt-2 font-body text-body-sm leading-relaxed text-on-surface-variant">
                      {moment.observation}
                    </p>

                    {moment.suggestion && (
                      <p className="mt-1.5 font-body text-body-sm text-tertiary">
                        <span className="font-semibold">Tip:</span>{" "}
                        {moment.suggestion}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </article>

        {/* Right Stack: Top Strengths & Actionable Practice Drills */}
        <div className="flex flex-col gap-6 lg:col-span-5">
          <article className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <CheckCircle2
                className="h-5 w-5 text-success"
                aria-hidden="true"
              />
              <h3 className="font-title text-title-md text-on-surface print-text-dark">
                Top Strengths
              </h3>
            </div>
            <ul className="space-y-2.5">
              {coaching.top_strengths.map((item, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 font-body text-body-sm leading-relaxed text-on-surface-variant"
                >
                  <CheckCircle2
                    className="mt-0.5 h-4 w-4 shrink-0 text-success"
                    aria-hidden="true"
                  />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" aria-hidden="true" />
              <h3 className="font-title text-title-md text-on-surface print-text-dark">
                Actionable Practice Drills
              </h3>
            </div>
            <ol className="space-y-3">
              {coaching.actionable_drills.map((drill, idx) => (
                <li
                  key={idx}
                  className="flex items-start gap-2.5 font-body text-body-sm leading-relaxed text-on-surface-variant"
                >
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-primary/20 bg-surface-container-low font-mono text-mono-sm font-semibold text-primary tabular-nums">
                    {idx + 1}
                  </span>
                  <span>{renderInlineBold(drill)}</span>
                </li>
              ))}
            </ol>
          </article>
        </div>
      </div>

      {/* Action Buttons Bar */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
        <div className="flex flex-wrap items-center gap-2">
          {audioBlob && (
            <button
              type="button"
              onClick={handleDownloadAudio}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-4 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container"
            >
              <FileAudio className="h-4 w-4 text-tertiary" aria-hidden="true" />
              <span>Download Audio</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-4 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container"
          >
            <Download className="h-4 w-4 text-primary" aria-hidden="true" />
            <span>Export JSON</span>
          </button>

          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-low px-4 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container"
          >
            <Printer className="h-4 w-4 text-secondary" aria-hidden="true" />
            <span>Print / Save PDF</span>
          </button>
        </div>

        <Link
          href={nextTakeHref}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-label text-label-sm text-on-primary transition-colors duration-120 hover:bg-primary-container"
        >
          <Mic className="h-4 w-4" aria-hidden="true" />
          <span>Record Next Take</span>
        </Link>
      </div>
    </div>
  );
}
