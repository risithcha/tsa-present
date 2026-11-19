"""Multimodal Gemini speech coach with deterministic telemetry fallback."""

import asyncio
import logging
from pathlib import Path
from typing import Literal

from google import genai
from google.genai import types

from app.schemas import (
    AcousticSummary,
    CoachingFeedback,
    DisfluencySummary,
    RubricConfig,
    RubricCriterionConfig,
    RubricCriterionScore,
    TimestampedMoment,
    WordToken,
)

logger = logging.getLogger(__name__)


def _score_to_tier(score: int) -> Literal["Exemplary", "Adequate", "Developing"]:
    """Map numeric 0-100 score to rubric performance tier."""
    if score >= 85:
        return "Exemplary"
    if score >= 65:
        return "Adequate"
    return "Developing"


def build_annotated_transcript(
    words: list[WordToken],
    disfluencies: DisfluencySummary,
    raw_transcript: str = "",
) -> str:
    """Build verbatim transcript annotated with inline [filler] and [Xs pause] markers."""
    if not words:
        if raw_transcript.strip():
            return raw_transcript.strip()
        return "[Transcript unavailable — evaluate vocal delivery directly from audio and acoustic telemetry.]"

    pauses = sorted(disfluencies.pauses, key=lambda p: p.start)
    pause_idx = 0
    parts: list[str] = []

    for token in words:
        mid = (token.start + token.end) / 2.0
        while pause_idx < len(pauses) and ((pauses[pause_idx].start + pauses[pause_idx].end) / 2.0) <= mid:
            p = pauses[pause_idx]
            label = p.classification.replace("_", " ")
            parts.append(f"[{p.duration:.1f}s {label}]")
            pause_idx += 1

        if token.is_filler:
            parts.append(f"[{token.word}]")
        else:
            parts.append(token.word)

    while pause_idx < len(pauses):
        p = pauses[pause_idx]
        label = p.classification.replace("_", " ")
        parts.append(f"[{p.duration:.1f}s {label}]")
        pause_idx += 1

    return " ".join(parts)


def _score_pacing(
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    target_range: tuple[int, int],
) -> tuple[int, str, list[float]]:
    low_wpm, high_wpm = target_range
    wpm = acoustics.articulation_wpm if acoustics.articulation_wpm > 0 else acoustics.overall_wpm
    score = 90
    notes: list[str] = []
    evidence: list[float] = []

    if wpm <= 0.0:
        score = 72
        notes.append(
            f"Word-level WPM was unavailable; active speaking time was {acoustics.speaking_time_sec:.1f}s "
            f"with a {acoustics.pause_ratio * 100:.0f}% internal pause ratio."
        )
    elif low_wpm <= wpm <= high_wpm:
        notes.append(f"Articulation pace ({wpm:.0f} WPM) sits inside the target {low_wpm}-{high_wpm} WPM window.")
    elif wpm > high_wpm:
        over = wpm - high_wpm
        score -= min(28, int(round(over * 0.6)))
        notes.append(f"Speaking rate ({wpm:.0f} WPM) ran faster than the {low_wpm}-{high_wpm} WPM target.")
    else:
        under = low_wpm - wpm
        score -= min(25, int(round(under * 0.6)))
        notes.append(f"Speaking rate ({wpm:.0f} WPM) ran slower than the {low_wpm}-{high_wpm} WPM target.")

    if disfluencies.awkward_pause_count > 0:
        score -= min(20, disfluencies.awkward_pause_count * 6)
        awkward = [p.start for p in disfluencies.pauses if p.classification == "awkward_pause"]
        evidence.extend(awkward[:3])
        notes.append(f"Detected {disfluencies.awkward_pause_count} awkward pause(s).")

    if disfluencies.dramatic_pause_count > 0:
        score = min(100, score + min(6, disfluencies.dramatic_pause_count * 2))
        dramatic = [p.start for p in disfluencies.pauses if p.classification == "dramatic_pause"]
        evidence.extend(dramatic[:2])
        notes.append(f"Used {disfluencies.dramatic_pause_count} intentional sentence-end pause(s).")

    return max(25, min(100, score)), " ".join(notes), sorted(set(round(t, 2) for t in evidence))


