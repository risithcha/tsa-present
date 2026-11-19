"""Rubric loader with filesystem discovery and embedded standalone fallback."""

from functools import lru_cache
import json
import logging
from pathlib import Path

from app.config import BACKEND_DIR, REPO_ROOT_DIR
from app.schemas import RubricConfig, RubricCriterionConfig

logger = logging.getLogger(__name__)


DEFAULT_GENERAL_RUBRIC = RubricConfig(
    rubric_id="general_delivery_v1",
    name="General Presentation & Vocal Delivery",
    description=(
        "Balanced rubric evaluating clarity, pacing, vocal variety, fluency, "
        "and persuasive structure for live speeches and presentations."
    ),
    target_wpm_range=(125, 165),
    criteria=[
        RubricCriterionConfig(
            criterion_id="pacing_and_pauses",
            name="Pacing & Intentional Pauses",
            weight=0.25,
            description="Speech rate control, rhythmic breathing, and strategic use of dramatic pauses.",
            exemplary_guidance="Maintains conversational pace (125-165 WPM) with deliberate pauses at transitions.",
            adequate_guidance="Generally intelligible pace with occasional rushing or hesitant mid-clause stops.",
            developing_guidance="Consistently too fast (>185 WPM), too slow (<105 WPM), or broken by awkward pauses.",
        ),
        RubricCriterionConfig(
            criterion_id="vocal_variety",
            name="Vocal Variety & Projection",
            weight=0.25,
            description="Pitch expressiveness, dynamic volume range, and strong sentence endings without trailing off.",
            exemplary_guidance="Expressive pitch modulation (>3.5 semitones IQR) and clear projection to phrase ends.",
            adequate_guidance="Moderate vocal inflection with minor monotone stretches or occasional soft endings.",
            developing_guidance="Flat monotone delivery (<2.0 semitones IQR) or frequent trailing off at sentence ends.",
        ),
        RubricCriterionConfig(
            criterion_id="fluency_and_polish",
            name="Fluency & Filler Control",
            weight=0.25,
            description="Minimal vocalized fillers, repetition stutters, and mumbled low-confidence words.",
            exemplary_guidance="Fewer than 2 fillers per minute, crisp articulation, and zero distracting stutters.",
            adequate_guidance="Occasional filler words (2-5 per minute) that do not obscure the core message.",
            developing_guidance="Frequent fillers (>5 per minute), restarts, or muffled delivery undermining authority.",
        ),
        RubricCriterionConfig(
            criterion_id="clarity_and_structure",
            name="Clarity & Message Structure",
            weight=0.25,
            description="Coherent narrative arc, clear signposting, concise phrasing, and strong opening/closing.",
            exemplary_guidance="Well-signposted opening, logical transitions, concrete examples, and memorable close.",
            adequate_guidance="Understandable main point with some meandering transitions or uneven emphasis.",
            developing_guidance="Unclear thesis, abrupt transitions, or weak conclusion lacking clear takeaway.",
        ),
    ],
)


def _candidate_rubric_dirs() -> list[Path]:
    """Return candidate directories where rubric JSON files may live."""
    return [
        REPO_ROOT_DIR / "rubrics",
        BACKEND_DIR.parent / "rubrics",
        Path("/app/rubrics"),
    ]


def _normalize_rubric_dict(raw: dict) -> dict:
    """Normalize external rubric JSON keys into RubricConfig shape."""
    data = dict(raw)
    if "rubric_id" not in data and "id" in data:
        data["rubric_id"] = data["id"]

    normalized_criteria: list[dict] = []
    for crit in data.get("criteria", []):
        c = dict(crit)
        if "criterion_id" not in c and "id" in c:
            c["criterion_id"] = c["id"]
        if "exemplary_guidance" not in c and "exemplary_anchor" in c:
            c["exemplary_guidance"] = c["exemplary_anchor"]
        if "developing_guidance" not in c and "developing_anchor" in c:
            c["developing_guidance"] = c["developing_anchor"]
        normalized_criteria.append(c)

    if normalized_criteria:
        data["criteria"] = normalized_criteria
    return data


@lru_cache(maxsize=1)
def load_rubrics() -> dict[str, RubricConfig]:
    """Load all *.json rubrics from disk, guaranteeing general_delivery_v1 fallback."""
    loaded: dict[str, RubricConfig] = {}

    for directory in _candidate_rubric_dirs():
        if not directory.is_dir():
            continue
        for json_path in sorted(directory.glob("*.json")):
            try:
                raw = json.loads(json_path.read_text(encoding="utf-8"))
                rubric = RubricConfig.model_validate(_normalize_rubric_dict(raw))
                loaded[rubric.rubric_id] = rubric
            except Exception as exc:
                logger.warning("Failed to load rubric %s: %s", json_path, exc)
        if loaded:
            break

    if DEFAULT_GENERAL_RUBRIC.rubric_id not in loaded:
        loaded[DEFAULT_GENERAL_RUBRIC.rubric_id] = DEFAULT_GENERAL_RUBRIC

    return loaded


def list_rubrics() -> list[RubricConfig]:
    """Return all available rubric configurations."""
    return list(load_rubrics().values())


def get_rubric(rubric_id: str) -> RubricConfig:
    """Fetch a rubric by ID or raise ValueError if not found."""
    rubrics = load_rubrics()
    if rubric_id not in rubrics:
        available = ", ".join(sorted(rubrics.keys()))
        raise ValueError(f"Unknown rubric_id '{rubric_id}'. Available rubrics: {available}")
    return rubrics[rubric_id]
