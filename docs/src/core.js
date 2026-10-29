// SPDX-License-Identifier: Apache-2.0
// Fictional fixtures only. No provider, browser automation, or model is connected.
export const STORAGE_KEY = 'c-geesaurus-demo-v1';
export const DRAFT = [
  { id: 'D01', speaker: '小纸船', text: '我将勇敢地踏上这段充满无限可能的旅程。' },
  { id: 'D02', speaker: '旁白', text: '风一吹，纸船离开了岸边。' },
];
export const SUGGESTIONS = [
  { id: 'S01', line: 'D01', title: '少一点宣言，多一点好奇', source: '独立建议 · Mock Critic', reason: '用一个小小的愿望代替抽象的宣言，让对白更像角色自己会说的话。', before: DRAFT[0].text, after: '河的那一边，会有什么呢？', speaker: '小纸船', caution: false },
  { id: 'S02', line: 'D02', title: '这条建议值得拒绝', source: '独立建议 · Mock Critic', reason: '故意放入的错误建议：把旁白改成角色自述，会改变已定义的说话者。建议模型并不总是对的。', before: DRAFT[1].text, after: '风一吹，我就离开了岸边。', speaker: '小纸船', caution: true },
];
export const BACKENDS = {
  'mock-balanced': { label: 'Mock Balanced', capabilities: ['text', 'vision', 'tools'] },
  'mock-text': { label: 'Mock Text Only', capabilities: ['text'] },
};
export const MODULES = [
  { id: 'draft', label: '初稿', needs: 'text' },
  { id: 'critic', label: '独立建议', needs: 'text' },
  { id: 'final', label: '取舍定稿', needs: 'text' },
  { id: 'storyboard', label: '分镜', needs: 'text' },
  { id: 'page', label: '页面解释', needs: 'tools' },
  { id: 'vision', label: '视觉质检', needs: 'vision' },
];
export function initialState() {
  return { schema: 1, decisions: { S01: 'pending', S02: 'pending' }, approved: false, revision: 1, config: { defaultBackend: 'mock-balanced', overrides: {}, image: 'mock-image', video: 'mock-web' }, task: null, sceneVersion: 1, repairOpen: false };
}
export function candidate(state) {
  return DRAFT.map(line => {
    const suggestion = SUGGESTIONS.find(item => item.line === line.id && state.decisions[item.id] === 'accept');
    return suggestion ? { ...line, text: suggestion.after, speaker: suggestion.speaker } : { ...line };
  });
}
export function decide(state, id, decision) {
  if (!SUGGESTIONS.some(item => item.id === id) || !['accept', 'reject'].includes(decision)) return state;
  if (state.task) return state; // A bound request cannot silently change its script.
  if (state.decisions[id] === decision) return state;
  return { ...state, decisions: { ...state.decisions, [id]: decision }, approved: false, revision: state.revision + 1 };
}
export function unresolved(state) { return Object.values(state.decisions).filter(value => value === 'pending').length; }
export function approve(state) { return unresolved(state) || state.task ? state : { ...state, approved: true }; }
export function effectiveBackend(state, id) { return state.config.overrides[id] || state.config.defaultBackend; }
export function capabilityIssues(state) {
  return MODULES.filter(module => !BACKENDS[effectiveBackend(state, module.id)].capabilities.includes(module.needs));
}
export function setConfig(state, field, value) {
  if (state.task) return state;
  if (field === 'defaultBackend' && Object.hasOwn(BACKENDS, value)) return { ...state, config: { ...state.config, defaultBackend: value } };
  if (MODULES.some(module => module.id === field) && (value === '' || Object.hasOwn(BACKENDS, value))) return { ...state, config: { ...state.config, overrides: { ...state.config.overrides, [field]: value } } };
  if (field === 'image' && value === 'mock-image' || field === 'video' && ['mock-web', 'mock-api'].includes(value)) return { ...state, config: { ...state.config, [field]: value } };
  return state;
}
export function startTask(state) {
  if (state.task || !state.approved || capabilityIssues(state).length) return state;
  return { ...state, task: { id: 'demo-paperboat-001', scriptRevision: state.revision, sceneVersion: 1, status: 'submitted', submissions: 1, confirmations: 0, observations: 1, downloaded: false, route: state.config.video, lines: candidate(state), evidence: [{ kind: 'submission', text: '本地模拟已发出；尚无接受回执。不能据此声称正在生成。' }] } };
}
const STATUS_FLOW = {
  submitted: { next: 'confirmation', kind: 'observation', text: '示例页面：请确认按剧本继续。请求 ID 与剧本版本相符。' },
  confirmation: { next: 'accepted', kind: 'receipt', text: '已模拟确认一次，收到绑定 demo-paperboat-001 的接受回执。' },
  accepted: { next: 'waiting', kind: 'observation', text: '示例页面：预计约 2 分钟。此为虚构 ETA，不是真实计时，也不是重新提交许可。' },
  waiting: { next: 'ready', kind: 'observation', text: '示例结果有两张卡片；仅 result-paperboat-001 与当前请求匹配。' },
};
export function advanceTask(state) {
  if (!state.task || !STATUS_FLOW[state.task.status]) return state;
  const next = STATUS_FLOW[state.task.status];
  return { ...state, task: { ...state.task, status: next.next, confirmations: state.task.confirmations + (next.next === 'accepted' ? 1 : 0), observations: state.task.observations + 1, evidence: [...state.task.evidence, { kind: next.kind, text: next.text }] } };
}
export function recoverTask(state) {
  if (!state.task) return state;
  return { ...state, task: { ...state.task, observations: state.task.observations + 1, evidence: [...state.task.evidence, { kind: 'recovery', text: '模拟刷新/恢复：重读同一请求记录；没有增加提交或重复确认。' }] } };
}
export function markDownload(state, resultId) {
  if (!state.task || !['ready', 'downloaded'].includes(state.task.status) || resultId !== 'result-paperboat-001') return state;
  if (state.task.downloaded) return state;
  return { ...state, task: { ...state.task, status: 'downloaded', downloaded: true, evidence: [...state.task.evidence, { kind: 'download', text: '已准备与当前请求匹配的本地 JSON 演示记录；不是生成视频。' }] } };
}
export function exportBundle(state) {
  return { project: 'C. Geesaurus', demo: true, fixture: 'Fictional paper boat; no real provider or model call.', script: { revision: state.revision, approvedInDemo: state.approved, lines: candidate(state), decisions: state.decisions }, references: { scene: 'river-bank', version: 1, views: ['wide', 'side'], character: 'paper-boat@1' }, config: state.config, task: state.task, repair: { implemented: false, planOnly: true, region: 'paper boat hull', preserveOriginalAudio: true, reviewRequired: true } };
}
export function restoreState(raw) {
  try {
    const parsed = JSON.parse(raw);
    if (parsed.schema !== 1) return initialState();
    // Rebuild only known fields. Never render arbitrary stored HTML or endpoints.
    let state = initialState();
    for (const suggestion of SUGGESTIONS) if (['accept', 'reject'].includes(parsed.decisions?.[suggestion.id])) state = decide(state, suggestion.id, parsed.decisions[suggestion.id]);
    if (Number.isSafeInteger(parsed.revision) && parsed.revision >= state.revision && parsed.revision < 1000000) state.revision = parsed.revision;
    if (parsed.approved === true) state = approve(state);
    const config = parsed.config || {};
    state = setConfig(state, 'defaultBackend', config.defaultBackend);
    for (const module of MODULES) if (Object.hasOwn(config.overrides || {}, module.id)) state = setConfig(state, module.id, config.overrides[module.id]);
    state = setConfig(state, 'image', config.image);
    state = setConfig(state, 'video', config.video);
    state.sceneVersion = parsed.sceneVersion === 2 ? 2 : 1;
    state.repairOpen = parsed.repairOpen === true;
    if (parsed.task && state.approved && !capabilityIssues(state).length) {
      const validStatuses = ['submitted', 'confirmation', 'accepted', 'waiting', 'ready', 'downloaded'];
      if (validStatuses.includes(parsed.task.status)) {
        state = startTask(state);
        for (let i = 0; i < Math.min(validStatuses.indexOf(parsed.task.status), 4); i++) state = advanceTask(state);
        if (parsed.task.status === 'downloaded') state = markDownload(state, 'result-paperboat-001');
        const baseline = JSON.stringify(state.task.evidence);
        const allowed = [...state.task.evidence, { kind: 'recovery', text: '模拟刷新/恢复：重读同一请求记录；没有增加提交或重复确认。' }];
        if (Array.isArray(parsed.task.evidence) && JSON.stringify(parsed.task.evidence.filter(item => item?.kind !== 'recovery')) === baseline && parsed.task.evidence.length > 0 && parsed.task.evidence.length <= 1000 && parsed.task.evidence.every(item => allowed.some(safe => item?.kind === safe.kind && item?.text === safe.text))) {
          state.task.evidence = parsed.task.evidence.map(({kind, text}) => ({kind, text}));
          state.task.observations = state.task.evidence.filter(item => !['download'].includes(item.kind)).length;
        }
      }
    }
    return state;
  } catch { return initialState(); }
}
