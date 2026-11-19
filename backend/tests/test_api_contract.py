"""API contract tests for /health, /api/v1/rubrics, and /api/v1/analyze."""

import io
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from fastapi.testclient import TestClient
import numpy as np
from scipy.signal import lfilter
import soundfile as sf

from app.main import app
from app.rubrics import get_rubric
from app.schemas import (
    AnalysisResponse,
    CoachingFeedback,
    RubricCriterionScore,
    TimestampedMoment,
    WordToken,
)


SR = 16000


def _wav_bytes(samples: np.ndarray, sr: int = SR) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, samples, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _make_speech_wav_bytes() -> bytes:
    """Create a realistic >2.5s synthetic speech WAV with an internal pause."""
    rng = np.random.default_rng(7)
    vowels = [(720, 1120), (520, 1800), (640, 1450), (460, 2000), (760, 1250)]

    def _burst(dur_sec: float, f0_base: float) -> np.ndarray:
        syl_len = int(0.18 * SR)
        n_syl = int(np.ceil(dur_sec * SR / syl_len))
        t_all = np.linspace(0.0, n_syl * 0.18, n_syl * syl_len, endpoint=False)
        f0 = f0_base + 35.0 * np.sin(2.0 * np.pi * 1.4 * t_all)
        phase = 2.0 * np.pi * np.cumsum(f0) / SR
        glot = sum((1.0 / k) * np.sin(k * phase) for k in range(1, 16))
        chunks = []
        for i in range(n_syl):
            s = i * syl_len
            e = s + syl_len
            seg = glot[s:e] + 0.06 * rng.standard_normal(syl_len)
            f1, f2 = vowels[i % len(vowels)]
            r1, th1 = np.exp(-np.pi * 90.0 / SR), 2.0 * np.pi * f1 / SR
            r2, th2 = np.exp(-np.pi * 120.0 / SR), 2.0 * np.pi * f2 / SR
            v1 = lfilter([1.0 - r1], [1.0, -2.0 * r1 * np.cos(th1), r1 * r1], seg)
            v2 = lfilter([1.0 - r2], [1.0, -2.0 * r2 * np.cos(th2), r2 * r2], seg)
            t_s = np.linspace(0.0, 1.0, syl_len, endpoint=False)
            env = 0.25 + 0.75 * (np.sin(np.pi * t_s) ** 0.5)
            chunks.append((v1 + 0.65 * v2) * env)
        out = np.concatenate(chunks)[: int(dur_sec * SR)]
        return (0.45 * out / max(float(np.max(np.abs(out))), 1e-6)).astype(np.float32)

    sil = np.zeros(int(0.8 * SR), dtype=np.float32)
    full = np.concatenate([_burst(2.5, 145.0), sil, _burst(2.5, 155.0)])
    return _wav_bytes(full, SR)


def test_health_and_rubrics_endpoints() -> None:
    """Verify /health pre-loads VAD and /api/v1/rubrics includes general_delivery_v1."""
    with TestClient(app) as client:
        health_res = client.get("/health")
        assert health_res.status_code == 200
        health_data = health_res.json()
        assert health_data["status"] == "ok"
        assert health_data["vad_loaded"] is True
        assert health_data["rubrics_loaded"] >= 1
        assert "gemini_model" in health_data

        rubrics_res = client.get("/api/v1/rubrics")
        assert rubrics_res.status_code == 200
        rubrics = rubrics_res.json()["rubrics"]
        ids = [r["rubric_id"] for r in rubrics]
        assert "general_delivery_v1" in ids
        assert "tsa_prepared_presentation_v1" in ids
        gen = next(r for r in rubrics if r["rubric_id"] == "general_delivery_v1")
        assert gen["id"] == "general_delivery_v1"
        assert gen["criteria"][0]["id"] == gen["criteria"][0]["criterion_id"]
        assert len(gen["criteria"]) == 5


def test_analyze_rejects_silent_wav_with_422() -> None:
    """Silent WAV triggers InsufficientSpeechError and returns HTTP 422."""
    silent_wav = _wav_bytes(np.zeros(int(3.0 * SR), dtype=np.float32))
    with TestClient(app) as client:
        res = client.post(
            "/api/v1/analyze",
            files={"file": ("silence.wav", silent_wav, "audio/wav")},
            data={"rubric_id": "general_delivery_v1"},
        )
    assert res.status_code == 422
    assert "minimum 2.0s" in res.json()["detail"].lower()


def test_analyze_rejects_invalid_file_with_400() -> None:
    """Corrupted non-audio bytes return HTTP 400."""
    with TestClient(app) as client:
        res = client.post(
            "/api/v1/analyze",
            files={"file": ("broken.webm", b"not-a-valid-audio-stream", "audio/webm")},
            data={"rubric_id": "general_delivery_v1"},
        )
    assert res.status_code == 400


