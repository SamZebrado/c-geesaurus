// SPDX-License-Identifier: Apache-2.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { exampleManifest, validateManifest, createLedger, reserveJob, markSubmitted, recordFailure, retryJob, recordAcceptance, recordArtifact, restoreLedger, mockAdapter, verifyPageBytes, sha256, subtitles, listeningChecklist, exportReviewPackage } from '../docs/src/audio-comic.js';
const clone = value => structuredClone(value);
async function reserved(manifest = exampleManifest(), stage = 'tts') { return reserveJob(await createLedger(manifest), 'D01', stage); }
async function complete(state, lineId = 'D01', stage = 'tts') {
  state = await reserveJob(state, lineId, stage);
  const job = state.jobs.find(item => item.request.line.id === lineId && item.request.stage === stage), adapter = mockAdapter(stage);
  state = markSubmitted(state, job.request.id);
  state = recordAcceptance(state, job.request.id, await adapter.submit(job.request));
  return recordArtifact(state, job.request.id, await adapter.fetchBytes(job.request));
}
const alteredManifest = change => { const m = exampleManifest(); change(m); return m; };

test('comic example is fictional, ordered, independently voiced and zero cash', async () => {
  const m = validateManifest(exampleManifest());
  assert.deepEqual(m.pages.map(p => p.order), [1, 2]); assert.equal(m.vc.enabled, false); assert.equal(m.budget.maxCashMicros, 0);
  assert.equal(m.voices.length, 2); assert.ok(m.voices.every(v => v.source.referenceRecording === null));
  const state = await createLedger(m); m.lines[0].text = 'changed'; assert.notEqual(state.manifest.lines[0].text, 'changed');
});
test('page bytes and source digests match the existing original SVG files', async () => {
  for (const page of exampleManifest().pages) {
    const bytes = new Uint8Array(readFileSync(new URL(`../docs/${page.asset}`, import.meta.url)));
    assert.equal(await sha256(bytes), createHash('sha256').update(bytes).digest('hex'));
    assert.equal(await verifyPageBytes(exampleManifest(), page.id, bytes), true);
    await assert.rejects(verifyPageBytes(exampleManifest(), page.id, new Uint8Array([1])), /Page bytes/);
  }
});
test('invalid manifest structures fail closed', () => {
  for (const m of [null, {}, { schema: 99 }, alteredManifest(m => { m.mode = 'real'; }), alteredManifest(m => { m.lines = []; }), alteredManifest(m => { m.voices = null; })]) assert.throws(() => validateManifest(m));
});
test('page order, input provenance and duplicate IDs cannot be inferred or ignored', () => {
  for (const mutate of [m => { m.pages.reverse(); }, m => { m.pages[1].order = 4; }, m => { m.pages[0].inputId = 'unknown'; }, m => { m.lines[1].id = 'D01'; }, m => { m.pages[0].sha256 = 'missing'; }]) assert.throws(() => validateManifest(alteredManifest(mutate)));
});
test('local page paths reject traversal, URLs and uncontrolled files', () => {
  for (const asset of ['../private.svg', 'https://example.com/page.svg', 'assets/../private.svg', 'assets/page.png']) assert.throws(() => validateManifest(alteredManifest(m => { m.pages[0].asset = asset; })), /Pinned local/);
});
test('missing page, voice, subtitle and input license permissions block planning', () => {
  for (const mutate of [m => { m.pages[0].rights.exportAllowed = false; }, m => { m.voices[0].source.rights.license = ''; }, m => { m.subtitles.rights.permission = ''; }, m => { m.inputs[0].rights.source = ''; }]) assert.throws(() => validateManifest(alteredManifest(mutate)), /rights required/);
});
test('speaker substitutions and unlicensed recording sources are rejected', () => {
  for (const mutate of [m => { m.lines[0].speaker = '旁白'; }, m => { m.lines[0].voiceId = 'missing'; }, m => { m.voices[1].speaker = m.voices[0].speaker; }, m => { m.voices[0].speaker = 'speaker\n99'; }, m => { m.voices[0].source.kind = 'reference-recording'; }, m => { m.voices[0].source.referenceRecording = 'recording.wav'; }]) assert.throws(() => validateManifest(alteredManifest(mutate)));
});
test('timing, overlap, emotion and pace must fit the explicit page sequence', () => {
  for (const mutate of [m => { m.lines.reverse(); }, m => { m.lines[0].endMs = 4100; }, m => { m.lines[0].startMs = -1; }, m => { m.lines[0].direction.pauseAfterMs = 1000; }, m => { m.lines[0].direction.rate = NaN; }, m => { m.lines[0].direction.intensity = 2; }, m => { m.lines[0].text = 'a\n\n99'; }]) assert.throws(() => validateManifest(alteredManifest(mutate)));
});
test('no real provider, nonzero cash budget or unknown quote is enabled', async () => {
  for (const mutate of [m => { m.tts.adapter = 'paid-api'; }, m => { m.vc.adapter = 'online-vc'; }, m => { m.budget.maxCashMicros = 1; }, m => { m.budget.maxAttempts = 999; }]) assert.throws(() => validateManifest(alteredManifest(mutate)));
  for (const quote of [{ cashMicros: 1 }, {}, { cashMicros: -1 }]) await assert.rejects(reserveJob(await createLedger(exampleManifest()), 'D01', 'tts', quote), /cost blocked/);
});
test('reservation is stable and duplicate requests consume no extra budget', async () => {
  const state = await reserved(), again = await reserveJob(state, 'D01'); assert.equal(again, state); assert.equal(state.reservedUnits, state.manifest.lines[0].text.length); assert.equal(state.jobs.length, 1);
  await assert.rejects(reserveJob(state, 'missing'), /Unknown line/);
});
test('all content affecting performance or source identity changes the request digest', async () => {
  const first = (await reserved()).jobs[0].request.id;
  for (const mutate of [m => { m.revision++; }, m => { m.lines[0].direction.emotion = 'excited'; }, m => { m.voices[0].version++; }, m => { m.voices[0].description += ' lower'; }, m => { m.pages[0].sha256 = '0'.repeat(64); }]) assert.notEqual((await reserved(alteredManifest(mutate))).jobs[0].request.id, first);
});
test('locked manifest mutation is blocked before reserving another request', async () => { const state = await reserved(); state.manifest.lines[1].text = 'changed'; await assert.rejects(reserveJob(state, 'D02'), /Locked manifest/); });
test('unit budget prevents extra requests and retries without consuming state', async () => {
  const m = exampleManifest(); m.budget.maxUnits = m.lines[0].text.length;
  let state = await reserved(m); await assert.rejects(reserveJob(state, 'D02'), /Unit budget/);
  const requestId = state.jobs[0].request.id; state = recordFailure(markSubmitted(state, requestId), requestId, 'not-accepted'); assert.throws(() => retryJob(state, requestId), /Retry budget/); assert.equal(state.jobs[0].attempts, 1);
});
test('submitted and accepted requests cannot be resubmitted or automatically retried', async () => {
  let state = await reserved(); const { request } = state.jobs[0]; state = markSubmitted(state, request.id);
  assert.throws(() => markSubmitted(state, request.id), /resubmitted/); assert.throws(() => retryJob(state, request.id), /inspected/);
  state = recordAcceptance(state, request.id, await mockAdapter().submit(request)); assert.throws(() => retryJob(state, request.id), /inspected/); assert.throws(() => recordFailure(state, request.id, 'not-accepted'), /before acceptance/);
});
test('unknown outcomes restore and inspect the same identity without a new submission', async () => {
  let state = await reserved(); const { request } = state.jobs[0]; state = recordFailure(markSubmitted(state, request.id), request.id, 'unknown');
  state = await restoreLedger(JSON.stringify(state), exampleManifest()); assert.throws(() => retryJob(state, request.id), /inspected/);
  state = recordAcceptance(state, request.id, await mockAdapter().inspect(request)); state = await recordArtifact(state, request.id, await mockAdapter().fetchBytes(request));
  assert.equal(state.jobs[0].attempts, 1); assert.equal(state.jobs[0].status, 'complete');
});
test('confirmed nonacceptance permits only bounded explicit retries', async () => {
  let state = await reserved(); const requestId = state.jobs[0].request.id;
  state = recordFailure(markSubmitted(state, requestId), requestId, 'not-accepted'); state = retryJob(state, requestId); assert.equal(state.jobs[0].attempts, 2);
  state = await restoreLedger(JSON.stringify(state), exampleManifest()); state = recordFailure(markSubmitted(state, requestId), requestId, 'not-accepted'); assert.throws(() => retryJob(state, requestId), /Retry budget/);
});
test('acceptance must bind stage, adapter, request and provider identity', async () => {
  let state = await reserved(); const { request } = state.jobs[0], receipt = await mockAdapter().submit(request);
  assert.throws(() => recordAcceptance(state, request.id, receipt), /premature/); state = markSubmitted(state, request.id);
  for (const field of ['requestId', 'providerRequestId', 'adapter', 'stage', 'mode']) assert.throws(() => recordAcceptance(state, request.id, { ...receipt, [field]: 'wrong' }), /Mismatched/);
});
test('bytes alone or a checksum alone cannot replace a source acceptance receipt', async () => { const state = await reserved(), { request } = state.jobs[0]; await assert.rejects(recordArtifact(state, request.id, await mockAdapter().fetchBytes(request)), /Accepted source/); });
test('actual output bytes, SHA, length, source and mock media type are all verified', async () => {
  let state = await reserved(); const { request } = state.jobs[0], adapter = mockAdapter(); state = recordAcceptance(markSubmitted(state, request.id), request.id, await adapter.submit(request)); const artifact = await adapter.fetchBytes(request);
  for (const mutate of [a => { a.bytes[0] ^= 1; }, a => { a.sha256 = 'f'.repeat(64); }, a => { a.byteLength++; }, a => { a.requestId = 'wrong'; }, a => { a.mediaType = 'audio/wav'; }, a => { a.synthesized = true; }]) { const bad = clone(artifact); mutate(bad); await assert.rejects(recordArtifact(state, request.id, bad), /mismatch/); }
  state = await recordArtifact(state, request.id, artifact); assert.equal(state.jobs[0].status, 'complete'); assert.equal(artifact.sha256, createHash('sha256').update(new Uint8Array(artifact.bytes)).digest('hex'));
});
test('VC is opt-in, requires TTS, and preserves the source artifact', async () => {
  await assert.rejects(reserved(exampleManifest(), 'vc'), /disabled/);
  const m = exampleManifest(); m.vc.enabled = true; let state = await createLedger(m); await assert.rejects(reserveJob(state, 'D01', 'vc'), /completed TTS/);
  state = await complete(state); const source = clone(state.jobs[0].artifact); state = await complete(state, 'D01', 'vc');
  assert.deepEqual(state.jobs[0].artifact, source); assert.equal(state.jobs[1].request.input.sha256, source.sha256); assert.notEqual(state.jobs[1].artifact.sha256, source.sha256);
  assert.deepEqual(await restoreLedger(JSON.stringify(state), m), state);
  await assert.rejects(mockAdapter('vc').submit(state.jobs[0].request), /mismatch/);
});
test('damaged checkpoints never reset into permission to submit again', async () => {
  const state = await complete(await createLedger(exampleManifest()));
  for (const mutate of [s => { s.cashMicros = 1; }, s => { s.reservedUnits = 0; }, s => { s.jobs.push(clone(s.jobs[0])); }, s => { s.jobs[0].artifact.bytes = []; }, s => { s.jobs[0].request.voice.version++; }, s => { s.jobs[0].status = 'invented'; }, s => { s.jobs[0].acceptance = null; }, s => { s.reviews = [{ status: 'PASS' }]; }]) { const bad = clone(state); mutate(bad); await assert.rejects(restoreLedger(JSON.stringify(bad), exampleManifest())); }
  for (const raw of ['invalid', '{}', 'null']) await assert.rejects(restoreLedger(raw, exampleManifest()));
});
test('checkpoint cannot be restored against another manifest revision', async () => { const state = await reserved(); await assert.rejects(restoreLedger(JSON.stringify(state), alteredManifest(m => { m.revision++; })), /manifest mismatch/); });
test('SRT follows page offsets and retains the planned timing boundary', () => {
  const srt = subtitles(exampleManifest()); assert.match(srt, /00:00:00,300 --> 00:00:03,300/); assert.match(srt, /00:00:04,200 --> 00:00:07,400/); assert.match(srt, /小纸船：/);
  assert.match(subtitles(alteredManifest(m => { m.lines[0].text = '<i>hello</i>'; })), /&lt;i&gt;/);
});
test('music is absent by default and requires separate sync/adaptation/export permissions', () => {
  assert.equal(exampleManifest().music, null);
  const m = exampleManifest(); m.music = { id: 'music-1', sha256: '0'.repeat(64), source: 'Original imaginary score metadata; no audio asset', syncAllowed: true, adaptationAllowed: true, gainDb: -18, rights: clone(m.inputs[0].rights) }; assert.doesNotThrow(() => validateManifest(m));
  for (const mutate of [m => { m.music.syncAllowed = false; }, m => { m.music.adaptationAllowed = false; }, m => { m.music.rights.exportAllowed = false; }, m => { m.music.sha256 = ''; }]) { const bad = clone(m); mutate(bad); assert.throws(() => validateManifest(bad)); }
});
test('review package cannot claim speech, human listening or a rendered movie', async () => {
  let state = await createLedger(exampleManifest()); for (const line of state.manifest.lines) state = await complete(state, line.id);
  const bundle = await exportReviewPackage(state); assert.equal(bundle.acceptance.completeMockContracts, true); assert.equal(bundle.acceptance.productionReady, false); assert.equal(bundle.acceptance.realSynthesis, false); assert.equal(bundle.acceptance.listeningPass, false); assert.equal(bundle.render.video, null);
  for (const item of listeningChecklist(state)) { assert.equal(item.status, 'not-performed'); assert.equal(item.fullClipListened, false); assert.equal(item.aids.replacesListening, false); assert.equal(item.reviewer, null); assert.equal(item.emotionAndPacing, 'pending'); }
  assert.equal(bundle.subtitles.timing, 'planned-not-aligned'); assert.ok(bundle.artifacts.every(a => a.mediaType === 'application/json' && a.synthesized === false));
});
test('incomplete jobs remain explicit export blockers', async () => { const bundle = await exportReviewPackage(await reserved()); assert.equal(bundle.acceptance.completeMockContracts, false); assert.ok(bundle.acceptance.blockers.includes('mock jobs incomplete')); assert.deepEqual(bundle.artifacts, []); });
test('CLI uses the shared core and returns honest JSON plus a recoverable submitted checkpoint', async () => {
  const cwd = new URL('..', import.meta.url);
  const bundle = JSON.parse(execFileSync(process.execPath, ['scripts/audio-comic.mjs', '--json'], { cwd, encoding: 'utf8' })); assert.equal(bundle.artifacts.length, 2); assert.equal(bundle.acceptance.listeningPass, false);
  const raw = execFileSync(process.execPath, ['scripts/audio-comic.mjs', '--stop-after-submit'], { cwd, encoding: 'utf8' }); const restored = await restoreLedger(raw, exampleManifest()); assert.equal(restored.jobs[0].status, 'submitted'); assert.equal(restored.jobs[0].attempts, 1);
  for (const args of [['--unknown'], ['--resume'], ['--manifest', 'does-not-exist.json']]) { const result = spawnSync(process.execPath, ['scripts/audio-comic.mjs', ...args], { cwd, encoding: 'utf8' }); assert.equal(result.status, 1); assert.match(result.stderr, /blocked/); }
});
test('comic browser entry retains CSP, uses local modules, and has no network transport', () => {
  const html = readFileSync(new URL('../docs/audio-comic.html', import.meta.url), 'utf8'); assert.match(html, /connect-src 'none'/); assert.match(html, /comic-listening/);
  for (const [, path] of html.matchAll(/(?:src|href)="((?:src)\/[^\"]+|styles\.css)"/g)) assert.ok(readFileSync(new URL(`../docs/${path}`, import.meta.url)).length);
  for (const path of ['docs/src/audio-comic.js', 'docs/src/audio-comic-app.js', 'scripts/audio-comic.mjs']) assert.doesNotMatch(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'), /\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\s*\(/);
});
