"""Lightweight pure-NumPy acoustic prosody engine (YIN F0 pitch, RMS dynamics, and pacing).

Avoids librosa/numba JIT overhead so peak memory stays well below 200 MB on free 512 MB hosts.
"""

import numpy as np

from app.schemas import AcousticSummary, PaceWindow, WordToken


def _build_speech_mask(
    frame_times: np.ndarray,
    speech_segments: list[tuple[float, float]],
) -> np.ndarray:
    """Return boolean mask marking frames falling inside any VAD speech segment."""
    mask = np.zeros(len(frame_times), dtype=bool)
    for start, end in speech_segments:
        mask |= (frame_times >= start) & (frame_times <= end)
    return mask


def _frame_audio(audio: np.ndarray, frame_length: int, hop_length: int) -> np.ndarray:
    """Slice 1D float32 audio into overlapping frames centered on hop indices."""
    pad = frame_length // 2
    padded = np.pad(audio, (pad, pad), mode="constant")
    n_frames = 1 + (len(padded) - frame_length) // hop_length
    if n_frames <= 0:
        return np.empty((0, frame_length), dtype=np.float32)
    stride = padded.strides[0]
    return np.lib.stride_tricks.as_strided(
        padded,
        shape=(n_frames, frame_length),
        strides=(hop_length * stride, stride),
    )


