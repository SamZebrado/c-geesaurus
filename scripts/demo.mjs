#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// The CLI and GUI call the same pure, mock-only workflow core.
import { initialState, decide, approve, startTask, advanceTask, recoverTask, markDownload, exportBundle } from '../docs/src/core.js';
const args = new Set(process.argv.slice(2));
if (args.has('--help')) {
  console.log('C. Geesaurus — local mock demo\n\nnode scripts/demo.mjs          Show a workflow summary\nnode scripts/demo.mjs --json   Print the synthetic evidence bundle\n\nNo real model, API, credential access, browser skill, or generated video.\nPreview GUI: npm run dev → http://127.0.0.1:4173');
} else {
  const unknown = [...args].filter(arg => arg !== '--json');
  if (unknown.length) { console.error(`Unknown option: ${unknown.join(', ')}. Use --help.`); process.exitCode = 1; }
  else {
    let state = initialState();
    state = decide(state, 'S01', 'accept'); state = decide(state, 'S02', 'reject'); state = approve(state); state = startTask(state);
    for (let step = 0; step < 4; step++) state = advanceTask(state);
    state = recoverTask(state); state = markDownload(state, 'result-paperboat-001');
    const bundle = exportBundle(state);
    if (args.has('--json')) console.log(JSON.stringify(bundle, null, 2));
    else console.log(`C. Geesaurus — MOCK ONLY\n草稿 → 独立建议 → 取舍定稿 → 分镜 → 模拟任务 → JSON\nScript v${bundle.script.revision}: ${bundle.script.lines.length} lines\nRequest: ${bundle.task.id}\nMock submissions: ${bundle.task.submissions}; confirmations: ${bundle.task.confirmations}\nReal model/API calls: 0\nVideo generation and audio repair: NOT IMPLEMENTED\n\nJSON: node scripts/demo.mjs --json\nGUI: npm run dev → http://127.0.0.1:4173`);
  }
}
