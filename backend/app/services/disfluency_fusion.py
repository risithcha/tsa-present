"""Fusion of STT word tokens, punctuation, and VAD silence gaps into disfluency events."""

import re

from app.schemas import AudibleDisfluency, DisfluencySummary, PauseEvent, WordToken

VOCAL_FILLERS = frozenset({"um", "uh", "er", "ah", "hmm", "mhmm", "uh-huh", "mm-mm"})

MULTI_WORD_DISCOURSE = frozenset(
    {
        ("you", "know"),
        ("i", "mean"),
        ("sort", "of"),
        ("kind", "of"),
        ("so", "yeah"),
    }
)

SINGLE_WORD_DISCOURSE = frozenset({"basically", "literally", "actually"})

LIKE_PRECEDING_EXCLUSIONS = frozenset(
    {"i", "we", "they", "you", "to", "would", "really", "don't", "didn't"}
)
LIKE_FOLLOWING_DETERMINERS = frozenset({"a", "an", "the", "this", "that"})

_EDGE_PUNCT_RE = re.compile(r"^[\s.,!?;:\"'()\[\]{}]+|[\s.,!?;:\"'()\[\]{}]+$")


def _normalize_word(word: str) -> str:
    """Lowercase a token and strip surrounding punctuation while keeping internal hyphens/apostrophes."""
    return _EDGE_PUNCT_RE.sub("", word).lower()


def _ends_with_sentence_punct(word: str) -> bool:
    """Return True if token ends with sentence-terminating punctuation."""
    stripped = word.strip().rstrip("\"'”’)]")
    return stripped.endswith((".", "?", "!"))


def _ends_with_comma(word: str) -> bool:
    """Return True if token ends with a comma or semicolon."""
    stripped = word.strip().rstrip("\"'”’)]")
    return stripped.endswith((",", ";"))


