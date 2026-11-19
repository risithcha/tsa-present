"""Acoustic prosody engine computing pitch, monotone risk, volume dynamics, and pacing."""

import librosa
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

    # 1. Pitch via YIN masked to VAD speech frames & valid human F0 range (70-450 Hz)
    if len(audio) >= frame_length and speech_segments:
        f0 = librosa.yin(
            audio,
            fmin=65.0,
            fmax=500.0,
            sr=sr,
            frame_length=frame_length,
            hop_length=hop_length,
        )
        f0_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=hop_length)
        speech_mask = _build_speech_mask(f0_times, speech_segments)
        valid_mask = speech_mask & np.isfinite(f0) & (f0 >= 70.0) & (f0 <= 450.0)
        valid_f0 = f0[valid_mask]
    else:
        valid_f0 = np.array([], dtype=np.float64)

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

    # 2. RMS dB across VAD speech frames -> dynamic range & trailing-off detection
    if len(audio) >= frame_length and speech_segments:
        rms = librosa.feature.rms(
            y=audio,
            frame_length=frame_length,
            hop_length=hop_length,
        )[0]
        rms_db = 20.0 * np.log10(np.maximum(rms, 1e-6))
        rms_times = librosa.frames_to_time(np.arange(len(rms_db)), sr=sr, hop_length=hop_length)
        rms_speech_mask = _build_speech_mask(rms_times, speech_segments)

        if np.any(rms_speech_mask):
            speech_db = rms_db[rms_speech_mask]
            p95, p10 = np.percentile(speech_db, [95.0, 10.0])
            volume_dynamic_range_db = float(max(0.0, p95 - p10))
        else:
            volume_dynamic_range_db = 0.0

        trailing_off_count = 0
        for seg_start, seg_end in speech_segments:
            if (seg_end - seg_start) < 1.5:
                continue
            split_t = seg_start + 0.8 * (seg_end - seg_start)
            first_mask = (rms_times >= seg_start) & (rms_times < split_t)
            final_mask = (rms_times >= split_t) & (rms_times <= seg_end)
            if not np.any(first_mask) or not np.any(final_mask):
                continue
            first_median_db = float(np.median(rms_db[first_mask]))
            final_median_db = float(np.median(rms_db[final_mask]))
            if (first_median_db - final_median_db) >= 8.0:
                trailing_off_count += 1
    else:
        volume_dynamic_range_db = 0.0
        trailing_off_count = 0

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
