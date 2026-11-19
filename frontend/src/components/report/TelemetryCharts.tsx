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
        return "border-success/20 bg-success-container text-on-success-container";
      case "moderate":
        return "border-warning/20 bg-warning-container text-on-warning-container";
      case "high":
        return "border-error/20 bg-error-container text-on-error-container";
    }
  }, [acoustics.monotone_risk]);

  const roundedWpm = Math.round(acoustics.overall_wpm);
  const paceInBand = roundedWpm >= 130 && roundedWpm <= 160;
  const fillersHigh = disfluencies.fillers_per_minute >= 2.0;

  return (
    <div className="space-y-6">
      {/* 5 Crisp KPI Cards */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5">
        {/* 1. Fillers/min */}
        <div className="print-card flex flex-col justify-between gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between font-label text-label-sm text-on-surface-variant">
            <span>Fillers / min</span>
            <MessageCircleWarning
              className="h-4 w-4 text-warning"
              aria-hidden="true"
            />
          </div>
          <div
            className={cn(
              "mt-1 font-headline text-headline-md tabular-nums",
              fillersHigh ? "text-warning" : "text-success"
            )}
          >
            {disfluencies.fillers_per_minute.toFixed(1)}
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            {disfluencies.total_fillers} fillers ·{" "}
            {disfluencies.repetition_stutters} stutters
          </p>
        </div>

        {/* 2. Speaking Pace */}
        <div className="print-card flex flex-col justify-between gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between font-label text-label-sm text-on-surface-variant">
            <span>Speaking Pace</span>
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div
            className={cn(
              "mt-1 font-headline text-headline-md tabular-nums",
              paceInBand ? "text-success" : "text-on-surface"
            )}
          >
            {roundedWpm}{" "}
            <span className="font-mono text-mono-sm text-on-surface-variant">
              WPM
            </span>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            Articulation:{" "}
            <span className="font-mono font-medium text-on-surface tabular-nums">
              {Math.round(acoustics.articulation_wpm)} WPM
            </span>
          </p>
        </div>

        {/* 3. Pause Ratio */}
        <div className="print-card flex flex-col justify-between gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between font-label text-label-sm text-on-surface-variant">
            <span>Pause Ratio</span>
            <Timer className="h-4 w-4 text-tertiary" aria-hidden="true" />
          </div>
          <div className="mt-1 font-headline text-headline-md text-on-surface tabular-nums print-text-dark">
            {(acoustics.pause_ratio * 100).toFixed(0)}%
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            {acoustics.pause_time_sec.toFixed(1)}s pause ·{" "}
            {disfluencies.awkward_pause_count} awkward
          </p>
        </div>

        {/* 4. Vocal Variety */}
        <div className="print-card flex flex-col justify-between gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between font-label text-label-sm text-on-surface-variant">
            <span>Vocal Variety</span>
            <Activity className="h-4 w-4 text-success" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-headline text-headline-md text-on-surface tabular-nums print-text-dark">
              {acoustics.pitch_variability_semitones.toFixed(1)}
            </span>
            <span className="font-mono text-mono-sm text-on-surface-variant">
              st
            </span>
          </div>
          <div className="mt-0.5 flex items-center">
            <span
              className={cn(
                "inline-flex rounded-full border px-2 py-0.5 font-label text-[10px] font-semibold uppercase tracking-wide",
                monotoneBadge
              )}
            >
              {acoustics.monotone_risk} monotone risk
            </span>
          </div>
        </div>

        {/* 5. Volume Dynamics */}
        <div className="print-card flex flex-col justify-between gap-1 rounded-xl border border-outline-variant bg-surface-container-lowest p-4">
          <div className="flex items-center justify-between font-label text-label-sm text-on-surface-variant">
            <span>Volume Dynamics</span>
            <AudioLines className="h-4 w-4 text-primary" aria-hidden="true" />
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="font-headline text-headline-md text-on-surface tabular-nums print-text-dark">
              {acoustics.volume_dynamic_range_db.toFixed(1)}
            </span>
            <span className="font-mono text-mono-sm text-on-surface-variant">
              dB
            </span>
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            {acoustics.trailing_off_count} trailing-off{" "}
            {acoustics.trailing_off_count === 1 ? "ending" : "endings"}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Pace Timeline Area Chart */}
        <article className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-title text-title-md text-on-surface print-text-dark">
                Speaking Pace Over Time (WPM)
              </h3>
              <p className="font-body text-body-sm text-on-surface-variant">
                Shaded emerald band marks the ideal 130–160 WPM presentation
                cadence
              </p>
            </div>
            <span className="rounded-full border border-success/20 bg-success-container px-2.5 py-1 font-label text-label-sm text-on-success-container">
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
                    <linearGradient id="paceGradLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0037B0" stopOpacity={0.22} />
                      <stop offset="95%" stopColor="#0037B0" stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E0E1F4" />
                  <XAxis
                    dataKey="label"
                    stroke="#434655"
                    tick={{ fill: "#434655", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#C4C5D7" }}
                  />
                  <YAxis
                    stroke="#434655"
                    tick={{ fill: "#434655", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#C4C5D7" }}
                    domain={[60, "dataMax + 30"]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#C4C5D7",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#0B1C30",
                      boxShadow: "0 4px 14px rgba(11, 28, 48, 0.08)",
                    }}
                    labelStyle={{ color: "#434655", fontWeight: 600 }}
                  />
                  <ReferenceArea
                    y1={130}
                    y2={160}
                    fill="#85F8C4"
                    fillOpacity={0.35}
                    stroke="#006C4A"
                    strokeOpacity={0.28}
                    strokeDasharray="3 3"
                  />
                  <Area
                    type="monotone"
                    dataKey="wpm"
                    name="Pace (WPM)"
                    stroke="#0037B0"
                    strokeWidth={2.5}
                    fill="url(#paceGradLight)"
                    dot={{
                      r: 3.5,
                      fill: "#0037B0",
                      stroke: "#FFFFFF",
                      strokeWidth: 1.5,
                    }}
                    activeDot={{ r: 5, fill: "#0037B0" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 items-center justify-center rounded-lg border border-outline-variant/60 bg-surface-container-low font-body text-body-sm text-on-surface-variant">
              Recording too short to plot segmented pace timeline.
            </div>
          )}
        </article>

        {/* Top Filler Words Horizontal Bar Breakdown */}
        <article className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6 lg:col-span-4">
          <div className="mb-4">
            <h3 className="font-title text-title-md text-on-surface print-text-dark">
              Top Filler Words
            </h3>
            <p className="font-body text-body-sm text-on-surface-variant">
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
                    stroke="#E0E1F4"
                  />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    stroke="#434655"
                    tick={{ fill: "#434655", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#C4C5D7" }}
                  />
                  <YAxis
                    type="category"
                    dataKey="word"
                    stroke="#0B1C30"
                    tick={{ fill: "#0B1C30", fontSize: 12, fontWeight: 500 }}
                    width={68}
                    tickLine={false}
                    axisLine={{ stroke: "#C4C5D7" }}
                  />
                  <Tooltip
                    cursor={{ fill: "#EFF4FF" }}
                    contentStyle={{
                      backgroundColor: "#FFFFFF",
                      borderColor: "#C4C5D7",
                      borderRadius: "12px",
                      fontSize: "12px",
                      color: "#0B1C30",
                      boxShadow: "0 4px 14px rgba(11, 28, 48, 0.08)",
                    }}
                    labelStyle={{ color: "#434655", fontWeight: 600 }}
                  />
                  <Bar
                    dataKey="count"
                    name="Occurrences"
                    fill="#904D00"
                    radius={[0, 6, 6, 0]}
                    barSize={18}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-60 flex-col items-center justify-center rounded-lg border border-success/25 bg-success-container/40 p-4 text-center">
              <span className="font-title text-title-md text-on-success-container">
                Clean Delivery!
              </span>
              <span className="mt-1 font-body text-body-sm text-on-surface-variant">
                Zero vocal or discourse filler words detected in this take.
              </span>
            </div>
          )}
        </article>
      </div>
    </div>
  );
}