def analyze_disfluencies(
    words: list[WordToken],
    silence_gaps: list[tuple[float, float]],
    duration_sec: float,
) -> tuple[list[WordToken], DisfluencySummary]:
    """Tag filler/repetition tokens and classify internal VAD pauses.

    Returns (tagged_words, DisfluencySummary).
    """
    tagged = [w.model_copy(update={"is_filler": False, "filler_type": None}) for w in words]
    norm_words = [_normalize_word(w.word) for w in tagged]

    filler_counts: dict[str, int] = {}
    repetition_stutters = 0

    def _inc_filler(label: str) -> None:
        filler_counts[label] = filler_counts.get(label, 0) + 1

    n = len(tagged)
    i = 0
    while i < n:
        curr_norm = norm_words[i]
        if not curr_norm:
            i += 1
            continue

        # 1. Vocal fillers
        if curr_norm in VOCAL_FILLERS:
            tagged[i].is_filler = True
            tagged[i].filler_type = "vocal"
            _inc_filler(curr_norm)
            i += 1
            continue

        # 2. Multi-word discourse fillers
        if i + 1 < n:
            next_norm = norm_words[i + 1]
            pair = (curr_norm, next_norm)
            gap_between = tagged[i + 1].start - tagged[i].end
            if (
                pair in MULTI_WORD_DISCOURSE
                and gap_between <= 0.6
                and not _ends_with_sentence_punct(tagged[i].word)
            ):
                tagged[i].is_filler = True
                tagged[i].filler_type = "discourse"
                tagged[i + 1].is_filler = True
                tagged[i + 1].filler_type = "discourse"
                _inc_filler(f"{curr_norm} {next_norm}")
                i += 2
                continue

        # 3. Single-word discourse fillers
        if curr_norm in SINGLE_WORD_DISCOURSE:
            tagged[i].is_filler = True
            tagged[i].filler_type = "discourse"
            _inc_filler(curr_norm)
            i += 1
            continue

        # 4. Context-aware "like" discourse filler
        if curr_norm == "like":
            prev_word = tagged[i - 1] if i > 0 else None
            next_word = tagged[i + 1] if i + 1 < n else None
            prev_norm = norm_words[i - 1] if i > 0 else ""
            next_norm = norm_words[i + 1] if i + 1 < n else ""

            preceded_by_comma = bool(prev_word and _ends_with_comma(prev_word.word))
            preceded_by_pause = bool(prev_word and (tagged[i].start - prev_word.end) >= 0.35)

            if preceded_by_comma or preceded_by_pause:
                is_discourse_like = True
            else:
                has_excluded_prev = prev_norm in LIKE_PRECEDING_EXCLUSIONS
                has_excluded_next = next_norm in LIKE_FOLLOWING_DETERMINERS
                is_discourse_like = (not has_excluded_prev) and (not has_excluded_next)

            if is_discourse_like:
                tagged[i].is_filler = True
                tagged[i].filler_type = "discourse"
                _inc_filler("like")
                i += 1
                continue

        i += 1

    # 5. Repetition stutters (1-word repeats and 2-word restarts <= 0.5s apart)
    idx = 1
    while idx < n:
        if tagged[idx].is_filler:
            idx += 1
            continue

        curr_norm = norm_words[idx]
        if not curr_norm:
            idx += 1
            continue

        # 2-word restart check first: (w[idx-3], w[idx-2]) == (w[idx-1], w[idx])
        if (
            idx >= 3
            and not tagged[idx - 1].is_filler
            and norm_words[idx - 1]
            and (norm_words[idx - 3], norm_words[idx - 2]) == (norm_words[idx - 1], curr_norm)
            and (tagged[idx - 1].start - tagged[idx - 2].end) <= 0.5
        ):
            tagged[idx - 1].is_filler = True
            tagged[idx - 1].filler_type = "repetition"
            tagged[idx].is_filler = True
            tagged[idx].filler_type = "repetition"
            repetition_stutters += 1
            idx += 1
            continue

        # 1-word consecutive repeat
        if (
            norm_words[idx - 1] == curr_norm
            and (tagged[idx].start - tagged[idx - 1].end) <= 0.5
        ):
            tagged[idx].is_filler = True
            tagged[idx].filler_type = "repetition"
            repetition_stutters += 1

        idx += 1

    # 6. Classify internal VAD silence gaps
    pauses: list[PauseEvent] = []
    awkward_pause_count = 0
    dramatic_pause_count = 0

    for raw_start, raw_end in silence_gaps:
        p_start = float(raw_start)
        p_end = float(raw_end)
        dur = p_end - p_start
        if dur < 0.35:
            continue

        mid = (p_start + p_end) / 2.0
        before_tokens = [w for w in tagged if ((w.start + w.end) / 2.0) <= mid]
        after_tokens = [w for w in tagged if ((w.start + w.end) / 2.0) > mid]

        context_before = " ".join(w.word for w in before_tokens[-4:])
        context_after = " ".join(w.word for w in after_tokens[:4])

        adjacent_to_filler = any(
            w.is_filler and (
                abs(w.end - p_start) <= 0.4
                or abs(w.start - p_end) <= 0.4
                or (w.start <= p_end and w.end >= p_start)
            )
            for w in tagged
        )

        prev_sentence_end = bool(
            before_tokens and _ends_with_sentence_punct(before_tokens[-1].word)
        )
        next_is_stumble = bool(
            after_tokens and (after_tokens[0].is_filler or after_tokens[0].confidence < 0.70)
        )

        if dur >= 2.5:
            classification = "awkward_pause"
        elif adjacent_to_filler or next_is_stumble:
            classification = "awkward_pause"
        elif prev_sentence_end and 0.55 <= dur <= 1.50:
            classification = "dramatic_pause"
        elif 0.35 <= dur < 0.80:
            classification = "micro_hesitation"
        else:
            classification = "awkward_pause"

        if classification == "awkward_pause":
            awkward_pause_count += 1
        elif classification == "dramatic_pause":
            dramatic_pause_count += 1

        pauses.append(
            PauseEvent(
                start=round(p_start, 3),
                end=round(p_end, 3),
                duration=round(dur, 3),
                classification=classification,
                context_before=context_before,
                context_after=context_after,
            )
        )

    low_confidence_mumbles = sum(
        1 for w in tagged if (not w.is_filler) and w.confidence < 0.65
    )

    total_fillers = sum(filler_counts.values())
    duration_min = duration_sec / 60.0
    fillers_per_minute = round(total_fillers / duration_min, 2) if duration_min > 0 else 0.0

    summary = DisfluencySummary(
        total_fillers=total_fillers,
        fillers_per_minute=fillers_per_minute,
        filler_counts=filler_counts,
        repetition_stutters=repetition_stutters,
        awkward_pause_count=awkward_pause_count,
        dramatic_pause_count=dramatic_pause_count,
        low_confidence_mumbles=low_confidence_mumbles,
        pauses=pauses,
        audible_events=[],
    )
    return tagged, summary


