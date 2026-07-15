import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const appUrl = process.env.CBAM_BEGINNER_UI_URL ?? 'http://127.0.0.1:3010';
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const outputBase = process.env.CBAM_BEGINNER_UI_OUTPUT ?? resolve('artifacts', 'beginner-ui-verification');
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const outputRoot = join(outputBase, runId);
const profileDir = join(outputRoot, 'chrome-profile');
const port = 9550 + Math.floor(Math.random() * 200);

function sleep(ms) {
    return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitFor(condition, timeoutMs, label) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
        const value = await condition();
        if (value) return value;
        await sleep(200);
    }
    throw new Error(`Timed out waiting for ${label}`);
}

class CdpClient {
    constructor(wsUrl) {
        this.ws = new WebSocket(wsUrl);
        this.nextId = 1;
        this.pending = new Map();
        this.opened = new Promise((resolvePromise, rejectPromise) => {
            this.ws.addEventListener('open', resolvePromise, { once: true });
            this.ws.addEventListener('error', rejectPromise, { once: true });
        });
        this.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.id && this.pending.has(message.id)) {
                const pending = this.pending.get(message.id);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result ?? {});
            }
        });
    }

    async send(method, params = {}) {
        await this.opened;
        const id = this.nextId++;
        this.ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolvePromise, rejectPromise) => {
            this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise });
        });
    }

    close() {
        this.ws.close();
    }
}

async function evaluate(cdp, expression) {
    const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
    return result.result?.value;
}

async function navigate(cdp, path) {
    await cdp.send('Page.navigate', { url: `${appUrl}${path}` });
    await waitFor(() => evaluate(cdp, `document.readyState === 'complete'`), 15000, path);
    await sleep(600);
}

async function clickText(cdp, text) {
    const clicked = await evaluate(cdp, `(() => {
        const target = Array.from(document.querySelectorAll('button, a')).find((element) =>
            (element.innerText || '').trim().includes(${JSON.stringify(text)}) && !element.disabled
        );
        if (!target) return false;
        target.click();
        return true;
    })()`);
    assert.equal(clicked, true, `Could not click: ${text}`);
    await sleep(350);
}

