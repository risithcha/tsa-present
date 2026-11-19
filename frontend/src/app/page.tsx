"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Lock,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";
import { analyzePresentation, fetchRubrics } from "@/lib/api";
import { saveSession } from "@/lib/db";
import type { RubricSummary } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { AnalyzingOverlay } from "@/components/AnalyzingOverlay";
import { AudioRecorder } from "@/components/AudioRecorder";
import { AudioUploader } from "@/components/AudioUploader";
import { NotesDrawer } from "@/components/NotesDrawer";
import { PresentationTimer } from "@/components/PresentationTimer";

type CaptureTab = "record" | "upload";

export default function PracticeStudioPage() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [rubrics, setRubrics] = useState<RubricSummary[]>([]);
  const [selectedRubricId, setSelectedRubricId] = useState("general_delivery_v1");
  const [rubricsLoading, setRubricsLoading] = useState(true);
  const [rubricsError, setRubricsError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<CaptureTab>("record");
  const [isRecordingActive, setIsRecordingActive] = useState(false);
  const [recordingElapsedSec, setRecordingElapsedSec] = useState(0);
  const [targetMinSec, setTargetMinSec] = useState<number | null>(180);
  const [targetMaxSec, setTargetMaxSec] = useState<number | null>(300);

  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // Optional prefill when clicking "Record Next Take" from a report
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const preTitle = params.get("title");
      const preRubric = params.get("rubric");
      if (preTitle) setTitle(preTitle);
      if (preRubric) setSelectedRubricId(preRubric);
    } catch {
      // Ignore URL parse errors
    }
  }, []);

  const loadRubrics = useCallback(async () => {
    setRubricsLoading(true);
    setRubricsError(null);
    try {
      const data = await fetchRubrics();
      setRubrics(data.rubrics);
      const hasDefault = data.rubrics.some(
        (r) => r.id === "general_delivery_v1" && r.enabled
      );
      if (hasDefault) {
        setSelectedRubricId((prev) =>
          data.rubrics.some((r) => r.id === prev && r.enabled)
            ? prev
            : "general_delivery_v1"
        );
      } else {
        const firstEnabled = data.rubrics.find((r) => r.enabled);
        if (firstEnabled) setSelectedRubricId(firstEnabled.id);
      }
    } catch (err) {
      setRubricsError(
        err instanceof Error
          ? err.message
          : "Unable to load rubrics from speech engine."
      );
    } finally {
      setRubricsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRubrics();
  }, [loadRubrics]);

  const selectedRubric = useMemo(
    () => rubrics.find((r) => r.id === selectedRubricId) ?? null,
    [rubrics, selectedRubricId]
  );

  const handleRecordingStateChange = useCallback(
    (active: boolean, elapsed: number) => {
      setIsRecordingActive(active);
      setRecordingElapsedSec(elapsed);
    },
    []
  );

  const handleRangeChange = useCallback(
    (minSec: number | null, maxSec: number | null) => {
      setTargetMinSec(minSec);
      setTargetMaxSec(maxSec);
    },
    []
  );

  const handleAnalyze = async (
    blob: Blob,
    filename: string,
    mimeType: string
  ) => {
    setAnalyzeError(null);
    setAnalyzing(true);

    try {
      const analysis = await analyzePresentation({
        audio: blob,
        filename,
        rubricId: selectedRubricId,
        topic: title.trim() || undefined,
        targetMinSec,
        targetMaxSec,
      });

      const sessionTitle =
        title.trim() ||
        `Practice Take (${new Intl.DateTimeFormat(undefined, {
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        }).format(new Date())})`;

      await saveSession({
        id: analysis.analysis_id,
        createdAt: Date.now(),
        title: sessionTitle,
        rubricId: analysis.rubric_id || selectedRubricId,
        audioBlob: blob,
        audioMimeType: mimeType || blob.type || "audio/webm",
        analysis,
      });

      router.push(`/report/${analysis.analysis_id}`);
    } catch (err) {
      setAnalyzing(false);
      setAnalyzeError(
        err instanceof Error
          ? err.message
          : "Analysis failed. Please check that the backend is running and try again."
      );
    }
  };

  return (
    <div className="space-y-6">
      <AnalyzingOverlay visible={analyzing} />

      {/* Studio Header */}
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
            Practice Studio
          </div>
          <h1 className="mt-2.5 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Rehearse. Record.{" "}
            <span className="bg-gradient-to-r from-indigo-400 to-cyan-400 bg-clip-text text-transparent">
              Command the Room.
            </span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Capture a live take or upload audio for instant acoustic pacing,
            filler-word detection, and rubric-aligned AI coaching.
          </p>
        </div>

        {/* Privacy pill */}
        <div className="inline-flex items-center gap-2 self-start rounded-xl border border-emerald-500/20 bg-emerald-500/[0.07] px-3.5 py-2 text-xs text-emerald-200/90 sm:self-auto">
          <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
          <span>
            Audio is analyzed ephemerally &amp; never stored on our servers; your
            takes stay private in your browser.
          </span>
        </div>
      </section>

      {analyzeError && (
        <div className="flex items-start gap-3 rounded-2xl border border-rose-500/35 bg-rose-500/10 p-4 text-sm text-rose-200">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
          <div>
            <p className="font-semibold text-rose-100">Analysis Error</p>
            <p className="mt-0.5 text-xs text-rose-200/90">{analyzeError}</p>
          </div>
        </div>
      )}

      {/* Main Studio Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left/Main Studio Console */}
        <div className="space-y-6 lg:col-span-7 xl:col-span-8">
          {/* Session Setup Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl sm:p-6">
            <div className="space-y-5">
              <div>
                <label
                  htmlFor="presentation-topic"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-400"
                >
                  Presentation Title or Topic
                </label>
                <input
                  id="presentation-topic"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., TSA Engineering Design — Autonomous Solar Drone Pitch"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/75 px-4 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400/60 focus:outline-none focus:ring-2 focus:ring-cyan-400/15"
                />
              </div>

              {/* Rubric Selector */}
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                    Evaluation Rubric
                  </span>
                  {rubricsError && (
                    <button
                      type="button"
                      onClick={() => void loadRubrics()}
                      className="inline-flex items-center gap-1 text-xs font-medium text-cyan-400 hover:text-cyan-300"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  )}
                </div>

                {rubricsLoading ? (
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[1, 2].map((skeleton) => (
                      <div
                        key={skeleton}
                        className="h-24 animate-pulse rounded-xl border border-white/5 bg-white/[0.03]"
                      />
                    ))}
                  </div>
                ) : rubricsError ? (
                  <div className="mt-2 rounded-xl border border-amber-500/25 bg-amber-500/10 p-3.5 text-xs text-amber-200">
                    <p className="font-medium">
                      Could not fetch rubrics ({rubricsError})
                    </p>
                    <p className="mt-1 text-amber-200/75">
                      Using default <code className="font-mono">general_delivery_v1</code>{" "}
                      rubric. Start the backend server and click Retry to load
                      all rubrics.
                    </p>
                  </div>
                ) : (
                  <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {rubrics.map((rubric) => {
                      const isSelected = rubric.id === selectedRubricId;
                      const isDisabled = !rubric.enabled;
                      return (
                        <button
                          key={rubric.id}
                          type="button"
                          disabled={isDisabled}
                          onClick={() => {
                            if (!isDisabled) setSelectedRubricId(rubric.id);
                          }}
                          className={cn(
                            "relative flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
                            isSelected &&
                              !isDisabled &&
                              "border-indigo-400/60 bg-indigo-500/15 ring-1 ring-indigo-400/30",
                            !isSelected &&
                              !isDisabled &&
                              "border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-900/80",
                            isDisabled &&
                              "cursor-not-allowed border-white/[0.05] bg-slate-950/40 opacity-60"
                          )}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <span className="text-sm font-semibold text-white">
                                {rubric.name}
                              </span>
                              {isDisabled ? (
                                <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-700 bg-slate-800/90 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                                  <Lock className="h-2.5 w-2.5" />
                                  Coming in Phase 2
                                </span>
                              ) : isSelected ? (
                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white">
                                  <Check className="h-3 w-3" />
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs text-slate-400">
                              {rubric.description}
                            </p>
                          </div>

                          <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                            <span>{rubric.criteria.length} criteria</span>
                            {rubric.target_min_sec && rubric.target_max_sec && (
                              <span>
                                • {formatTime(rubric.target_min_sec)}–
                                {formatTime(rubric.target_max_sec)}
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Audio Capture / Upload Card */}
          <div className="rounded-2xl border border-white/[0.08] bg-slate-900/60 p-5 backdrop-blur-xl sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-white">
                  Audio Input
                </h2>
                <p className="text-xs text-slate-400">
                  Record directly in browser or drop an existing take
                </p>
              </div>

              <div className="inline-flex rounded-xl border border-white/10 bg-slate-950/80 p-1">
                <button
                  type="button"
                  onClick={() => setActiveTab("record")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                    activeTab === "record"
                      ? "bg-indigo-500/25 text-white ring-1 ring-indigo-400/40"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Mic className="h-3.5 w-3.5" />
                  Record Live
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("upload")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all",
                    activeTab === "upload"
                      ? "bg-cyan-500/20 text-white ring-1 ring-cyan-400/40"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Audio
                </button>
              </div>
            </div>

            {activeTab === "record" ? (
              <AudioRecorder
                disabled={analyzing}
                onAnalyze={handleAnalyze}
                onRecordingStateChange={handleRecordingStateChange}
              />
            ) : (
              <AudioUploader disabled={analyzing} onAnalyze={handleAnalyze} />
            )}
          </div>
        </div>

        {/* Right Side: Timer + Cue Card Drawer */}
        <div className="space-y-6 lg:col-span-5 xl:col-span-4">
          <PresentationTimer
            isRecordingActive={isRecordingActive}
            recordingElapsedSec={recordingElapsedSec}
            defaultMinSec={selectedRubric?.target_min_sec}
            defaultMaxSec={selectedRubric?.target_max_sec}
            onRangeChange={handleRangeChange}
          />

          <NotesDrawer />
        </div>
      </div>
    </div>
  );
}
