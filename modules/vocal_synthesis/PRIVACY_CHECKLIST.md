# Before publishing a change

1. Stage an explicit file list, not an entire working directory. Review both filenames and contents in the staged diff.
2. Publish only source, documentation, and invented fixtures. Keep real audio, lyrics, transcripts, alignments, reference pitches, embeddings, checkpoints, caches, logs, links, and deployment identifiers outside the public tree.
3. Check hidden files, notebooks, archives, metadata, absolute paths, credentials, account IDs and email addresses. An ignore rule does not remove already tracked files or sanitize Git history.
4. Review new commit author/committer metadata; use a suitable public or no-reply identity. Existing repository history is a separate surface and is not rewritten by this module.
5. Run the tests and the synthetic demo from the exact candidate code. Inspect generated reports locally; do not commit arbitrary output directories.
6. Review any new dependencies, pretrained models and audio assets separately. Code license, model license, recording consent and composition rights are different questions.
7. Verify the exact published commit and CI result. Do not describe a local-only change as uploaded or a numeric test as listening approval.

The public example contains no lyric text and no real recording. The ignore rules are a convenience, not a security boundary or proof that a repository is private.
