"""End-to-end async speech & audio intelligence orchestration pipeline."""

import asyncio
import logging
import uuid

import numpy as np
import soundfile as sf

from app.config import Settings
from app.rubrics import get_rubric
from app.schemas import AnalysisResponse, WordToken
from app.services.audio_norm import NormalizedAudio, cleanup_temp_dir, normalize_audio
from app.services.coach_gemini import generate_coaching
from app.services.disfluency_fusion import analyze_disfluencies, merge_audible_disfluencies
from app.services.prosody_engine import analyze_prosody
from app.services.stt_deepgram import STTUnavailableError, transcribe_audio
from app.services.vad_engine import SileroVADEngine, VADResult

logger = logging.getLogger(__name__)


class InsufficientSpeechError(Exception):
    """Raised when active spoken duration is too short for meaningful analysis."""


def _load_wav_and_run_vad(
    wav_path: str,
    vad_engine: SileroVADEngine,
) -> tuple[np.ndarray, int, VADResult]:
    """Read 16kHz normalized WAV and run Silero VAD segmentation."""
    y, sr = sf.read(wav_path, dtype="float32")
    audio = np.asarray(y, dtype=np.float32)
    if audio.ndim > 1:
        audio = np.mean(audio, axis=1).astype(np.float32)
    vad_result = vad_engine.detect_speech(audio, sr=int(sr))
    return audio, int(sr), vad_result


async def analyze_presentation(
    audio_bytes: bytes,
    filename: str,
    rubric_id: str,
    settings: Settings,
    topic: str | None = None,
    target_min_sec: int | None = None,
    target_max_sec: int | None = None,
) -> AnalysisResponse:
    """Run full audio normalization, VAD + STT, prosody, disfluency fusion, and coaching."""
    rubric = get_rubric(rubric_id)
    warnings: list[str] = []
    norm: NormalizedAudio | None = None

    try:
        norm = await asyncio.to_thread(
            normalize_audio,
            audio_bytes,
            filename,
            settings.max_duration_sec,
        )

        vad_engine = SileroVADEngine.get_instance(settings.resolve_vad_model_path())

        vad_task = asyncio.to_thread(_load_wav_and_run_vad, str(norm.wav_path), vad_engine)
        stt_task = transcribe_audio(
            norm.wav_path,
            settings.deepgram_api_key,
            model=settings.deepgram_model,
        )

        vad_outcome, stt_outcome = await asyncio.gather(
            vad_task,
            stt_task,
            return_exceptions=True,
        )

        if isinstance(vad_outcome, BaseException):
            raise vad_outcome

        y, sr, vad_result = vad_outcome

        if vad_result.speaking_time_sec < 2.0:
            raise InsufficientSpeechError(
                f"Only {vad_result.speaking_time_sec:.2f}s of clear speech was detected "
                "(minimum 2.0s required). Please check your microphone, reduce background noise, "
                "and speak clearly before trying again."
            )

        transcript = ""
        words: list[WordToken] = []
        if isinstance(stt_outcome, STTUnavailableError):
            logger.info("Deepgram STT unavailable: %s", stt_outcome)
            warnings.append(str(stt_outcome))
        elif isinstance(stt_outcome, BaseException):
            logger.warning("Unexpected STT error: %s", stt_outcome)
            warnings.append(f"Speech-to-text failed ({stt_outcome}); continuing with acoustic analysis only.")
        else:
            transcript, words, _utterances = stt_outcome

        tagged_words, disfluencies = await asyncio.to_thread(
            analyze_disfluencies,
            words,
            vad_result.silence_gaps,
            norm.duration_sec,
        )

        acoustics = await asyncio.to_thread(
            analyze_prosody,
            y,
            sr,
            norm.duration_sec,
            vad_result.speech_segments,
            vad_result.speaking_time_sec,
            vad_result.pause_time_sec,
            vad_result.pause_ratio,
            tagged_words,
        )

        coaching, coach_warnings = await generate_coaching(
            mp3_path=norm.mp3_path,
            rubric=rubric,
            acoustics=acoustics,
            disfluencies=disfluencies,
            words=tagged_words,
            transcript=transcript,
            api_key=settings.gemini_api_key,
            model_name=settings.gemini_model,
            topic=topic,
            target_min_sec=target_min_sec,
            target_max_sec=target_max_sec,
        )
        warnings.extend(coach_warnings)

        if coaching.audible_disfluencies:
            disfluencies = merge_audible_disfluencies(
                words=tagged_words,
                summary=disfluencies,
                audible_events=coaching.audible_disfluencies,
                duration_sec=norm.duration_sec,
            )

        return AnalysisResponse(
            analysis_id=str(uuid.uuid4()),
            rubric_id=rubric.rubric_id,
            transcript=transcript,
            words=tagged_words,
            acoustics=acoustics,
            disfluencies=disfluencies,
            coaching=coaching,
            warnings=warnings,
        )
    finally:
        if norm is not None:
            cleanup_temp_dir(norm.temp_dir)
