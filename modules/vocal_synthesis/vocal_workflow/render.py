"""WORLD analysis, consonant-aware time warping, explicit pitch replacement."""

import numpy as np
import pyworld as pw

from .audio import fade, validate_audio
from .score import pitch_at, validate_alignment, validate_score

FRAME_S = 0.005


def nearest_indices(grid, positions):
    right = np.clip(np.searchsorted(grid, positions), 0, len(grid) - 1)
    left = np.maximum(right - 1, 0)
    return np.where(abs(grid[left] - positions) <= abs(grid[right] - positions), left, right)


def warp_segment(segment, source_times, voiced):
    """Keep unvoiced intervals near source duration; stretch periodic nuclei."""
    a, b = segment["source_start_s"], segment["source_end_s"]
    c, d = segment["target_start_s"], segment["target_end_s"]
    edges = np.unique(np.r_[a, np.arange(np.ceil(a / FRAME_S) * FRAME_S, b, FRAME_S), b])
    widths = np.diff(edges)
    centers = (edges[:-1] + edges[1:]) / 2
    mask = voiced[nearest_indices(source_times, centers)]
    vd, nv = widths[mask].sum(), widths[~mask].sum()
    duration = d - c
    if segment["kind"] == "auto" and vd > 0.015 and nv > 0:
        nonperiodic_duration = min(nv, 0.55 * duration)
        nonperiodic_scale = nonperiodic_duration / nv
        periodic_scale = (duration - nonperiodic_duration) / vd
        weights = np.where(mask, periodic_scale, nonperiodic_scale)
    else:
        periodic_scale = nonperiodic_scale = duration / (b - a)
        weights = np.full(len(widths), periodic_scale)
    warped = widths * weights
    warped *= duration / warped.sum()
    target = np.r_[c, c + np.cumsum(warped)]
    target[-1] = d
    return edges, target, {"periodic_scale": float(periodic_scale), "nonperiodic_scale": float(nonperiodic_scale)}


def render(source, sr, score, alignment):
    x = validate_audio(source, sr)
    validate_score(score)
    validate_alignment(alignment, len(x) / sr, score["duration_s"])
    f0, st = pw.harvest(x, sr, f0_floor=55, f0_ceil=1000, frame_period=5)
    f0 = pw.stonemask(x, f0, st, sr)
    sp = pw.cheaptrick(x, f0, st, sr)
    ap = pw.d4c(x, f0, st, sr)
    voiced = f0 > 0
    if not voiced.any():
        raise ValueError("WORLD found no voiced source frames; inspect input or use a better source")
    tt = np.arange(int(np.ceil(score["duration_s"] / FRAME_S)) + 1) * FRAME_S
    source_t = np.zeros_like(tt)
    active = np.zeros(len(tt), dtype=bool)
    force_unvoiced = np.zeros_like(active)
    segments = []
    warnings = []
    for index, segment in enumerate(alignment["segments"]):
        edges, target, scales = warp_segment(segment, st, voiced)
        mask = (tt >= segment["target_start_s"]) & (tt < segment["target_end_s"])
        source_t[mask] = np.interp(tt[mask], target, edges)
        active[mask] = segment["kind"] != "silence"
        force_unvoiced[mask] = segment["kind"] == "unvoiced"
        if max(scales.values()) > 5 or min(scales.values()) < 0.35:
            warnings.append(f"segment {index + 1}: extreme stretch ratio; review consonants and vowel tails")
        segments.append({"segment": index + 1, **scales})
    idx = nearest_indices(st, source_t)
    left = np.clip(np.searchsorted(st, source_t, side="right") - 1, 0, len(st) - 1)
    right = np.minimum(left + 1, len(st) - 1)
    alpha = np.clip((source_t - st[left]) / FRAME_S, 0, 1)[:, None]
    target_sp = np.ascontiguousarray(sp[left] * (1 - alpha) + sp[right] * alpha)
    target_ap = np.ascontiguousarray(ap[left] * (1 - alpha) + ap[right] * alpha)
    pitch = pitch_at(score, tt)
    target_f0 = np.where(active & voiced[idx] & ~force_unvoiced, pitch, 0.0)
    # Preserve source unvoiced excitation. Score rests and target gaps are muted below.
    y = pw.synthesize(np.ascontiguousarray(target_f0), target_sp, target_ap, sr, 5)
    length = round(score["duration_s"] * sr)
    y = np.pad(y, (0, max(0, length - len(y))))[:length]
    # Exact sample-domain windows avoid leakage into rests or unaligned gaps.
    sample_active = np.zeros(len(y), dtype=bool)
    for segment in alignment["segments"]:
        if segment["kind"] == "silence":
            continue
        for note in score["notes"]:
            if note["pitch"] is None:
                continue
            start = max(segment["target_start_s"], note["start_s"])
            end = min(segment["target_end_s"], note["end_s"])
            if end <= start:
                continue
            a, b = round(start * sr), round(end * sr)
            sample_active[a:b] = True
    # Fade connected activity edges only; do not notch every legato note boundary.
    gated = np.zeros_like(y)
    transitions = np.diff(np.r_[False, sample_active, False].astype(np.int8))
    for a, b in zip(np.flatnonzero(transitions == 1), np.flatnonzero(transitions == -1)):
        gated[a:b] = fade(y[a:b].copy(), sr, 0.003)
    if not np.isfinite(gated).all() or np.max(np.abs(gated)) < 1e-8:
        raise ValueError("render is silent or non-finite; check score and alignment")
    report = {"engine": "WORLD", "pyworld_version": pw.__version__, "frame_period_ms": 5,
              "source_voiced_frames": int(voiced.sum()), "target_voiced_frames": int(np.count_nonzero(target_f0)),
              "segments": segments, "warnings": warnings,
              "listening_performed": False, "intelligibility_validated": False,
              "automatic_lyric_alignment": False, "automatic_score_recognition": False}
    return gated, report, {"target_time_s": tt, "source_time_s": source_t, "target_f0_hz": target_f0}