def _overlaps(a_start: float, a_end: float, b_start: float, b_end: float, pad: float = 0.65) -> bool:
    return (a_start - pad) <= b_end and (a_end + pad) >= b_start


def merge_audible_disfluencies(
    words: list[WordToken],
    summary: DisfluencySummary,
    audible_events: list[AudibleDisfluency],
    duration_sec: float,
) -> DisfluencySummary:
    """Fuse audio-heard disfluencies (sub-word stutters, missed fillers) into DisfluencySummary."""
    if not audible_events:
        return summary

    cleaned_events: list[AudibleDisfluency] = []
    for ev in audible_events:
        s = max(0.0, round(float(ev.start), 3))
        e = max(s + 0.15, round(float(ev.end), 3))
        if duration_sec > 0:
            s = min(s, duration_sec)
            e = min(max(e, s + 0.1), duration_sec)
        cleaned_events.append(
            AudibleDisfluency(
                start=s,
                end=e,
                kind=ev.kind,
                text=(ev.text or "").strip() or ev.kind,
            )
        )
    cleaned_events.sort(key=lambda item: item.start)

    filler_counts = dict(summary.filler_counts)
    repetition_stutters = summary.repetition_stutters

    existing_fillers = [w for w in words if w.is_filler and w.filler_type != "repetition"]
    existing_reps = [w for w in words if w.is_filler and w.filler_type == "repetition"]
    counted_stutter_spans: list[tuple[float, float]] = [(w.start, w.end) for w in existing_reps]

    for ev in cleaned_events:
        if ev.kind == "vocal_filler":
            # LLM audio timestamps can drift ~1-1.5s vs word-level ASR timestamps
            already_tracked = any(
                _overlaps(ev.start, ev.end, w.start, w.end, pad=1.6) for w in existing_fillers
            )
            if not already_tracked:
                label = _normalize_word(ev.text)
                if label.startswith("um"):
                    label = "um"
                elif label.startswith("uh") or label.startswith("er"):
                    label = "uh"
                else:
                    label = label or "um/uh"
                filler_counts[label] = filler_counts.get(label, 0) + 1
        elif ev.kind in {"stutter", "false_start"}:
            already_tracked = any(
                _overlaps(ev.start, ev.end, s, e, pad=1.2) for s, e in counted_stutter_spans
            )
            if not already_tracked:
                repetition_stutters += 1
                counted_stutter_spans.append((ev.start, ev.end))

    # Re-check pauses: a pause right before/after an audible stutter or filler is not dramatic
    updated_pauses: list[PauseEvent] = []
    awkward_count = 0
    dramatic_count = 0
    for pause in summary.pauses:
        classification = pause.classification
        if classification == "dramatic_pause":
            near_hiccup = any(
                ev.kind in {"stutter", "vocal_filler", "false_start"}
                and _overlaps(pause.start, pause.end, ev.start, ev.end, pad=0.6)
                for ev in cleaned_events
            )
            if near_hiccup:
                classification = "awkward_pause"
        if classification == "awkward_pause":
            awkward_count += 1
        elif classification == "dramatic_pause":
            dramatic_count += 1
        updated_pauses.append(pause.model_copy(update={"classification": classification}))

    total_fillers = sum(filler_counts.values())
    duration_min = duration_sec / 60.0
    fillers_per_minute = round(total_fillers / duration_min, 2) if duration_min > 0 else 0.0

    return summary.model_copy(
        update={
            "total_fillers": total_fillers,
            "fillers_per_minute": fillers_per_minute,
            "filler_counts": filler_counts,
            "repetition_stutters": repetition_stutters,
            "awkward_pause_count": awkward_count,
            "dramatic_pause_count": dramatic_count,
            "pauses": updated_pauses,
            "audible_events": cleaned_events,
        }
    )
