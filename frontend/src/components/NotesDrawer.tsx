"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, FileText, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tsa-present-cue-notes";

const SAMPLE_OUTLINE = `• Hook: Start with a crisp problem statistic or real-world story
• Problem & Solution: State what your project solves in one clear sentence
• Engineering / Evidence: Highlight testing iterations & measurable results
• Impact & Conclusion: End decisively — pause 1 second before thanking judges`;

export function NotesDrawer() {
  const [isOpen, setIsOpen] = useState(true);
  const [notes, setNotes] = useState("");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setNotes(saved);
    } catch {
      // Ignore storage access errors
    }
  }, []);

  const updateNotes = (val: string) => {
    setNotes(val);
    try {
      window.localStorage.setItem(STORAGE_KEY, val);
    } catch {
      // Ignore storage errors
    }
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => setIsOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/25">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">
              Speaker Cue Card
            </h3>
            <p className="text-[11px] text-slate-400">
              Glanceable bullet points while you record (saved locally)
            </p>
          </div>
        </div>
        <span className="rounded-lg border border-white/10 bg-white/5 p-1.5 text-slate-400">
          {isOpen ? (
            <ChevronUp className="h-4 w-4" />
          ) : (
            <ChevronDown className="h-4 w-4" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className="border-t border-white/[0.06] px-4 pb-4 pt-3">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-lg border border-white/[0.08] bg-slate-950/60 p-0.5 text-[11px]">
              {(["sm", "md", "lg"] as const).map((sz) => (
                <button
                  key={sz}
                  type="button"
                  onClick={() => setFontSize(sz)}
                  className={cn(
                    "rounded-md px-2 py-0.5 font-medium uppercase transition",
                    fontSize === sz
                      ? "bg-indigo-500/25 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {sz}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              {!notes && (
                <button
                  type="button"
                  onClick={() => updateNotes(SAMPLE_OUTLINE)}
                  className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-[11px] font-medium text-cyan-300 transition hover:bg-cyan-500/20"
                >
                  Load TSA Outline
                </button>
              )}
              {notes && (
                <button
                  type="button"
                  onClick={() => updateNotes("")}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-slate-400 transition hover:text-rose-300"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>

          <textarea
            value={notes}
            onChange={(e) => updateNotes(e.target.value)}
            rows={7}
            placeholder="Paste your key talking points, transitions, or TSA judging criteria reminders here..."
            className={cn(
              "w-full resize-y rounded-xl border border-white/[0.08] bg-slate-950/70 p-3 leading-relaxed text-slate-200 placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none",
              fontSize === "sm" && "text-xs",
              fontSize === "md" && "text-sm",
              fontSize === "lg" && "text-base"
            )}
          />
        </div>
      )}
    </div>
  );
}
