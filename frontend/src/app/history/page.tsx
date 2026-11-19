"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowRight,
  Mic,
  PlusCircle,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { fetchRubrics } from "@/lib/api";
import { deleteSession, listSessions } from "@/lib/db";
import type { PracticeSession } from "@/lib/types";
import {
  cn,
  formatShortDate,
  getTierBadgeClasses,
} from "@/lib/utils";

interface ProgressPoint {
  takeLabel: string;
  axisLabel: string;
  date: string;
  fullDate: string;
  title: string;
  score: number;
  fillersPerMin: number;
}

const KNOWN_RUBRIC_NAMES: Record<string, string> = {
  general_delivery_v1: "General Presentation Delivery",
  tsa_prepared_v1: "TSA Prepared Presentation",
  tsa_extemp_v1: "TSA Extemporaneous Speech",
};

function formatHistoryDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

function formatDurationClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

function formatRubricLabel(
  rubricId: string,
  rubricNames: Record<string, string>
): string {
  if (rubricNames[rubricId]) return rubricNames[rubricId];
  if (KNOWN_RUBRIC_NAMES[rubricId]) return KNOWN_RUBRIC_NAMES[rubricId];

  return rubricId
    .replace(/_v\d+$/i, "")
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => {
      if (part.toLowerCase() === "tsa") return "TSA";
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function ProgressTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: ProgressPoint }>;
}) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="max-w-[240px] rounded border border-outline-variant bg-surface-container-lowest px-3.5 py-2.5 shadow-sm">
      <div className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
        {point.takeLabel} · {point.fullDate}
      </div>
      <div className="mt-0.5 truncate font-title text-label-lg text-on-surface">
        {point.title}
      </div>
      <div className="mt-2 flex flex-col gap-1 border-t border-outline-variant/60 pt-2">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-label text-label-sm text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-primary" aria-hidden="true" />
            Overall Score
          </span>
          <span className="font-mono text-mono-sm font-semibold text-primary tabular-nums">
            {point.score}/100
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5 font-label text-label-sm text-on-surface-variant">
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            Fillers / min
          </span>
          <span className="font-mono text-mono-sm font-semibold text-warning tabular-nums">
            {point.fillersPerMin.toFixed(1)}/min
          </span>
        </div>
      </div>
    </div>
  );
}

