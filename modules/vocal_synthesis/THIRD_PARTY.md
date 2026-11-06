# Dependency and asset boundaries

No third-party source tree, model weights, voice embeddings, recording, SoundFont, or production artwork is bundled. Original code inherits the repository's Apache-2.0 license. Installed dependencies retain their own licenses.

## Runtime used for verification

- Python 3.12, Linux x86-64.
- NumPy 2.3.5: BSD-3-Clause core. Wheels may include separately licensed numerical libraries.
- SciPy 1.17.0: BSD-3-Clause core. Wheels may include separately licensed numerical/compiler libraries; inspect the installed distribution's complete license notices if redistributing binaries.
- pyworld 0.3.5: MIT wrapper. Its underlying WORLD library uses a BSD-3-Clause-style license. These were checked against the package source license files.
- setuptools 80.9.0: MIT core, with separately licensed vendored components. Pinned below 81 because pyworld 0.3.5 imports the deprecated `pkg_resources`; a deprecation warning is expected with this tested combination. Do not silently upgrade this dependency without retesting.

The version pins describe the environment used to test this generic module, not a claim that every earlier experiment used identical versions. No hash-locked, cross-platform binary build is promised.

Upstream references:

- [pyworld source and license](https://github.com/JeremyCCHsu/Python-Wrapper-for-World-Vocoder)
- [WORLD source and license](https://github.com/mmorise/World)
- [NumPy license](https://github.com/numpy/numpy/blob/main/LICENSE.txt)
- [SciPy license](https://github.com/scipy/scipy/blob/main/LICENSE.txt)
- [setuptools](https://github.com/pypa/setuptools)

## Optional upstream tools described, not included

- TTS/voice models: code and model licenses can differ. A permissive inference-code license does not imply unrestricted model or generated-voice rights. Obtain and review the specific model's terms separately.
- FluidSynth: LGPL-2.1-or-later with additional component notices. It renders a SoundFont; the SoundFont has its own license. No SoundFont is downloaded or redistributed here, and there is no bundled FluidSynth adapter.
- The test source is a deterministic mathematical harmonic/formant signal produced by this module. The four-note example is an invented test fixture, not a transcription of a production song.

There is no bundled natural voice or pretrained singing voice. Permission to run code does not grant permission to imitate a person, redistribute a voice model, reuse lyrics/melodies, or publish a recording.
