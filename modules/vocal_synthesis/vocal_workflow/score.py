"""Strict, monophonic note timelines; no automatic transcription or score OCR."""

import json
import math
import re
from pathlib import Path

MAX_DURATION = 60.0  # Render long compositions phrase by phrase.
MIN_EVENT = 0.010


def number(value, label):
    if isinstance(value, bool) or not isinstance(value, (float, int)):
        raise ValueError(f"{label} must be a finite number")
    try:
        finite = math.isfinite(value)
    except OverflowError:
        finite = False
    if not finite:
        raise ValueError(f"{label} must be a finite number")
    return float(value)


def pitch_hz(pitch):
    """Scientific pitch name (C4=60), MIDI number, or null for a rest."""
    if pitch is None:
        return 0.0
    if isinstance(pitch, str):
        match = re.fullmatch(r"([A-Ga-g])([#b]?)(-?\d+)", pitch)
        if not match:
            raise ValueError("pitch must be a MIDI number, note such as C#4, or null")
        letter, accidental, octave = match.groups()
        semitone = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[letter.upper()]
        midi = 12 * (int(octave) + 1) + semitone + {"": 0, "#": 1, "b": -1}[accidental]
    else:
        midi = number(pitch, "pitch")
    hz = 440.0 * 2.0 ** ((midi - 69) / 12.0) if -100 < midi < 200 else 0.0
    if not 55 <= hz <= 1000:
        raise ValueError("target pitch must be between 55 and 1000 Hz")
    return hz


def validate_score(data):
    if not isinstance(data, dict) or set(data) != {"version", "duration_s", "notes"}:
        raise ValueError("score must have exactly version, duration_s, and notes")
    if type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("only score version 1 is supported")
    duration = number(data["duration_s"], "duration_s")
    if not MIN_EVENT <= duration <= MAX_DURATION:
        raise ValueError(f"duration_s must be between {MIN_EVENT} and {MAX_DURATION}")
    if not isinstance(data["notes"], list) or not data["notes"] or len(data["notes"]) > 6000:
        raise ValueError("notes must be a nonempty list of at most 6000 events")
    previous_end = 0.0
    for event in data["notes"]:
        if not isinstance(event, dict) or set(event) != {"start_s", "end_s", "pitch"}:
            raise ValueError("each note needs exactly start_s, end_s, pitch")
        start = number(event["start_s"], "start_s")
        end = number(event["end_s"], "end_s")
        if start < previous_end - 1e-9 or end - start < MIN_EVENT - 1e-9 or end > duration + 1e-9:
            raise ValueError("notes must be ordered, non-overlapping, at least 10 ms, and inside duration_s")
        pitch_hz(event["pitch"])
        previous_end = end
    return data


def read_score(path):
    return validate_score(json.loads(Path(path).read_text(encoding="utf-8")))


def pitch_at(score, times):
    import numpy as np

    f0 = np.zeros_like(times, dtype=float)
    for event in score["notes"]:
        mask = (times >= event["start_s"]) & (times < event["end_s"])
        f0[mask] = pitch_hz(event["pitch"])
    return f0


def validate_alignment(data, source_duration, target_duration):
    if not isinstance(data, dict) or set(data) != {"version", "segments"} or type(data["version"]) is not int or data["version"] != 1:
        raise ValueError("alignment needs version 1 and segments")
    segments = data["segments"]
    if not isinstance(segments, list) or not segments or len(segments) > 6000:
        raise ValueError("segments must be a nonempty list of at most 6000 entries")
    source_previous = target_previous = 0.0
    for segment in segments:
        required = {"source_start_s", "source_end_s", "target_start_s", "target_end_s", "kind"}
        if not isinstance(segment, dict) or set(segment) != required:
            raise ValueError("segment fields must be source_start_s, source_end_s, target_start_s, target_end_s, kind")
        if segment["kind"] not in ("auto", "unvoiced", "silence"):
            raise ValueError("segment kind must be auto, unvoiced, or silence")
        a, b, c, d = [number(segment[key], key) for key in ("source_start_s", "source_end_s", "target_start_s", "target_end_s")]
        if a < source_previous - 1e-9 or c < target_previous - 1e-9 or b - a < MIN_EVENT - 1e-9 or d - c < MIN_EVENT - 1e-9:
            raise ValueError("source and target segments must be ordered, non-overlapping, and at least 10 ms")
        if b > source_duration + 1e-9 or d > target_duration + 1e-9:
            raise ValueError("alignment extends beyond source or target duration")
        source_previous, target_previous = b, d
    return data
