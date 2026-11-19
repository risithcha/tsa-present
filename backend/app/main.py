"""FastAPI application entrypoint for the speech & audio intelligence backend."""

from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, File, Form, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.rubrics import get_rubric, list_rubrics, load_rubrics
from app.schemas import AnalysisResponse, HealthResponse, RubricListResponse
from app.services.pipeline import InsufficientSpeechError, analyze_presentation
from app.services.vad_engine import SileroVADEngine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Pre-load rubrics and Silero VAD ONNX model on startup."""
    settings = get_settings()
    load_rubrics()
    try:
        SileroVADEngine.get_instance(settings.resolve_vad_model_path())
    except Exception as exc:
        logger.warning("Could not pre-load Silero VAD on startup: %s", exc)
    yield


def create_app() -> FastAPI:
    """Create and configure the FastAPI application instance."""
    settings = get_settings()

    application = FastAPI(
        title="Speech & Audio Intelligence API",
        version="1.0.0",
        description="Multimodal presentation delivery, acoustic prosody, and disfluency analysis API.",
        lifespan=lifespan,
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @application.get("/health", response_model=HealthResponse)
    @application.get("/api/v1/status", response_model=HealthResponse)
    async def health_check() -> HealthResponse:
        cfg = get_settings()
        return HealthResponse(
            status="ok",
            vad_loaded=SileroVADEngine.is_loaded(),
            deepgram_configured=bool(cfg.deepgram_api_key.strip()),
            gemini_configured=bool(cfg.gemini_api_key.strip()),
            gemini_model=cfg.gemini_model,
            rubrics_loaded=len(list_rubrics()),
        )

    @application.get("/api/v1/rubrics", response_model=RubricListResponse)
    async def get_rubrics() -> RubricListResponse:
        return RubricListResponse(rubrics=list_rubrics())

    @application.post("/api/v1/analyze", response_model=AnalysisResponse)
    async def analyze_audio(
        audio: UploadFile | None = File(default=None),
        file: UploadFile | None = File(default=None),
        rubric_id: str = Form("general_delivery_v1"),
        topic: str | None = Form(default=None),
        target_min_sec: int | None = Form(default=None),
        target_max_sec: int | None = Form(default=None),
    ) -> AnalysisResponse:
        cfg = get_settings()
        upload = audio or file
        if upload is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Missing audio upload (provide form field 'audio' or 'file').",
            )

        try:
            get_rubric(rubric_id)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

        audio_bytes = await upload.read()
        if not audio_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded audio file is empty.",
            )

        if len(audio_bytes) > cfg.max_audio_bytes:
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"Uploaded audio exceeds maximum allowed size of {cfg.max_audio_mb} MB.",
            )

        try:
            return await analyze_presentation(
                audio_bytes=audio_bytes,
                filename=upload.filename or "upload.wav",
                rubric_id=rubric_id,
                settings=cfg,
                topic=topic,
                target_min_sec=target_min_sec,
                target_max_sec=target_max_sec,
            )
        except InsufficientSpeechError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(exc),
            ) from exc

    return application


app = create_app()
