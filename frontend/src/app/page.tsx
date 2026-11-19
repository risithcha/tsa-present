"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Lock,
  Mic,
  RefreshCw,
  Upload,
} from "lucide-react";
import { analyzePresentation, fetchRubrics } from "@/lib/api";
import { saveSession } from "@/lib/db";
import type { RubricSummary } from "@/lib/types";
import { cn, formatTime } from "@/lib/utils";
import { AnalyzingOverlay } from "@/components/AnalyzingOverlay";
import {
  AudioRecorder,
  type MicLevelStatus,
  type RecorderStatus,
} from "@/components/AudioRecorder";
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
  const [recorderStatus, setRecorderStatus] = useState<RecorderStatus>("idle");
  const [micLevel, setMicLevel] = useState<MicLevelStatus>("good");
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

  const handleMicStatusChange = useCallback(
    (nextStatus: RecorderStatus, nextLevel: MicLevelStatus) => {
      setRecorderStatus(nextStatus);
      setMicLevel(nextLevel);
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

  const handleTabSwitch = (nextTab: CaptureTab) => {
    setActiveTab(nextTab);
    if (nextTab === "upload") {
      setIsRecordingActive(false);
      setRecordingElapsedSec(0);
      setRecorderStatus("idle");
    }
  };

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
    <div className="flex flex-col gap-gutter-xl">
      <AnalyzingOverlay visible={analyzing} />

      {/* Flowy Editorial Session Setup */}
      <section aria-label="Session setup" className="flex flex-col gap-gutter-md">
        <label htmlFor="presentation-topic" className="flex flex-col gap-1">
          <span className="font-label text-label-sm uppercase tracking-wider text-primary">
            Practice Topic
          </span>
          <input
            id="presentation-topic"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Enter your presentation title or topic..."
            className="w-full border-0 border-b border-outline-variant/50 bg-transparent px-0 py-1 font-headline text-headline-md text-on-surface placeholder:text-outline transition-colors duration-[120ms] hover:border-outline-variant focus:border-primary focus:outline-none focus:ring-0 sm:text-headline-lg"
          />
        </label>

        <div className="flex flex-wrap items-center gap-gutter-sm">
          <span className="mr-1 font-label text-label-md text-on-surface-variant">
            Rubric:
          </span>

          {rubricsLoading ? (
            <div className="flex flex-wrap items-center gap-gutter-sm">
              <div className="h-8 w-52 animate-pulse rounded-full border border-outline-variant/50 bg-surface-container-low" />
              <div className="h-8 w-60 animate-pulse rounded-full border border-outline-variant/50 bg-surface-container-low" />
            </div>
          ) : rubricsError ? (
            <div className="flex flex-wrap items-center gap-gutter-sm">
              <button
                type="button"
                aria-pressed="true"
                className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-surface-container-lowest px-3.5 py-1.5 font-label text-label-md text-primary"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span>General Presentation Delivery</span>
              </button>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-warning-container px-3 py-1 font-label text-label-sm text-on-warning-container">
                Using default rubric ({rubricsError})
              </span>
              <button
                type="button"
                onClick={() => void loadRubrics()}
                className="inline-flex items-center gap-1 rounded-full border border-outline-variant bg-surface-container-lowest px-3 py-1 font-label text-label-sm text-primary transition-colors duration-[120ms] hover:bg-surface-container-low"
              >
                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                <span>Retry</span>
              </button>
            </div>
          ) : (
            rubrics.map((rubric) => {
              const isSelected = rubric.id === selectedRubricId;
              const isDisabled = !rubric.enabled;
              const targetWindow =
                rubric.target_min_sec && rubric.target_max_sec
                  ? ` (${formatTime(rubric.target_min_sec)}–${formatTime(rubric.target_max_sec)})`
                  : "";

              if (isDisabled) {
                return (
                  <button
                    key={rubric.id}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title={`${rubric.description} (Coming in Phase 2)`}
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full bg-surface-container-low px-3.5 py-1.5 font-label text-label-md text-on-surface-variant opacity-80"
                  >
                    <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{rubric.name} · Phase 2</span>
                  </button>
                );
              }

              return (
                <button
                  key={rubric.id}
                  type="button"
                  aria-pressed={isSelected}
                  title={`${rubric.description} · ${rubric.criteria.length} criteria${targetWindow}`}
                  onClick={() => setSelectedRubricId(rubric.id)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 font-label text-label-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    isSelected
                      ? "border-primary bg-surface-container-lowest text-primary"
                      : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                  )}
                >
                  {isSelected && (
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  )}
                  <span>{rubric.name}</span>
                </button>
              );
            })
          )}
        </div>
      </section>

      {analyzeError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-error/30 bg-error-container/70 p-4 text-body-sm text-on-error-container"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-error" aria-hidden="true" />
          <div>
            <p className="font-label text-label-md text-on-error-container">
              Analysis Error
            </p>
            <p className="mt-0.5 text-body-sm text-on-error-container/90">
              {analyzeError}
            </p>
          </div>
        </div>
      )}

      {/* Studio Stage: 7 Cols Open Recording Flow + 5 Cols Cue Card */}
      <div className="grid grid-cols-1 items-start gap-gutter-xl lg:grid-cols-12">
        {/* Left 7 Columns: Timekeeper + Audio Capture */}
        <div className="flex flex-col gap-gutter-lg lg:col-span-7">
          <PresentationTimer
            isRecordingActive={isRecordingActive}
            recordingElapsedSec={recordingElapsedSec}
            defaultMinSec={selectedRubric?.target_min_sec}
            defaultMaxSec={selectedRubric?.target_max_sec}
            onRangeChange={handleRangeChange}
          />

          {/* Soft Tonal Audio Capture Stage */}
          <article className="flex flex-col gap-gutter-lg rounded-xl border border-outline-variant bg-surface-container-lowest p-gutter-lg sm:p-gutter-xl">
            <div className="flex flex-wrap items-center justify-between gap-gutter-sm">
              <div
                role="tablist"
                aria-label="Audio input mode"
                className="inline-flex gap-1 rounded-full bg-surface-container-low p-1"
              >
                <button
                  role="tab"
                  type="button"
                  aria-selected={activeTab === "record"}
                  onClick={() => handleTabSwitch("record")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-label text-label-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    activeTab === "record"
                      ? "bg-surface-container-lowest text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <Mic className="h-4 w-4" aria-hidden="true" />
                  <span>Record Live</span>
                </button>
                <button
                  role="tab"
                  type="button"
                  aria-selected={activeTab === "upload"}
                  onClick={() => handleTabSwitch("upload")}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 font-label text-label-md transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    activeTab === "upload"
                      ? "bg-surface-container-lowest text-primary"
                      : "text-on-surface-variant hover:text-on-surface"
                  )}
                >
                  <Upload className="h-4 w-4" aria-hidden="true" />
                  <span>Upload Audio</span>
                </button>
              </div>

              {activeTab === "record" ? (
                recorderStatus === "recording" || recorderStatus === "paused" ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label text-label-sm",
                      micLevel === "good" &&
                        "bg-success-container text-on-success-container",
                      micLevel === "quiet" &&
                        "bg-warning-container text-on-warning-container",
                      micLevel === "loud" &&
                        "bg-error-container text-on-error-container"
                    )}
                  >
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full",
                        micLevel === "good" && "bg-success",
                        micLevel === "quiet" && "bg-warning",
                        micLevel === "loud" && "bg-error"
                      )}
                      aria-hidden="true"
                    />
                    {micLevel === "good" && "Good level"}
                    {micLevel === "quiet" && "Too quiet — move closer"}
                    {micLevel === "loud" && "Loud — back up slightly"}
                  </span>
                ) : recorderStatus === "recorded" ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-success-container px-3 py-1 font-label text-label-sm text-on-success-container">
                    <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden="true" />
                    Take ready
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1 font-label text-label-sm text-on-surface-variant">
                    <span className="h-1.5 w-1.5 rounded-full bg-outline" aria-hidden="true" />
                    Mic ready
                  </span>
                )
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-low px-3 py-1 font-label text-label-sm text-on-surface-variant">
                  Max 25 MB
                </span>
              )}
            </div>

            {activeTab === "record" ? (
              <AudioRecorder
                disabled={analyzing}
                onAnalyze={handleAnalyze}
                onRecordingStateChange={handleRecordingStateChange}
                onMicStatusChange={handleMicStatusChange}
              />
            ) : (
              <AudioUploader disabled={analyzing} onAnalyze={handleAnalyze} />
            )}
          </article>
        </div>

        {/* Right 5 Columns: Speaker Cue Card */}
        <div className="lg:col-span-5">
          <NotesDrawer />
        </div>
      </div>

      {/* Subtle One-Line Privacy Note */}
      <footer className="flex items-center justify-center gap-gutter-sm pt-gutter-sm text-on-surface-variant">
        <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="font-body text-body-sm">
          Audio is analyzed ephemerally and saved locally in your browser.
        </p>
      </footer>
    </div>
  );
}