def test_analyze_valid_speech_with_mocked_deepgram_and_gemini() -> None:
    """Full end-to-end /api/v1/analyze returns 200 matching AnalysisResponse schema."""
    speech_wav = _make_speech_wav_bytes()
    rubric = get_rubric("general_delivery_v1")

    mock_words = [
        WordToken(word="Hello", start=0.1, end=0.4, confidence=0.98),
        WordToken(word="everyone.", start=0.45, end=0.95, confidence=0.97),
        WordToken(word="Um,", start=1.0, end=1.25, confidence=0.95),
        WordToken(word="I", start=1.3, end=1.45, confidence=0.99),
        WordToken(word="like", start=1.48, end=1.7, confidence=0.98),
        WordToken(word="robotics.", start=1.75, end=2.25, confidence=0.99),
        WordToken(word="So,", start=3.4, end=3.6, confidence=0.96),
        WordToken(word="like,", start=3.65, end=3.85, confidence=0.94),
        WordToken(word="our", start=3.9, end=4.1, confidence=0.97),
        WordToken(word="design", start=4.15, end=4.6, confidence=0.98),
        WordToken(word="works.", start=4.65, end=5.1, confidence=0.99),
    ]
    mock_transcript = "Hello everyone. Um, I like robotics. So, like, our design works."

    mock_coaching = CoachingFeedback(
        overall_score=86,
        overall_tier="Exemplary",
        executive_summary="Clear, confident opening with strong vocal energy.",
        vocal_delivery_impression="Well-modulated pitch with crisp pacing.",
        criterion_scores=[
            RubricCriterionScore(
                criterion_id=c.criterion_id,
                name=c.name,
                score=86,
                tier="Exemplary",
                weight=c.weight,
                summary=f"Strong execution on {c.name}.",
                evidence_timestamps=[0.1, 3.4],
            )
            for c in rubric.criteria
        ],
        timestamped_moments=[
            TimestampedMoment(
                timestamp_sec=1.0,
                end_sec=1.25,
                category="hiccup",
                title="Brief vocal filler",
                observation="Small 'Um' before stating your interest in robotics.",
                suggestion="Pause silently for 0.3s instead of vocalizing.",
            )
        ],
        top_strengths=["Strong opening clarity", "Natural vocal inflection"],
        actionable_drills=["Silent transition drill between sentences."],
    )

    mock_genai_client = MagicMock()
    mock_genai_client.models.generate_content.return_value = SimpleNamespace(
        parsed=mock_coaching,
        text=mock_coaching.model_dump_json(),
    )

    with (
        patch(
            "app.services.pipeline.transcribe_audio",
            new=AsyncMock(return_value=(mock_transcript, mock_words, [])),
        ),
        patch(
            "app.services.coach_gemini.genai.Client",
            return_value=mock_genai_client,
        ),
        patch.dict(
            "os.environ",
            {"DEEPGRAM_API_KEY": "test-dg-key", "GEMINI_API_KEY": "test-gem-key"},
        ),
    ):
        from app.config import get_settings

        get_settings.cache_clear()
        try:
            with TestClient(app) as client:
                res = client.post(
                    "/api/v1/analyze",
                    files={"file": ("speech.wav", speech_wav, "audio/wav")},
                    data={"rubric_id": "general_delivery_v1"},
                )
        finally:
            get_settings.cache_clear()

    assert res.status_code == 200, res.text
    parsed = AnalysisResponse.model_validate(res.json())
    assert parsed.rubric_id == "general_delivery_v1"
    assert parsed.transcript == mock_transcript
    assert parsed.acoustics.speaking_time_sec >= 2.0
    assert parsed.disfluencies.total_fillers == 2  # "Um," + "like," (not "I like robotics")
    assert parsed.coaching.overall_score == 86
    assert parsed.warnings == []

    # Verify Gemini received both audio/mpeg MP3 Part and prompt text
    mock_genai_client.models.generate_content.assert_called_once()
    call_kwargs = mock_genai_client.models.generate_content.call_args.kwargs
    contents = call_kwargs["contents"]
    assert contents[0].inline_data.mime_type == "audio/mpeg"
    assert len(contents[0].inline_data.data) > 0
    assert "[Um,]" in contents[1]


def test_analyze_graceful_fallback_without_api_keys() -> None:
    """When Deepgram & Gemini keys are unset, pipeline degrades gracefully with warnings."""
    speech_wav = _make_speech_wav_bytes()

    with patch.dict("os.environ", {"DEEPGRAM_API_KEY": "", "GEMINI_API_KEY": ""}):
        from app.config import get_settings

        get_settings.cache_clear()
        try:
            with TestClient(app) as client:
                res = client.post(
                    "/api/v1/analyze",
                    files={"audio": ("speech.wav", speech_wav, "audio/wav")},
                    data={
                        "rubric_id": "general_delivery_v1",
                        "topic": "Autonomous robotics pitch",
                        "target_min_sec": "120",
                        "target_max_sec": "300",
                    },
                )
        finally:
            get_settings.cache_clear()

    assert res.status_code == 200, res.text
    parsed = AnalysisResponse.model_validate(res.json())
    assert parsed.transcript == ""
    assert parsed.words == []
    assert parsed.acoustics.speaking_time_sec >= 2.0
    assert len(parsed.coaching.criterion_scores) == len(get_rubric("general_delivery_v1").criteria)
    assert len(parsed.warnings) == 2