def _score_vocal_variety(acoustics: AcousticSummary) -> tuple[int, str, list[float]]:
    score = 88
    notes: list[str] = []

    if acoustics.monotone_risk == "high":
        score -= 26
        notes.append(
            f"Pitch variability was narrow ({acoustics.pitch_variability_semitones:.1f} semitones IQR), "
            "indicating high monotone risk."
        )
    elif acoustics.monotone_risk == "moderate":
        score -= 10
        notes.append(
            f"Pitch variability was moderate ({acoustics.pitch_variability_semitones:.1f} semitones IQR); "
            "wider inflection on key claims would boost engagement."
        )
    else:
        notes.append(
            f"Expressive pitch range ({acoustics.pitch_variability_semitones:.1f} semitones IQR around "
            f"{acoustics.pitch_median_hz:.0f} Hz median) kept delivery engaging."
        )

    if acoustics.volume_dynamic_range_db < 6.0:
        score -= 10
        notes.append(f"Volume dynamic range was compressed ({acoustics.volume_dynamic_range_db:.1f} dB).")
    else:
        notes.append(f"Healthy volume dynamics ({acoustics.volume_dynamic_range_db:.1f} dB range).")

    if acoustics.trailing_off_count > 0:
        score -= min(18, acoustics.trailing_off_count * 6)
        notes.append(f"Energy dropped noticeably at the end of {acoustics.trailing_off_count} phrase(s).")

    return max(25, min(100, score)), " ".join(notes), []


def _score_fluency(
    words: list[WordToken],
    disfluencies: DisfluencySummary,
) -> tuple[int, str, list[float]]:
    if not words:
        return (
            74,
            "Transcript telemetry was unavailable; no word-level filler or mumble counts were flagged.",
            [],
        )

    score = 92
    notes: list[str] = []
    evidence = [round(w.start, 2) for w in words if w.is_filler][:4]

    fpm = disfluencies.fillers_per_minute
    if fpm <= 1.5:
        notes.append(f"Very clean verbal polish ({fpm:.1f} fillers/min).")
    elif fpm <= 4.0:
        score -= 12
        notes.append(f"Moderate filler usage ({disfluencies.total_fillers} total, {fpm:.1f}/min).")
    else:
        score -= min(32, 12 + int(round((fpm - 4.0) * 4)))
        notes.append(f"Frequent fillers ({disfluencies.total_fillers} total, {fpm:.1f}/min) interrupted flow.")

    if disfluencies.repetition_stutters > 0:
        score -= min(15, disfluencies.repetition_stutters * 5)
        notes.append(f"Detected {disfluencies.repetition_stutters} repetition stutter(s).")

    if disfluencies.low_confidence_mumbles > 0:
        score -= min(15, disfluencies.low_confidence_mumbles * 3)
        notes.append(f"Flagged {disfluencies.low_confidence_mumbles} low-confidence mumbled word(s).")

    return max(25, min(100, score)), " ".join(notes), evidence


def _score_vocal_clarity(
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    words: list[WordToken],
) -> tuple[int, str, list[float]]:
    score = 90
    notes: list[str] = []
    evidence: list[float] = []

    if acoustics.trailing_off_count > 0:
        score -= min(22, acoustics.trailing_off_count * 7)
        notes.append(f"Detected {acoustics.trailing_off_count} phrase(s) trailing off at the ending.")
    else:
        notes.append("Maintained strong breath support through phrase endings.")

    if words and disfluencies.low_confidence_mumbles > 0:
        score -= min(20, disfluencies.low_confidence_mumbles * 4)
        mumble_ts = [round(w.start, 2) for w in words if (not w.is_filler) and w.confidence < 0.65]
        evidence.extend(mumble_ts[:3])
        notes.append(f"Flagged {disfluencies.low_confidence_mumbles} low-confidence articulated word(s).")

    if acoustics.volume_dynamic_range_db < 5.0:
        score -= 8
        notes.append(f"Narrow projection range ({acoustics.volume_dynamic_range_db:.1f} dB).")

    return max(25, min(100, score)), " ".join(notes), evidence


