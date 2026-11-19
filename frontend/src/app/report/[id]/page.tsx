"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  Download,
  FileAudio,
  Headphones,
  History,
  Mic,
  Printer,
} from "lucide-react";
import { getSession } from "@/lib/db";
import type { PracticeSession } from "@/lib/types";
import {
  cn,
  formatDate,
  formatDurationVerbose,
  getTierBadgeClasses,
} from "@/lib/utils";
import { CoachReport } from "@/components/report/CoachReport";
import { ScoreRing } from "@/components/report/ScoreRing";
import { SyncedTranscript } from "@/components/report/SyncedTranscript";
import { TelemetryCharts } from "@/components/report/TelemetryCharts";
import {
  WaveformPlayer,
  type WaveformPlayerHandle,
} from "@/components/report/WaveformPlayer";

function getAudioExtension(mimeType?: string): string {
  const mime = (mimeType ?? "").toLowerCase();
  if (mime.includes("mp4") || mime.includes("m4a")) return ".mp4";
  if (mime.includes("wav")) return ".wav";
  if (mime.includes("mpeg") || mime.includes("mp3")) return ".mp3";
  if (mime.includes("ogg")) return ".ogg";
  if (mime.includes("webm")) return ".webm";
  return ".webm";
}

export default function ReportDashboardPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;

  const [session, setSession] = useState<PracticeSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);

  const waveformRef = useRef<WaveformPlayerHandle | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      try {
        const found = await getSession(sessionId);
        if (active) {
          setSession(found ?? null);
        }
      } catch {
        if (active) {
          setSession(null);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleSeek = useCallback((seconds: number) => {
    waveformRef.current?.seekTo(seconds, true);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 pb-8">
        <div className="h-14 animate-pulse rounded-xl border border-outline-variant bg-surface-container-lowest" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="h-48 animate-pulse rounded-xl border border-outline-variant bg-surface-container-lowest lg:col-span-7" />
          <div className="h-48 animate-pulse rounded-xl border border-outline-variant bg-surface-container-low lg:col-span-5" />
        </div>
        <div className="h-40 animate-pulse rounded-xl border border-outline-variant bg-surface-container-lowest" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-xl border border-outline-variant bg-surface-container-lowest"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-8 text-center">
        <h1 className="font-headline text-headline-md text-on-surface">
          Report Not Found
        </h1>
        <p className="mt-2 font-body text-body-md text-on-surface-variant">
          This presentation take is stored locally in your browser&apos;s
          IndexedDB and could not be found on this device.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-label text-label-sm text-on-primary transition-colors duration-120 hover:bg-primary-container"
          >
            <Mic className="h-4 w-4" aria-hidden="true" />
            <span>New Practice Take</span>
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 rounded-full border border-outline-variant bg-surface-container-low px-5 py-2.5 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            <span>View History</span>
          </Link>
        </div>
      </div>
    );
  }

  const { analysis } = session;
  const { coaching, acoustics, disfluencies } = analysis;
  const nextTakeHref = `/?title=${encodeURIComponent(session.title)}&rubric=${encodeURIComponent(analysis.rubric_id)}`;

  const handleDownloadAudio = () => {
    if (!session.audioBlob) return;
    const ext = getAudioExtension(session.audioMimeType || session.audioBlob.type);
    const url = URL.createObjectURL(session.audioBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tsa-present-${analysis.analysis_id}${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-8 pb-10">
      {/* Top Breadcrumb + Editorial Report Header */}
      <div className="space-y-3">
        <div className="no-print flex items-center justify-between gap-3">
          <Link
            href="/history"
            className="inline-flex items-center gap-1.5 font-label text-label-md text-on-surface-variant transition-colors duration-120 hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Back to Practice History</span>
          </Link>
        </div>

        <section className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-0.5 font-mono text-mono-sm text-on-surface-variant">
                {analysis.rubric_id}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-mono-sm text-on-surface-variant tabular-nums">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDate(session.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 font-mono text-mono-sm text-on-surface-variant tabular-nums">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDurationVerbose(acoustics.duration_sec)}
              </span>
            </div>

            <h1 className="font-headline text-headline-lg tracking-tight text-on-surface print-text-dark">
              {session.title}
            </h1>
          </div>

          <div className="no-print flex flex-wrap items-center gap-2">
            {session.audioBlob && (
              <button
                type="button"
                onClick={handleDownloadAudio}
                className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container-low"
              >
                <FileAudio
                  className="h-4 w-4 text-tertiary"
                  aria-hidden="true"
                />
                <span>Download Audio</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleExportJson}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container-low"
            >
              <Download className="h-4 w-4 text-primary" aria-hidden="true" />
              <span>Export JSON</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-2 font-label text-label-sm text-on-surface transition-colors duration-120 hover:bg-surface-container-low"
            >
              <Printer className="h-4 w-4 text-secondary" aria-hidden="true" />
              <span>Print / Save PDF</span>
            </button>

            <Link
              href={nextTakeHref}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 font-label text-label-sm text-on-primary transition-colors duration-120 hover:bg-primary-container"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span>Record Next Take</span>
            </Link>
          </div>
        </section>
      </div>

      {/* Warnings Banner */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-xl border border-warning/25 bg-warning-container/60 p-4 text-on-warning-container">
          <div className="flex items-center gap-2 font-title text-title-md text-on-warning-container">
            <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
            <span>Analysis Notices</span>
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-1 font-body text-body-sm text-on-warning-container">
            {analysis.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Executive Score Split + What the AI Coach Heard */}
      <section className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
        <div className="print-card flex flex-col items-center gap-6 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 sm:flex-row sm:items-center lg:col-span-7">
          <div className="shrink-0">
            <ScoreRing
              score={coaching.overall_score}
              tier={coaching.overall_tier}
              size={156}
            />
          </div>

          <div className="flex-1 space-y-3 text-center sm:text-left">
            <div className="flex flex-wrap items-center justify-center gap-2.5 sm:justify-start">
              <span
                className={cn(
                  "inline-flex items-center rounded-full border px-3 py-1 font-label text-label-md",
                  getTierBadgeClasses(coaching.overall_tier)
                )}
              >
                {coaching.overall_tier} Delivery
              </span>
              <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                {Math.round(coaching.overall_score)} / 100
              </span>
            </div>

            <p className="font-body text-body-md leading-relaxed text-on-surface-variant">
              {coaching.executive_summary}
            </p>
          </div>
        </div>

        {/* What the AI Coach Heard Callout */}
        <article className="print-card flex flex-col justify-center gap-3 rounded-xl border border-outline-variant bg-surface-container-low p-6 lg:col-span-5">
          <header className="flex items-center gap-2">
            <Headphones
              className="h-5 w-5 text-tertiary"
              aria-hidden="true"
            />
            <h2 className="font-title text-title-md text-on-surface print-text-dark">
              What the AI Coach Heard
            </h2>
          </header>
          <p className="font-body text-body-md leading-relaxed text-on-surface-variant">
            {coaching.vocal_delivery_impression}
          </p>
        </article>
      </section>

      {/* Waveform & Synced Transcript */}
      <WaveformPlayer
        ref={waveformRef}
        audioBlob={session.audioBlob}
        words={analysis.words}
        pauses={disfluencies.pauses}
        moments={coaching.timestamped_moments}
        audibleEvents={
          analysis.disfluencies.audible_events ??
          analysis.coaching.audible_disfluencies ??
          []
        }
        durationFallbackSec={acoustics.duration_sec}
        onTimeUpdate={setCurrentTime}
      />

      <SyncedTranscript
        transcript={analysis.transcript}
        words={analysis.words}
        pauses={disfluencies.pauses}
        currentTime={currentTime}
        onSeek={handleSeek}
      />

      {/* Acoustic & Disfluency Telemetry */}
      <TelemetryCharts acoustics={acoustics} disfluencies={disfluencies} />

      {/* Rubric Breakdown, Moments, Strengths & Drills */}
      <CoachReport
        sessionTitle={session.title}
        analysis={analysis}
        audioBlob={session.audioBlob}
        audioMimeType={session.audioMimeType}
        onSeek={handleSeek}
      />
    </div>
  );
}
