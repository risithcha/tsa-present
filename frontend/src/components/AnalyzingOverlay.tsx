"use client";

import { useEffect, useState } from "react";
import { AudioWaveform, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAGES = [
  {
    title: "Uploading & decoding audio",
    detail: "Preparing ephemeral audio stream for acoustic analysis",
  },
  {
    title: "Measuring pace, pitch & pauses",
    detail: "Running Silero VAD and vocal expressiveness telemetry",
  },
  {
    title: "Transcribing & detecting disfluencies",
    detail: "Aligning word-level timestamps, fillers, and stutters",
  },
  {
    title: "Generating AI rubric coaching",
    detail: "Synthesizing timestamped feedback and practice drills",
  },
];

interface AnalyzingOverlayProps {
  visible: boolean;
}

export function AnalyzingOverlay({ visible }: AnalyzingOverlayProps) {
  const [stageIndex, setStageIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!visible) {
      setStageIndex(0);
      setSeconds(0);
      return;
    }

    const secInterval = setInterval(() => {
      setSeconds((s) => s + 1);
    }, 1000);

    const stageInterval = setInterval(() => {
      setStageIndex((idx) => (idx < STAGES.length - 1 ? idx + 1 : idx));
    }, 3200);

    return () => {
      clearInterval(secInterval);
      clearInterval(stageInterval);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="analyzing-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/25 p-4 backdrop-blur-sm"
    >
      <div className="w-full max-w-md rounded-xl border border-outline-variant bg-surface-container-lowest/95 p-gutter-lg shadow-xl backdrop-blur-md sm:p-gutter-xl">
        <div className="flex items-center gap-gutter-md">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-primary text-on-primary">
            <AudioWaveform className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h2
              id="analyzing-title"
              className="font-headline text-headline-sm text-on-surface"
            >
              Analyzing Your Presentation
            </h2>
            <p className="mt-0.5 font-body text-body-sm text-on-surface-variant">
              Elapsed:{" "}
              <span className="font-mono text-mono-sm text-primary tabular-nums">
                {seconds}s
              </span>{" "}
              · Ephemeral processing
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-gutter-sm">
          {STAGES.map((stage, idx) => {
            const done = idx < stageIndex;
            const current = idx === stageIndex;
            return (
              <div
                key={stage.title}
                className={cn(
                  "flex items-start gap-3 rounded-md border p-3 transition-colors duration-[120ms]",
                  current && "border-primary/40 bg-surface-container-low",
                  done && "border-success/25 bg-success-container/40",
                  !current &&
                    !done &&
                    "border-outline-variant/60 bg-surface opacity-55"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle2
                      className="h-4 w-4 text-success"
                      aria-hidden="true"
                    />
                  ) : current ? (
                    <Loader2
                      className="h-4 w-4 animate-spin text-primary"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="block h-4 w-4 rounded-full border border-outline-variant"
                      aria-hidden="true"
                    />
                  )}
                </div>
                <div>
                  <p className="font-label text-label-md text-on-surface">
                    {stage.title}
                  </p>
                  <p className="mt-0.5 font-body text-body-sm text-on-surface-variant">
                    {stage.detail}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
