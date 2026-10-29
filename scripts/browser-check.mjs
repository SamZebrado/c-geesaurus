#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// Optional browser QA: Node 22+, installed Chromium/Chrome. No npm dependencies.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { access, readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve, extname, sep } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
const root = resolve(new URL('../docs', import.meta.url).pathname);
const out = resolve(process.env.QA_OUTPUT || 'test-results');
await mkdir(out, { recursive: true });
const candidates = [process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
let executable;
for (const candidate of candidates) { try { await access(candidate); executable=candidate; break; } catch {} }
if (!executable) throw new Error('Chromium/Chrome is required for browser QA; no browser was installed automatically.');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png' };
const server = createServer(async (request,response) => {
  try {
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    const target=resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
    if (!target.startsWith(root+sep)) { response.writeHead(403).end(); return; }
    response.writeHead(200,{'Content-Type':mime[extname(target)]||'application/octet-stream'});
    response.end(await readFile(target));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const profile=await mkdtemp(join(tmpdir(),'geesaurus-browser-'));
const chrome=spawn(executable,['--headless=new','--no-sandbox','--disable-dev-shm-usage','--disable-background-networking','--disable-extensions','--no-first-run','--no-default-browser-check',`--user-data-dir=${profile}`,'--remote-debugging-port=0','about:blank'],{stdio:['ignore','ignore','pipe']});
let ws, sequence=0;
const pending=new Map(), errors=[], network=[];
try {
  const endpoint=await new Promise((resolve,reject)=>{
    let log=''; const timer=setTimeout(()=>reject(new Error('Chrome debug endpoint did not start.')),20000);
    chrome.stderr.on('data',chunk=>{log+=chunk;const match=log.match(/DevTools listening on (ws:\/\/[^\s]+)/); if(match){clearTimeout(timer);resolve(match[1]);}});
    chrome.on('error',reject); chrome.on('exit',code=>{clearTimeout(timer);reject(new Error(`Chrome exited before connection (${code}). ${log.slice(-1500)}`));});
  });
  const debug=new URL(endpoint);
  const pages=await (await fetch(`http://${debug.host}/json/list`)).json();
  const page=pages.find(page=>page.type==='page');
  assert.ok(page,'Chrome did not expose a test page');
  ws=new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
  ws.addEventListener('message',event=>{
    const message=JSON.parse(event.data);
    if(message.id){const entry=pending.get(message.id);if(entry){clearTimeout(entry.timer);pending.delete(message.id);message.error?entry.reject(new Error(JSON.stringify(message.error))):entry.resolve(message.result);}}
    if(message.method==='Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
    if(message.method==='Network.requestWillBeSent') network.push(message.params.request.url);
  });
  const cdp=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error(`${method} timeout`));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params}));});
  const evaluate=async(expression)=>{const result=await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const waitFor=async(expression)=>{for(let count=0;count<100;count++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error(`Timed out: ${expression}`);};
  const click=async selector=>{await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);};
  const value=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).textContent`);
  const change=async(selector,value)=>evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  const navigate=async path=>{await cdp('Page.navigate',{url:base+path});await waitFor(`document.querySelector('#guide-steps')?.children.length === 4`);};
  const shot=async name=>{const metrics=await cdp('Page.getLayoutMetrics');const height=Math.min(metrics.cssContentSize.height,9000);const {data}=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,clip:{x:0,y:0,width:metrics.cssContentSize.width,height,scale:1}});await writeFile(join(out,name),Buffer.from(data,'base64'));};
  await cdp('Page.enable');await cdp('Runtime.enable');await cdp('Network.enable');
  await cdp('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
  await navigate('/');await waitFor(`Array.from(document.images).every(image=>image.complete)`);await shot('desktop-initial.png');
  assert.equal(await evaluate(`document.querySelector('#approve-script').disabled`),true);
  await click('[data-id="S01"][data-decision="accept"]');await click('[data-id="S02"][data-decision="reject"]');await click('#approve-script');
  assert.match(await value('#shot-version'),/匹配/);
  await click('[data-nav="models"]');await waitFor(`!document.querySelector('#models').hidden`);
  await change('#default-backend','mock-text');assert.match(await value('#capability-status'),/能力缺口/);
  await change('#module-page','mock-balanced');await change('#module-vision','mock-balanced');assert.match(await value('#capability-status'),/校验通过/);await shot('desktop-config.png');
  await click('[data-nav="assets"]');await waitFor(`!document.querySelector('#assets').hidden`);await click('#new-scene-version');assert.match(await value('#scene-status'),/仍锁定 v1/);
  await click('[data-nav="tasks"]');await waitFor(`!document.querySelector('#tasks').hidden`);await click('#start-task');
  for(let count=0;count<3;count++)await click('#advance-task');
  assert.match(await value('#task-status'),/虚构 ETA/);
  await click('#recover-task');await click('#recover-task');const observations=await value('#observe-count');
  await cdp('Page.reload');await waitFor(`document.querySelector('#observe-count')?.textContent === ${JSON.stringify(observations)}`);
  assert.equal(await value('#submit-count'),'1');assert.equal(await value('#confirm-count'),'1');
  await click('#advance-task');assert.equal(await evaluate(`document.querySelector('.result-item.invalid button').disabled`),true);
  await cdp('Browser.setDownloadBehavior',{behavior:'allow',downloadPath:out});await click('#download-record');
  for(let i=0;i<40;i++){try{await access(join(out,'c-geesaurus-mock-record.json'));break;}catch{await new Promise(resolve=>setTimeout(resolve,100));}}
  const download=JSON.parse(await readFile(join(out,'c-geesaurus-mock-record.json'),'utf8'));assert.equal(download.demo,true);assert.equal(download.task.submissions,1);
  await click('#repair-preview');assert.equal(await evaluate(`document.querySelector('#repair-plan').hidden`),false);await shot('desktop-tasks.png');
  await click('#reset-demo');await click('#cancel-reset');assert.equal(await value('#submit-count'),'1');
  await click('#reset-demo');await cdp('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await cdp('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});assert.equal(await evaluate(`document.querySelector('#reset-dialog').open`),false);
  await click('#reset-demo');await click('#confirm-reset');assert.equal(await evaluate(`document.querySelector('#approve-script').disabled`),true);
  await navigate('/#models');await navigate('/#assets');await evaluate('history.back()');await waitFor(`!document.querySelector('#models').hidden`);
  for(const width of [360,390,768,1440]){
    await cdp('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:width<700});
    for(const view of ['workspace','assets','models','tasks']){await navigate('/#'+view);await waitFor(`!document.querySelector('#${view}').hidden`);assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'),true,`Horizontal overflow: ${width} / ${view}`);}
    await navigate('/#workspace');
    if(width<=390)await shot(`mobile-${width}.png`);
    const boxes=await evaluate(`Array.from(document.querySelector('.shot-card').children).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y};})`);
    if(width<=390)assert.ok(boxes[1].y>boxes[0].y+100);
    if(width===1440)assert.ok(boxes[1].x>boxes[0].x+100);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(network.filter(url=>!url.startsWith(base)&&!url.startsWith('blob:')),[]);
  const result={passed:true,viewports:[360,390,768,1440],screenshots:5,externalRequests:0,consoleErrors:0,checks:['choices and approval','capability overrides','scene pinning','request deduplication','refresh persistence','matching download','quality boundary','reset cancel and Escape','Back navigation','responsive cards','no overflow','no external requests']};
  await writeFile(join(out,'browser-results.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
} finally {
  for(const entry of pending.values())clearTimeout(entry.timer);
  if(ws)ws.close();chrome.kill();server.close();
  await new Promise(resolve=>setTimeout(resolve,300));await rm(profile,{recursive:true,force:true});
}
