"""Tests for Silero VAD segmentation and prosody acoustics (pitch, monotone risk, trailing off)."""

import numpy as np
from scipy.signal import lfilter

from app.schemas import WordToken
from app.services.prosody_engine import analyze_prosody
from app.services.vad_engine import SileroVADEngine


SR = 16000


def _resonant_filter(x: np.ndarray, f_hz: float, bw_hz: float) -> np.ndarray:
    r = np.exp(-np.pi * bw_hz / SR)
    theta = 2.0 * np.pi * f_hz / SR
    a = np.array([1.0, -2.0 * r * np.cos(theta), r * r])
    b = np.array([1.0 - r])
    return lfilter(b, a, x)


def _synth_speech_burst(
    dur_sec: float,
    f0_base: float = 150.0,
    f0_mod_hz: float = 35.0,
    amp: float = 0.45,
) -> np.ndarray:
    """Synthesize formant-varying voiced speech syllables for Silero VAD & YIN."""
    rng = np.random.default_rng(7)
    vowels = [(720, 1120), (520, 1800), (640, 1450), (460, 2000), (760, 1250)]
    syl_len = int(0.18 * SR)
    n_syl = int(np.ceil(dur_sec * SR / syl_len))
    t_all = np.linspace(0.0, n_syl * 0.18, n_syl * syl_len, endpoint=False)

    f0 = f0_base + f0_mod_hz * np.sin(2.0 * np.pi * 1.4 * t_all)
    phase = 2.0 * np.pi * np.cumsum(f0) / SR
    glot = sum((1.0 / k) * np.sin(k * phase) for k in range(1, 16))

    chunks: list[np.ndarray] = []
    for i in range(n_syl):
        s = i * syl_len
        e = s + syl_len
        seg = glot[s:e] + 0.06 * rng.standard_normal(syl_len)
        f1, f2 = vowels[i % len(vowels)]
        voiced = _resonant_filter(seg, f1, 90.0) + 0.65 * _resonant_filter(seg, f2, 120.0)
        t_s = np.linspace(0.0, 1.0, syl_len, endpoint=False)
        env = 0.25 + 0.75 * (np.sin(np.pi * t_s) ** 0.5)
        chunks.append(voiced * env)

    out = np.concatenate(chunks)[: int(dur_sec * SR)]
    peak = max(float(np.max(np.abs(out))), 1e-6)
    return (amp * out / peak).astype(np.float32)


def _voiced_harmonic_waveform(f0_series: np.ndarray, amp_envelope: np.ndarray) -> np.ndarray:
    """Synthesize clean voiced harmonic waveform with exact F0 trajectory and amplitude envelope."""
    phase = 2.0 * np.pi * np.cumsum(f0_series) / SR
    sig = (
        0.65 * np.sin(phase)
        + 0.25 * np.sin(2.0 * phase)
        + 0.10 * np.sin(3.0 * phase)
    )
    return (sig * amp_envelope).astype(np.float32)


def test_vad_detects_speech_and_internal_pauses_ignoring_edges() -> None:
    """Silero VAD detects two speech bursts separated by silence, ignoring leading/trailing silence."""
    vad = SileroVADEngine.get_instance()
    sil = np.zeros(int(1.0 * SR), dtype=np.float32)
    burst_a = _synth_speech_burst(2.4, f0_base=145.0, f0_mod_hz=35.0)
    burst_b = _synth_speech_burst(2.4, f0_base=155.0, f0_mod_hz=30.0)
    audio = np.concatenate([sil, burst_a, sil, burst_b, sil])

    res = vad.detect_speech(audio, sr=SR)

    assert len(res.speech_segments) >= 2
    # Leading 1.0s silence must not appear as an internal silence gap
    assert res.speech_segments[0][0] >= 0.85
    assert len(res.silence_gaps) >= 1
    assert any(gap_end - gap_start >= 0.8 for gap_start, gap_end in res.silence_gaps)
    assert res.speaking_time_sec > 2.0
    assert 0.0 < res.pause_ratio < 1.0


