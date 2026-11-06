"""WAV I/O and small, deliberately basic synthesis utilities."""

from pathlib import Path

import numpy as np
from scipy.io import wavfile


def validate_audio(x, sr):
    x = np.asarray(x)
    if type(sr) is not int or x.ndim != 1 or not 16000 <= sr <= 48000:
        raise ValueError("source must be mono WAV, 16–48 kHz; explicitly downmix/resample first")
    if x.dtype.kind not in "fiu":
        raise ValueError("source must be a real-valued numeric array")
    x = x.astype(np.float64, copy=False)
    if len(x) < sr * 0.05 or len(x) > sr * 60 or not np.isfinite(x).all() or np.max(np.abs(x)) > 1:
        raise ValueError("source must be finite, normalized, and between 0.05 and 60 seconds")
    if np.max(np.abs(x)) < 1e-7:
        raise ValueError("source is silent")
    return np.ascontiguousarray(x, dtype=np.float64)


def read_mono(path):
    sr, raw = wavfile.read(path)
    if raw.dtype.kind == "u":
        half = (np.iinfo(raw.dtype).max + 1) / 2
        x = (raw.astype(float) - half) / half
    elif raw.dtype.kind == "i":
        x = raw.astype(float) / -float(np.iinfo(raw.dtype).min)
    elif raw.dtype.kind == "f":
        x = raw.astype(float)
    else:
        raise ValueError("unsupported WAV encoding")
    return sr, validate_audio(x, sr)


def write_pcm(path, sr, x):
    if not len(x) or not np.isfinite(x).all():
        raise ValueError("cannot write empty or non-finite audio")
    peak = float(np.max(np.abs(x)))
    gain = min(1.0, 0.90 / max(peak, 1e-12))
    pcm = np.round(x * gain * 32767).astype(np.int16)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    wavfile.write(path, sr, pcm)
    check_sr, check = wavfile.read(path)
    if check_sr != sr or not np.array_equal(check, pcm):
        raise RuntimeError("WAV roundtrip failed")
    return {"sample_rate": sr, "samples": len(pcm), "duration_s": len(pcm) / sr,
            "peak": float(np.max(np.abs(pcm.astype(float)))) / 32768,
            "gain": gain, "clipped_samples": int(np.count_nonzero(np.abs(pcm.astype(np.int32)) >= 32767))}


def fade(x, sr, seconds=0.005):
    n = min(round(sr * seconds), len(x) // 2)
    if n:
        ramp = np.linspace(0, 1, n)
        x[:n] *= ramp
        x[-n:] *= ramp[::-1]
    return x


def guide_tone(score, sr=24000):
    """Three-harmonic pitch guide, not a realistic instrument or accompaniment."""
    from .score import pitch_hz

    y = np.zeros(round(score["duration_s"] * sr))
    for event in score["notes"]:
        hz = pitch_hz(event["pitch"])
        if not hz:
            continue
        start, end = round(event["start_s"] * sr), round(event["end_s"] * sr)
        t = np.arange(end - start) / sr
        note = sum(np.sin(2 * np.pi * hz * k * t) / k for k in range(1, 4)) * 0.20
        y[start:end] += fade(note, sr, 0.015)
    return y


def synthetic_vowel(sr=24000, duration=1.0):
    """Deterministic /a/-like test signal. Not a recording, TTS, or cloned voice."""
    t = np.arange(round(sr * duration)) / sr
    f0 = 150.0
    y = np.zeros_like(t)
    for k in range(1, int((sr / 2 - 1) / f0) + 1):
        frequency = k * f0
        envelope = sum(np.exp(-0.5 * ((frequency - center) / width) ** 2)
                       for center, width in ((700, 120), (1200, 160), (2600, 220)))
        y += (envelope + 0.01) * np.sin(2 * np.pi * frequency * t) / k
    y *= 0.5 / max(float(np.max(np.abs(y))), 1e-12)
    return fade(y, sr, 0.025)
