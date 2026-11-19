"""Singleton Silero VAD ONNX Runtime processor with hysteresis smoothing."""

from dataclasses import dataclass
import logging
from pathlib import Path
import threading

import numpy as np
import onnxruntime as ort

from app.config import get_settings

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VADResult:
    """Voice activity detection segmentation and timing summary."""

    speech_segments: list[tuple[float, float]]
    silence_gaps: list[tuple[float, float]]
    speaking_time_sec: float
    pause_time_sec: float
    pause_ratio: float


class SileroVADEngine:
    """Thread-safe singleton wrapper around Silero VAD ONNX Runtime session."""

    _instance: "SileroVADEngine | None" = None
    _lock = threading.Lock()

    def __init__(self, model_path: Path) -> None:
        if not model_path.exists():
            raise FileNotFoundError(f"Silero VAD ONNX model not found at {model_path}")

        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 1
        opts.inter_op_num_threads = 1

        self.model_path = model_path
        self.session = ort.InferenceSession(
            str(model_path),
            sess_options=opts,
            providers=["CPUExecutionProvider"],
        )

        input_names = {inp.name for inp in self.session.get_inputs()}
        if "state" in input_names:
            self.version = "v5"
        elif "h" in input_names and "c" in input_names:
            self.version = "v4"
        else:
            raise ValueError(f"Unsupported Silero VAD ONNX inputs: {sorted(input_names)}")

        logger.info("Loaded Silero VAD (%s) from %s", self.version, model_path)

    @classmethod
    def get_instance(cls, model_path: Path | None = None) -> "SileroVADEngine":
        """Return the singleton SileroVADEngine instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    resolved = model_path or get_settings().resolve_vad_model_path()
                    cls._instance = cls(resolved)
        return cls._instance

    @classmethod
    def is_loaded(cls) -> bool:
        """Return True if singleton model session has been initialized."""
        return cls._instance is not None

    def _infer_chunk_probs(self, audio: np.ndarray, sr: int = 16000) -> list[float]:
        """Run chunked ONNX inference over 16kHz mono float32 audio."""
        if sr != 16000:
            raise ValueError(f"Silero VAD expects 16000 Hz audio, got {sr} Hz.")

        window_size = 512
        num_samples = len(audio)
        if num_samples == 0:
            return []

        remainder = num_samples % window_size
        if remainder != 0:
            pad_len = window_size - remainder
            padded = np.concatenate([audio, np.zeros(pad_len, dtype=np.float32)])
        else:
            padded = audio

        probs: list[float] = []
        sr_tensor = np.array(sr, dtype=np.int64) if self.version == "v5" else np.array([sr], dtype=np.int64)

        if self.version == "v5":
            state = np.zeros((2, 1, 128), dtype=np.float32)
            context = np.zeros((1, 64), dtype=np.float32)
            for start in range(0, len(padded), window_size):
                chunk = padded[start : start + window_size].reshape(1, window_size)
                model_input = np.concatenate([context, chunk], axis=1)
                out, state = self.session.run(
                    None,
                    {"input": model_input, "state": state, "sr": sr_tensor},
                )
                probs.append(float(out[0, 0]))
                context = chunk[:, -64:]
        else:
            h = np.zeros((2, 1, 64), dtype=np.float32)
            c = np.zeros((2, 1, 64), dtype=np.float32)
            for start in range(0, len(padded), window_size):
                chunk = padded[start : start + window_size].reshape(1, window_size)
                out, h, c = self.session.run(
                    None,
                    {"input": chunk, "h": h, "c": c, "sr": sr_tensor},
                )
                probs.append(float(out[0, 0]))

        return probs

    def detect_speech(
        self,
        audio: np.ndarray,
        sr: int = 16000,
        speech_threshold: float = 0.5,
        min_speech_ms: int = 200,
        min_silence_ms: int = 350,
    ) -> VADResult:
        """Detect speech segments and internal pauses using smoothing hysteresis."""
        samples = np.asarray(audio, dtype=np.float32)
        if samples.ndim > 1:
            samples = np.mean(samples, axis=1).astype(np.float32)

        total_samples = len(samples)
        if total_samples == 0:
            return VADResult([], [], 0.0, 0.0, 0.0)

        duration_sec = total_samples / float(sr)
        probs = self._infer_chunk_probs(samples, sr=sr)

        window_size = 512
        neg_threshold = max(speech_threshold - 0.15, 0.01)
        min_speech_samples = int(sr * (min_speech_ms / 1000.0))
        min_silence_samples = int(sr * (min_silence_ms / 1000.0))

        triggered = False
        temp_end = 0
        current_start = 0
        raw_segments: list[tuple[int, int]] = []

        for idx, prob in enumerate(probs):
            cur_sample = idx * window_size

            if prob >= speech_threshold and temp_end:
                temp_end = 0

            if prob >= speech_threshold and not triggered:
                triggered = True
                current_start = cur_sample
                continue

            if prob < neg_threshold and triggered:
                if not temp_end:
                    temp_end = cur_sample
                if (cur_sample - temp_end) < min_silence_samples:
                    continue

                if (temp_end - current_start) >= min_speech_samples:
                    raw_segments.append((current_start, temp_end))
                triggered = False
                temp_end = 0

        if triggered:
            end_sample = temp_end if temp_end > current_start else total_samples
            if (end_sample - current_start) >= min_speech_samples:
                raw_segments.append((current_start, min(end_sample, total_samples)))

        # Convert to seconds and clamp to [0, duration_sec]
        speech_segments: list[tuple[float, float]] = []
        min_gap_sec = min_silence_ms / 1000.0
        for s_samp, e_samp in raw_segments:
            s_sec = round(max(0.0, s_samp / float(sr)), 3)
            e_sec = round(min(duration_sec, e_samp / float(sr)), 3)
            if e_sec <= s_sec:
                continue
            if speech_segments and (s_sec - speech_segments[-1][1]) < min_gap_sec:
                prev_s, _ = speech_segments[-1]
                speech_segments[-1] = (prev_s, e_sec)
            else:
                speech_segments.append((s_sec, e_sec))

        if not speech_segments:
            return VADResult([], [], 0.0, 0.0, 0.0)

        # Only internal pauses between first speech start and last speech end
        silence_gaps: list[tuple[float, float]] = []
        for idx in range(len(speech_segments) - 1):
            gap_start = speech_segments[idx][1]
            gap_end = speech_segments[idx + 1][0]
            if gap_end > gap_start:
                silence_gaps.append((round(gap_start, 3), round(gap_end, 3)))

        speaking_time_sec = round(sum(e - s for s, e in speech_segments), 3)
        pause_time_sec = round(sum(e - s for s, e in silence_gaps), 3)
        active_span = speaking_time_sec + pause_time_sec
        pause_ratio = round(pause_time_sec / active_span, 4) if active_span > 0.0 else 0.0

        return VADResult(
            speech_segments=speech_segments,
            silence_gaps=silence_gaps,
            speaking_time_sec=speaking_time_sec,
            pause_time_sec=pause_time_sec,
            pause_ratio=pause_ratio,
        )
