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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-xl">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/30">
            <AudioWaveform className="h-6 w-6 animate-pulse text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">
              Analyzing Your Presentation
            </h2>
            <p className="text-xs text-slate-400">
              Elapsed: <span className="font-mono text-cyan-300">{seconds}s</span>{" "}
              • Ephemeral processing
            </p>
          </div>
        </div>

        <div className="mt-6 space-y-3">
          {STAGES.map((stage, idx) => {
            const done = idx < stageIndex;
            const current = idx === stageIndex;
            return (
              <div
                key={stage.title}
                className={cn(
                  "flex items-start gap-3 rounded-xl border p-3 transition-all",
                  current &&
                    "border-cyan-500/40 bg-cyan-500/10",
                  done && "border-emerald-500/20 bg-emerald-500/5",
                  !current &&
                    !done &&
                    "border-white/[0.04] bg-white/[0.02] opacity-50"
                )}
              >
                <div className="mt-0.5 shrink-0">
                  {done ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  ) : current ? (
                    <Loader2 className="h-4 w-4 animate-spin text-cyan-400" />
                  ) : (
                    <span className="block h-4 w-4 rounded-full border border-slate-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-100">
                    {stage.title}
                  </p>
                  <p className="text-xs text-slate-400">{stage.detail}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
