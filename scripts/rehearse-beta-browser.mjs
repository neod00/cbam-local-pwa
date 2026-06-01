import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

const appUrl = process.env.CBAM_REHEARSAL_URL ?? 'http://127.0.0.1:3000';
const officialTemplatePath = process.env.CBAM_EU_TEMPLATE_PATH;
const chromePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const artifactRoot = resolve('artifacts', 'beta-browser-rehearsal');
const runId = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '');
const runRoot = join(artifactRoot, runId);
const profileDir = join(runRoot, 'chrome-profile');
const downloadDir = join(runRoot, 'downloads');
const screenshotDir = join(runRoot, 'screenshots');
const port = 9350 + Math.floor(Math.random() * 200);

const stores = [
  'installations',
  'products',
  'periods',
  'processes',
  'product_output_lines',
  'source_streams',
  'precursors',
  'settings',
];

const routes = [
  { path: '/', label: 'Dashboard', snippets: ['CBAM Local', '대시보드'] },
  { path: '/installations', label: 'Installations', snippets: ['사업장', 'Main Factory A'] },
  { path: '/periods', label: 'Periods', snippets: ['보고기간', '2024 Annual'] },
  { path: '/products', label: 'Products', snippets: ['품목', 'Hot Rolled Coil'] },
  { path: '/processes', label: 'Processes', snippets: ['생산공정', 'Rolling and finishing'] },
  { path: '/source-streams', label: 'Source streams', snippets: ['배출원', 'Natural gas combustion'] },
  { path: '/precursors', label: 'Precursors', snippets: ['전구물질', 'Purchased hot rolled coil'] },
  { path: '/results', label: 'Results', snippets: ['산정 결과', 'CBAM 기준 SEE', '참고용 총 SEE'] },
  { path: '/scenarios', label: 'Scenarios', snippets: ['시나리오', 'SEFA', '인증서'] },
  { path: '/upload', label: 'Upload', snippets: ['자료 업로드', '로컬'] },
  { path: '/export', label: 'EU Export', snippets: ['EU 템플릿 Export', 'Summary_Products'] },
  { path: '/settings', label: 'Settings', snippets: ['설정', '백업'] },
  { path: '/release-notes', label: 'Release notes', snippets: ['릴리스 노트', 'v0.1.0'] },
  { path: '/terms', label: 'Terms', snippets: ['무료 사용 약관', 'openbrain.main@gmail.com'] },
];

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

async function waitFor(condition, timeoutMs, label) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const value = await condition();
    if (value) {
      return value;
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.handlers = new Map();
    this.opened = new Promise((resolvePromise, rejectPromise) => {
      this.ws.addEventListener('open', resolvePromise, { once: true });
      this.ws.addEventListener('error', rejectPromise, { once: true });
    });
    this.ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve: resolvePromise, reject: rejectPromise } = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) {
          rejectPromise(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
        } else {
          resolvePromise(message.result ?? {});
        }
        return;
      }

      if (message.method && this.handlers.has(message.method)) {
        for (const handler of this.handlers.get(message.method)) {
          handler(message.params ?? {});
        }
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

  on(method, handler) {
    const handlers = this.handlers.get(method) ?? [];
    handlers.push(handler);
    this.handlers.set(method, handlers);
  }

  close() {
    this.ws.close();
  }
}

async function waitForChromeTarget() {
  return waitFor(async () => {
    try {
      const pages = await fetchJson(`http://127.0.0.1:${port}/json/list`);
      return pages.find((page) => page.type === 'page' && page.webSocketDebuggerUrl);
    } catch {
      return undefined;
    }
  }, 15000, 'Chrome DevTools target');
}

async function navigate(cdp, path) {
  const loadPromise = new Promise((resolvePromise) => {
    cdp.on('Page.loadEventFired', resolvePromise);
  });
  await cdp.send('Page.navigate', { url: `${appUrl}${path}` });
  await Promise.race([loadPromise, sleep(6000)]);
  await sleep(900);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });

  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime evaluation failed');
  }

  return result.result?.value;
}

async function bodyText(cdp) {
  return evaluate(cdp, 'document.body.innerText');
}

