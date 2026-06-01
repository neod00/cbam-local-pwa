import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const port = Number(process.env.CBAM_ROUTE_CHECK_PORT ?? 3219);
const baseUrl = `http://127.0.0.1:${port}`;
const nextCliPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const routes = [
  '/',
  '/announcement',
  '/installations',
  '/periods',
  '/privacy',
  '/products',
  '/processes',
  '/source-streams',
  '/precursors',
  '/release-notes',
  '/results',
  '/scenarios',
  '/upload',
  '/export',
  '/settings',
  '/terms',
  '/design-preview',
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(deadlineMs = 25000) {
  const startedAt = Date.now();
  let lastError;

  while (Date.now() - startedAt < deadlineMs) {
    try {
      const response = await fetch(baseUrl, { redirect: 'manual' });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`server returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await sleep(500);
  }

  throw lastError ?? new Error('server did not start before timeout');
}

async function verifyRoutes() {
  const renderedHtmlByRoute = new Map();

  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${route} should return HTTP 200`);
    renderedHtmlByRoute.set(route, await response.text());
  }

  assert.ok(renderedHtmlByRoute.get('/')?.includes('다음 작업'), 'dashboard should render guided next-action copy');
  assert.ok(renderedHtmlByRoute.get('/')?.includes('.cbam'), 'dashboard should render local backup guidance');

  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('CBAM Local PWA 무료 베타'), 'announcement should render beta announcement');
  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('openbrain.main@gmail.com'), 'announcement should render public support email');

  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('개인정보 및 로컬 데이터 처리 안내'), 'privacy should render data handling notice');
  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('운영 서버로 업로드하지 않는 것을 원칙'), 'privacy should render local-first data boundary');

  assert.ok(renderedHtmlByRoute.get('/results')?.includes('CBAM 기준 SEE'), 'results should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/results')?.includes('참고용 총 SEE'), 'results should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('CBAM 기준 SEE'), 'scenarios should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('참고용 총 SEE'), 'scenarios should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/export')?.includes('Summary_Products 반영 검토'), 'export should render Summary_Products review');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('공식 수식'), 'export should render official formula guidance');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('CBAM 기준 SEE'), 'export should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('참고용 총 SEE'), 'export should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/settings')?.includes('로컬 사용 안전 체크리스트'), 'settings should render local-use safety checklist');
  assert.ok(renderedHtmlByRoute.get('/settings')?.includes('.cbam'), 'settings should render backup guidance');

  assert.ok(renderedHtmlByRoute.get('/terms')?.includes('CBAM Local 무료 사용 약관'), 'terms should render free-use terms');
  assert.ok(renderedHtmlByRoute.get('/terms')?.includes('openbrain.main@gmail.com'), 'terms should render the public support email');
}

function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/pid', String(child.pid), '/t', '/f'], { stdio: 'ignore' });
    } catch {
      child.kill();
    }
    return;
  }

  child.kill('SIGTERM');
}

const child = spawn(process.execPath, [nextCliPath, 'start', '--port', String(port)], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOutput = '';
child.stdout.on('data', (chunk) => {
  serverOutput += chunk.toString();
});
child.stderr.on('data', (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();
  await verifyRoutes();
  console.log(`Production route verification passed for ${routes.length} routes on ${baseUrl}.`);
} catch (error) {
  console.error(serverOutput.trim());
  throw error;
} finally {
  stopServer(child);
}