def test_vad_returns_empty_on_silence() -> None:
    """Pure silence produces zero speech segments and zero speaking time."""
    vad = SileroVADEngine.get_instance()
    silence = np.zeros(int(3.0 * SR), dtype=np.float32)
    res = vad.detect_speech(silence, sr=SR)

    assert res.speech_segments == []
    assert res.silence_gaps == []
    assert res.speaking_time_sec == 0.0
    assert res.pause_ratio == 0.0


def test_prosody_monotone_vs_expressive_pitch() -> None:
    """Flat F0 yields high monotone_risk; wide F0 modulation yields low monotone_risk."""
    dur = 3.0
    n = int(dur * SR)
    amp = np.full(n, 0.35, dtype=np.float32)
    segments = [(0.0, dur)]
    words = [
        WordToken(word=f"w{i}", start=i * 0.4, end=i * 0.4 + 0.3, confidence=0.98)
        for i in range(7)
    ]

    # 1. Flat monotone 150 Hz
    flat_f0 = np.full(n, 150.0, dtype=np.float64)
    flat_audio = _voiced_harmonic_waveform(flat_f0, amp)
    flat_summary = analyze_prosody(
        y=flat_audio,
        sr=SR,
        duration_sec=dur,
        speech_segments=segments,
        speaking_time_sec=dur,
        pause_time_sec=0.0,
        pause_ratio=0.0,
        words=words,
    )
    assert 140.0 <= flat_summary.pitch_median_hz <= 160.0
    assert flat_summary.pitch_variability_semitones < 2.0
    assert flat_summary.monotone_risk == "high"
    assert flat_summary.overall_wpm > 0.0
    assert len(flat_summary.pace_timeline) == 1

    # 2. Expressive pitch varying +/- 40 Hz around 160 Hz (roughly +/- 4.3 semitones)
    t = np.linspace(0.0, dur, n, endpoint=False)
    varied_f0 = 160.0 + 45.0 * np.sin(2.0 * np.pi * 1.0 * t)
    varied_audio = _voiced_harmonic_waveform(varied_f0, amp)
    varied_summary = analyze_prosody(
        y=varied_audio,
        sr=SR,
        duration_sec=dur,
        speech_segments=segments,
        speaking_time_sec=dur,
        pause_time_sec=0.0,
        pause_ratio=0.0,
        words=words,
    )
    assert varied_summary.pitch_variability_semitones > 3.5
    assert varied_summary.monotone_risk == "low"


def test_prosody_detects_trailing_off_volume_drop() -> None:
    """Segments >= 1.5s whose final 20% drops >= 8 dB increment trailing_off_count."""
    dur = 2.5
    n = int(dur * SR)
    split = int(0.8 * n)

    # First 80% at 0.50 amplitude, final 20% at 0.10 amplitude (~14 dB drop)
    amp_drop = np.concatenate(
        [
            np.full(split, 0.50, dtype=np.float32),
            np.full(n - split, 0.10, dtype=np.float32),
        ]
    )
    f0 = np.full(n, 165.0, dtype=np.float64)
    audio_drop = _voiced_harmonic_waveform(f0, amp_drop)

    summary_drop = analyze_prosody(
        y=audio_drop,
        sr=SR,
        duration_sec=dur,
        speech_segments=[(0.0, dur)],
        speaking_time_sec=dur,
        pause_time_sec=0.0,
        pause_ratio=0.0,
        words=[],
    )
    assert summary_drop.trailing_off_count == 1
    assert summary_drop.volume_dynamic_range_db >= 8.0

    # Steady amplitude across the entire segment -> 0 trailing off
    amp_steady = np.full(n, 0.40, dtype=np.float32)
    audio_steady = _voiced_harmonic_waveform(f0, amp_steady)
    summary_steady = analyze_prosody(
        y=audio_steady,
        sr=SR,
        duration_sec=dur,
        speech_segments=[(0.0, dur)],
        speaking_time_sec=dur,
        pause_time_sec=0.0,
        pause_ratio=0.0,
        words=[],
    )
    assert summary_steady.trailing_off_count == 0
