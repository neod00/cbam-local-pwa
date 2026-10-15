// run36 — 따로 띄운 Chrome(원격 디버깅 9333)을 조작한다. Playwright MCP가 다른 세션에 잡혀 있어 만든 대용품.
//   node cdp.mjs goto <url> | eval <js파일> | upload <css선택자 순번> <파일> | text | shot <png> | dialogs
import { readFileSync, writeFileSync } from 'node:fs';
const [cmd, a, b] = process.argv.slice(2);
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res) => ws.addEventListener('open', res));
let id = 0; const pending = new Map(); const dialogs = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  if (msg.method === 'Page.javascriptDialogOpening') {
    dialogs.push(msg.params.message);
    // 새 프로젝트: 첫 확인창(삭제)은 수락, 둘째(백업할까요)는 취소
    send('Page.handleJavaScriptDialog', { accept: !/백업할까요/.test(msg.params.message) });
  }
});
const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: n, method, params })); });
const evaluate = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? JSON.stringify(r.exceptionDetails)); return r.result.value; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable'); await send('Runtime.enable');
if (process.env.CDP_DL) await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: process.env.CDP_DL, eventsEnabled: true }).catch((e) => console.log('내려받기 설정 실패', e.message));
if (cmd === 'goto') { await send('Page.navigate', { url: a }); await sleep(Number(b ?? 2500)); console.log(await evaluate('location.href')); }
else if (cmd === 'eval') { const out = await evaluate(`(async () => { ${readFileSync(a, 'utf8')} })()`); await sleep(300); console.log(typeof out === 'string' ? out : JSON.stringify(out, null, 1)); if (dialogs.length) console.log('[확인창]', JSON.stringify(dialogs, null, 1)); }
else if (cmd === 'upload') { const { root } = await send('DOM.getDocument'); const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: 'input[type=file]' }); await send('DOM.setFileInputFiles', { nodeId: nodeIds[Number(a)], files: [b] }); await sleep(6000); console.log('올림', b); }
else if (cmd === 'text') { console.log(await evaluate(`(document.querySelector('main') ?? document.body).innerText`)); }
else if (cmd === 'shot') { const m = await send('Page.getLayoutMetrics'); const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: m.cssContentSize.width, height: Math.min(m.cssContentSize.height, 6000), scale: 1 } }); writeFileSync(a, Buffer.from(r.data, 'base64')); console.log('저장', a); }
else if (cmd === 'downloads') { const browser = await (await fetch('http://127.0.0.1:9333/json/version')).json(); await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: a }).catch(async () => send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: a })); console.log('내려받기 폴더', a, browser.Browser); }
ws.close();
