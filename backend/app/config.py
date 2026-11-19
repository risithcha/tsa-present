"""Application configuration loaded from environment variables and optional .env files."""

from functools import lru_cache
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT_DIR = BACKEND_DIR.parent


class Settings(BaseSettings):
    """Runtime settings for the speech & audio intelligence backend."""

    deepgram_api_key: str = ""
    deepgram_model: str = "nova-2"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    cors_origins: str = "http://localhost:3000"
    max_audio_mb: int = 25
    max_duration_sec: int = 600
    vad_model_path: str = ""

    model_config = SettingsConfigDict(
        env_file=(str(BACKEND_DIR / ".env"), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        """Return parsed CORS origin strings."""
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        return origins or ["http://localhost:3000"]

    @property
    def max_audio_bytes(self) -> int:
        """Return maximum allowed uploaded audio size in bytes."""
        return self.max_audio_mb * 1024 * 1024

    def resolve_vad_model_path(self) -> Path:
        """Resolve Silero VAD ONNX model path from config or standard locations."""
        if self.vad_model_path:
            return Path(self.vad_model_path)
        local_model = BACKEND_DIR / "models" / "silero_vad.onnx"
        if local_model.exists():
            return local_model
        container_model = Path("/app/models/silero_vad.onnx")
        if container_model.exists():
            return container_model
        return local_model


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return cached Settings instance."""
    return Settings()
