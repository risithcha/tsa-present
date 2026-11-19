"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  FileAudio,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { cn, formatTime } from "@/lib/utils";

const MAX_FILE_BYTES = 25 * 1024 * 1024; // 25 MB
const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".m4a", ".webm", ".ogg"];

interface AudioUploaderProps {
  disabled?: boolean;
  onAnalyze: (blob: Blob, filename: string, mimeType: string) => void;
}

function isSupportedAudioFile(file: File): boolean {
  const lower = file.name.toLowerCase();
  if (ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext))) return true;
  if (file.type.startsWith("audio/")) return true;
  return false;
}

export function AudioUploader({
  disabled = false,
  onAnalyze,
}: AudioUploaderProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSec, setCurrentSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = (file: File) => {
    setError(null);
    if (!isSupportedAudioFile(file)) {
      setError(
        "Unsupported file format. Please upload .mp3, .wav, .m4a, .webm, or .ogg audio."
      );
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `File exceeds 25 MB limit (${(file.size / (1024 * 1024)).toFixed(1)} MB).`
      );
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const url = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(url);
    setIsPlaying(false);
    setCurrentSec(0);
    setDurationSec(0);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleClear = () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setIsPlaying(false);
    setCurrentSec(0);
    setDurationSec(0);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !durationSec || !Number.isFinite(durationSec)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    audio.currentTime = ratio * durationSec;
    setCurrentSec(audio.currentTime);
  };

  const progressPct =
    durationSec > 0 && Number.isFinite(durationSec)
      ? Math.min(100, (currentSec / durationSec) * 100)
      : 0;

  return (
    <div className="flex flex-col gap-gutter-md">
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-error/30 bg-error-container/70 p-3 text-body-sm text-on-error-container"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-error" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {!selectedFile ? (
        <div
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragActive(false);
          }}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              inputRef.current?.click();
            }
          }}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-gutter-sm rounded-lg border-2 border-dashed p-gutter-xl text-center transition-colors duration-[120ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
            dragActive
              ? "border-primary bg-surface-container"
              : "border-outline-variant bg-surface-container-low hover:border-primary/60 hover:bg-surface-container"
          )}
        >
          <FileAudio className="h-8 w-8 text-primary" aria-hidden="true" />
          <div className="font-title text-title-md text-on-surface">
            Drop an audio recording here, or browse files
          </div>
          <p className="font-body text-body-sm text-on-surface-variant">
            Supports .mp3, .wav, .m4a, .webm, or .ogg up to 25 MB.
          </p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              inputRef.current?.click();
            }}
            className="mt-2 rounded-full border border-outline-variant bg-surface-container-lowest px-4 py-2 font-label text-label-md text-on-surface transition-colors duration-[120ms] hover:bg-surface-container"
          >
            Choose Audio File
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".mp3,.wav,.m4a,.webm,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
      ) : (
        <div className="flex flex-col gap-gutter-md">
          <div className="rounded-lg border border-outline-variant/80 bg-surface-container-low p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-outline-variant bg-surface-container-lowest text-primary">
                  <FileAudio className="h-5 w-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="truncate font-title text-title-md text-on-surface">
                    {selectedFile.name}
                  </p>
                  <p className="font-body text-body-sm text-on-surface-variant">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB · Ready to analyze
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                aria-label="Remove audio file"
                title="Remove file"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-surface-container-lowest text-on-surface-variant transition-colors duration-[120ms] hover:border-error/40 hover:bg-error-container/60 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            {previewUrl && (
              <div className="mt-3 flex items-center gap-gutter-md rounded-md border border-outline-variant/60 bg-surface-container-lowest px-3.5 py-2.5">
                <audio
                  ref={audioRef}
                  src={previewUrl}
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const dur = e.currentTarget.duration;
                    if (Number.isFinite(dur)) setDurationSec(dur);
                  }}
                  onTimeUpdate={(e) => {
                    setCurrentSec(e.currentTarget.currentTime);
                  }}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={togglePlayback}
                  aria-label={isPlaying ? "Pause uploaded audio" : "Play uploaded audio"}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-low text-primary transition-colors duration-[120ms] hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4 translate-x-0.5" aria-hidden="true" />
                  )}
                </button>
                <div
                  role="slider"
                  tabIndex={0}
                  aria-label="Audio preview position"
                  aria-valuemin={0}
                  aria-valuemax={Math.round(durationSec)}
                  aria-valuenow={Math.round(currentSec)}
                  onClick={handleSeek}
                  className="h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-surface-container-highest"
                >
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-75"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <span className="font-mono text-mono-sm text-on-surface-variant tabular-nums">
                  {formatTime(currentSec)} / {formatTime(durationSec)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-end pt-gutter-sm">
        <button
          type="button"
          disabled={disabled || !selectedFile}
          onClick={() => {
            if (!selectedFile) return;
            onAnalyze(
              selectedFile,
              selectedFile.name,
              selectedFile.type || "audio/mpeg"
            );
          }}
          className="inline-flex w-full items-center justify-center gap-gutter-sm rounded-full bg-primary px-6 py-2.5 font-label text-label-lg text-on-primary transition-colors duration-[120ms] hover:bg-primary-container disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          <span>Analyze Presentation</span>
        </button>
      </div>
    </div>
  );
}