def _score_criterion(
    criterion: RubricCriterionConfig,
    rubric: RubricConfig,
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    words: list[WordToken],
) -> RubricCriterionScore:
    cid = criterion.id.lower()
    if "clar" in cid or ("vocal" in cid and "variet" not in cid) or "project" in cid or "articul" in cid:
        score, summary, evidence = _score_vocal_clarity(acoustics, disfluencies, words)
    elif "pac" in cid or "rate" in cid or "pause" in cid or "time" in cid:
        score, summary, evidence = _score_pacing(acoustics, disfluencies, rubric.target_wpm_range)
    elif "variet" in cid or "tone" in cid or "pitch" in cid or "voice" in cid:
        score, summary, evidence = _score_vocal_variety(acoustics)
    elif "fluen" in cid or "filler" in cid or "polish" in cid or "hiccup" in cid:
        score, summary, evidence = _score_fluency(words, disfluencies)
    else:
        pacing_s, _, _ = _score_pacing(acoustics, disfluencies, rubric.target_wpm_range)
        fluency_s, _, _ = _score_fluency(words, disfluencies)
        score = int(round((pacing_s + fluency_s) / 2.0))
        word_note = f"{len(words)} transcribed words" if words else "acoustic structure"
        summary = (
            f"Evaluated delivery continuity across {acoustics.duration_sec:.1f}s ({word_note}, "
            f"{disfluencies.dramatic_pause_count} boundary pauses, {disfluencies.awkward_pause_count} hesitations)."
        )
        evidence = [round(p.start, 2) for p in disfluencies.pauses[:3]]

    return RubricCriterionScore(
        criterion_id=criterion.id,
        name=criterion.name,
        score=score,
        tier=_score_to_tier(score),
        weight=criterion.weight,
        summary=summary,
        evidence_timestamps=evidence,
    )


