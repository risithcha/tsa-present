"""Tests for disfluency fusion: fillers, context-aware 'like', stutters, pauses, and mumbles."""

from app.schemas import AudibleDisfluency, WordToken
from app.services.disfluency_fusion import analyze_disfluencies, merge_audible_disfluencies


def _w(word: str, start: float, end: float, conf: float = 0.96) -> WordToken:
    return WordToken(word=word, start=start, end=end, confidence=conf)


def test_vocal_and_discourse_fillers_with_context_aware_like() -> None:
    """Verify 'I like robotics' is NOT flagged while 'So, like, basically' IS flagged."""
    words = [
        _w("I", 0.0, 0.15),
        _w("like", 0.18, 0.42),
        _w("robotics.", 0.45, 0.95),
        _w("Um,", 1.20, 1.45),
        _w("So,", 1.60, 1.80),
        _w("like,", 1.85, 2.05),
        _w("basically", 2.10, 2.55),
        _w("we", 2.60, 2.75),
        _w("built", 2.78, 3.05),
        _w("you", 3.10, 3.22),
        _w("know", 3.25, 3.45),
        _w("a", 3.50, 3.58),
        _w("rover", 3.60, 4.00),
        _w("like", 4.05, 4.25),
        _w("a", 4.28, 4.35),
        _w("tank.", 4.38, 4.80),
    ]

    tagged, summary = analyze_disfluencies(words, silence_gaps=[], duration_sec=6.0)

    # "I like robotics" -> index 1 must NOT be flagged
    assert tagged[1].is_filler is False
    assert tagged[1].filler_type is None

    # "Um," -> index 3 vocal
    assert tagged[3].is_filler is True
    assert tagged[3].filler_type == "vocal"

    # "like," after comma -> index 5 discourse
    assert tagged[5].is_filler is True
    assert tagged[5].filler_type == "discourse"

    # "basically" -> index 6 discourse
    assert tagged[6].is_filler is True
    assert tagged[6].filler_type == "discourse"

    # "you know" -> indices 9, 10 discourse (1 count in filler_counts)
    assert tagged[9].is_filler is True
    assert tagged[9].filler_type == "discourse"
    assert tagged[10].is_filler is True
    assert tagged[10].filler_type == "discourse"

    # "like a tank" (similative comparison without comma/pause) -> index 13 NOT flagged
    assert tagged[13].is_filler is False

    assert summary.filler_counts == {"um": 1, "like": 1, "basically": 1, "you know": 1}
    assert summary.total_fillers == 4
    assert summary.fillers_per_minute == 40.0


def test_repetition_stutters_single_and_two_word_restarts() -> None:
    """Detect single-word repeats and 2-word restarts separated by <= 0.5s."""
    words = [
        _w("The", 0.0, 0.15),
        _w("the", 0.25, 0.40),
        _w("system", 0.45, 0.85),
        _w("can", 1.00, 1.20),
        _w("scale", 1.25, 1.55),
        _w("can", 1.75, 1.95),
        _w("scale", 2.00, 2.30),
        _w("quickly.", 2.35, 2.80),
    ]

    tagged, summary = analyze_disfluencies(words, silence_gaps=[], duration_sec=4.0)

    assert tagged[1].is_filler is True
    assert tagged[1].filler_type == "repetition"
    assert tagged[5].is_filler is True
    assert tagged[5].filler_type == "repetition"
    assert tagged[6].is_filler is True
    assert tagged[6].filler_type == "repetition"
    assert summary.repetition_stutters == 2
    assert summary.total_fillers == 0


def test_pause_classification_and_low_confidence_mumbles() -> None:
    """Classify awkward mid-clause, filler-adjacent, micro-hesitation, and dramatic pauses."""
    words = [
        _w("Today", 0.0, 0.4),
        _w("matters.", 0.45, 0.90),
        # Gap 0.90 -> 1.80 (0.90s after sentence-end '.') -> dramatic_pause
        _w("Our", 1.80, 2.05),
        _w("sensor", 2.10, 2.50, conf=0.52),  # low-confidence mumble (< 0.65)
        # Gap 2.50 -> 3.00 (0.50s mid-clause) -> micro_hesitation
        _w("detects", 3.00, 3.45),
        # Gap 3.45 -> 4.65 (1.20s mid-clause) -> awkward_pause
        _w("motion", 4.65, 5.10, conf=0.48),  # low-confidence mumble
        _w("uh", 5.20, 5.45, conf=0.40),  # filler should NOT count as mumble
        # Gap 5.45 -> 6.05 (0.60s adjacent to filler 'uh') -> awkward_pause
        _w("reliably.", 6.05, 6.60),
    ]
    gaps = [
        (0.90, 1.80),
        (2.50, 3.00),
        (3.45, 4.65),
        (5.45, 6.05),
    ]

    tagged, summary = analyze_disfluencies(words, silence_gaps=gaps, duration_sec=7.0)

    assert [p.classification for p in summary.pauses] == [
        "dramatic_pause",
        "micro_hesitation",
        "awkward_pause",
        "awkward_pause",
    ]
    assert summary.dramatic_pause_count == 1
    assert summary.awkward_pause_count == 2
    assert summary.low_confidence_mumbles == 2
    assert tagged[0].word == "Today"


def test_merge_audible_disfluencies_deduplicates_fillers_and_downgrades_pause() -> None:
    """Gemini-heard sub-word stutters increment stutter count, deduplicate nearby fillers, and downgrade dramatic pauses."""
    words = [
        _w("Um,", 1.4, 1.8),
        _w("here.", 2.0, 2.4),
        # 1.0s pause after period: initially dramatic, but followed immediately by audible stutter!
        _w("Thirty", 3.4, 4.1),
    ]
    tagged, summary = analyze_disfluencies(words, silence_gaps=[(2.4, 3.4)], duration_sec=6.0)
    assert summary.total_fillers == 1
    assert summary.dramatic_pause_count == 1

    audible = [
        AudibleDisfluency(start=0.5, end=1.1, kind="vocal_filler", text="um"),  # within 1.6s of Deepgram Um -> no double count
        AudibleDisfluency(start=3.4, end=3.9, kind="stutter", text="stutter on thirty"),
        AudibleDisfluency(start=3.9, end=4.1, kind="stutter", text="stutter on thirty"),  # same stutter cluster -> deduped
    ]
    merged = merge_audible_disfluencies(tagged, summary, audible, duration_sec=6.0)
    assert merged.total_fillers == 1
    assert merged.repetition_stutters == 1
    assert merged.dramatic_pause_count == 0
    assert merged.awkward_pause_count == 1
    assert len(merged.audible_events) == 3