def _yin_f0_frames(
    frames: np.ndarray,
    sr: int,
    fmin: float = 65.0,
    fmax: float = 500.0,
    trough_threshold: float = 0.12,
    batch_size: int = 512,
) -> np.ndarray:
    """Vectorized FFT-accelerated YIN pitch estimator over 2D audio frames."""
    n_frames, frame_length = frames.shape
    if n_frames == 0:
        return np.empty(0, dtype=np.float64)

    tau_min = max(2, int(np.floor(sr / fmax)))
    tau_max = min(frame_length // 2, int(np.ceil(sr / fmin)))
    if tau_max <= tau_min + 2:
        return np.full(n_frames, np.nan, dtype=np.float64)

    win_len = frame_length - tau_max
    n_fft = 1 << int(np.ceil(np.log2(frame_length + win_len)))
    taus = np.arange(tau_max + 1, dtype=np.float64)
    f0_out = np.full(n_frames, np.nan, dtype=np.float64)

    for b_start in range(0, n_frames, batch_size):
        batch = np.asarray(frames[b_start : b_start + batch_size], dtype=np.float64)
        batch = batch - np.mean(batch, axis=1, keepdims=True)
        energy_check = np.sum(batch * batch, axis=1)

        # Cumulative squared energy for sliding window energy terms
        csq = np.concatenate(
            [np.zeros((len(batch), 1), dtype=np.float64), np.cumsum(batch * batch, axis=1)],
            axis=1,
        )
        e1 = csq[:, win_len : win_len + 1]
        tau_idx = np.arange(tau_max + 1)
        e2 = csq[:, tau_idx + win_len] - csq[:, tau_idx]

        # Cross-correlation via FFT: acf[tau] = sum_{j=0}^{win_len-1} x[j] * x[j + tau]
        x1_fft = np.fft.rfft(batch[:, :win_len], n=n_fft, axis=1)
        x2_fft = np.fft.rfft(batch, n=n_fft, axis=1)
        acf = np.fft.irfft(np.conj(x1_fft) * x2_fft, n=n_fft, axis=1)[:, : tau_max + 1]

        diff = np.maximum(0.0, e1 + e2 - 2.0 * acf)

        # Cumulative mean normalized difference function (CMNDF)
        cum = np.cumsum(diff[:, 1:], axis=1)
        cmndf = np.ones_like(diff)
        cmndf[:, 1:] = np.where(cum > 1e-12, diff[:, 1:] * taus[1:] / np.maximum(cum, 1e-12), 1.0)

        for i in range(len(batch)):
            if energy_check[i] < 1e-7:
                continue
            c = cmndf[i]
            sub = c[tau_min : tau_max + 1]

            # Find first local minimum below trough_threshold, else global minimum
            below = np.where(sub < trough_threshold)[0]
            if len(below) > 0:
                idx = int(below[0]) + tau_min
                while idx + 1 <= tau_max and c[idx + 1] < c[idx]:
                    idx += 1
            else:
                idx = int(np.argmin(sub)) + tau_min
                if c[idx] > 0.5:
                    continue

            # Parabolic interpolation around trough for sub-sample precision
            tau_est = float(idx)
            if 0 < idx < tau_max:
                s0, s1, s2 = c[idx - 1], c[idx], c[idx + 1]
                denom = 2.0 * (s0 - 2.0 * s1 + s2)
                if abs(denom) > 1e-12:
                    delta = (s0 - s2) / denom
                    if abs(delta) <= 1.0:
                        tau_est += delta

            if tau_est > 0.0:
                f0_out[b_start + i] = sr / tau_est

    return f0_out


def _compute_pace_timeline(
    words: list[WordToken],
    duration_sec: float,
    window_sec: float = 15.0,
    step_sec: float = 5.0,
) -> list[PaceWindow]:
    """Compute 15-second rolling WPM pace timeline across the recording."""
    if duration_sec <= 0.0:
        return []

    windows: list[tuple[float, float]] = []
    if duration_sec <= window_sec:
        windows.append((0.0, duration_sec))
    else:
        pos = 0.0
        while pos + window_sec <= duration_sec + 1e-6:
            windows.append((pos, min(pos + window_sec, duration_sec)))
            pos += step_sec
        if windows and (duration_sec - windows[-1][1]) >= 2.0:
            windows.append((max(0.0, duration_sec - window_sec), duration_sec))

    midpoints = np.array([(w.start + w.end) / 2.0 for w in words], dtype=np.float64)
    timeline: list[PaceWindow] = []

    for idx, (w_start, w_end) in enumerate(windows):
        span = w_end - w_start
        if span <= 0.0:
            continue
        if len(midpoints) == 0:
            count = 0
        elif idx == len(windows) - 1:
            count = int(np.sum((midpoints >= w_start) & (midpoints <= w_end)))
        else:
            count = int(np.sum((midpoints >= w_start) & (midpoints < w_end)))
        wpm = round(count / (span / 60.0), 1)
        timeline.append(
            PaceWindow(
                start_sec=round(w_start, 2),
                end_sec=round(w_end, 2),
                wpm=wpm,
            )
        )

    return timeline


def analyze_prosody(
    y: np.ndarray,
    sr: int,
    duration_sec: float,
    speech_segments: list[tuple[float, float]],
    speaking_time_sec: float,
    pause_time_sec: float,
    pause_ratio: float,
    words: list[WordToken],
) -> AcousticSummary:
    """Compute F0 pitch stats, monotone risk, RMS dynamic range, trailing-off, and pace."""
    audio = np.asarray(y, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1)

    hop_length = 256
    frame_length = 1024

    if len(audio) >= frame_length and speech_segments:
        frames = _frame_audio(audio, frame_length=frame_length, hop_length=hop_length)
        frame_times = (np.arange(len(frames), dtype=np.float64) * hop_length) / float(sr)
        speech_mask = _build_speech_mask(frame_times, speech_segments)

        # 1. Pitch via YIN computed strictly on VAD speech frames & valid human F0 range (70-450 Hz)
        if np.any(speech_mask):
            speech_f0 = _yin_f0_frames(frames[speech_mask], sr=sr, fmin=65.0, fmax=500.0)
            valid_f0 = speech_f0[np.isfinite(speech_f0) & (speech_f0 >= 70.0) & (speech_f0 <= 450.0)]
        else:
            valid_f0 = np.array([], dtype=np.float64)

        # 2. RMS dB across VAD speech frames -> dynamic range & trailing-off detection
        rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1))
        rms_db = 20.0 * np.log10(np.maximum(rms, 1e-6))

        if np.any(speech_mask):
            speech_db = rms_db[speech_mask]
            p95, p10 = np.percentile(speech_db, [95.0, 10.0])
            volume_dynamic_range_db = float(max(0.0, p95 - p10))
        else:
            volume_dynamic_range_db = 0.0

        trailing_off_count = 0
        for seg_start, seg_end in speech_segments:
            if (seg_end - seg_start) < 1.5:
                continue
            split_t = seg_start + 0.8 * (seg_end - seg_start)
            first_mask = (frame_times >= seg_start) & (frame_times < split_t)
            final_mask = (frame_times >= split_t) & (frame_times <= seg_end)
            if not np.any(first_mask) or not np.any(final_mask):
                continue
            first_median_db = float(np.median(rms_db[first_mask]))
            final_median_db = float(np.median(rms_db[final_mask]))
            if (first_median_db - final_median_db) >= 8.0:
                trailing_off_count += 1
    else:
        valid_f0 = np.array([], dtype=np.float64)
        volume_dynamic_range_db = 0.0
        trailing_off_count = 0

    if len(valid_f0) > 0:
        pitch_median_hz = float(np.median(valid_f0))
        semitones = 12.0 * np.log2(valid_f0 / pitch_median_hz)
        q75, q25 = np.percentile(semitones, [75.0, 25.0])
        pitch_variability_semitones = float(max(0.0, q75 - q25))
    else:
        pitch_median_hz = 0.0
        pitch_variability_semitones = 0.0

    if pitch_variability_semitones < 2.0:
        monotone_risk = "high"
    elif pitch_variability_semitones <= 3.5:
        monotone_risk = "moderate"
    else:
        monotone_risk = "low"

    # 3. Speaking rate & rolling pace timeline
    word_count = len(words)
    overall_wpm = (
        round(word_count / (duration_sec / 60.0), 1)
        if duration_sec > 0.0 and word_count > 0
        else 0.0
    )
    articulation_wpm = (
        round(word_count / (speaking_time_sec / 60.0), 1)
        if speaking_time_sec > 0.0 and word_count > 0
        else 0.0
    )
    pace_timeline = _compute_pace_timeline(words, duration_sec)

    return AcousticSummary(
        duration_sec=round(duration_sec, 3),
        speaking_time_sec=round(speaking_time_sec, 3),
        pause_time_sec=round(pause_time_sec, 3),
        pause_ratio=round(pause_ratio, 4),
        overall_wpm=overall_wpm,
        articulation_wpm=articulation_wpm,
        pitch_median_hz=round(pitch_median_hz, 2),
        pitch_variability_semitones=round(pitch_variability_semitones, 2),
        monotone_risk=monotone_risk,
        volume_dynamic_range_db=round(volume_dynamic_range_db, 2),
        trailing_off_count=trailing_off_count,
        pace_timeline=pace_timeline,
    )
