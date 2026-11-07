// SPDX-License-Identifier: Apache-2.0
// Shared browser/CLI contract. Only deterministic, zero-cost mock adapters ship.
const copy = value => structuredClone(value);
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const nonempty = value => typeof value === 'string' && value.trim().length > 0;
const singleLine = value => nonempty(value) && !/[\u0000-\u001f\u007f]/.test(value);
const integer = value => Number.isSafeInteger(value) && value >= 0;
const digest = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const id = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const canonical = value => {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  return JSON.stringify(value);
};
export async function sha256(bytes) {
  requireThat(bytes instanceof Uint8Array, 'Expected bytes');
  return Array.from(new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
const hash = value => sha256(new TextEncoder().encode(canonical(value)));
const fixtureRights = () => ({ source: 'Original fictional repository fixture', license: 'Apache-2.0', permission: 'repository-original', attribution: 'C. Geesaurus contributors', exportAllowed: true });

export function exampleManifest() {
  return {
    schema: 1, id: 'paperboat-comic', revision: 1, mode: 'mock', title: '纸船问路 · 虚构漫画',
    inputs: [{ id: 'story-1', kind: 'original-storyboard', description: 'Two original fictional panels; no private story or recording.', rights: fixtureRights() }],
    pages: [
      { id: 'page-1', order: 1, inputId: 'story-1', composition: 'fixture-svg', asset: 'assets/river-wide.svg', sha256: 'b3df1ddf987f43dc4a9ae26645ab119e7fe6cbea7b309f37e40134f97c5db353', durationMs: 4000, rights: fixtureRights() },
      { id: 'page-2', order: 2, inputId: 'story-1', composition: 'fixture-svg', asset: 'assets/river-side.svg', sha256: '6c35fa6e5a57c00462e91f9c99d68ba0c68397cc0fc04ee37af984f584a26967', durationMs: 4000, rights: fixtureRights() },
    ],
    voices: [
      { id: 'boat', version: 1, speaker: '小纸船', language: 'zh-CN', description: '明亮、清晰的通用成年声，中音，温和；不模仿真人。', source: { kind: 'text-design', model: 'mock-tts-v1', voiceId: 'fixture-boat-v1', referenceRecording: null, rights: fixtureRights() } },
      { id: 'narrator', version: 1, speaker: '旁白', language: 'zh-CN', description: '沉稳、舒缓的通用成年声，清楚咬字；不模仿真人。', source: { kind: 'text-design', model: 'mock-tts-v1', voiceId: 'fixture-narrator-v1', referenceRecording: null, rights: fixtureRights() } },
    ],
    lines: [
      { id: 'D01', pageId: 'page-1', voiceId: 'boat', speaker: '小纸船', text: '河的那一边，会有什么呢？', startMs: 300, endMs: 3300, direction: { emotion: 'curious', intensity: 0.4, rate: 0.95, pauseAfterMs: 300, instruction: '轻轻提问，句末上扬；保留角色声线。' } },
      { id: 'D02', pageId: 'page-2', voiceId: 'narrator', speaker: '旁白', text: '风一吹，纸船离开了岸边。', startMs: 200, endMs: 3400, direction: { emotion: 'gentle', intensity: 0.2, rate: 0.9, pauseAfterMs: 300, instruction: '平稳叙述，在逗号后稍停。' } },
    ],
    tts: { adapter: 'mock-tts-v1' }, vc: { enabled: false, adapter: 'mock-vc-v1' },
    budget: { currency: 'USD', maxCashMicros: 0, maxUnits: 1000, maxAttempts: 2 },
    subtitles: { format: 'srt', language: 'zh-CN', timing: 'planned-not-aligned', rights: fixtureRights() },
    music: null,
    export: { target: 'review-package', width: 1280, height: 720, fps: 24, syntheticDisclosure: true },
  };
}

function rights(value, label) {
  requireThat(value && ['source', 'license', 'permission', 'attribution'].every(key => nonempty(value[key])) && value.exportAllowed === true, `${label}: source, license, permission, attribution and export rights required`);
}
function unique(items, label) {
  requireThat(Array.isArray(items) && items.length > 0 && items.length <= 1000, `${label}: nonempty bounded list required`);
  requireThat(items.every(item => item && id(item.id)) && new Set(items.map(item => item.id)).size === items.length, `${label}: unique safe IDs required`);
}
export function validateManifest(manifest) {
  const m = manifest;
  requireThat(m && m.schema === 1 && id(m.id) && integer(m.revision) && m.revision > 0 && m.mode === 'mock' && nonempty(m.title), 'Unsupported manifest; mock mode required');
  unique(m.inputs, 'inputs'); unique(m.pages, 'pages'); unique(m.voices, 'voices'); unique(m.lines, 'lines');
  requireThat(new Set(m.voices.map(voice => voice.speaker)).size === m.voices.length, 'Each speaker must have one pinned voice profile');
  for (const input of m.inputs) { requireThat(nonempty(input.kind) && nonempty(input.description), 'Input provenance required'); rights(input.rights, 'input'); }
  for (const [index, page] of m.pages.entries()) {
    requireThat(page.order === index + 1 && m.inputs.some(input => input.id === page.inputId), 'Explicit contiguous page order and known input required');
    requireThat(page.composition === 'fixture-svg' && typeof page.asset === 'string' && /^assets\/[a-zA-Z0-9_-]+\.svg$/.test(page.asset) && digest(page.sha256), 'Pinned local fixture page required');
    requireThat(integer(page.durationMs) && page.durationMs > 0 && page.durationMs <= 600000, 'Invalid page duration'); rights(page.rights, 'page');
  }
  for (const voice of m.voices) {
    requireThat(integer(voice.version) && voice.version > 0 && singleLine(voice.speaker) && nonempty(voice.language) && nonempty(voice.description), 'Versioned voice profile required');
    requireThat(voice.source?.kind === 'text-design' && nonempty(voice.source.model) && nonempty(voice.source.voiceId) && voice.source.referenceRecording === null, 'This mock implementation accepts text-designed profiles only; no recordings');
    rights(voice.source.rights, 'voice');
  }
  let previousEnd = 0;
  const offsets = new Map(); let offset = 0;
  for (const page of m.pages) { offsets.set(page.id, offset); offset += page.durationMs; }
  for (const line of m.lines) {
    const page = m.pages.find(item => item.id === line.pageId), voice = m.voices.find(item => item.id === line.voiceId);
    requireThat(page && voice && voice.speaker === line.speaker && singleLine(line.text) && line.text.length <= 10000, 'Known page, speaker/profile match and single-line text required');
    const d = line.direction;
    requireThat(d && nonempty(d.emotion) && nonempty(d.instruction) && Number.isFinite(d.intensity) && d.intensity >= 0 && d.intensity <= 1 && Number.isFinite(d.rate) && d.rate >= 0.5 && d.rate <= 2 && integer(d.pauseAfterMs), 'Invalid emotional or rhythm direction');
    requireThat(integer(line.startMs) && integer(line.endMs) && line.endMs > line.startMs && line.endMs + d.pauseAfterMs <= page.durationMs && offsets.get(page.id) + line.startMs >= previousEnd, 'Line order, timing or pause exceeds page boundaries');
    previousEnd = offsets.get(page.id) + line.endMs + d.pauseAfterMs;
  }
  requireThat(m.tts?.adapter === 'mock-tts-v1' && typeof m.vc?.enabled === 'boolean' && m.vc.adapter === 'mock-vc-v1', 'Only independent mock TTS and optional mock VC adapters are enabled');
  const b = m.budget;
  requireThat(b?.currency === 'USD' && b.maxCashMicros === 0 && integer(b.maxUnits) && b.maxUnits > 0 && integer(b.maxAttempts) && b.maxAttempts > 0 && b.maxAttempts <= 3, 'Zero cash budget and bounded units/attempts required');
  requireThat(m.subtitles?.format === 'srt' && nonempty(m.subtitles.language) && m.subtitles.timing === 'planned-not-aligned', 'Planned SRT timing required'); rights(m.subtitles.rights, 'subtitles');
  requireThat(m.music === null || (m.music && id(m.music.id) && digest(m.music.sha256) && nonempty(m.music.source) && m.music.syncAllowed === true && m.music.adaptationAllowed === true && Number.isFinite(m.music.gainDb) && m.music.gainDb <= 0), 'Music requires pinned source, sync/adaptation rights and gain');
  if (m.music) rights(m.music.rights, 'music');
  requireThat(m.export?.target === 'review-package' && integer(m.export.width) && m.export.width > 0 && integer(m.export.height) && m.export.height > 0 && integer(m.export.fps) && m.export.fps > 0 && m.export.syntheticDisclosure === true, 'Review export settings and synthetic disclosure required');
  return copy(m);
}

export async function createLedger(manifest) {
  const m = validateManifest(manifest);
  return { schema: 1, mode: 'mock', manifestSha256: await hash(m), manifest: m, reservedUnits: 0, cashMicros: 0, jobs: [], reviews: [] };
}
async function requestFor(state, lineId, stage) {
  requireThat(await hash(validateManifest(state.manifest)) === state.manifestSha256, 'Locked manifest changed; create a new revision ledger');
  requireThat(['tts', 'vc'].includes(stage), 'Unknown stage');
  const line = state.manifest.lines.find(item => item.id === lineId);
  requireThat(line, 'Unknown line');
  const voice = state.manifest.voices.find(item => item.id === line.voiceId);
  let input = null;
  if (stage === 'vc') {
    requireThat(state.manifest.vc.enabled, 'VC is disabled');
    const tts = state.jobs.find(job => job.request.line.id === lineId && job.request.stage === 'tts');
    requireThat(tts?.status === 'complete', 'VC requires completed TTS; original remains separate');
    input = { requestId: tts.request.id, sha256: tts.artifact.sha256 };
  }
  const payload = { mode: 'mock', manifestSha256: state.manifestSha256, stage, adapter: stage === 'tts' ? state.manifest.tts.adapter : state.manifest.vc.adapter, line, voice, input };
  return { ...copy(payload), id: await hash(payload) };
}
export async function reserveJob(state, lineId, stage = 'tts', quote = { cashMicros: 0 }) {
  const request = await requestFor(state, lineId, stage);
  if (state.jobs.some(job => job.request.id === request.id)) return state;
  requireThat(quote.cashMicros === 0 && state.cashMicros === 0, 'Nonzero or unknown cost blocked; no credit spending');
  const units = request.line.text.length;
  requireThat(state.reservedUnits + units <= state.manifest.budget.maxUnits, 'Unit budget exhausted');
  const next = copy(state); next.reservedUnits += units;
  next.jobs.push({ request, units, attempts: 1, status: 'reserved', acceptance: null, artifact: null, failure: null });
  return next;
}
function updateJob(state, requestId, change) {
  const next = copy(state), job = next.jobs.find(item => item.request.id === requestId);
  requireThat(job, 'Unknown request'); change(job); return next;
}
export function markSubmitted(state, requestId) {
  return updateJob(state, requestId, job => {
    requireThat(job.status === 'reserved', 'Persisted request cannot be resubmitted');
    job.status = 'submitted'; // Persist THIS state before invoking any adapter.
  });
}
export function recordFailure(state, requestId, certainty) {
  return updateJob(state, requestId, job => {
    requireThat(job.status === 'submitted' && ['not-accepted', 'unknown'].includes(certainty), 'Failure applies only before acceptance');
    job.status = certainty === 'not-accepted' ? 'failed' : 'uncertain'; job.failure = certainty;
  });
}
export function retryJob(state, requestId) {
  const next = updateJob(state, requestId, job => {
    requireThat(job.status === 'failed' && job.failure === 'not-accepted', 'Uncertain or accepted requests must be inspected, never retried');
    requireThat(job.attempts < state.manifest.budget.maxAttempts && state.reservedUnits + job.units <= state.manifest.budget.maxUnits, 'Retry budget exhausted');
    job.attempts++; job.status = 'reserved'; job.failure = null;
  });
  next.reservedUnits += next.jobs.find(job => job.request.id === requestId).units;
  return next;
}
const acceptanceFor = request => ({ mode: 'mock', requestId: request.id, adapter: request.adapter, stage: request.stage, providerRequestId: `fixture-${request.id}` });
export function recordAcceptance(state, requestId, receipt) {
  return updateJob(state, requestId, job => {
    requireThat(['submitted', 'uncertain', 'accepted'].includes(job.status) && canonical(receipt) === canonical(acceptanceFor(job.request)), 'Mismatched or premature acceptance receipt');
    job.acceptance = copy(receipt); job.status = 'accepted'; job.failure = null;
  });
}
async function artifactFor(request) {
  // JSON bytes prove integrity of a fixture. They are deliberately NOT audio.
  const bytes = new TextEncoder().encode(canonical({ mock: true, requestId: request.id, stage: request.stage, message: 'No speech synthesized; no listening performed.' }));
  return { mode: 'mock', requestId: request.id, adapter: request.adapter, providerRequestId: `fixture-${request.id}`, stage: request.stage, mediaType: 'application/json', byteLength: bytes.length, sha256: await sha256(bytes), bytes: Array.from(bytes), synthesized: false };
}
export function mockAdapter(stage = 'tts') {
  requireThat(['tts', 'vc'].includes(stage), 'Unknown adapter stage');
  const check = request => requireThat(request.stage === stage && request.mode === 'mock' && request.adapter === `mock-${stage}-v1`, 'Adapter/request mismatch');
  return Object.freeze({
    id: `mock-${stage}-v1`, mode: 'mock', stage,
    async submit(request) { check(request); return acceptanceFor(request); },
    async inspect(request) { check(request); return acceptanceFor(request); },
    async fetchBytes(request) { check(request); return artifactFor(request); },
  });
}
export async function recordArtifact(state, requestId, artifact) {
  const job = state.jobs.find(item => item.request.id === requestId);
  requireThat(job?.status === 'accepted', 'Accepted source receipt required before bytes');
  requireThat(canonical(artifact) === canonical(await artifactFor(job.request)), 'Output bytes, SHA, media type or source receipt mismatch');
  return updateJob(state, requestId, item => { item.artifact = copy(artifact); item.status = 'complete'; });
}
export async function verifyPageBytes(manifest, pageId, bytes) {
  const page = validateManifest(manifest).pages.find(item => item.id === pageId);
  requireThat(page && await sha256(bytes) === page.sha256, 'Page bytes do not match manifest'); return true;
}

// Fail closed on damaged checkpoints. Never reset into an empty ledger and resend.
export async function restoreLedger(raw, expectedManifest) {
  const parsed = JSON.parse(raw), fresh = await createLedger(expectedManifest);
  requireThat(parsed?.schema === 1 && parsed.mode === 'mock' && parsed.manifestSha256 === fresh.manifestSha256 && canonical(parsed.manifest) === canonical(fresh.manifest), 'Checkpoint manifest mismatch');
  requireThat(Array.isArray(parsed.jobs) && parsed.jobs.length <= fresh.manifest.lines.length * 2 && Array.isArray(parsed.reviews), 'Invalid checkpoint');
  let state = fresh;
  for (const stored of parsed.jobs) {
    const request = await requestFor(state, stored.request?.line?.id, stored.request?.stage);
    requireThat(canonical(stored.request) === canonical(request) && !state.jobs.some(job => job.request.id === request.id), 'Checkpoint request mismatch or duplicate');
    requireThat(integer(stored.attempts) && stored.attempts >= 1 && stored.attempts <= state.manifest.budget.maxAttempts && stored.units === request.line.text.length, 'Invalid attempts or units');
    // Rebuild each attempt through legal transitions; conservatively retain reservations.
    state = await reserveJob(state, request.line.id, request.stage);
    for (let n = 1; n < stored.attempts; n++) { state = markSubmitted(state, request.id); state = recordFailure(state, request.id, 'not-accepted'); state = retryJob(state, request.id); }
    if (stored.status !== 'reserved') state = markSubmitted(state, request.id);
    if (['failed', 'uncertain'].includes(stored.status)) state = recordFailure(state, request.id, stored.status === 'failed' ? 'not-accepted' : 'unknown');
    if (['accepted', 'complete'].includes(stored.status)) state = recordAcceptance(state, request.id, stored.acceptance);
    if (stored.status === 'complete') state = await recordArtifact(state, request.id, stored.artifact);
    requireThat(canonical(state.jobs.at(-1)) === canonical(stored), 'Damaged checkpoint job');
  }
  requireThat(state.reservedUnits === parsed.reservedUnits && parsed.cashMicros === 0 && parsed.reviews.length === 0, 'Damaged budget or unsupported mock listening claim');
  return state;
}

export function listeningChecklist(state) {
  return state.jobs.filter(job => job.status === 'complete').map(job => ({
    requestId: job.request.id, artifactSha256: job.artifact.sha256, lineId: job.request.line.id, stage: job.request.stage,
    status: 'not-performed', reviewer: null, listenedAt: null, fullClipListened: false,
    pronunciation: 'pending', speakerConsistency: 'pending', emotionAndPacing: 'pending', clippingAndNoise: 'pending', subtitleSync: 'pending', musicBalance: 'pending', notes: '',
    aids: { asr: 'not-run', waveform: 'not-run', replacesListening: false },
  }));
}
const timestamp = ms => { const h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60; return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')},${String(ms % 1000).padStart(3,'0')}`; };
export function subtitles(manifest) {
  const m = validateManifest(manifest); let offset = 0; const offsets = new Map();
  for (const page of m.pages) { offsets.set(page.id, offset); offset += page.durationMs; }
  // Escape markup to keep spoken text literal in SRT renderers.
  const literal = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  return m.lines.map((line, index) => `${index + 1}\n${timestamp(offsets.get(line.pageId) + line.startMs)} --> ${timestamp(offsets.get(line.pageId) + line.endMs)}\n${literal(line.speaker)}：${literal(line.text)}\n`).join('\n');
}
export async function exportReviewPackage(state) {
  state = await restoreLedger(JSON.stringify(state), state.manifest);
  const expected = state.manifest.lines.length * (state.manifest.vc.enabled ? 2 : 1);
  const complete = state.jobs.filter(job => job.status === 'complete').length;
  return {
    schema: 1, project: 'C. Geesaurus', mode: 'mock', manifest: copy(state.manifest), manifestSha256: state.manifestSha256,
    ledger: copy(state), artifacts: state.jobs.filter(job => job.artifact).map(job => copy(job.artifact)),
    subtitles: { mediaType: 'application/x-subrip', timing: 'planned-not-aligned', text: subtitles(state.manifest) },
    listening: listeningChecklist(state),
    acceptance: { productionReady: false, realSynthesis: false, listeningPass: false, completeMockContracts: complete === expected, blockers: ['mock JSON bytes are not audio', 'human full-clip listening not performed', 'subtitle alignment and music mix not rendered', ...(complete === expected ? [] : ['mock jobs incomplete'])] },
    render: { implemented: false, audio: null, video: null, musicIncluded: false, settings: copy(state.manifest.export) },
  };
}