async function setLabelValue(cdp, labelText, value) {
    const changed = await evaluate(cdp, `(() => {
        const label = Array.from(document.querySelectorAll('label')).find((item) =>
            (item.innerText || '').includes(${JSON.stringify(labelText)})
        );
        const control = label?.querySelector('input, select, textarea');
        if (!control) return false;
        const prototype = Object.getPrototypeOf(control);
        const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
        if (setter) setter.call(control, ${JSON.stringify(value)});
        else control.value = ${JSON.stringify(value)};
        control.dispatchEvent(new Event('input', { bubbles: true }));
        control.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    assert.equal(changed, true, `Could not fill: ${labelText}`);
}

async function waitForPath(cdp, path) {
    await waitFor(() => evaluate(cdp, `location.pathname === ${JSON.stringify(path)}`), 10000, path);
    await sleep(500);
}

async function screenshot(cdp, name, width = 1440, height = 1000) {
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
    const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const layout = await evaluate(cdp, `({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth
    })`);
    assert.ok(layout.documentWidth <= layout.viewportWidth + 1, `${name}: page width ${layout.documentWidth}px exceeds viewport ${layout.viewportWidth}px`);
    const path = join(outputRoot, `${name}-${width}x${height}.png`);
    await writeFile(path, Buffer.from(result.data, 'base64'));
    return path;
}

async function getCounts(cdp) {
    return evaluate(cdp, `new Promise((resolve, reject) => {
        const request = indexedDB.open('cbam-local', 5);
        request.onerror = () => reject(request.error?.message);
        request.onsuccess = () => {
            const stores = ['installations','periods','products','processes','product_output_lines','source_streams','precursors','settings'];
            const transaction = request.result.transaction(stores, 'readonly');
            const counts = {};
            let pending = stores.length;
            stores.forEach((storeName) => {
                const countRequest = transaction.objectStore(storeName).count();
                countRequest.onsuccess = () => {
                    counts[storeName] = countRequest.result;
                    pending -= 1;
                    if (pending === 0) resolve(counts);
                };
            });
        };
    })`);
}

async function run() {
    assert.ok(existsSync(chromePath), `Chrome not found: ${chromePath}`);
    await mkdir(profileDir, { recursive: true });

    const chrome = spawn(chromePath, [
        '--headless=new',
        `--remote-debugging-port=${port}`,
        `--user-data-dir=${profileDir}`,
        '--no-first-run',
        '--disable-background-networking',
        '--disable-extensions',
        '--window-size=1440,1000',
        'about:blank',
    ], { stdio: 'ignore' });

    let cdp;
    const consoleErrors = [];
    try {
        const target = await waitFor(async () => {
            try {
                const response = await fetch(`http://127.0.0.1:${port}/json/list`);
                const targets = await response.json();
                return targets.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
            } catch {
                return undefined;
            }
        }, 15000, 'Chrome target');

        cdp = new CdpClient(target.webSocketDebuggerUrl);
        await cdp.send('Page.enable');
        await cdp.send('Runtime.enable');
        cdp.ws.addEventListener('message', (event) => {
            const message = JSON.parse(event.data);
            if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
                consoleErrors.push(message.params.args?.map((arg) => arg.value ?? arg.description).join(' '));
            }
            if (message.method === 'Runtime.exceptionThrown') {
                consoleErrors.push(message.params.exceptionDetails?.text ?? 'Runtime exception');
            }
        });

        await navigate(cdp, '/workspace');
        await evaluate(cdp, `new Promise((resolve) => { const request = indexedDB.deleteDatabase('cbam-local'); request.onsuccess = request.onerror = request.onblocked = () => resolve(true); })`);
        await navigate(cdp, '/workspace');
        await screenshot(cdp, 'workspace-empty');
        await screenshot(cdp, 'workspace-tablet', 1024, 900);

        await setLabelValue(cdp, '사업장명', 'QA 포항사업장');
        await clickText(cdp, '저장하고 품목 등록');
        await waitForPath(cdp, '/products');
        await setLabelValue(cdp, '품목명', 'QA 열연강판');
        await setLabelValue(cdp, 'CN 코드 8자리', '72083900');
        await clickText(cdp, '품목 저장');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('CN 완료')`), 8000, 'saved product');
        await screenshot(cdp, 'products');
        await clickText(cdp, '생산공정으로');
        await waitForPath(cdp, '/processes');

        await setLabelValue(cdp, '공정명', 'QA 열연 압연 공정');
        await setLabelValue(cdp, '보고기간 생산량', '1200');
        await clickText(cdp, '공정 저장');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('QA 열연 압연 공정')`), 8000, 'saved process');
        await screenshot(cdp, 'processes');
        await clickText(cdp, '사용자료 입력');
        await waitForPath(cdp, '/source-streams');

        await clickText(cdp, '다음');
        await clickText(cdp, '다음');
        await setLabelValue(cdp, '보고기간 사용량', '1245600');
        await clickText(cdp, '다음');
        await screenshot(cdp, 'usage-preview');
        await clickText(cdp, '로컬 저장');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('전기 자료를 로컬에 저장했습니다')`), 8000, 'saved electricity');
        await clickText(cdp, '전구물질 확인');
        await waitForPath(cdp, '/precursors');

        await clickText(cdp, '아니요, 없습니다');
        await clickText(cdp, '없음으로 저장하고 결과 보기');
        await waitForPath(cdp, '/results');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('총 CBAM 배출량')`), 8000, 'calculation results');
        await screenshot(cdp, 'results');
        await screenshot(cdp, 'results-tablet', 1024, 900);

        await navigate(cdp, '/');
        await waitFor(() => evaluate(cdp, `document.body.innerText.includes('대시보드')`), 8000, 'dashboard');
        await screenshot(cdp, 'dashboard');

        await navigate(cdp, '/export');
        await screenshot(cdp, 'export');
        await navigate(cdp, '/products?advanced=1');
        const advancedText = await evaluate(cdp, 'document.body.innerText');
        assert.ok(advancedText.includes('고급 화면'));
        assert.ok(advancedText.includes('간단 화면으로 돌아가기'));

        const counts = await getCounts(cdp);
        assert.equal(counts.installations, 1);
        assert.equal(counts.periods, 1);
        assert.equal(counts.products, 1);
        assert.equal(counts.processes, 1);
        assert.equal(counts.product_output_lines, 1);
        assert.ok(counts.settings >= 1);
        assert.equal(consoleErrors.length, 0, consoleErrors.join('\n'));

        const report = { appUrl, counts, consoleErrors, checkedAt: new Date().toISOString() };
        await writeFile(join(outputRoot, 'report.json'), JSON.stringify(report, null, 2));
        console.log(JSON.stringify(report, null, 2));
    } finally {
        cdp?.close();
        chrome.kill();
    }
}

run().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
