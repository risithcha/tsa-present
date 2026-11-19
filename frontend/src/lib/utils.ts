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
      return "bg-success-container text-on-success-container border-success/20";
    case "Adequate":
      return "bg-warning-container text-on-warning-container border-warning/20";
    case "Developing":
      return "bg-error-container text-on-error-container border-error/20";
  }
}

export function getScoreAccentColor(score: number): string {
  if (score >= 85) return "#006C4A"; // success
  if (score >= 70) return "#0037B0"; // primary
  if (score >= 55) return "#904D00"; // warning
  return "#BF0715"; // error
}
