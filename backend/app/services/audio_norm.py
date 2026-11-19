"""Audio normalization service converting arbitrary uploads to 16kHz WAV and 64kbps MP3."""

from dataclasses import dataclass
import logging
from pathlib import Path
import shutil
import subprocess
import tempfile

import soundfile as sf

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class NormalizedAudio:
    """Paths and metadata for normalized audio artifacts in a temporary directory."""

    temp_dir: Path
    wav_path: Path
    mp3_path: Path
    duration_sec: float
    sample_rate: int = 16000


def cleanup_temp_dir(temp_dir: Path | None) -> None:
    """Best-effort removal of a temporary audio processing directory."""
    if temp_dir and temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)


def normalize_audio(
    audio_bytes: bytes,
    filename: str = "upload.wav",
    max_duration_sec: int = 600,
) -> NormalizedAudio:
    """Convert raw audio bytes to 16kHz mono PCM WAV and 64kbps mono MP3 via ffmpeg.

    Raises ValueError on empty, corrupted, unsupported, or overly long audio.
    """
    if not audio_bytes:
        raise ValueError("Uploaded audio file is empty.")

    suffix = Path(filename).suffix.lower() if filename else ".bin"
    if not suffix or len(suffix) > 10:
        suffix = ".bin"

    temp_dir = Path(tempfile.mkdtemp(prefix="tsa_audio_"))
    input_path = temp_dir / f"input{suffix}"
    wav_path = temp_dir / "normalized_16k.wav"
    mp3_path = temp_dir / "coach.mp3"

    try:
        input_path.write_bytes(audio_bytes)

        cmd = [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(input_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            str(wav_path),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-b:a",
            "64k",
            "-c:a",
            "libmp3lame",
            str(mp3_path),
        ]

        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
        if proc.returncode != 0:
            err_detail = proc.stderr.strip() or "Unsupported or corrupted audio file."
            raise ValueError(f"Audio decoding failed: {err_detail}")

        if not wav_path.exists() or wav_path.stat().st_size == 0:
            raise ValueError("Decoded WAV file is empty.")

        try:
            info = sf.info(str(wav_path))
        except Exception as exc:
            raise ValueError(f"Failed to read normalized WAV audio: {exc}") from exc

        if info.frames <= 0 or info.samplerate <= 0:
            raise ValueError("Uploaded file contains no audio frames.")

        duration_sec = float(info.frames) / float(info.samplerate)
        if duration_sec <= 0.0:
            raise ValueError("Audio duration must be greater than zero.")

        if duration_sec > float(max_duration_sec):
            raise ValueError(
                f"Audio duration ({duration_sec:.1f}s) exceeds maximum allowed {max_duration_sec}s."
            )

        return NormalizedAudio(
            temp_dir=temp_dir,
            wav_path=wav_path,
            mp3_path=mp3_path,
            duration_sec=duration_sec,
            sample_rate=info.samplerate,
        )
    except Exception:
        cleanup_temp_dir(temp_dir)
        raise
