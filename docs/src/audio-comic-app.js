// SPDX-License-Identifier: Apache-2.0
import { exampleManifest, createLedger, reserveJob, markSubmitted, recordAcceptance, recordArtifact, restoreLedger, mockAdapter, exportReviewPackage, subtitles } from './audio-comic.js';
const $ = selector => document.querySelector(selector);
const key = 'c-geesaurus-audio-comic-v1';
let state, busy = false, blocked = false;
const status = message => { $('#comic-status').textContent = message; };
// Use textContent for all manifest-controlled strings.
function render() {
  const pages = $('#comic-pages'); pages.replaceChildren();
  for (const page of state.manifest.pages) {
    const figure = document.createElement('figure'), image = document.createElement('img'), caption = document.createElement('figcaption');
    image.src = page.asset; image.alt = `第 ${page.order} 页 · 原创虚构示意`;
    caption.textContent = `${page.order} · ${page.id} · ${page.durationMs} ms · ${page.composition}`;
    figure.append(image, caption); pages.append(figure);
  }
  const voices = $('#comic-voices'); voices.replaceChildren();
  for (const voice of state.manifest.voices) { const li = document.createElement('li'); li.textContent = `${voice.speaker} · ${voice.id}@${voice.version}：${voice.description}`; voices.append(li); }
  const jobs = $('#comic-jobs'); jobs.replaceChildren();
  for (const job of state.jobs) { const li = document.createElement('li'); li.textContent = `${job.request.line.id} · ${job.request.stage} · ${job.status} · attempts ${job.attempts} · ${job.artifact ? `${job.artifact.byteLength} JSON bytes · SHA ${job.artifact.sha256}` : '尚无输出字节'}`; jobs.append(li); }
  $('#comic-vc').checked = state.manifest.vc.enabled; $('#comic-vc').disabled = busy || blocked || state.jobs.length > 0;
  $('#comic-run').disabled = busy || blocked;
  $('#comic-export').disabled = busy || blocked || !state.jobs.length;
  $('#comic-subtitles').textContent = subtitles(state.manifest);
}
function persist() {
  // If durability fails, stop before the adapter call. Never silently lose identity.
  localStorage.setItem(key, JSON.stringify(state));
}
try {
  const raw = localStorage.getItem(key);
  if (raw) {
    const manifest = exampleManifest(); manifest.vc.enabled = JSON.parse(raw).manifest?.vc?.enabled === true;
    state = await restoreLedger(raw, manifest);
  } else state = await createLedger(exampleManifest());
  status('零现金；仅本地 JSON mock。可以运行或恢复同一任务。');
} catch (error) {
  blocked = true; state = await createLedger(exampleManifest());
  status(`断点或存储不可用，已停止：${error.message}。保留存储中的原记录；使用 CLI 检查，不自动清空或重发。`);
}
render();
$('#comic-vc').addEventListener('change', async () => {
  try { const m = exampleManifest(); m.vc.enabled = $('#comic-vc').checked; state = await createLedger(m); persist(); render(); }
  catch (error) { blocked = true; status(`已停止：${error.message}`); render(); }
});
$('#comic-run').addEventListener('click', async () => {
  if (busy || blocked) return; busy = true; render();
  try {
    if (!navigator.locks) throw new Error('此浏览器缺少并发写入锁，请使用支持 Web Locks 的浏览器或 CLI');
    await navigator.locks.request(key, { ifAvailable: true }, async lock => {
    if (!lock) throw new Error('另一标签页正在运行同一流程，请稍后刷新核对');
    const raw = localStorage.getItem(key);
    if (raw) state = await restoreLedger(raw, state.manifest);
    for (const line of state.manifest.lines) for (const stage of state.manifest.vc.enabled ? ['tts', 'vc'] : ['tts']) {
      if (blocked) throw new Error('并发断点变化，停止当前写入');
      state = await reserveJob(state, line.id, stage); persist();
      let job = state.jobs.find(item => item.request.line.id === line.id && item.request.stage === stage);
      if (job.status === 'complete') continue;
      const adapter = mockAdapter(stage);
      if (job.status === 'reserved') { state = markSubmitted(state, job.request.id); persist(); state = recordAcceptance(state, job.request.id, await adapter.submit(job.request)); }
      else if (['submitted', 'uncertain'].includes(job.status)) state = recordAcceptance(state, job.request.id, await adapter.inspect(job.request));
      else if (job.status === 'failed') throw new Error('已确认失败需要显式重试与剩余预算');
      persist(); job = state.jobs.find(item => item.request.id === job.request.id);
      state = await recordArtifact(state, job.request.id, await adapter.fetchBytes(job.request)); persist();
    }
    status(`离线合同完成；${state.jobs.length} 个 JSON fixture；现金 0；真实合成和实听均未进行。`);
    });
  } catch (error) { blocked = true; status(`已停止并保留断点：${error.message}`); }
  finally { busy = false; render(); }
});
$('#comic-export').addEventListener('click', async () => {
  try {
    const bundle = await exportReviewPackage(state), blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a'); link.href = url; link.download = 'c-geesaurus-audio-comic-mock.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { status(`导出被阻止：${error.message}`); }
});
// One writer per origin: a change in another tab stops this instance before more work.
window.addEventListener('storage', event => { if (event.key === key) { blocked = true; status('另一标签页修改了断点，已停止。刷新后核对同一请求。'); render(); } });
