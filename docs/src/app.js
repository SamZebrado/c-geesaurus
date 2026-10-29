// SPDX-License-Identifier: Apache-2.0
import { STORAGE_KEY, DRAFT, SUGGESTIONS, BACKENDS, MODULES, initialState, candidate, decide, unresolved, approve, effectiveBackend, capabilityIssues, setConfig, startTask, advanceTask, recoverTask, markDownload, exportBundle, restoreState } from './core.js';
const $ = selector => document.querySelector(selector);
const escapeHTML = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let storageAvailable = true;
let state;
try { state = restoreState(localStorage.getItem(STORAGE_KEY)); } catch { state = initialState(); storageAvailable = false; }
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 4500); }
function save(next) {
  state = next;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch { storageAvailable = false; toast('浏览器不允许保存；本次仍可体验，刷新后进度可能丢失。'); }
  render();
}
function dialogue(line, changed = false) { return `<div class="dialogue${changed ? ' changed' : ''}"><div class="speaker">${escapeHTML(line.id)} · ${escapeHTML(line.speaker)}</div><blockquote>“${escapeHTML(line.text)}”</blockquote></div>`; }
const viewNames = { workspace: '创作工作台', assets: '资产参考库', models: '模型与服务', tasks: '任务与质检' };
function route() {
  const hash = location.hash.slice(1) || 'workspace';
  const view = hash === 'writing' ? 'workspace' : (viewNames[hash] ? hash : 'workspace');
  document.querySelectorAll('.view').forEach(section => { section.hidden = section.id !== view; });
  document.querySelectorAll('[data-nav]').forEach(link => { link.classList.toggle('active', link.dataset.nav === view); if (link.dataset.nav === view) link.setAttribute('aria-current','page'); else link.removeAttribute('aria-current'); });
  $('#page-title').textContent = viewNames[view];
  if (hash === 'writing') requestAnimationFrame(() => $('#writing').scrollIntoView({ block: 'start' }));
}
function renderWriting() {
  $('#draft-lines').innerHTML = DRAFT.map(line => dialogue(line)).join('');
  $('#suggestions').innerHTML = SUGGESTIONS.map(item => `<div class="suggestion"><h4>${escapeHTML(item.title)}</h4><p>${escapeHTML(item.reason)}</p><div class="suggested-text">${escapeHTML(item.speaker)}：“${escapeHTML(item.after)}”</div><div class="decision-buttons"><button class="choice ${state.decisions[item.id] === 'accept' ? 'selected' : ''}" data-decision="accept" data-id="${item.id}" aria-pressed="${state.decisions[item.id] === 'accept'}" aria-label="采纳建议 ${item.id}" ${state.task ? 'disabled' : ''}>✓ 采纳</button><button class="choice reject ${state.decisions[item.id] === 'reject' ? 'selected' : ''}" data-decision="reject" data-id="${item.id}" aria-pressed="${state.decisions[item.id] === 'reject'}" aria-label="拒绝建议 ${item.id}" ${state.task ? 'disabled' : ''}>× 拒绝</button></div></div>`).join('');
  const lines = candidate(state);
  $('#final-lines').innerHTML = lines.map(line => dialogue(line, DRAFT.find(original => original.id === line.id).text !== line.text)).join('');
  $('#revision').textContent = `v${state.revision}`;
  $('#final-status').textContent = state.approved ? `✓ 演示 v${state.revision} 已确认；镜头对白逐条匹配。` : unresolved(state) ? `还有 ${unresolved(state)} 条建议待你取舍。` : '取舍完成。检查说话者与对白，再确认这版。';
  $('#final-status').classList.toggle('warning', !state.approved && !unresolved(state));
  $('#approve-script').disabled = !!(unresolved(state) || state.approved || state.task);
  $('#approve-script').textContent = state.approved ? '✓ 已确认演示版本' : '确认这版演示剧本 ✓';
  $('#shot-version').textContent = state.approved ? `✓ 剧本 v${state.revision} · 对白 2 / 2 匹配` : `候选 v${state.revision} · 等待确认`;
  $('#shot-list').innerHTML = lines.map((line, index) => `<article class="shot-card"><div class="shot-visual"><img src="assets/river-${index ? 'side' : 'wide'}.svg" alt="SHOT-0${index + 1} 人工绘制参考示意，真实首态图尚未生成"><span>SHOT-0${index + 1}</span><small>参考示意 · 真实首态图未生成</small></div><div class="shot-copy"><div class="shot-heading"><h3>${index ? '顺着风，慢慢出发' : '出发前的一点好奇'}</h3><span>0${index * 4}—0${index * 4 + 4}s · ${index ? '侧面近景' : '固定广角'}</span></div><div class="shot-row"><span>分镜动作</span><p>${index ? '纸船从画面左侧缓缓漂向右侧。镜头不追赶，留住水纹和微风。' : '晨光落在河岸。纸船轻轻摇晃，停留片刻，船尖朝向河对岸。'}</p></div><div class="shot-row"><span>对白 ${line.id}</span><p class="shot-dialogue"><strong>${escapeHTML(line.speaker)}</strong> · “${escapeHTML(line.text)}”</p></div><div class="shot-refs"><span>river-bank@1 · ${index ? 'side' : 'wide'}</span><span>paper-boat@1</span><span>script@${state.revision}</span><span>${state.approved ? '本地已确认' : '未确认'}</span></div></div></article>`).join('');
}
function renderModels() {
  $('#default-backend').value = state.config.defaultBackend;
  $('#image-provider').value = state.config.image;
  $('#video-provider').value = state.config.video;
  $('#module-config').innerHTML = MODULES.map(module => `<div class="module-row"><label for="module-${module.id}">${module.label}<small>${module.needs.toUpperCase()}</small></label><div><select id="module-${module.id}" data-config="${module.id}" ${state.task ? 'disabled' : ''}><option value="">继承统一默认</option>${Object.entries(BACKENDS).map(([id, backend]) => `<option value="${id}" ${state.config.overrides[module.id] === id ? 'selected' : ''}>${backend.label}</option>`).join('')}</select><small>mock://agent · ${BACKENDS[effectiveBackend(state, module.id)].label}</small></div></div>`).join('');
  document.querySelectorAll('[data-config]').forEach(select => { select.disabled = !!state.task; });
  const issues = capabilityIssues(state);
  $('#capability-status').textContent = issues.length ? `能力缺口：${issues.map(module => `${module.label} 需要 ${module.needs}`).join('；')}。请为这些模块覆盖 Mock Balanced，或恢复统一默认。不会静默降级。` : '✓ 模拟能力表校验通过。Agent backend 与图片 / 视频 provider 独立配置，互不覆盖。';
  $('#capability-status').classList.toggle('warning', !!issues.length);
  $('#pipeline').innerHTML = MODULES.map((module, index) => `${index ? '<span class="pipeline-arrow" aria-hidden="true">→</span>' : ''}<div class="pipeline-node"><b>${module.label}</b><small>API: mock://agent<br>Model: ${BACKENDS[effectiveBackend(state, module.id)].label}<br>${state.config.overrides[module.id] ? '模块覆盖' : '继承默认'} · credential ref only</small></div>`).join('');
}
const statusNames = { submitted: '已发出 · 未核实接受', confirmation: '等待内容确认', accepted: '已接受 · 模拟回执', waiting: '等待 · 虚构 ETA', ready: '结果待核对', downloaded: '演示记录已准备' };
function renderTask() {
  const task = state.task;
  const blocked = !state.approved || capabilityIssues(state).length;
  $('#start-task').disabled = !!(task || blocked);
  $('#task-gate').textContent = task ? `任务锁定剧本 v${task.scriptRevision} 和场景 v${task.sceneVersion}。刷新或重复点击都不会新增提交。` : !state.approved ? '先去创作工作台：逐条采纳 / 拒绝建议，再确认演示剧本。' : capabilityIssues(state).length ? '模型配置存在能力缺口；请先在模型与服务中修正。' : '演示准备就绪。开始只会创建一个浏览器本地模拟任务，不会发送请求。';
  $('#task-gate').classList.toggle('warning', !!blocked && !task);
  $('#task-status').textContent = task ? statusNames[task.status] : '待开始';
  $('#task-identity').textContent = task ? `${task.id} · ${task.route === 'mock-web' ? 'Mock Web Skill' : 'Mock API · 复用网页 fixture'}` : '尚未提交 · No real generation';
  const steps = ['submitted', 'confirmation', 'accepted', 'waiting', 'ready', 'downloaded'];
  const labels = ['发出', '确认', '接受', '等待', '核对', '记录'];
  $('#task-progress').innerHTML = steps.map((step, index) => `<span class="${task && index <= steps.indexOf(task.status) ? 'done' : ''}">${labels[index]}</span>`).join('');
  const observations = {
    submitted: ['↗', '发出了，不等于已接受。', '模拟提交计数为 1。先观察同一请求，不因回执缺失就重新提交。'],
    confirmation: ['?', '“是否按这个剧本继续？”', `示例页面要求确认。解释器已核对 demo-paperboat-001 / 剧本 v${state.revision}，下一步只确认一次。`],
    accepted: ['✓', '找到绑定此请求的接受回执。', '这才进入“已接受”状态。原始回执与解释分开记录。'],
    waiting: ['◷', '“预计需要约 2 分钟。”', '这是虚构页面里的 ETA；不启动真实计时。点击下方按钮模拟下一次观察，不会新建请求。'],
  };
  if (!task) $('#observation').innerHTML = '<span class="observation-icon">◌</span><h4>等你的故事准备好。</h4><p>这里将呈现人工构造的页面观察，而不是实时网站。</p>';
  else if (['ready', 'downloaded'].includes(task.status)) $('#observation').innerHTML = `<h4>两张卡片，只取有来源的那一张。</h4><p>绑定当前请求的结果可下载为 JSON 记录；不是视频文件。</p><div class="result-grid"><div class="result-item invalid"><strong>result-other-002</strong><p>请求不匹配 · 不下载</p><button disabled class="button secondary">来源不符</button></div><div class="result-item"><strong>result-paperboat-001</strong><p>demo-paperboat-001 ✓</p><button id="download-record" class="button primary">${task.downloaded ? '再次下载 JSON ↓' : '下载演示 JSON ↓'}</button></div></div>`;
  else { const observation = observations[task.status]; $('#observation').innerHTML = `<span class="observation-icon">${observation[0]}</span><h4>${observation[1]}</h4><p>${observation[2]}</p>`; }
  $('#advance-task').disabled = !task || ['ready', 'downloaded'].includes(task.status);
  $('#advance-task').textContent = task?.status === 'confirmation' ? '模拟确认这版剧本 ✓' : '推进一次模拟观察 →';
  $('#recover-task').disabled = !task;
  $('#submit-count').textContent = task?.submissions || 0;
  $('#confirm-count').textContent = task?.confirmations || 0;
  $('#observe-count').textContent = task?.observations || 0;
  $('#evidence-list').innerHTML = task ? task.evidence.map((item, index) => `<li><strong>${String(index + 1).padStart(2,'0')} · ${escapeHTML(item.kind)}</strong><br>${escapeHTML(item.text)}</li>`).join('') : '<li>还没有任务。所有后续证据都是带有 Mock 标记的人工 fixture。</li>';
}
function renderGuide() {
  const steps = [ ['writing', '01 · 写作与取舍', '采纳 S01，拒绝错误的 S02。', unresolved(state) === 0], ['workspace', '02 · 确认与审阅', '确认定稿，检查两张镜头卡。', state.approved], ['tasks', '03 · 观察模拟任务', '推进观察，试试刷新不重发。', ['ready','downloaded'].includes(state.task?.status)], ['tasks', '04 · 下载演示记录', '保存 JSON；不是真实视频。', state.task?.downloaded] ];
  $('#guide-steps').innerHTML = steps.map(([href,title,note,done]) => `<a href="#${href}" class="guide-step ${done ? 'done' : ''}"><b>${done ? '✓ ' : ''}${title}</b><small>${note}</small></a>`).join('');
}
function render() {
  renderWriting(); renderModels(); renderTask(); renderGuide();
  $('#storage-warning').hidden = storageAvailable;
  $('#new-scene-version').disabled = state.sceneVersion === 2;
  $('#scene-status').textContent = state.sceneVersion === 2 ? '已模拟创建 v2（黄昏光线，仅元数据）。两个镜头仍锁定 v1；没有偷偷替换参考图。' : '当前资产版本 v1（日光）。可以模拟创建 v2，观察镜头引用保持不变。';
  $('#repair-plan').hidden = !state.repairOpen;
  $('#repair-preview').setAttribute('aria-expanded', String(state.repairOpen));
  $('#repair-preview').textContent = state.repairOpen ? '收起修补计划 −' : '查看局部修补计划 ＋';
}
function downloadRecord() {
  const next = markDownload(state, 'result-paperboat-001');
  if (!next.task?.downloaded) return;
  save(next);
  const blob = new Blob([JSON.stringify(exportBundle(state), null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'c-geesaurus-mock-record.json'; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast('已准备本地 JSON 下载。里面只有虚构演示记录，没有真实生成视频。');
}
document.addEventListener('click', event => {
  const choice = event.target.closest('[data-decision]');
  if (choice) { const focusKey = [choice.dataset.id,choice.dataset.decision]; save(decide(state, ...focusKey)); document.querySelector(`[data-id="${focusKey[0]}"][data-decision="${focusKey[1]}"]`)?.focus(); }
  if (event.target.closest('#download-record')) downloadRecord();
});
document.addEventListener('change', event => {
  if (event.target.matches('[data-config]')) { const id = event.target.id; save(setConfig(state, event.target.dataset.config, event.target.value)); document.getElementById(id)?.focus(); }
});
$('#approve-script').addEventListener('click', () => { save(approve(state)); toast('演示剧本已确认。镜头对白与当前版本逐条对应。'); });
$('#start-task').addEventListener('click', () => { save(startTask(state)); toast('创建了一个本地模拟任务。真实 API 调用数：0。'); });
$('#advance-task').addEventListener('click', () => save(advanceTask(state)));
$('#recover-task').addEventListener('click', () => { save(recoverTask(state)); toast('已模拟重读同一请求。提交计数仍然是 1。'); });
$('#new-scene-version').addEventListener('click', () => save({ ...state, sceneVersion: 2 }));
$('#repair-preview').addEventListener('click', () => save({ ...state, repairOpen: !state.repairOpen }));
$('#reset-demo').addEventListener('click', () => $('#reset-dialog').showModal());
$('#cancel-reset').addEventListener('click', () => $('#reset-dialog').close());
$('#confirm-reset').addEventListener('click', () => { $('#reset-dialog').close(); save(initialState()); location.hash = 'workspace'; toast('已重置本地演示。下载过的文件不受影响。'); });
window.addEventListener('hashchange', route);
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { state = restoreState(event.newValue); render(); toast('已同步同一浏览器其他标签页的演示进度。'); } });
render(); route();
if (!storageAvailable) toast('本地存储不可用；仍可体验，刷新后进度可能丢失。');