async function captureScreenshot(cdp, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const path = join(screenshotDir, `${name}.png`);
  await writeFile(path, Buffer.from(result.data, 'base64'));
  return path;
}

async function getIndexedDbCounts(cdp) {
  return evaluate(cdp, `new Promise((resolve, reject) => {
    const request = indexedDB.open('cbam-local', 5);
    request.onerror = () => reject(request.error?.message ?? 'open failed');
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(${JSON.stringify(stores)}, 'readonly');
      const counts = {};
      let pending = ${stores.length};
      for (const storeName of ${JSON.stringify(stores)}) {
        const countRequest = tx.objectStore(storeName).count();
        countRequest.onsuccess = () => {
          counts[storeName] = countRequest.result;
          pending -= 1;
          if (pending === 0) resolve(counts);
        };
        countRequest.onerror = () => reject(countRequest.error?.message ?? 'count failed');
      }
    };
  })`);
}

async function setFirstFileInput(cdp, filePath) {
  const root = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const query = await cdp.send('DOM.querySelector', {
    nodeId: root.root.nodeId,
    selector: 'input[type="file"]',
  });
  assert.ok(query.nodeId, `file input should exist for ${filePath}`);
  await cdp.send('DOM.setFileInputFiles', {
    nodeId: query.nodeId,
    files: [filePath],
  });
  await evaluate(cdp, `(() => {
    const input = document.querySelector('input[type="file"]');
    if (!input) return false;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await sleep(1500);
}

async function clickElementByText(cdp, selector, includesText) {
  return evaluate(cdp, `(() => {
    const elements = Array.from(document.querySelectorAll(${JSON.stringify(selector)}));
    const element = elements.find((candidate) => {
      const text = (candidate.innerText || candidate.textContent || '').trim();
      return text.includes(${JSON.stringify(includesText)}) && !candidate.disabled && candidate.getAttribute('aria-disabled') !== 'true';
    });
    if (!element) {
      return false;
    }
    element.click();
    return true;
  })()`);
}

async function waitForDownloadedFile(extension, timeoutMs, label) {
  return waitFor(async () => {
    const files = await readdir(downloadDir).catch(() => []);
    const completed = files
      .filter((file) => file.endsWith(extension) && !file.endsWith('.crdownload'))
      .map((file) => join(downloadDir, file));
    return completed[0];
  }, timeoutMs, label);
}

async function run() {
  assert.ok(existsSync(chromePath), `Chrome executable not found: ${chromePath}`);
  assert.ok(officialTemplatePath, 'Set CBAM_EU_TEMPLATE_PATH to the official EU template workbook path.');
  assert.ok(existsSync(officialTemplatePath), `EU template not found: ${officialTemplatePath}`);

  await mkdir(artifactRoot, { recursive: true });
  await rm(runRoot, { recursive: true, force: true });
  await mkdir(profileDir, { recursive: true });
  await mkdir(downloadDir, { recursive: true });
  await mkdir(screenshotDir, { recursive: true });

  const chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--disable-background-networking',
    '--disable-sync',
    '--disable-extensions',
    '--window-size=1440,1000',
    'about:blank',
  ], { stdio: 'ignore' });

  const externalRequests = [];
  const report = {
    appUrl,
    runRoot,
    officialTemplate: officialTemplatePath,
    startedAt: new Date().toISOString(),
    routeChecks: [],
    indexedDbCounts: {},
    downloads: {},
    screenshots: {},
    externalRequests,
    notes: [],
  };

  let cdp;
  try {
    const target = await waitForChromeTarget();
    cdp = new CdpClient(target.webSocketDebuggerUrl);
    await cdp.opened;
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Network.enable');
    await cdp.send('Browser.setDownloadBehavior', {
      behavior: 'allow',
      downloadPath: downloadDir,
    }).catch(async () => {
      await cdp.send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: downloadDir,
      });
    });

    cdp.on('Network.requestWillBeSent', (params) => {
      const url = params.request?.url ?? '';
      if (
        url &&
        !url.startsWith(appUrl) &&
        !url.startsWith('data:') &&
        !url.startsWith('blob:') &&
        !url.startsWith('chrome:') &&
        !url.startsWith('devtools:')
      ) {
        externalRequests.push({
          method: params.request?.method,
          url,
          type: params.type,
        });
      }
    });

    for (const route of routes) {
      await navigate(cdp, route.path);
      const text = await bodyText(cdp);
      const missingSnippets = route.snippets.filter((snippet) => !text.includes(snippet));
      report.routeChecks.push({
        path: route.path,
        label: route.label,
        status: missingSnippets.length === 0 ? 'pass' : 'review',
        missingSnippets,
      });

      if (['/', '/results', '/scenarios', '/export', '/settings'].includes(route.path)) {
        const screenshotName = route.path === '/' ? 'dashboard' : route.path.slice(1).replaceAll('/', '-');
        report.screenshots[screenshotName] = await captureScreenshot(cdp, screenshotName);
      }
    }

    await navigate(cdp, '/installations');
    await waitFor(async () => {
      const counts = await getIndexedDbCounts(cdp);
      return counts.installations > 0 && counts.products > 0 && counts.processes > 0 ? counts : undefined;
    }, 10000, 'seeded IndexedDB data');
    report.indexedDbCounts = await getIndexedDbCounts(cdp);

    await navigate(cdp, '/export');
    await setFirstFileInput(cdp, resolve(officialTemplatePath));
    const exportText = await bodyText(cdp);
    report.exportAfterUpload = {
      hasTemplateFilename: exportText.includes(basename(officialTemplatePath)),
      hasSummaryProducts: exportText.includes('Summary_Products'),
      buttons: await evaluate(cdp, `Array.from(document.querySelectorAll('button')).map((button) => ({
        text: (button.innerText || button.textContent || '').trim(),
        disabled: button.disabled,
        ariaDisabled: button.getAttribute('aria-disabled')
      }))`),
    };
    report.screenshots.exportAfterUpload = await captureScreenshot(cdp, 'export-after-upload');
    assert.ok(exportText.includes(basename(officialTemplatePath)), 'export page should show selected EU template filename');
    assert.ok(exportText.includes('Summary_Products'), 'export page should show Summary_Products review');
    const clickedExport = await clickElementByText(cdp, 'button', '다운로드');
    assert.equal(clickedExport, true, 'export copy download button should be clickable');
    report.downloads.euTemplateCopy = await waitForDownloadedFile('.xlsx', 20000, 'EU template export copy download');
    report.screenshots.exportAfterDownload = await captureScreenshot(cdp, 'export-after-download');

    await navigate(cdp, '/settings');
    const clickedBackup = await clickElementByText(cdp, 'button', '백업');
    assert.equal(clickedBackup, true, 'backup export button should be clickable');
    report.downloads.cbamBackup = await waitForDownloadedFile('.cbam', 15000, '.cbam backup download');
    const backupContent = JSON.parse(await readFile(report.downloads.cbamBackup, 'utf8'));
    assert.equal(backupContent.manifest.format, 'cbam-local-backup');
    assert.ok(backupContent.manifest.counts.installations > 0, 'backup should include installations');
    assert.ok(backupContent.manifest.counts.products > 0, 'backup should include products');
    assert.ok(backupContent.manifest.counts.precursors > 0, 'backup should include precursors');
    report.backupManifest = backupContent.manifest;

    if (externalRequests.length > 0) {
      report.notes.push('Review external requests before beta release.');
    }

    report.finishedAt = new Date().toISOString();
    report.status = 'pass';
  } finally {
    if (cdp) {
      cdp.close();
    }
    chrome.kill();
  }

  await writeFile(join(runRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(join(artifactRoot, 'latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

run().catch(async (error) => {
  await mkdir(artifactRoot, { recursive: true });
  const failure = {
    status: 'fail',
    appUrl,
    runRoot,
    officialTemplate: officialTemplatePath,
    error: error instanceof Error ? error.message : String(error),
    failedAt: new Date().toISOString(),
  };
  await mkdir(runRoot, { recursive: true }).catch(() => undefined);
  await writeFile(join(runRoot, 'report.json'), `${JSON.stringify(failure, null, 2)}\n`).catch(() => undefined);
  await writeFile(join(artifactRoot, 'latest-report.json'), `${JSON.stringify(failure, null, 2)}\n`);
  console.error(JSON.stringify(failure, null, 2));
  process.exit(1);
});
