import type { Tier } from "./types";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDurationVerbose(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0s";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  if (mins === 0) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

export function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export function formatShortDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

export function getTierBadgeClasses(tier: Tier): string {
  switch (tier) {
    case "Exemplary":
      return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
    case "Adequate":
      return "bg-amber-500/15 text-amber-300 border-amber-500/30";
    case "Developing":
      return "bg-rose-500/15 text-rose-300 border-rose-500/30";
  }
}

export function getScoreAccentColor(score: number): string {
  if (score >= 85) return "#10b981"; // emerald-500
  if (score >= 70) return "#06b6d4"; // cyan-500
  if (score >= 55) return "#f59e0b"; // amber-500
  return "#f43f5e"; // rose-500
}
