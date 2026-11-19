"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Calendar,
  Clock,
  Gauge,
  History,
  Mic,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { deleteSession, listSessions } from "@/lib/db";
import type { PracticeSession } from "@/lib/types";
import {
  cn,
  formatDate,
  formatDurationVerbose,
  formatShortDate,
  getTierBadgeClasses,
} from "@/lib/utils";

export default function HistoryPage() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await listSessions();
      setSessions(items);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleDelete = async (id: string) => {
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setConfirmDeleteId(null);
  };

  // Chronological order for progress chart
  const progressData = useMemo(() => {
    return [...sessions]
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((s, idx) => ({
        take: `#${idx + 1}`,
        date: formatShortDate(s.createdAt),
        title: s.title,
        score: Math.round(s.analysis.coaching.overall_score),
        fillersPerMin: Number(
          s.analysis.disfluencies.fillers_per_minute.toFixed(1)
        ),
      }));
  }, [sessions]);

  return (
    <div className="space-y-6 pb-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-medium text-cyan-300">
            <History className="h-3.5 w-3.5" />
            Local Browser Vault
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Practice History
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Review past presentations, replay audio waveforms, and track your
            improvement across takes.
          </p>
        </div>

        <Link
          href="/"
          className="inline-flex items-center gap-2 self-start rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 sm:self-auto"
        >
          <Mic className="h-4 w-4" />
          New Practice Take
        </Link>
      </section>

      {/* Progress Over Time Chart (when 2+ takes exist) */}
      {sessions.length >= 2 && (
        <section className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl">
          <div className="mb-4 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-emerald-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">
                  Progress Over Time
                </h2>
                <p className="text-xs text-slate-400">
                  Tracking overall score and fillers/min across {sessions.length}{" "}
                  saved takes
                </p>
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={progressData}
                margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="rgba(148,163,184,0.12)"
                />
                <XAxis
                  dataKey="take"
                  stroke="#94a3b8"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 100]}
                  stroke="#22d3ee"
                  fontSize={11}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, "dataMax + 2"]}
                  stroke="#f59e0b"
                  fontSize={11}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "rgba(15, 23, 42, 0.95)",
                    borderColor: "rgba(255, 255, 255, 0.12)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    color: "#f8fafc",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="score"
                  name="Overall Score"
                  stroke="#22d3ee"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#22d3ee" }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="fillersPerMin"
                  name="Fillers / Min"
                  stroke="#f59e0b"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: "#f59e0b" }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Sessions List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-2xl border border-white/5 bg-slate-900/50"
            />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-3xl border border-white/[0.08] bg-slate-900/60 p-12 text-center backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
            <Mic className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-semibold text-white">
            No Practice Takes Yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-400">
            Record or upload your first presentation in the Practice Studio to
            unlock waveform playback, acoustic telemetry, and AI coaching.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-indigo-500/25"
          >
            Go to Practice Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => {
            const { coaching, acoustics, disfluencies } = session.analysis;
            const isConfirming = confirmDeleteId === session.id;

            return (
              <div
                key={session.id}
                className="group flex flex-col justify-between gap-4 rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl transition hover:border-cyan-400/35 hover:bg-slate-900/80 sm:flex-row sm:items-center sm:p-5"
              >
                <Link
                  href={`/report/${session.id}`}
                  className="min-w-0 flex-1 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h3 className="truncate text-base font-semibold text-white group-hover:text-cyan-300">
                      {session.title}
                    </h3>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
                        getTierBadgeClasses(coaching.overall_tier)
                      )}
                    >
                      {coaching.overall_tier}
                    </span>
                    <span className="rounded-md border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[10px] text-slate-400">
                      {session.rubricId}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5 text-slate-500" />
                      {formatDate(session.createdAt)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Clock className="h-3.5 w-3.5 text-slate-500" />
                      {formatDurationVerbose(acoustics.duration_sec)}
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-slate-500" />
                      {Math.round(acoustics.overall_wpm)} WPM
                    </span>
                    <span>
                      <strong className="font-mono text-amber-300">
                        {disfluencies.fillers_per_minute.toFixed(1)}
                      </strong>{" "}
                      fillers/min
                    </span>
                  </div>
                </Link>

                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <Link
                    href={`/report/${session.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/70 px-3.5 py-2 transition hover:border-cyan-400/40"
                  >
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider text-slate-400">
                        Score
                      </div>
                      <div className="font-mono text-lg font-bold text-cyan-300">
                        {Math.round(coaching.overall_score)}
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slate-400 group-hover:text-cyan-300" />
                  </Link>

                  {isConfirming ? (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDelete(session.id)}
                        className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-300 hover:bg-white/10"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(session.id)}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-400 transition hover:border-rose-500/30 hover:bg-rose-500/15 hover:text-rose-300"
                      title="Delete take"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
