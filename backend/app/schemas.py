"""Pydantic v2 request/response and domain schemas."""

from typing import Literal
from pydantic import BaseModel, Field, computed_field


class WordToken(BaseModel):
    """Single word token aligned with timestamps, confidence, and filler tags."""

    word: str
    start: float
    end: float
    confidence: float
    is_filler: bool = False
    filler_type: Literal["vocal", "discourse", "repetition"] | None = None


class PauseEvent(BaseModel):
    """Classified internal pause detected between speech segments."""

    start: float
    end: float
    duration: float
    classification: Literal["micro_hesitation", "awkward_pause", "dramatic_pause"]
    context_before: str
    context_after: str


class PaceWindow(BaseModel):
    """Speaking rate (WPM) over a rolling time window."""

    start_sec: float
    end_sec: float
    wpm: float


class AcousticSummary(BaseModel):
    """Objective acoustic, pacing, pitch, and energy telemetry."""

    duration_sec: float
    speaking_time_sec: float
    pause_time_sec: float
    pause_ratio: float
    overall_wpm: float
    articulation_wpm: float
    pitch_median_hz: float
    pitch_variability_semitones: float
    monotone_risk: Literal["low", "moderate", "high"]
    volume_dynamic_range_db: float
    trailing_off_count: int
    pace_timeline: list[PaceWindow]


class AudibleDisfluency(BaseModel):
    """Acoustic disfluency (sub-word stutter, drawn-out filler, false start) heard in raw audio."""

    start: float
    end: float
    kind: Literal["stutter", "vocal_filler", "false_start", "mumble"]
    text: str = Field(
        max_length=40,
        description="Short 1-4 word label (e.g. 'stutter on thirty', 'drawn-out um'); never repeat letters.",
    )


class DisfluencySummary(BaseModel):
    """Aggregated filler words, stutters, mumbles, and classified pauses."""

    total_fillers: int
    fillers_per_minute: float
    filler_counts: dict[str, int]
    repetition_stutters: int
    awkward_pause_count: int
    dramatic_pause_count: int
    low_confidence_mumbles: int
    pauses: list[PauseEvent]
    audible_events: list[AudibleDisfluency] = Field(default_factory=list)


class TimestampedMoment(BaseModel):
    """Specific timestamped coaching highlight or improvement opportunity."""

    timestamp_sec: float
    end_sec: float | None = None
    category: Literal["strength", "hiccup", "pacing", "tone", "structure"]
    title: str
    observation: str
    suggestion: str


class RubricCriterionScore(BaseModel):
    """Score and justification for a single rubric criterion."""

    criterion_id: str
    name: str
    score: int = Field(ge=0, le=100)
    tier: Literal["Exemplary", "Adequate", "Developing"]
    weight: float
    summary: str
    evidence_timestamps: list[float] = Field(default_factory=list)


class CoachingFeedback(BaseModel):
    """Structured multimodal coaching evaluation aligned to the active rubric."""

    overall_score: int = Field(ge=0, le=100)
    overall_tier: Literal["Exemplary", "Adequate", "Developing"]
    executive_summary: str
    vocal_delivery_impression: str
    criterion_scores: list[RubricCriterionScore]
    timestamped_moments: list[TimestampedMoment]
    top_strengths: list[str]
    actionable_drills: list[str]
    audible_disfluencies: list[AudibleDisfluency] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    """Complete speech & audio intelligence response payload."""

    analysis_id: str
    rubric_id: str
    transcript: str
    words: list[WordToken]
    acoustics: AcousticSummary
    disfluencies: DisfluencySummary
    coaching: CoachingFeedback
    warnings: list[str] = Field(default_factory=list)


class RubricCriterionConfig(BaseModel):
    """Configuration definition for one rubric criterion."""

    criterion_id: str
    name: str
    weight: float
    description: str
    exemplary_guidance: str = ""
    adequate_guidance: str = ""
    developing_guidance: str = ""

    @computed_field
    @property
    def id(self) -> str:
        """Expose `id` alias alongside `criterion_id` for frontend consumers."""
        return self.criterion_id


class RubricConfig(BaseModel):
    """Presentation evaluation rubric loaded from JSON or embedded fallback."""

    rubric_id: str
    name: str
    description: str
    version: str = "1.0"
    enabled: bool = True
    target_min_sec: int | None = None
    target_max_sec: int | None = None
    target_wpm_range: tuple[int, int] = (125, 165)
    criteria: list[RubricCriterionConfig]

    @computed_field
    @property
    def id(self) -> str:
        """Expose `id` alias alongside `rubric_id` for frontend consumers."""
        return self.rubric_id


class RubricListResponse(BaseModel):
    """Response schema for available rubrics endpoint."""

    rubrics: list[RubricConfig]


class HealthResponse(BaseModel):
    """Health check response schema."""

    status: str
    vad_loaded: bool
    deepgram_configured: bool
    gemini_configured: bool
    gemini_model: str
    rubrics_loaded: int
