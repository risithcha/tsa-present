"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  Clock,
  Headphones,
  History,
  Mic,
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
      <div className="space-y-6">
        <div className="h-48 animate-pulse rounded-3xl border border-white/5 bg-slate-900/50" />
        <div className="h-40 animate-pulse rounded-2xl border border-white/5 bg-slate-900/50" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-2xl border border-white/5 bg-slate-900/50"
            />
          ))}
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="mx-auto max-w-lg rounded-3xl border border-white/10 bg-slate-900/70 p-8 text-center backdrop-blur-xl">
        <h1 className="text-xl font-bold text-white">Report Not Found</h1>
        <p className="mt-2 text-sm text-slate-400">
          This presentation take is stored locally in your browser&apos;s
          IndexedDB and could not be found on this device.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white"
          >
            <Mic className="h-4 w-4" />
            New Practice Take
          </Link>
          <Link
            href="/history"
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
          >
            <History className="h-4 w-4" />
            View History
          </Link>
        </div>
      </div>
    );
  }

  const { analysis } = session;
  const { coaching, acoustics, disfluencies } = analysis;

  return (
    <div className="space-y-6 pb-8">
      {/* Top Breadcrumb */}
      <div className="no-print flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/history"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Practice History
        </Link>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 font-mono text-[11px] text-slate-300">
            {analysis.rubric_id}
          </span>
        </div>
      </div>

      {/* Warnings Banner */}
      {analysis.warnings.length > 0 && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
          <div className="flex items-center gap-2 font-semibold text-amber-100">
            <AlertTriangle className="h-4 w-4 text-amber-400" />
            Analysis Notices
          </div>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-amber-200/90">
            {analysis.warnings.map((warning, idx) => (
              <li key={idx}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Hero Scorecard */}
      <section className="print-card relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/75 to-indigo-950/40 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:gap-8">
          {/* Score Ring */}
          <div className="flex shrink-0 flex-col items-center justify-center">
            <ScoreRing
              score={coaching.overall_score}
              tier={coaching.overall_tier}
              size={156}
            />
          </div>

          {/* Summary & Meta */}
          <div className="flex-1 space-y-4">
            <div className="flex flex-wrap items-center gap-2.5">
              <span
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide",
                  getTierBadgeClasses(coaching.overall_tier)
                )}
              >
                {coaching.overall_tier} Delivery
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(session.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                <Clock className="h-3.5 w-3.5" />
                {formatDurationVerbose(acoustics.duration_sec)}
              </span>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white print-text-dark sm:text-3xl">
                {session.title}
              </h1>
              <p className="mt-2 text-sm leading-relaxed text-slate-300 print:text-slate-700">
                {coaching.executive_summary}
              </p>
            </div>

            {/* What the AI Coach Heard Callout */}
            <div className="rounded-2xl border border-cyan-500/25 bg-cyan-500/[0.08] p-4">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-cyan-300 print:text-indigo-700">
                <Headphones className="h-4 w-4" />
                What the AI Coach Heard
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-200 print:text-slate-800">
                {coaching.vocal_delivery_impression}
              </p>
            </div>
          </div>
        </div>
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