def build_heuristic_coaching(
    rubric: RubricConfig,
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    words: list[WordToken],
    transcript: str = "",
) -> CoachingFeedback:
    """Deterministic fallback coach built strictly from acoustic & disfluency telemetry."""
    criterion_scores = [
        _score_criterion(criterion, rubric, acoustics, disfluencies, words)
        for criterion in rubric.criteria
    ]

    total_weight = sum(c.weight for c in criterion_scores)
    if total_weight > 0:
        overall_score = int(
            round(sum(c.score * c.weight for c in criterion_scores) / total_weight)
        )
    elif criterion_scores:
        overall_score = int(round(sum(c.score for c in criterion_scores) / len(criterion_scores)))
    else:
        overall_score = 75
    overall_tier = _score_to_tier(overall_score)

    moments: list[TimestampedMoment] = []

    for pause in disfluencies.pauses[:4]:
        if pause.classification == "awkward_pause":
            moments.append(
                TimestampedMoment(
                    timestamp_sec=pause.start,
                    end_sec=pause.end,
                    category="hiccup",
                    title=f"{pause.duration:.1f}s awkward pause",
                    observation=(
                        f"Mid-thought gap ({pause.duration:.1f}s) between "
                        f"'{pause.context_before or '...'}' and '{pause.context_after or '...'}'."
                    ),
                    suggestion="Take a silent breath at the end of a full clause rather than pausing mid-phrase.",
                )
            )
        elif pause.classification == "dramatic_pause":
            moments.append(
                TimestampedMoment(
                    timestamp_sec=pause.start,
                    end_sec=pause.end,
                    category="strength",
                    title="Intentional sentence-end pause",
                    observation=(
                        f"Effective {pause.duration:.1f}s pause after '{pause.context_before or 'sentence'}' "
                        "gives listeners time to absorb the point."
                    ),
                    suggestion="Keep using clean beats like this after key thesis statements.",
                )
            )

    filler_tokens = [w for w in words if w.is_filler]
    if filler_tokens:
        first_filler = filler_tokens[0]
        moments.append(
            TimestampedMoment(
                timestamp_sec=round(first_filler.start, 2),
                end_sec=round(first_filler.end, 2),
                category="hiccup",
                title=f"Filler detected: '{first_filler.word}'",
                observation=f"Detected {disfluencies.total_fillers} filler(s) across the talk ({disfluencies.fillers_per_minute:.1f}/min).",
                suggestion="Replace filler sounds with a crisp 0.4s silent breath when transitioning.",
            )
        )

    low_wpm, high_wpm = rubric.target_wpm_range
    for win in acoustics.pace_timeline:
        if win.wpm > high_wpm + 20:
            moments.append(
                TimestampedMoment(
                    timestamp_sec=win.start_sec,
                    end_sec=win.end_sec,
                    category="pacing",
                    title=f"Fast pacing window ({win.wpm:.0f} WPM)",
                    observation=f"Delivery accelerated to {win.wpm:.0f} WPM between {win.start_sec:.0f}s and {win.end_sec:.0f}s.",
                    suggestion=f"Slow down toward {low_wpm}-{high_wpm} WPM and land consonants clearly.",
                )
            )
            break

    if not moments:
        moments.append(
            TimestampedMoment(
                timestamp_sec=0.0,
                end_sec=min(acoustics.duration_sec, 5.0),
                category="tone",
                title="Baseline vocal delivery profile",
                observation=(
                    f"Median pitch {acoustics.pitch_median_hz:.0f} Hz with "
                    f"{acoustics.pitch_variability_semitones:.1f} semitones variability."
                ),
                suggestion="Emphasize key nouns with deliberate pitch peaks and sustained volume.",
            )
        )

    strengths: list[str] = []
    if acoustics.monotone_risk == "low":
        strengths.append(
            f"Expressive pitch inflection ({acoustics.pitch_variability_semitones:.1f} semitones IQR) keeps listeners engaged."
        )
    if acoustics.trailing_off_count == 0 and acoustics.volume_dynamic_range_db >= 6.0:
        strengths.append("Consistent vocal projection through the end of phrases without trailing off.")
    if words and disfluencies.fillers_per_minute <= 2.0:
        strengths.append(f"Strong verbal fluency with only {disfluencies.fillers_per_minute:.1f} fillers per minute.")
    if disfluencies.dramatic_pause_count > 0:
        strengths.append(f"Effective use of {disfluencies.dramatic_pause_count} boundary pause(s) to frame ideas.")
    if not strengths:
        strengths.append(
            f"Completed {acoustics.speaking_time_sec:.1f}s of active spoken delivery across the recording."
        )

    drills: list[str] = []
    if acoustics.monotone_risk in {"high", "moderate"}:
        drills.append(
            "Pitch-step drill: Read your opening 3 sentences aloud, deliberately raising pitch on the core verb and dropping cleanly on the final word."
        )
    if disfluencies.total_fillers > 0:
        drills.append(
            "Silent-beat drill: Record a 60-second summary and close your lips completely whenever you feel an 'um' or 'like' coming."
        )
    if acoustics.trailing_off_count > 0:
        drills.append(
            "Finish-strong drill: Support your breath through the final syllable of every sentence so volume stays within 5 dB of your phrase start."
        )
    if disfluencies.awkward_pause_count > 0:
        drills.append(
            "Clause-chunking drill: Mark slash boundaries between phrases in your notes and breathe only at slash marks."
        )
    if not drills:
        drills.append(
            "Contrast drill: Practice varying pace by +/-15 WPM between contextual setup and your main takeaway."
        )

    exec_summary = (
        f"Overall {overall_tier} delivery ({overall_score}/100) under '{rubric.name}'. "
        f"Across {acoustics.duration_sec:.1f}s ({acoustics.speaking_time_sec:.1f}s active speech), "
        f"pitch variability was {acoustics.pitch_variability_semitones:.1f} semitones ({acoustics.monotone_risk} monotone risk) "
        f"with {disfluencies.total_fillers} filler(s) and {disfluencies.awkward_pause_count} awkward pause(s)."
    )
    vocal_impression = (
        f"Median pitch sits at {acoustics.pitch_median_hz:.0f} Hz with {acoustics.volume_dynamic_range_db:.1f} dB "
        f"dynamic range and {acoustics.trailing_off_count} trailing-off segment(s). "
        f"Overall rate is {acoustics.overall_wpm:.0f} WPM (articulation {acoustics.articulation_wpm:.0f} WPM)."
    )

    return CoachingFeedback(
        overall_score=overall_score,
        overall_tier=overall_tier,
        executive_summary=exec_summary,
        vocal_delivery_impression=vocal_impression,
        criterion_scores=criterion_scores,
        timestamped_moments=moments,
        top_strengths=strengths[:3],
        actionable_drills=drills[:3],
    )


