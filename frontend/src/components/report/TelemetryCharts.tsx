"use client";

import { useMemo } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  AudioLines,
  Gauge,
  MessageCircleWarning,
  Timer,
} from "lucide-react";
import type { AcousticsMetrics, DisfluencyMetrics } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

interface TelemetryChartsProps {
  acoustics: AcousticsMetrics;
  disfluencies: DisfluencyMetrics;
}

export function TelemetryCharts({
  acoustics,
  disfluencies,
}: TelemetryChartsProps) {
  const paceData = useMemo(() => {
    return acoustics.pace_timeline.map((pt) => ({
      label: formatTime(pt.start_sec),
      midpoint: Math.round((pt.start_sec + pt.end_sec) / 2),
      wpm: Math.round(pt.wpm),
    }));
  }, [acoustics.pace_timeline]);

  const fillerBreakdown = useMemo(() => {
    return Object.entries(disfluencies.filler_counts)
      .map(([word, count]) => ({ word, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 7);
  }, [disfluencies.filler_counts]);

  const monotoneBadge = useMemo(() => {
    switch (acoustics.monotone_risk) {
      case "low":
        return "border-emerald-500/30 bg-emerald-500/15 text-emerald-300";
      case "moderate":
        return "border-amber-500/30 bg-amber-500/15 text-amber-300";
      case "high":
        return "border-rose-500/30 bg-rose-500/15 text-rose-300";
    }
  }, [acoustics.monotone_risk]);

  return (
    <div className="space-y-6">
      {/* 5 Crisp KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Fillers/min */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Fillers / Min</span>
            <MessageCircleWarning className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white print-text-dark">
            {disfluencies.fillers_per_minute.toFixed(1)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {disfluencies.total_fillers} fillers •{" "}
            {disfluencies.repetition_stutters} stutters
          </p>
        </div>

        {/* 2. Speaking Pace */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Speaking Pace</span>
            <Gauge className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white print-text-dark">
            {Math.round(acoustics.overall_wpm)}{" "}
            <span className="text-xs font-normal text-slate-400">WPM</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Articulation:{" "}
            <span className="font-mono text-slate-200">
              {Math.round(acoustics.articulation_wpm)} WPM
            </span>
          </p>
        </div>

        {/* 3. Pause Ratio */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Pause Ratio</span>
            <Timer className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-bold text-white print-text-dark">
            {(acoustics.pause_ratio * 100).toFixed(0)}%
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {acoustics.pause_time_sec.toFixed(1)}s pause •{" "}
            {disfluencies.awkward_pause_count} awkward
          </p>
        </div>

        {/* 4. Vocal Expressiveness */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Vocal Variety</span>
            <Activity className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="font-mono text-2xl font-bold text-white print-text-dark">
              {acoustics.pitch_variability_semitones.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400">st</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                monotoneBadge
              )}
            >
              {acoustics.monotone_risk} monotone risk
            </span>
          </div>
        </div>

        {/* 5. Volume Dynamics */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-4 backdrop-blur-xl">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Volume Dynamics</span>
            <AudioLines className="h-4 w-4 text-violet-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span className="font-mono text-2xl font-bold text-white print-text-dark">
              {acoustics.volume_dynamic_range_db.toFixed(1)}
            </span>
            <span className="text-xs text-slate-400">dB</span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            {acoustics.trailing_off_count} trailing-off{" "}
            {acoustics.trailing_off_count === 1 ? "ending" : "endings"}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Pace Timeline Area Chart */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-white print-text-dark">
                Speaking Pace Over Time
              </h3>
              <p className="text-xs text-slate-400">
                Shaded emerald band marks the ideal 130–160 WPM presentation
                cadence
              </p>
            </div>
            <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
              Target: 130–160 WPM
            </span>
          </div>

          {paceData.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={paceData}
                  margin={{ top: 10, right: 12, left: -12, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="paceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="rgba(148,163,184,0.12)"
                  />
                  <XAxis
                    dataKey="label"
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                    domain={[60, "dataMax + 30"]}
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
                  <ReferenceArea
                    y1={130}
                    y2={160}
                    fill="#10b981"
                    fillOpacity={0.12}
                    strokeOpacity={0}
                  />
                  <Area
                    type="monotone"
                    dataKey="wpm"
                    name="Pace (WPM)"
                    stroke="#22d3ee"
                    strokeWidth={2.5}
                    fill="url(#paceGrad)"
                    dot={{ r: 3, fill: "#22d3ee" }}
                    activeDot={{ r: 5 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center text-xs text-slate-400">
              Recording too short to plot segmented pace timeline.
            </div>
          )}
        </div>

        {/* Top Filler Words Horizontal Bar Breakdown */}
        <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl lg:col-span-4">
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-white print-text-dark">
              Filler Word Breakdown
            </h3>
            <p className="text-xs text-slate-400">
              Most frequent vocal &amp; discourse fillers
            </p>
          </div>

          {fillerBreakdown.length > 0 ? (
            <div className="h-60 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={fillerBreakdown}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 4, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    horizontal={false}
                    stroke="rgba(148,163,184,0.1)"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    stroke="#94a3b8"
                    fontSize={11}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="word"
                    stroke="#e2e8f0"
                    fontSize={12}
                    width={64}
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
                  <Bar
                    dataKey="count"
                    name="Occurrences"
                    fill="#f59e0b"
                    radius={[0, 6, 6, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 flex-col items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-4 text-center">
              <span className="text-sm font-semibold text-emerald-300">
                Clean Delivery!
              </span>
              <span className="mt-1 text-xs text-slate-400">
                Zero vocal or discourse filler words detected in this take.
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
