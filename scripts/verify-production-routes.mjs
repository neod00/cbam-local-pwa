import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const port = Number(process.env.CBAM_ROUTE_CHECK_PORT ?? 3219);
const baseUrl = `http://127.0.0.1:${port}`;
const nextCliPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const routes = [
  '/',
  '/admin',
  '/announcement',
  '/guide',
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

  assert.ok(renderedHtmlByRoute.get('/')?.includes('무엇부터 하면 되나요?'), 'dashboard should render beginner-first start guidance');
  assert.ok(renderedHtmlByRoute.get('/')?.includes('사업장 등록'), 'dashboard should render the first beginner action');
  assert.equal(renderedHtmlByRoute.get('/')?.includes('벤치마크와 국가/CN 기본값 기준자료를 가져오세요.'), false, 'dashboard should not show official reference upload as the first beginner task');
  assert.ok(renderedHtmlByRoute.get('/')?.includes('.cbam'), 'dashboard should render local backup guidance');

  assert.ok(renderedHtmlByRoute.get('/admin')?.includes('CBAM Local 관리자 콘솔'), 'admin should render the operator console');
  assert.ok(renderedHtmlByRoute.get('/admin')?.includes('사용자/라이선스'), 'admin should render license user management');
  assert.ok(renderedHtmlByRoute.get('/admin')?.includes('생산량, 배출량, EU 템플릿'), 'admin should render the no-CBAM-data boundary');
  assert.ok(renderedHtmlByRoute.get('/admin')?.includes('NEXT_PUBLIC_LICENSE_API_URL'), 'admin should show the future license API activation boundary');

  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('CBAM Local PWA 무료 베타'), 'announcement should render beta announcement');
  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('openbrain.main@gmail.com'), 'announcement should render public support email');

  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('시작 가이드'), 'guide should render the first-run workflow');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('먼저 이것만 하세요'), 'guide should render the three-step beginner summary');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('전체 12단계 상세 보기'), 'guide should keep the detailed workflow available');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('Hot Rolled Coil'), 'guide should render the fictional HRC rehearsal path');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('Excel 공식 수식 재계산'), 'guide should render Excel recalculation guidance');

  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('개인정보 및 로컬 데이터 처리 안내'), 'privacy should render data handling notice');
  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('운영 서버로 업로드하지 않는 것을 원칙'), 'privacy should render local-first data boundary');

  assert.ok(renderedHtmlByRoute.get('/results')?.includes('CBAM 산정 기준 SEE'), 'results should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/results')?.includes('내부 검토용 total SEE'), 'results should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('CBAM 산정 기준 SEE'), 'scenarios should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('내부 검토용 total SEE'), 'scenarios should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/export')?.includes('Summary_Products 반영 검토'), 'export should render Summary_Products review');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('공식 수식'), 'export should render official formula guidance');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('CBAM 산정 기준 SEE'), 'export should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('내부 검토용 total SEE'), 'export should render informational SEE labels');

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
