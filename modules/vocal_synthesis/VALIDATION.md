# Verification of this snapshot

Executed on Linux x86-64, Python 3.12, with the pinned versions in `requirements.txt`.

- `python -m unittest discover -s tests -v`: 20 tests passed.
- Actual WORLD render of a deterministic mathematical vowel into an invented four-note melody: 24 kHz, 60,000 samples, 2.5 seconds, no clipped samples.
- Independent Harvest pitch re-extraction: each note's stable interior is required to be within 35 cents of its target and to contain more than ten voiced analysis frames.
- Rest and unmapped-gap samples verified to be exactly zero; explicit unvoiced/closure behavior covered.
- PCM8/PCM16/PCM32/float input conversion, malformed API input rejection, fractional frame/sample boundaries, adjacent-note continuity and output-preserving rerun behavior covered.
- CLI demo and file-input render path both exercised using only the mathematical source; no real recording needed.
- Existing repository `npm run check`: 21 tests passed; no browser UI files were changed.
- Python compilation check passed.

These checks exercise a small synthetic case, not arbitrary score coverage or real-voice accuracy. Perceptual listening, intelligibility, lyrics, singer identity, advanced instrument realism and final mix quality are **not** certified. Existing browser end-to-end checks are left to the repository's separate CI workflow; this change does not alter the browser UI.

CI reruns the Python tests and demo on each relevant pull request. Check the run for the exact commit before treating a hosted CI check as passed. Audio outputs, caches and local reports are not committed or uploaded as CI artifacts.
