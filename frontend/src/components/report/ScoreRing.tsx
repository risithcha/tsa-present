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
  const dashOffset = circumference - (animatedScore / 100) * circumference;
  const accentColor = getScoreAccentColor(clampedScore);

  return (
    <div
      className="relative inline-flex items-center justify-center"
      style={{ width: size, height: size }}
      aria-label={`Overall score ${clampedScore} out of 100, ${tier} tier`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E5EEFF"
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
          className="motion-reduce:transition-none"
          style={{
            transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="font-headline text-display-lg leading-none font-bold tracking-tight text-on-surface tabular-nums print-text-dark">
          {clampedScore}
        </span>
        <span className="mt-1 font-label text-[11px] font-semibold uppercase tracking-widest text-on-surface-variant">
          {tier}
        </span>
      </div>
    </div>
  );
}
