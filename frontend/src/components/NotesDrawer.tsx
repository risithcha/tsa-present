"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, StickyNote, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "tsa-present-cue-notes";
const MIN_FONT_PX = 12;
const MAX_FONT_PX = 22;
const DEFAULT_FONT_PX = 15;

const SAMPLE_OUTLINE = `01 Opening Hook: Start with a crisp problem statistic or real-world story.
02 Constraints: State what your project solves and the key engineering bounds.
03 Architecture: Walk through your core design and testing iterations.
04 Field Data: Highlight measurable validation results and numbers.
05 Close: State the impact clearly — pause 1 second before thanking judges.`;

export function NotesDrawer() {
  const [mobileOpen, setMobileOpen] = useState(true);
  const [notes, setNotes] = useState("");
  const [fontSizePx, setFontSizePx] = useState<number>(DEFAULT_FONT_PX);

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

  const adjustFontSize = (delta: number) => {
    setFontSizePx((prev) =>
      Math.min(MAX_FONT_PX, Math.max(MIN_FONT_PX, prev + delta))
    );
  };

  return (
    <aside
      aria-label="Speaker Cue Card"
      className="flex flex-col gap-gutter-md rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg sm:p-gutter-xl"
    >
      <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
        <div className="flex items-center gap-gutter-sm">
          <StickyNote className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <h2 className="font-headline text-headline-sm text-on-surface">
            Cue Card
          </h2>
        </div>

        <div className="flex items-center gap-gutter-sm">
          <div
            className="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2 py-1"
            role="group"
            aria-label="Cue card font size"
          >
            <button
              type="button"
              onClick={() => adjustFontSize(-1)}
              disabled={fontSizePx <= MIN_FONT_PX}
              aria-label="Decrease cue card font size"
              className="rounded-full px-1.5 py-0.5 font-label text-label-sm text-on-surface transition-colors duration-[120ms] hover:bg-surface-container-lowest disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              A-
            </button>
            <span className="px-1 font-mono text-mono-sm text-on-surface-variant tabular-nums">
              {fontSizePx}px
            </span>
            <button
              type="button"
              onClick={() => adjustFontSize(1)}
              disabled={fontSizePx >= MAX_FONT_PX}
              aria-label="Increase cue card font size"
              className="rounded-full px-1.5 py-0.5 font-label text-label-sm text-on-surface transition-colors duration-[120ms] hover:bg-surface-container-lowest disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              A+
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((o) => !o)}
            aria-expanded={mobileOpen}
            aria-label={mobileOpen ? "Collapse cue card" : "Expand cue card"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-surface-container-low text-on-surface-variant transition-colors duration-[120ms] hover:bg-surface-container hover:text-on-surface lg:hidden"
          >
            {mobileOpen ? (
              <ChevronUp className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      <div
        className={cn(
          "flex-col gap-gutter-sm",
          mobileOpen ? "flex" : "hidden lg:flex"
        )}
      >
        <textarea
          value={notes}
          onChange={(e) => updateNotes(e.target.value)}
          rows={9}
          aria-label="Speaker cue card notes"
          placeholder="Jot down your opening hook, key engineering specs, transitions, or TSA judging reminders..."
          style={{ fontSize: `${fontSizePx}px` }}
          className="w-full resize-y rounded-md border border-outline-variant/80 bg-surface-container-low/65 p-3.5 font-body leading-relaxed text-on-surface placeholder:text-outline transition-colors duration-[120ms] focus:border-primary focus:bg-surface-container-lowest focus:outline-none"
        />

        <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
          <span className="font-body text-body-sm text-on-surface-variant">
            Saved locally in your browser
          </span>

          <div className="flex items-center gap-gutter-sm">
            {!notes.trim() ? (
              <button
                type="button"
                onClick={() => updateNotes(SAMPLE_OUTLINE)}
                className="rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 font-label text-label-sm text-primary transition-colors duration-[120ms] hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Load Sample TSA Outline
              </button>
            ) : (
              <button
                type="button"
                onClick={() => updateNotes("")}
                className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-low px-3 py-1 font-label text-label-sm text-on-surface-variant transition-colors duration-[120ms] hover:border-error/40 hover:bg-error-container/50 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
