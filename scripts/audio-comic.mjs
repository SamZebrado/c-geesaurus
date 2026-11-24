#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Zero network, zero model dependencies. Stdout only; callers choose where to save.
import { readFile } from 'node:fs/promises';
import { exampleManifest, createLedger, reserveJob, markSubmitted, recordAcceptance, recordArtifact, restoreLedger, mockAdapter, verifyPageBytes, exportReviewPackage } from '../docs/src/audio-comic.js';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(`C. Geesaurus audio comic — MOCK ONLY
node scripts/audio-comic.mjs --json
node scripts/audio-comic.mjs --manifest manifest.json --json
node scripts/audio-comic.mjs --stop-after-submit > checkpoint.json
node scripts/audio-comic.mjs --resume checkpoint.json --json
Only original fixture pages and JSON bytes. No speech, recording, API, model install, or listening PASS.
No files are written by this CLI. Checkpoints contain the manifest and ledger, not credentials.`);
} else {
  try {
    let manifestPath, resumePath, stop = false, json = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg === '--json') json = true;
      else if (arg === '--stop-after-submit') stop = true;
      else if (arg === '--manifest' || arg === '--resume') {
        if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${arg} requires a local JSON path`);
        if (arg === '--manifest') manifestPath = args[++i]; else resumePath = args[++i];
      } else throw new Error(`Unknown option: ${arg}`);
    }
    const load = async path => { const raw = await readFile(path, 'utf8'); if (raw.length > 2000000) throw new Error('Checkpoint/manifest exceeds 2 MB'); return JSON.parse(raw); };
    const checkpoint = resumePath ? await load(resumePath) : null;
    const manifest = manifestPath ? await load(manifestPath) : checkpoint?.manifest || exampleManifest();
    let state = checkpoint ? await restoreLedger(JSON.stringify(checkpoint), manifest) : await createLedger(manifest);
    for (const page of state.manifest.pages) await verifyPageBytes(state.manifest, page.id, new Uint8Array(await readFile(new URL(`../docs/${page.asset}`, import.meta.url))));
    let stopped = false;
    for (const line of state.manifest.lines) {
      for (const stage of state.manifest.vc.enabled ? ['tts', 'vc'] : ['tts']) {
        state = await reserveJob(state, line.id, stage);
        let job = state.jobs.find(item => item.request.line.id === line.id && item.request.stage === stage);
        if (job.status === 'complete') continue;
        const adapter = mockAdapter(stage);
        if (job.status === 'reserved') {
          state = markSubmitted(state, job.request.id);
          if (stop) { stopped = true; break; }
          // Mock has no side effects. A real runtime MUST durably save above state first.
          state = recordAcceptance(state, job.request.id, await adapter.submit(job.request));
        } else if (['submitted', 'uncertain'].includes(job.status)) {
          // Recovery only inspects the SAME request; never calls submit again.
          state = recordAcceptance(state, job.request.id, await adapter.inspect(job.request));
        } else if (job.status === 'failed') throw new Error('Verified failure requires explicit retryJob and available retry budget');
        job = state.jobs.find(item => item.request.id === job.request.id);
        state = await recordArtifact(state, job.request.id, await adapter.fetchBytes(job.request));
      }
      if (stopped) break;
    }
    if (stopped) console.log(JSON.stringify(state, null, 2));
    else {
      const bundle = await exportReviewPackage(state);
      console.log(json ? JSON.stringify(bundle, null, 2) : `C. Geesaurus — audio comic MOCK ONLY\nPages: ${manifest.pages.length}; lines: ${manifest.lines.length}; mock artifacts: ${bundle.artifacts.length}\nTTS: mock JSON; VC: ${manifest.vc.enabled ? 'optional mock JSON' : 'disabled'}\nCash: 0; reserved units: ${state.reservedUnits}\nReal synthesis: false; listening PASS: false; video rendering: false\nSRT: planned timing only\nUse --json for the review package; --help for checkpoint recovery.`);
    }
  } catch (error) { console.error(`Audio comic blocked: ${error.message}`); process.exitCode = 1; }
}
