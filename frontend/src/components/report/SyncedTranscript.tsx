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

    // Group into readable flowing paragraphs (~45 words at sentence boundaries)
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
    <section className="print-card rounded-xl border border-outline-variant bg-surface-container-lowest p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageSquareQuote
            className="h-4 w-4 text-primary"
            aria-hidden="true"
          />
          <h2 className="font-headline text-headline-sm text-on-surface print-text-dark">
            Synced Verbatim Transcript
          </h2>
        </div>

        <div className="no-print flex flex-wrap items-center gap-3 font-label text-label-sm text-on-surface-variant">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-warning" aria-hidden="true" />
            Filler
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-error" aria-hidden="true" />
            Repetition / Awkward Pause
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
            Effective Pause
          </span>
          <span className="hidden text-outline sm:inline">· Click to jump</span>
        </div>
      </div>

      <div className="rounded-lg border border-outline-variant/60 bg-surface-container-low p-4 sm:p-5 print:border-0 print:bg-white print:p-0">
        {words.length === 0 ? (
          <p className="font-body text-body-md leading-relaxed text-on-surface-variant">
            {transcript || "No speech transcript detected in this recording."}
          </p>
        ) : (
          <div className="max-h-[360px] space-y-4 overflow-y-auto pr-2 font-body text-body-md leading-8 text-on-surface print:max-h-none print:overflow-visible print:text-on-surface">
            {paragraphs.map((group, gIdx) => {
              const firstItem = group[0];
              const groupStartSec =
                firstItem.type === "word"
                  ? firstItem.word.start
                  : firstItem.pause.start;

              return (
                <p key={gIdx} className="leading-8">
                  <span className="mr-2 font-mono text-mono-sm text-on-surface-variant tabular-nums">
                    {formatTime(groupStartSec)}
                  </span>
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
                            "mx-1 inline-flex items-center rounded-full px-2.5 py-0.5 font-mono text-mono-sm transition-all duration-120 hover:brightness-95",
                            isAwkward
                              ? "bg-error-container text-on-error-container"
                              : "bg-success-container text-on-success-container"
                          )}
                        >
                          [{item.pause.duration.toFixed(1)}s{" "}
                          {isAwkward ? "awkward pause" : "good pause"}]
                        </button>
                      );
                    }

                    const { word, index } = item;
                    const isActive =
                      currentTime >= word.start &&
                      currentTime <= word.end + 0.08;
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
                            "inline rounded px-1 py-0.5 text-left transition-colors duration-120",
                            isActive &&
                              "bg-primary/15 font-medium text-primary ring-1 ring-primary/30",
                            !isActive &&
                              isFiller &&
                              "bg-warning-container font-medium text-on-warning-container",
                            !isActive &&
                              isRepetition &&
                              "bg-error-container font-medium text-on-error-container",
                            !isActive &&
                              !isFiller &&
                              !isRepetition &&
                              "hover:bg-surface-container"
                          )}
                        >
                          {word.word}
                        </button>{" "}
                      </span>
                    );
                  })}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
