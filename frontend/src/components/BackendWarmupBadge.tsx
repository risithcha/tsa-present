"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { fetchHealth } from "@/lib/api";
import type { HealthResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

type EngineState = "warming" | "ready" | "offline";

export function BackendWarmupBadge() {
  const [state, setState] = useState<EngineState>("warming");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const retryCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkHealth = useCallback(async (isRetry = false) => {
    if (!isRetry) {
      setState("warming");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const data = await fetchHealth(controller.signal);
      clearTimeout(timeout);
      setHealth(data);
      if (data.status === "ok" && data.vad_loaded) {
        setState("ready");
        retryCountRef.current = 0;
      } else {
        setState("warming");
        if (retryCountRef.current < 6) {
          retryCountRef.current += 1;
          timerRef.current = setTimeout(() => checkHealth(true), 3000);
        }
      }
    } catch {
      clearTimeout(timeout);
      if (retryCountRef.current < 2) {
        // Initial cold start grace period before declaring offline
        retryCountRef.current += 1;
        setState("warming");
        timerRef.current = setTimeout(() => checkHealth(true), 2500);
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

  const handleManualRetry = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    retryCountRef.current = 0;
    void checkHealth(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowDetails((prev) => !prev)}
        className={cn(
          "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
          state === "ready" &&
            "border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
          state === "warming" &&
            "border-amber-500/25 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15",
          state === "offline" &&
            "border-rose-500/25 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
        )}
        title="Audio Engine Status"
      >
        <span className="relative flex h-2 w-2">
          {state === "warming" && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
          )}
          {state === "ready" && (
            <span className="absolute inline-flex h-full w-full animate-pulse rounded-full bg-emerald-400 opacity-60" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              state === "ready" && "bg-emerald-400",
              state === "warming" && "bg-amber-400",
              state === "offline" && "bg-rose-400"
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
      </button>

      {showDetails && (
        <div className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-white/10 bg-slate-900/95 p-3.5 text-xs shadow-2xl backdrop-blur-xl">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold text-slate-200">
              Speech Engine Diagnostics
            </span>
            <button
              type="button"
              onClick={handleManualRetry}
              className="inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 text-[11px] text-slate-300 hover:bg-white/10"
            >
              <RefreshCw className="h-3 w-3" />
              Recheck
            </button>
          </div>
          {health ? (
            <dl className="space-y-1.5 text-slate-400">
              <div className="flex justify-between">
                <dt>Silero VAD</dt>
                <dd
                  className={
                    health.vad_loaded ? "text-emerald-400" : "text-amber-400"
                  }
                >
                  {health.vad_loaded ? "Loaded" : "Loading"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Deepgram STT</dt>
                <dd
                  className={
                    health.deepgram_configured
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {health.deepgram_configured ? "Connected" : "Unconfigured"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt>Gemini Coach</dt>
                <dd
                  className={
                    health.gemini_configured
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }
                >
                  {health.gemini_configured ? "Connected" : "Unconfigured"}
                </dd>
              </div>
              {health.gemini_model && (
                <div className="flex justify-between border-t border-white/5 pt-1.5">
                  <dt>Model</dt>
                  <dd className="font-mono text-[11px] text-cyan-300">
                    {health.gemini_model}
                  </dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="text-slate-400">
              {state === "warming"
                ? "Connecting to FastAPI speech analysis backend..."
                : "Could not reach backend API. Ensure FastAPI is running on port 8000."}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
