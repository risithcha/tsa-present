"use client";

import { useEffect, useState } from "react";
import type { Tier } from "@/lib/types";
import { getScoreAccentColor } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  tier: Tier;
  size?: number;
}

export function ScoreRing({ score, tier, size = 148 }: ScoreRingProps) {
  const clampedScore = Math.max(0, Math.min(100, Math.round(score)));
  const [animatedScore, setAnimatedScore] = useState(0);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setAnimatedScore(clampedScore);
    });
    return () => cancelAnimationFrame(frame);
  }, [clampedScore]);

  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset =
    circumference - (animatedScore / 100) * circumference;
  const accentColor = getScoreAccentColor(clampedScore);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90 drop-shadow-[0_0_20px_rgba(6,182,212,0.2)]"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148, 163, 184, 0.14)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={accentColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-mono text-4xl font-extrabold tracking-tight text-white print-text-dark">
          {clampedScore}
        </span>
        <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-400">
          {tier}
        </span>
      </div>
    </div>
  );
}
