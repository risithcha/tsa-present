"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  FileAudio,
  Sparkles,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { cn } from "@/lib/utils";

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
  const inputRef = useRef<HTMLInputElement | null>(null);

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
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleClear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedFile(null);
    setError(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
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
            "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-8 text-center transition-all",
            dragActive
              ? "border-cyan-400 bg-cyan-500/10"
              : "border-white/15 bg-slate-950/60 hover:border-indigo-400/50 hover:bg-slate-900/60"
          )}
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/15 text-indigo-300 ring-1 ring-indigo-500/30">
            <UploadCloud className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">
              Drop an audio recording here, or{" "}
              <span className="text-cyan-400 underline underline-offset-2">
                browse files
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Supports .mp3, .wav, .m4a, .webm, .ogg • Max 25 MB
            </p>
          </div>
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
        <div className="flex flex-col gap-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/75 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/15 text-cyan-300 ring-1 ring-cyan-500/30">
                  <FileAudio className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-white">
                    {selectedFile.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready
                    to analyze
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:bg-rose-500/15 hover:text-rose-300"
                title="Remove file"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {previewUrl && (
              <audio
                src={previewUrl}
                controls
                className="mt-3 w-full accent-cyan-400"
              />
            )}
          </div>

          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              onAnalyze(
                selectedFile,
                selectedFile.name,
                selectedFile.type || "audio/mpeg"
              )
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 via-indigo-600 to-cyan-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            Analyze Presentation
          </button>
        </div>
      )}
    </div>
  );
}