def _build_gemini_prompt(
    rubric: RubricConfig,
    annotated_transcript: str,
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    topic: str | None = None,
    target_min_sec: int | None = None,
    target_max_sec: int | None = None,
) -> str:
    """Assemble structured multimodal coaching prompt for Gemini."""
    context_lines: list[str] = []
    if topic and topic.strip():
        context_lines.append(f"- Speaker topic/context: {topic.strip()}")
    if target_min_sec or target_max_sec:
        context_lines.append(
            f"- Target duration window: {target_min_sec or 0}s to {target_max_sec or 'unbounded'}s"
        )
    extra_context = ("\n=== PRESENTATION CONTEXT ===\n" + "\n".join(context_lines) + "\n") if context_lines else ""

    return (
        "You are an expert TSA (Technology Student Association) presentation coach and vocal delivery analyst. "
        "CRITICAL: Do NOT rely only on the text transcript. Actively LISTEN to the attached audio recording to evaluate "
        "audible vocal traits (tone, enthusiasm, nervousness, breaths, stumbles, vocal fry, pitch lifts, rushed phrasing, "
        "emphasis, trailing off, and composure), AND combine what you hear with the objective acoustic & disfluency telemetry below. "
        "Return a JSON object conforming strictly to the CoachingFeedback schema.\n\n"
        "Scoring instructions:\n"
        "- Score every criterion in the active rubric from 0 to 100 using its exact criterion_id, name, and weight.\n"
        "- Map scores to tiers: Exemplary (>=85), Adequate (65-84), Developing (<65).\n"
        "- In `vocal_delivery_impression`, explicitly describe what you HEARD in the speaker's voice (tone, energy, confidence, stumbling, breath control).\n"
        "- In `audible_disfluencies`, list up to 12 sub-word/syllable stutters, false starts, mumbles, or missed vocal fillers you HEAR in the audio with accurate [start, end] timestamps. Keep each `text` field a concise plain label of 1-4 words (e.g., 'stutter on thirty', 'stutter on seconds', 'drawn-out um')—NEVER write repeated letters or hyphens like 'd-d-d-d'.\n"
        "- Provide 4-7 concrete `timestamped_moments` grounded in real seconds (a balanced mix of hiccups/pacing/tone improvements AND strengths).\n"
        "- Keep feedback encouraging, student-friendly, specific, and immediately actionable for the very next practice take (use plain text in `actionable_drills`, no markdown asterisks).\n\n"
        f"{extra_context}"
        f"=== ACTIVE RUBRIC JSON ===\n{rubric.model_dump_json(indent=2)}\n\n"
        f"=== ANNOTATED VERBATIM TRANSCRIPT ===\n{annotated_transcript}\n\n"
        f"=== ACOUSTIC TELEMETRY JSON ===\n{acoustics.model_dump_json(indent=2)}\n\n"
        f"=== DISFLUENCY TELEMETRY JSON ===\n{disfluencies.model_dump_json(indent=2)}\n"
    )


async def generate_coaching(
    mp3_path: Path,
    rubric: RubricConfig,
    acoustics: AcousticSummary,
    disfluencies: DisfluencySummary,
    words: list[WordToken],
    transcript: str,
    api_key: str,
    model_name: str = "gemini-2.5-flash",
    topic: str | None = None,
    target_min_sec: int | None = None,
    target_max_sec: int | None = None,
) -> tuple[CoachingFeedback, list[str]]:
    """Generate multimodal coaching via Gemini, falling back to deterministic telemetry coach."""
    warnings: list[str] = []

    if not api_key or not api_key.strip():
        warnings.append(
            "GEMINI_API_KEY is not configured; generated deterministic telemetry-based coaching."
        )
        return build_heuristic_coaching(rubric, acoustics, disfluencies, words, transcript), warnings

    try:
        mp3_bytes = mp3_path.read_bytes()
        annotated = build_annotated_transcript(words, disfluencies, transcript)
        prompt = _build_gemini_prompt(
            rubric,
            annotated,
            acoustics,
            disfluencies,
            topic=topic,
            target_min_sec=target_min_sec,
            target_max_sec=target_max_sec,
        )

        def _invoke_gemini() -> CoachingFeedback:
            client = genai.Client(api_key=api_key.strip())
            audio_part = types.Part.from_bytes(data=mp3_bytes, mime_type="audio/mpeg")
            config = types.GenerateContentConfig(
                temperature=0.25,
                max_output_tokens=8192,
                thinking_config=types.ThinkingConfig(thinking_budget=1024),
                response_mime_type="application/json",
                response_schema=CoachingFeedback,
            )
            response = client.models.generate_content(
                model=model_name,
                contents=[audio_part, prompt],
                config=config,
            )
            if getattr(response, "parsed", None) is not None and isinstance(
                response.parsed, CoachingFeedback
            ):
                return response.parsed
            if not getattr(response, "text", None):
                raise ValueError("Gemini returned an empty response.")
            return CoachingFeedback.model_validate_json(response.text)

        coaching = await asyncio.to_thread(_invoke_gemini)
        return coaching, warnings
    except Exception as exc:
        logger.warning("Gemini coaching failed, falling back to heuristic coach: %s", exc)
        warnings.append(
            f"Gemini coaching unavailable ({exc}); generated deterministic telemetry-based coaching."
        )
        return build_heuristic_coaching(rubric, acoustics, disfluencies, words, transcript), warnings
