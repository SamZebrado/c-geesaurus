"""Run from this module directory: python -m vocal_workflow --help."""

import argparse
import json
from pathlib import Path

from .score import read_score, validate_score


def main():
    parser = argparse.ArgumentParser(description="Offline WORLD vocal resynthesis from a reviewed note timeline")
    sub = parser.add_subparsers(dest="command", required=True)
    validate = sub.add_parser("validate", help="validate a monophonic JSON score")
    validate.add_argument("score", type=Path)
    tone = sub.add_parser("tone", help="render a basic three-harmonic guide tone")
    tone.add_argument("score", type=Path)
    tone.add_argument("output", type=Path)
    render_cli = sub.add_parser("render", help="render a provided mono voice WAV using explicit alignment")
    render_cli.add_argument("source", type=Path)
    render_cli.add_argument("score", type=Path)
    render_cli.add_argument("alignment", type=Path)
    render_cli.add_argument("output_dir", type=Path)
    demo = sub.add_parser("demo", help="render an invented melody and synthetic vowel, without downloads")
    demo.add_argument("output_dir", type=Path)
    args = parser.parse_args()
    if args.command == "validate":
        read_score(args.score)
        print("Score valid (monophonic JSON v1)")
        return
    from .audio import guide_tone, read_mono, synthetic_vowel, write_pcm
    if args.command == "tone":
        if args.output.exists():
            parser.error("output exists; select a new filename")
        result = write_pcm(args.output, 24000, guide_tone(read_score(args.score)))
        print(json.dumps(result, indent=2))
        return
    if args.output_dir.exists():
        parser.error("output directory exists; select a new directory to preserve prior results")
    from .render import render
    if args.command == "demo":
        sr, source = 24000, synthetic_vowel()
        score = validate_score({"version": 1, "duration_s": 2.5, "notes": [
            {"start_s": 0.0, "end_s": 0.5, "pitch": "C4"},
            {"start_s": 0.5, "end_s": 1.0, "pitch": "E4"},
            {"start_s": 1.0, "end_s": 1.25, "pitch": None},
            {"start_s": 1.25, "end_s": 2.0, "pitch": "D4"},
            {"start_s": 2.0, "end_s": 2.5, "pitch": "G3"}]})
        alignment = {"version": 1, "segments": [{"source_start_s": 0.0, "source_end_s": 1.0,
                     "target_start_s": 0.0, "target_end_s": 2.5, "kind": "auto"}]}
    else:
        sr, source = read_mono(args.source)
        score = read_score(args.score)
        alignment = json.loads(args.alignment.read_text(encoding="utf-8"))
    y, report, parameters = render(source, sr, score, alignment)
    args.output_dir.mkdir(parents=True)
    report["audio"] = write_pcm(args.output_dir / "vocal.wav", sr, y)
    write_pcm(args.output_dir / "guide.wav", 24000, guide_tone(score))
    if args.command == "demo":
        write_pcm(args.output_dir / "synthetic_source.wav", sr, source)
        (args.output_dir / "score.json").write_text(json.dumps(score, indent=2) + "\n", encoding="utf-8")
        (args.output_dir / "alignment.json").write_text(json.dumps(alignment, indent=2) + "\n", encoding="utf-8")
    import numpy as np
    np.savez_compressed(args.output_dir / "parameters.npz", **parameters)
    (args.output_dir / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
