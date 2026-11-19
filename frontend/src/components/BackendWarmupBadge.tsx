"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { API_BASE_URL, fetchHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type EngineState = "warming" | "ready" | "offline";

export function BackendWarmupBadge() {
  const [state, setState] = useState<EngineState>("warming");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const checkHealth = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      setState("warming");
    }
    const controller = new AbortController();
    // Allow generous timeout for free-tier cloud cold starts (Render can take 50-60s)
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const data = await fetchHealth(controller.signal);
      clearTimeout(timeout);
      setHealth(data);
      if (data.status === "ok" && data.vad_loaded) {
        setState("ready");
        retryCountRef.current = 0;
      } else {
        setState("warming");
        if (retryCountRef.current < 8) {
          retryCountRef.current += 1;
          timerRef.current = setTimeout(() => checkHealth(true), 3000);
        }
      }
    } catch {
      clearTimeout(timeout);
      if (retryCountRef.current < 4) {
        // Up to ~115s total grace period for free-tier container cold starts
        retryCountRef.current += 1;
        setState("warming");
        timerRef.current = setTimeout(() => checkHealth(true), 3000);
      } else {
        setState("offline");
      }
    }
  }, []);

  useEffect(() => {
    void checkHealth(false);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [checkHealth]);

  useEffect(() => {
    if (!showDetails) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowDetails(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowDetails(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [showDetails]);

  const handleManualRetry = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    retryCountRef.current = 0;
    void checkHealth(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        aria-expanded={showDetails}
        aria-haspopup="dialog"
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-label text-label-sm transition-colors duration-[120ms] ease-state-change focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          state === "ready" &&
            "bg-success-container text-on-success-container hover:brightness-95",
          state === "warming" &&
            "bg-warning-container text-on-warning-container hover:brightness-95",
          state === "offline" &&
            "bg-error-container text-on-error-container hover:brightness-95"
        )}
        title="Audio Engine Status"
      >
        <span role="status" className="inline-flex items-center gap-1.5">
          <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
            {state === "warming" && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-60" />
            )}
            <span
              className={cn(
                "relative inline-flex h-2 w-2 rounded-full",
                state === "ready" && "bg-success",
                state === "warming" && "bg-warning",
                state === "offline" && "bg-error"
              )}
            />
          </span>
          <span className="hidden sm:inline">
            {state === "ready" && "Audio Engine Ready"}
            {state === "warming" && "Warming up engine..."}
            {state === "offline" && "Engine Offline"}
          </span>
          <span className="sm:hidden">
            {state === "ready" && "Ready"}
            {state === "warming" && "Warming"}
            {state === "offline" && "Offline"}
          </span>
        </span>
      </button>

      {showDetails && (
        <div
          role="dialog"
          aria-label="Speech Engine Diagnostics"
          className="absolute right-0 z-50 mt-2 w-72 rounded-md border border-outline-variant bg-surface-container-lowest p-4 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <span className="font-label text-label-md text-on-surface">
              Speech Engine Diagnostics
            </span>
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1 rounded border border-outline-variant bg-surface-container-low px-2 py-1 font-label text-label-sm text-on-surface transition-colors duration-[120ms] ease-state-change hover:bg-surface-container focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <RefreshCw className="h-3 w-3" />
              Recheck
            </button>
          </div>
          {health ? (
            <dl className="space-y-2 font-body text-body-sm text-on-surface-variant">
              <div className="flex items-center justify-between">
                <dt>Silero VAD</dt>
                <dd
                  className={cn(
                    "font-label text-label-sm",
                    health.vad_loaded ? "text-success" : "text-warning"
                  )}
                >
                  {health.vad_loaded ? "Loaded" : "Loading"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Deepgram STT</dt>
                <dd
                  className={cn(
                    "font-label text-label-sm",
                    health.deepgram_configured ? "text-success" : "text-error"
                  )}
                >
                  {health.deepgram_configured ? "Connected" : "Unconfigured"}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt>Gemini Coach</dt>
                <dd
                  className={cn(
                    "font-label text-label-sm",
                    health.gemini_configured ? "text-success" : "text-error"
                  )}
                >
                  {health.gemini_configured ? "Connected" : "Unconfigured"}
                </dd>
              </div>
              {health.gemini_model && (
                <div className="flex items-center justify-between border-t border-outline-variant pt-2">
                  <dt>Model</dt>
                  <dd className="font-mono text-mono-sm text-primary">
                    {health.gemini_model}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="font-body text-body-sm text-on-surface-variant">
              {state === "warming"
                ? "Waking up speech engine (free-tier cold starts can take 30–60s after idle)..."
                : `Could not reach speech engine at ${API_BASE_URL}. Click Recheck to retry.`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
