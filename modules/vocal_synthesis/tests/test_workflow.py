import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
import pyworld as pw
from scipy.io import wavfile

from vocal_workflow.audio import guide_tone, read_mono, synthetic_vowel, write_pcm
from vocal_workflow.render import render, warp_segment
from vocal_workflow.score import pitch_at, pitch_hz, read_score, validate_alignment, validate_score

ROOT = Path(__file__).resolve().parents[1]


class ScoreTests(unittest.TestCase):
    def setUp(self):
        self.score = read_score(ROOT / "examples/score.json")
        self.alignment = json.loads((ROOT / "examples/alignment.json").read_text())

    def test_pitch_names(self):
        self.assertAlmostEqual(pitch_hz("A4"), 440)
        self.assertAlmostEqual(pitch_hz("C#4"), pitch_hz("Db4"))
        self.assertAlmostEqual(pitch_hz(60), pitch_hz("C4"))
        self.assertEqual(pitch_hz(None), 0)

    def test_invalid_pitches(self):
        for pitch in [True, float("nan"), -20, 2000, "C", "H4", "A999"]:
            with self.subTest(pitch=pitch), self.assertRaises(ValueError):
                pitch_hz(pitch)

    def test_rests_and_boundaries(self):
        result = pitch_at(self.score, np.array([0, 0.5, 1, 1.2499, 1.25, 2.5]))
        np.testing.assert_allclose(result, [pitch_hz("C4"), pitch_hz("E4"), 0, 0, pitch_hz("D4"), 0])

    def test_reject_overlapping_notes(self):
        self.score["notes"][1]["start_s"] = 0.4
        with self.assertRaises(ValueError):
            validate_score(self.score)

    def test_reject_invalid_durations(self):
        for duration in [float("inf"), 0, 61, True, "2.5"]:
            score = copy.deepcopy(self.score)
            score["duration_s"] = duration
            with self.subTest(duration=duration), self.assertRaises(ValueError):
                validate_score(score)

    def test_reject_unknown_metadata(self):
        self.score["private_source"] = "not accepted"
        with self.assertRaises(ValueError):
            validate_score(self.score)

    def test_alignment_rejects_overlap_and_outside(self):
        for field, value in [("source_start_s", -0.1), ("source_end_s", 1.1), ("target_end_s", 3), ("kind", "guess")]:
            alignment = copy.deepcopy(self.alignment)
            alignment["segments"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                validate_alignment(alignment, 1, 2.5)
        alignment = copy.deepcopy(self.alignment)
        alignment["segments"] *= 2
        with self.assertRaises(ValueError):
            validate_alignment(alignment, 1, 2.5)

    def test_warp_keeps_consonants(self):
        times = np.arange(201) * 0.005
        voiced = times >= 0.2
        edges, target, report = warp_segment(self.alignment["segments"][0], times, voiced)
        self.assertTrue(np.all(np.diff(edges) > 0))
        self.assertTrue(np.all(np.diff(target) > 0))
        self.assertAlmostEqual(target[-1], 2.5)
        self.assertAlmostEqual(report["nonperiodic_scale"], 1)
        self.assertGreater(report["periodic_scale"], 1)


class AudioTests(unittest.TestCase):
    def test_wav_dtypes_and_stereo_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "input.wav"
            for dtype, values in [(np.uint8, [64, 192]), (np.int16, [-16384, 16384]),
                                  (np.int32, [-1073741824, 1073741824]), (np.float32, [-0.5, 0.5])]:
                wavfile.write(path, 24000, np.tile(np.array(values, dtype=dtype), 1200))
                sr, audio = read_mono(path)
                self.assertEqual(sr, 24000)
                np.testing.assert_allclose(audio[:2], [-0.5, 0.5])
            wavfile.write(path, 24000, np.ones((2400, 2), dtype=np.int16))
            with self.assertRaises(ValueError):
                read_mono(path)

    def test_silent_and_nan_rejection(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "input.wav"
            for audio in [np.zeros(2400), np.full(2400, np.nan)]:
                wavfile.write(path, 24000, audio)
                with self.assertRaises(ValueError):
                    read_mono(path)

    def test_guide_and_pcm_roundtrip(self):
        score = read_score(ROOT / "examples/score.json")
        tone = guide_tone(score)
        self.assertEqual(len(tone), 60000)
        self.assertTrue(np.all(tone[24000:30000] == 0))
        with tempfile.TemporaryDirectory() as tmp:
            report = write_pcm(Path(tmp) / "tone.wav", 24000, tone * 10)
            self.assertEqual(report["clipped_samples"], 0)
            self.assertLessEqual(report["peak"], 0.901)


class WorldTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.score = read_score(ROOT / "examples/score.json")
        cls.alignment = json.loads((ROOT / "examples/alignment.json").read_text())
        cls.y, cls.report, cls.params = render(synthetic_vowel(), 24000, cls.score, cls.alignment)

    def test_actual_world_render(self):
        self.assertEqual(len(self.y), 60000)
        self.assertTrue(np.isfinite(self.y).all())
        self.assertGreater(np.max(np.abs(self.y)), 0.01)
        self.assertGreater(self.report["target_voiced_frames"], 100)
        self.assertFalse(self.report["listening_performed"])

    def test_rest_is_sample_exact_silence(self):
        self.assertTrue(np.all(self.y[24000:30000] == 0))

    def test_measured_pitch_matches_notes(self):
        f0, times = pw.harvest(np.ascontiguousarray(self.y), 24000, f0_floor=55, f0_ceil=1000, frame_period=5)
        for event in self.score["notes"]:
            if event["pitch"] is None:
                continue
            mask = (times > event["start_s"] + 0.08) & (times < event["end_s"] - 0.08) & (f0 > 0)
            self.assertGreater(mask.sum(), 10)
            cents = 1200 * np.log2(np.median(f0[mask]) / pitch_hz(event["pitch"]))
            self.assertLess(abs(cents), 35)

    def test_unaligned_gap_is_silent(self):
        alignment = {"version": 1, "segments": [
            {"source_start_s": 0.0, "source_end_s": 0.4, "target_start_s": 0.0, "target_end_s": 0.5, "kind": "auto"},
            {"source_start_s": 0.4, "source_end_s": 1.0, "target_start_s": 1.25, "target_end_s": 2.5, "kind": "auto"}]}
        y, _, _ = render(synthetic_vowel(), 24000, self.score, alignment)
        self.assertTrue(np.all(y[12000:30000] == 0))

    def test_direct_api_rejects_invalid_audio(self):
        for source, sr in [(np.zeros((2400, 2)), 24000), (np.full(2400, np.nan), 24000),
                           (np.full(2400, 2.0), 24000), (np.ones(2), 24000),
                           (np.ones(2400), 8000), (np.ones(2400), True)]:
            with self.subTest(sr=sr), self.assertRaises(ValueError):
                render(source, sr, self.score, self.alignment)

    def test_contiguous_note_boundary_is_not_faded(self):
        # A note boundary must not force adjacent waveform samples to zero.
        boundary = round(0.5 * 24000)
        self.assertGreater(abs(self.y[boundary - 1]) + abs(self.y[boundary]), 1e-5)

    def test_fractional_frame_and_sample_boundaries(self):
        score = {"version": 1, "duration_s": 0.50321, "notes": [
            {"start_s": 0.0001, "end_s": 0.0101, "pitch": "C4"},
            {"start_s": 0.01513, "end_s": 0.50321, "pitch": "D4"}]}
        alignment = {"version": 1, "segments": [{"source_start_s": 0.0, "source_end_s": 1.0,
            "target_start_s": 0.0, "target_end_s": 0.50321, "kind": "auto"}]}
        y, _, _ = render(synthetic_vowel(), 24000, score, alignment)
        self.assertEqual(len(y), round(0.50321 * 24000))
        self.assertTrue(np.all(y[round(0.0101 * 24000):round(0.01513 * 24000)] == 0))

    def test_explicit_unvoiced_and_silence(self):
        alignment = {"version": 1, "segments": [
            {"source_start_s": 0.0, "source_end_s": 0.3, "target_start_s": 0.0, "target_end_s": 0.5, "kind": "unvoiced"},
            {"source_start_s": 0.3, "source_end_s": 0.5, "target_start_s": 0.5, "target_end_s": 1.0, "kind": "silence"},
            {"source_start_s": 0.5, "source_end_s": 1.0, "target_start_s": 1.25, "target_end_s": 2.5, "kind": "auto"}]}
        y, _, params = render(synthetic_vowel(), 24000, self.score, alignment)
        self.assertTrue(np.all(params["target_f0_hz"][params["target_time_s"] < 1.25] == 0))
        self.assertTrue(np.all(y[12000:30000] == 0))

    def test_cli_demo_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "demo"
            command = [sys.executable, "-m", "vocal_workflow", "demo", str(output)]
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            report = json.loads((output / "report.json").read_text())
            self.assertEqual(report["audio"]["clipped_samples"], 0)
            before = (output / "vocal.wav").read_bytes()
            repeat = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertNotEqual(repeat.returncode, 0)
            self.assertEqual(before, (output / "vocal.wav").read_bytes())
            # Test the public file-input path too, using only synthetic inputs.
            command = [sys.executable, "-m", "vocal_workflow", "render", str(output / "synthetic_source.wav"),
                       str(output / "score.json"), str(output / "alignment.json"), str(Path(tmp) / "rerender")]
            result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == "__main__":
    unittest.main()
