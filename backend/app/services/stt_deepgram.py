"""Async Deepgram Nova-3 Speech-to-Text client with graceful fallback errors."""

import logging
from pathlib import Path
from typing import Any

import httpx

from app.schemas import WordToken

logger = logging.getLogger(__name__)

DEEPGRAM_LISTEN_URL = "https://api.deepgram.com/v1/listen"
DEFAULT_DEEPGRAM_MODEL = "nova-2"


class STTUnavailableError(Exception):
    """Raised when Deepgram STT is unconfigured or fails transiently."""


async def transcribe_audio(
    wav_path: Path,
    api_key: str,
    model: str = DEFAULT_DEEPGRAM_MODEL,
    timeout_sec: float = 60.0,
) -> tuple[str, list[WordToken], list[dict[str, Any]]]:
    """Transcribe a 16kHz WAV file via Deepgram (default nova-2 for verbatim filler fidelity).

    Returns (transcript, words, utterances).
    Raises STTUnavailableError if API key is missing or request fails.
    """
    if not api_key or not api_key.strip():
        raise STTUnavailableError("DEEPGRAM_API_KEY is not configured; skipping transcription.")

    try:
        audio_bytes = wav_path.read_bytes()
    except OSError as exc:
        raise STTUnavailableError(f"Could not read WAV file for transcription: {exc}") from exc

    headers = {
        "Authorization": f"Token {api_key.strip()}",
        "Content-Type": "audio/wav",
    }
    params = {
        "model": (model or DEFAULT_DEEPGRAM_MODEL).strip(),
        "filler_words": "true",
        "punctuate": "true",
        "smart_format": "false",
        "utterances": "true",
    }

    try:
        async with httpx.AsyncClient(timeout=timeout_sec) as client:
            response = await client.post(
                DEEPGRAM_LISTEN_URL,
                params=params,
                headers=headers,
                content=audio_bytes,
            )
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        raise STTUnavailableError(f"Deepgram API returned HTTP {status}.") from exc
    except (httpx.RequestError, ValueError) as exc:
        raise STTUnavailableError(f"Deepgram API request failed: {exc}") from exc

    return parse_deepgram_payload(payload)


def parse_deepgram_payload(
    payload: dict[str, Any],
) -> tuple[str, list[WordToken], list[dict[str, Any]]]:
    """Parse Deepgram /v1/listen JSON response into (transcript, words, utterances)."""
    results = payload.get("results") or {}
    channels = results.get("channels") or []
    utterances = results.get("utterances") or []

    if not channels:
        return "", [], utterances

    alternatives = channels[0].get("alternatives") or []
    if not alternatives:
        return "", [], utterances

    primary = alternatives[0]
    transcript = str(primary.get("transcript") or "").strip()
    raw_words = primary.get("words") or []

    words: list[WordToken] = []
    for item in raw_words:
        display_word = str(item.get("punctuated_word") or item.get("word") or "").strip()
        if not display_word:
            continue
        words.append(
            WordToken(
                word=display_word,
                start=float(item.get("start", 0.0)),
                end=float(item.get("end", 0.0)),
                confidence=float(item.get("confidence", 1.0)),
            )
        )

    if not transcript and words:
        transcript = " ".join(token.word for token in words)

    return transcript, words, utterances