export default function HistoryPage() {
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [rubricNames, setRubricNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

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

  // Best-effort lookup of human-readable rubric names without blocking offline viewing
  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 3000);

    fetchRubrics(controller.signal)
      .then((res) => {
        const map: Record<string, string> = {};
        for (const rubric of res.rubrics) {
          map[rubric.id] = rubric.name;
        }
        setRubricNames(map);
      })
      .catch(() => {
        // Silently fall back to local rubric ID formatting
      })
      .finally(() => {
        window.clearTimeout(timeoutId);
      });

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteSession(id);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      setConfirmDeleteId(null);
    } finally {
      setDeletingId(null);
    }
  };

  // Sort chronologically for trend & KPI calculations
  const chronologicalSessions = useMemo(
    () => [...sessions].sort((a, b) => a.createdAt - b.createdAt),
    [sessions]
  );

  // Sort newest-first for the sessions table/list
  const orderedSessions = useMemo(
    () => [...sessions].sort((a, b) => b.createdAt - a.createdAt),
    [sessions]
  );

  const filteredSessions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return orderedSessions;

    return orderedSessions.filter((session) => {
      const rubricLabel = formatRubricLabel(session.rubricId, rubricNames);
      return (
        session.title.toLowerCase().includes(query) ||
        session.rubricId.toLowerCase().includes(query) ||
        rubricLabel.toLowerCase().includes(query)
      );
    });
  }, [orderedSessions, rubricNames, searchQuery]);

  const stats = useMemo(() => {
    if (chronologicalSessions.length === 0) {
      return null;
    }
    const earliest = chronologicalSessions[0];
    const latest = chronologicalSessions[chronologicalSessions.length - 1];

    const latestScore = Math.round(latest.analysis.coaching.overall_score);
    const earliestScore = Math.round(earliest.analysis.coaching.overall_score);
    const scoreDelta =
      chronologicalSessions.length >= 2 ? latestScore - earliestScore : null;

    let scoreSum = 0;
    let bestScore = -1;
    let fillerSum = 0;

    for (const session of chronologicalSessions) {
      const score = Math.round(session.analysis.coaching.overall_score);
      scoreSum += score;
      if (score > bestScore) bestScore = score;
      fillerSum += session.analysis.disfluencies.fillers_per_minute;
    }

    const avgFillers = fillerSum / chronologicalSessions.length;
    const earliestFillers = earliest.analysis.disfluencies.fillers_per_minute;
    const latestFillers = latest.analysis.disfluencies.fillers_per_minute;

    return {
      totalTakes: chronologicalSessions.length,
      latestScore,
      latestTier: latest.analysis.coaching.overall_tier,
      latestTitle: latest.title,
      scoreDelta,
      bestScore,
      avgScore: Math.round(scoreSum / chronologicalSessions.length),
      avgFillers,
      earliestFillers,
      earliestDate: formatShortDate(earliest.createdAt),
      latestFillers,
    };
  }, [chronologicalSessions]);

  const progressData = useMemo<ProgressPoint[]>(() => {
    return chronologicalSessions.map((session, idx) => {
      const shortDate = formatShortDate(session.createdAt);
      const takeLabel = `Take ${idx + 1}`;
      return {
        takeLabel,
        axisLabel: `${takeLabel} · ${shortDate}`,
        date: shortDate,
        fullDate: formatHistoryDate(session.createdAt),
        title: session.title,
        score: Math.round(session.analysis.coaching.overall_score),
        fillersPerMin: Number(
          session.analysis.disfluencies.fillers_per_minute.toFixed(1)
        ),
      };
    });
  }, [chronologicalSessions]);

  return (
    <div className="flex flex-col gap-gutter-xl pb-8">
      {/* Editorial Header + Stat Strip */}
      <section className="flex flex-col gap-gutter-lg">
        <div className="flex flex-wrap items-center justify-between gap-gutter-md">
          <div className="flex flex-col gap-1">
            <h1 className="font-headline text-headline-lg text-on-surface">
              Practice History &amp; Progress
            </h1>
            <p className="font-body text-body-md text-on-surface-variant">
              Track delivery scores and filler reduction across your TSA rehearsal takes.
            </p>
          </div>

          <Link
            href="/"
            className="inline-flex items-center gap-gutter-sm rounded-full bg-primary px-5 py-2.5 font-label text-label-lg text-on-primary transition-colors duration-[120ms] ease-state-change hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <PlusCircle className="h-5 w-5" aria-hidden="true" />
            <span>New Practice Take</span>
          </Link>
        </div>

        {/* Summary KPI Header Cards */}
        <div className="grid grid-cols-1 gap-gutter-lg sm:grid-cols-3">
          {/* Card 1: Total Takes */}
          <div className="flex flex-col gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg">
            <span className="font-label text-label-md text-on-surface-variant">
              Total Takes
            </span>
            {loading ? (
              <div className="my-1 h-10 w-20 animate-pulse rounded bg-surface-container-low" />
            ) : (
              <span className="font-mono text-mono-lg-mobile text-on-surface tabular-nums sm:text-mono-lg">
                {sessions.length}
              </span>
            )}
            <span className="font-body text-body-sm text-on-surface-variant">
              Saved locally in browser
            </span>
          </div>

          {/* Card 2: Latest Score (with tier badge) */}
          <div className="flex flex-col gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg">
            <span className="font-label text-label-md text-on-surface-variant">
              Latest Score
            </span>
            {loading ? (
              <div className="my-1 h-10 w-36 animate-pulse rounded bg-surface-container-low" />
            ) : stats ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-mono-lg-mobile text-primary tabular-nums sm:text-mono-lg">
                    {stats.latestScore}
                  </span>
                  <span className="font-mono text-title-md text-on-surface-variant tabular-nums">
                    / 100
                  </span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full border px-2.5 py-0.5 font-label text-label-sm",
                      getTierBadgeClasses(stats.latestTier)
                    )}
                  >
                    {stats.latestTier}
                  </span>
                </div>
                <span className="truncate font-body text-body-sm text-on-surface-variant">
                  {stats.scoreDelta !== null ? (
                    <>
                      <span
                        className={cn(
                          "font-mono font-medium tabular-nums",
                          stats.scoreDelta > 0
                            ? "text-success"
                            : stats.scoreDelta < 0
                              ? "text-error"
                              : "text-on-surface-variant"
                        )}
                      >
                        {stats.scoreDelta >= 0 ? `+${stats.scoreDelta}` : stats.scoreDelta}
                      </span>{" "}
                      vs Take 1 · {stats.latestTitle}
                    </>
                  ) : (
                    stats.latestTitle
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-mono-lg-mobile text-on-surface-variant tabular-nums sm:text-mono-lg">
                  --
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Record a take to score delivery
                </span>
              </>
            )}
          </div>

          {/* Card 3: Avg Fillers / min + Best Score context */}
          <div className="flex flex-col gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg">
            <span className="font-label text-label-md text-on-surface-variant">
              Avg Fillers / min
            </span>
            {loading ? (
              <div className="my-1 h-10 w-28 animate-pulse rounded bg-surface-container-low" />
            ) : stats ? (
              <>
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-mono-lg-mobile text-warning tabular-nums sm:text-mono-lg">
                    {stats.avgFillers.toFixed(1)}
                  </span>
                  <span className="font-mono text-mono-sm text-on-surface-variant">
                    / min
                  </span>
                  <span className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-low px-2.5 py-0.5 font-mono text-label-sm text-on-surface tabular-nums">
                    Best {stats.bestScore}/100
                  </span>
                </div>
                <span className="font-body text-body-sm text-on-surface-variant">
                  {chronologicalSessions.length >= 2 ? (
                    stats.latestFillers < stats.earliestFillers ? (
                      <>
                        Down from{" "}
                        <span className="font-mono tabular-nums">
                          {stats.earliestFillers.toFixed(1)}/min
                        </span>{" "}
                        on {stats.earliestDate}
                      </>
                    ) : stats.latestFillers > stats.earliestFillers ? (
                      <>
                        Latest{" "}
                        <span className="font-mono tabular-nums">
                          {stats.latestFillers.toFixed(1)}/min
                        </span>{" "}
                        vs{" "}
                        <span className="font-mono tabular-nums">
                          {stats.earliestFillers.toFixed(1)}/min
                        </span>{" "}
                        on {stats.earliestDate}
                      </>
                    ) : (
                      <>
                        Steady at{" "}
                        <span className="font-mono tabular-nums">
                          {stats.latestFillers.toFixed(1)}/min
                        </span>{" "}
                        across takes
                      </>
                    )
                  ) : (
                    <>
                      Pace baseline recorded on {stats.earliestDate}
                    </>
                  )}
                </span>
              </>
            ) : (
              <>
                <span className="font-mono text-mono-lg-mobile text-on-surface-variant tabular-nums sm:text-mono-lg">
                  --
                </span>
                <span className="font-body text-body-sm text-on-surface-variant">
                  Filler rate telemetry appears after Take 1
                </span>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Progress Over Time Dual-Metric LineChart (shown when 2+ takes exist) */}
      {!loading && sessions.length >= 2 && (
        <section className="flex flex-col gap-gutter-md rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg sm:p-gutter-xl">
          <div className="flex flex-wrap items-center justify-between gap-gutter-md">
            <div>
              <h2 className="font-headline text-headline-sm text-on-surface">
                Progress Over Time
              </h2>
              <p className="font-body text-body-sm text-on-surface-variant">
                Overall Score (0–100) and Fillers/min across your {sessions.length} takes.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-gutter-md">
              <span className="inline-flex items-center gap-1.5 font-label text-label-md text-on-surface">
                <span
                  className="h-1 w-3.5 rounded-full bg-primary"
                  aria-hidden="true"
                />
                Overall Score
              </span>
              <span className="inline-flex items-center gap-1.5 font-label text-label-md text-on-surface">
                <span
                  className="h-0.5 w-3.5 border-t-2 border-dashed border-warning"
                  aria-hidden="true"
                />
                Fillers / min
              </span>
            </div>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={progressData}
                margin={{ top: 10, right: 8, left: -8, bottom: 4 }}
              >
                <CartesianGrid
                  stroke="#E0E1F4"
                  strokeDasharray="3 3"
                  vertical={false}
                />
                <XAxis
                  dataKey="axisLabel"
                  stroke="#C4C5D7"
                  axisLine={{ stroke: "#E0E1F4" }}
                  tickLine={false}
                  interval="preserveStartEnd"
                  minTickGap={24}
                  tick={{
                    fill: "#434655",
                    fontSize: 11,
                    fontFamily: "var(--font-red-hat-mono), monospace",
                  }}
                />
                <YAxis
                  yAxisId="left"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tick={{
                    fill: "#0037B0",
                    fontSize: 11,
                    fontFamily: "var(--font-red-hat-mono), monospace",
                  }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, (dataMax: number) => Math.max(4, Math.ceil(dataMax + 1))]}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                  tick={{
                    fill: "#904D00",
                    fontSize: 11,
                    fontFamily: "var(--font-red-hat-mono), monospace",
                  }}
                />
                <Tooltip
                  cursor={{ stroke: "#C4C5D7", strokeDasharray: "3 3" }}
                  content={(props) => (
                    <ProgressTooltip
                      active={props.active}
                      payload={
                        props.payload as
                          | ReadonlyArray<{ payload?: ProgressPoint }>
                          | undefined
                      }
                    />
                  )}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="score"
                  name="Overall Score"
                  stroke="#0037B0"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={{ r: 4.5, fill: "#0037B0", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: "#0037B0", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="fillersPerMin"
                  name="Fillers / min"
                  stroke="#904D00"
                  strokeWidth={2.5}
                  strokeDasharray="6 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dot={{ r: 4, fill: "#904D00", stroke: "#FFFFFF", strokeWidth: 1.5 }}
                  activeDot={{ r: 5.5, fill: "#904D00", stroke: "#FFFFFF", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Sessions Loading / Empty / Table & Responsive List */}
      {loading ? (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          <div className="border-b border-outline-variant/60 px-gutter-lg py-gutter-md sm:px-gutter-xl">
            <div className="h-6 w-48 animate-pulse rounded bg-surface-container-low" />
          </div>
          <div className="divide-y divide-outline-variant/50">
            {[1, 2, 3].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-4 px-gutter-lg py-4 sm:px-gutter-xl"
              >
                <div className="h-5 w-1/3 animate-pulse rounded bg-surface-container-low" />
                <div className="h-5 w-1/4 animate-pulse rounded bg-surface-container-low" />
                <div className="h-8 w-28 animate-pulse rounded-full bg-surface-container-low" />
              </div>
            ))}
          </div>
        </section>
      ) : sessions.length === 0 ? (
        <section className="rounded-xl border border-outline-variant bg-surface-container-lowest px-gutter-lg py-12 text-center sm:px-gutter-xl">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-lg border border-outline-variant bg-surface-container-low text-primary">
            <Mic className="h-7 w-7" aria-hidden="true" />
          </div>
          <h2 className="mt-4 font-headline text-headline-md text-on-surface">
            No Practice Takes Yet
          </h2>
          <p className="mx-auto mt-1.5 max-w-md font-body text-body-md text-on-surface-variant">
            Record or upload your first presentation in the Practice Studio to unlock
            synced waveform playback, acoustic telemetry, and TSA rubric coaching.
          </p>
          <Link
            href="/"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 font-label text-label-lg text-on-primary transition-colors duration-[120ms] ease-state-change hover:bg-primary-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
          >
            <span>Record Your First Take</span>
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest">
          {/* Table Toolbar with Search/Filter Input */}
          <div className="flex flex-col gap-gutter-md border-b border-outline-variant/60 px-gutter-lg py-gutter-md sm:flex-row sm:items-center sm:justify-between sm:px-gutter-xl">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-headline text-headline-sm text-on-surface">
                Past Practice Sessions
              </h2>
              <span className="font-body text-body-sm text-on-surface-variant">
                {searchQuery.trim()
                  ? `Showing ${filteredSessions.length} of ${sessions.length} takes`
                  : "Ordered by most recent"}
              </span>
            </div>

            <div className="relative w-full sm:w-80">
              <label htmlFor="filter-practice-takes" className="sr-only">
                Filter Practice Takes
              </label>
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline"
                aria-hidden="true"
              />
              <input
                id="filter-practice-takes"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter Practice Takes..."
                aria-label="Filter Practice Takes by title or rubric"
                className="w-full rounded border border-outline-variant bg-surface-container-lowest py-2 pl-9 pr-9 font-body text-body-md text-on-surface placeholder:text-outline transition-colors duration-[120ms] ease-state-change focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  aria-label="Clear filter"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-on-surface-variant transition-colors duration-[120ms] ease-state-change hover:bg-surface-container-low hover:text-on-surface"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {filteredSessions.length === 0 ? (
            <div className="px-gutter-lg py-12 text-center sm:px-gutter-xl">
              <p className="font-title text-title-md text-on-surface">
                No practice takes match &ldquo;{searchQuery.trim()}&rdquo;
              </p>
              <p className="mt-1 font-body text-body-sm text-on-surface-variant">
                Try searching by presentation title or rubric name.
              </p>
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="mt-4 inline-flex items-center rounded-full border border-outline-variant bg-surface-container-low px-4 py-1.5 font-label text-label-md text-primary transition-colors duration-[120ms] ease-state-change hover:bg-surface-container"
              >
                Clear Filter
              </button>
            </div>
          ) : (
            <>
              {/* Desktop Table View */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="bg-surface-container-low">
                      <th className="px-gutter-xl py-3 font-label text-label-md text-on-surface-variant">
                        Title
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Date
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Rubric
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Duration
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Score
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Pace (WPM)
                      </th>
                      <th className="px-gutter-md py-3 font-label text-label-md text-on-surface-variant">
                        Fillers/min
                      </th>
                      <th className="px-gutter-xl py-3 text-right font-label text-label-md text-on-surface-variant">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/50">
                    {filteredSessions.map((session) => {
                      const { coaching, acoustics, disfluencies } =
                        session.analysis;
                      const score = Math.round(coaching.overall_score);
                      const rubricLabel = formatRubricLabel(
                        session.rubricId,
                        rubricNames
                      );
                      const isConfirming = confirmDeleteId === session.id;
                      const isDeleting = deletingId === session.id;

                      return (
                        <tr
                          key={session.id}
                          className="transition-colors duration-[120ms] ease-state-change hover:bg-surface-container-low/60"
                        >
                          <td className="max-w-[260px] px-gutter-xl py-3.5">
                            <Link
                              href={`/report/${session.id}`}
                              className="block truncate font-title text-title-md text-on-surface transition-colors duration-[120ms] ease-state-change hover:text-primary"
                            >
                              {session.title}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap px-gutter-md py-3.5 font-mono text-mono-sm text-on-surface-variant tabular-nums">
                            {formatHistoryDate(session.createdAt)}
                          </td>
                          <td className="px-gutter-md py-3.5">
                            <span className="inline-flex max-w-[210px] truncate rounded-full border border-outline-variant/70 bg-surface-container-low px-2.5 py-0.5 font-label text-label-sm text-on-surface-variant">
                              {rubricLabel}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-gutter-md py-3.5 font-mono text-mono-sm text-on-surface tabular-nums">
                            {formatDurationClock(acoustics.duration_sec)}
                          </td>
                          <td className="whitespace-nowrap px-gutter-md py-3.5">
                            <span
                              className={cn(
                                "inline-flex items-center rounded-full border px-2.5 py-0.5 font-mono text-mono-sm tabular-nums",
                                getTierBadgeClasses(coaching.overall_tier)
                              )}
                            >
                              {score}/100
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-gutter-md py-3.5 font-mono text-mono-sm text-on-surface tabular-nums">
                            {Math.round(acoustics.overall_wpm)} WPM
                          </td>
                          <td className="whitespace-nowrap px-gutter-md py-3.5 font-mono text-mono-sm text-on-surface tabular-nums">
                            {disfluencies.fillers_per_minute.toFixed(1)}/min
                          </td>
                          <td className="whitespace-nowrap px-gutter-xl py-3.5 text-right">
                            {isConfirming ? (
                              <div className="inline-flex items-center gap-gutter-sm">
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => void handleDelete(session.id)}
                                  className="rounded-full bg-error px-3 py-1.5 font-label text-label-md text-on-error transition-opacity duration-[120ms] ease-state-change hover:opacity-90 disabled:opacity-60"
                                >
                                  {isDeleting ? "Deleting..." : "Confirm"}
                                </button>
                                <button
                                  type="button"
                                  disabled={isDeleting}
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1.5 font-label text-label-md text-on-surface-variant transition-colors duration-[120ms] ease-state-change hover:bg-surface-container-low disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="inline-flex items-center gap-gutter-sm">
                                <Link
                                  href={`/report/${session.id}`}
                                  className="rounded-full bg-surface-container-low px-3.5 py-1.5 font-label text-label-md text-primary transition-colors duration-[120ms] ease-state-change hover:bg-surface-container"
                                >
                                  Open Report
                                </Link>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(session.id)}
                                  aria-label={`Delete ${session.title}`}
                                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-label text-label-md text-error transition-colors duration-[120ms] ease-state-change hover:bg-error-container/50"
                                >
                                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  <span>Delete</span>
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="divide-y divide-outline-variant/50 md:hidden">
                {filteredSessions.map((session) => {
                  const { coaching, acoustics, disfluencies } =
                    session.analysis;
                  const score = Math.round(coaching.overall_score);
                  const rubricLabel = formatRubricLabel(
                    session.rubricId,
                    rubricNames
                  );
                  const isConfirming = confirmDeleteId === session.id;
                  const isDeleting = deletingId === session.id;

                  return (
                    <div
                      key={session.id}
                      className="flex flex-col gap-3 p-gutter-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <Link
                            href={`/report/${session.id}`}
                            className="block truncate font-title text-title-md text-on-surface hover:text-primary"
                          >
                            {session.title}
                          </Link>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                              {formatHistoryDate(session.createdAt)}
                            </span>
                            <span className="inline-flex rounded-full border border-outline-variant/70 bg-surface-container-low px-2 py-0.5 font-label text-label-sm text-on-surface-variant">
                              {rubricLabel}
                            </span>
                          </div>
                        </div>

                        <span
                          className={cn(
                            "shrink-0 rounded-full border px-2.5 py-0.5 font-mono text-mono-sm tabular-nums",
                            getTierBadgeClasses(coaching.overall_tier)
                          )}
                        >
                          {score}/100
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 rounded-md border border-outline-variant/60 bg-surface-container-low px-3 py-2">
                        <div>
                          <div className="font-label text-label-sm text-on-surface-variant">
                            Duration
                          </div>
                          <div className="font-mono text-mono-sm text-on-surface tabular-nums">
                            {formatDurationClock(acoustics.duration_sec)}
                          </div>
                        </div>
                        <div>
                          <div className="font-label text-label-sm text-on-surface-variant">
                            Pace
                          </div>
                          <div className="font-mono text-mono-sm text-on-surface tabular-nums">
                            {Math.round(acoustics.overall_wpm)} WPM
                          </div>
                        </div>
                        <div>
                          <div className="font-label text-label-sm text-on-surface-variant">
                            Fillers/min
                          </div>
                          <div className="font-mono text-mono-sm text-on-surface tabular-nums">
                            {disfluencies.fillers_per_minute.toFixed(1)}/min
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-gutter-sm">
                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => void handleDelete(session.id)}
                              className="rounded-full bg-error px-3.5 py-1.5 font-label text-label-md text-on-error disabled:opacity-60"
                            >
                              {isDeleting ? "Deleting..." : "Confirm Delete"}
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-full border border-outline-variant bg-surface-container-lowest px-3.5 py-1.5 font-label text-label-md text-on-surface-variant"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(session.id)}
                              className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 font-label text-label-md text-error hover:bg-error-container/50"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              <span>Delete</span>
                            </button>
                            <Link
                              href={`/report/${session.id}`}
                              className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-4 py-1.5 font-label text-label-md text-primary hover:bg-surface-container"
                            >
                              <span>Open Report</span>
                              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                            </Link>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}
    </div>
  );
}
