"use client";

import { useMemo } from "react";
import { MessageSquareQuote } from "lucide-react";
import type { PauseEvent, WordToken } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";

interface SyncedTranscriptProps {
  transcript: string;
  words: WordToken[];
  pauses: PauseEvent[];
  currentTime: number;
  onSeek: (seconds: number) => void;
}

type TranscriptSegmentItem =
  | { type: "word"; word: WordToken; index: number }
  | { type: "pause"; pause: PauseEvent; index: number };

export function SyncedTranscript({
  transcript,
  words,
  pauses,
  currentTime,
  onSeek,
}: SyncedTranscriptProps) {
  const paragraphs = useMemo(() => {
    if (words.length === 0) return [];

    // Sort pauses chronologically to inject cleanly between words
    const sortedPauses = [...pauses]
      .filter(
        (p) =>
          p.classification === "awkward_pause" ||
          p.classification === "dramatic_pause"
      )
      .sort((a, b) => a.start - b.start);

    const items: TranscriptSegmentItem[] = [];
    let pauseCursor = 0;

    words.forEach((word, idx) => {
      while (
        pauseCursor < sortedPauses.length &&
        sortedPauses[pauseCursor].start <= word.start
      ) {
        items.push({
          type: "pause",
          pause: sortedPauses[pauseCursor],
          index: pauseCursor,
        });
        pauseCursor += 1;
      }
      items.push({ type: "word", word, index: idx });
    });

    while (pauseCursor < sortedPauses.length) {
      items.push({
        type: "pause",
        pause: sortedPauses[pauseCursor],
        index: pauseCursor,
      });
      pauseCursor += 1;
    }

    // Group into readable flowing paragraphs (~50 words at sentence boundaries)
    const groups: TranscriptSegmentItem[][] = [];
    let currentGroup: TranscriptSegmentItem[] = [];
    let wordCountInGroup = 0;

    items.forEach((item) => {
      currentGroup.push(item);
      if (item.type === "word") {
        wordCountInGroup += 1;
        const endsSentence = /[.!?]$/.test(item.word.word.trim());
        if (wordCountInGroup >= 45 && endsSentence) {
          groups.push(currentGroup);
          currentGroup = [];
          wordCountInGroup = 0;
        }
      }
    });

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }, [words, pauses]);

  return (
    <div className="print-card rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <MessageSquareQuote className="h-4 w-4 text-indigo-400" />
          <h2 className="text-sm font-semibold text-white print-text-dark">
            Synced Verbatim Transcript
          </h2>
        </div>

        <div className="no-print flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-amber-400" />
            Filler
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-rose-400" />
            Repetition / Awkward Pause
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Effective Pause
          </span>
        </div>
      </div>

      {words.length === 0 ? (
        <p className="text-sm leading-relaxed text-slate-300">
          {transcript || "No speech transcript detected in this recording."}
        </p>
      ) : (
        <div className="max-h-[340px] space-y-4 overflow-y-auto pr-2 text-sm leading-7 text-slate-200 print:max-h-none print:overflow-visible print:text-slate-900">
          {paragraphs.map((group, gIdx) => (
            <p key={gIdx} className="leading-8">
              {group.map((item) => {
                if (item.type === "pause") {
                  const isAwkward =
                    item.pause.classification === "awkward_pause";
                  return (
                    <button
                      key={`pause-${item.index}`}
                      type="button"
                      onClick={() => onSeek(item.pause.start)}
                      title={`Jump to ${formatTime(item.pause.start)}`}
                      className={cn(
                        "mx-1.5 inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium transition hover:brightness-125",
                        isAwkward
                          ? "border-rose-500/35 bg-rose-500/15 text-rose-300"
                          : "border-emerald-500/35 bg-emerald-500/15 text-emerald-300"
                      )}
                    >
                      [{item.pause.duration.toFixed(1)}s{" "}
                      {isAwkward ? "awkward pause" : "good pause"}]
                    </button>
                  );
                }

                const { word, index } = item;
                const isActive =
                  currentTime >= word.start && currentTime <= word.end + 0.08;
                const isRepetition =
                  word.is_filler && word.filler_type === "repetition";
                const isFiller =
                  word.is_filler && word.filler_type !== "repetition";

                return (
                  <span key={`word-${index}`}>
                    <button
                      type="button"
                      onClick={() => onSeek(word.start)}
                      title={`${formatTime(word.start)} • Click to jump`}
                      className={cn(
                        "inline rounded px-1 py-0.5 text-left transition-colors",
                        isActive &&
                          "bg-cyan-400/25 text-cyan-100 ring-1 ring-cyan-400/60",
                        !isActive &&
                          isFiller &&
                          "border border-amber-500/30 bg-amber-500/15 text-amber-200",
                        !isActive &&
                          isRepetition &&
                          "border border-rose-500/30 bg-rose-500/15 text-rose-200",
                        !isActive &&
                          !isFiller &&
                          !isRepetition &&
                          "hover:bg-white/10"
                      )}
                    >
                      {word.word}
                    </button>{" "}
                  </span>
                );
              })}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
