import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const port = Number(process.env.CBAM_ROUTE_CHECK_PORT ?? 3219);
const baseUrl = `http://127.0.0.1:${port}`;
const nextCliPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const routes = [
  '/',
  '/admin/login',
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

  const adminResponse = await fetch(`${baseUrl}/admin`, { redirect: 'manual' });
  assert.ok([302, 303, 307, 308].includes(adminResponse.status), '/admin should redirect unauthenticated users');
  assert.ok(adminResponse.headers.get('location')?.includes('/admin/login'), '/admin should redirect to the admin login page');

  const adminApiResponse = await fetch(`${baseUrl}/api/admin/ping`, { redirect: 'manual' });
  assert.equal(adminApiResponse.status, 401, '/api/admin/* should reject unauthenticated requests');

  const updateManifestResponse = await fetch(`${baseUrl}/api/update-manifest`, { redirect: 'manual' });
  assert.equal(updateManifestResponse.status, 200, '/api/update-manifest should return HTTP 200 without DB configuration');
  const updateManifest = await updateManifestResponse.json();
  assert.equal(updateManifest.update_policy, 'none', '/api/update-manifest should return the safe default manifest without DB configuration');

  const announcementsResponse = await fetch(`${baseUrl}/api/announcements`, { redirect: 'manual' });
  assert.equal(announcementsResponse.status, 200, '/api/announcements should return HTTP 200 without DB configuration');
  const announcements = await announcementsResponse.json();
  assert.ok(Array.isArray(announcements.announcements), '/api/announcements should return an announcements array');

  const registerResponse = await fetch(`${baseUrl}/api/license/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@example.co.kr',
      company_name: '대한철강 주식회사',
      contact_name: '김지연',
      contact_phone: '010-0000-1001',
      country: 'South Korea',
      industry: 'Iron and steel',
      accepted_terms_version: '2026.06-beta',
      app_version: '0.1.0-beta',
    }),
    redirect: 'manual',
  });
  assert.equal(registerResponse.status, 503, '/api/license/register should stay unavailable until DATABASE_URL is configured');

  const forbiddenRegisterResponse = await fetch(`${baseUrl}/api/license/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@example.co.kr',
      company_name: '대한철강 주식회사',
      production_volume: 1000,
    }),
    redirect: 'manual',
  });
  assert.equal(forbiddenRegisterResponse.status, 400, '/api/license/register should reject unsupported fields');

  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${route} should return HTTP 200`);
    renderedHtmlByRoute.set(route, await response.text());
  }

  assert.ok(renderedHtmlByRoute.get('/')?.includes('무엇부터 하면 되나요?'), 'dashboard should render beginner-first start guidance');
  assert.ok(renderedHtmlByRoute.get('/')?.includes('사업장 등록'), 'dashboard should render the first beginner action');
  assert.equal(renderedHtmlByRoute.get('/')?.includes('벤치마크와 국가/CN 기본값 기준자료를 가져오세요.'), false, 'dashboard should not show official reference upload as the first beginner task');
  assert.ok(renderedHtmlByRoute.get('/')?.includes('.cbam'), 'dashboard should render local backup guidance');

  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('CBAM Local 관리자 로그인'), 'admin login should render the operator login page');
  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('Google 계정으로 로그인'), 'admin login should render Google OAuth CTA');
  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('openbrain.main@gmail.com'), 'admin login should render the default operator email');
  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('CBAM Local Admin'), 'admin login should render the dedicated admin shell');
  assert.equal(renderedHtmlByRoute.get('/admin/login')?.includes('품목 관리'), false, 'admin login should not render the user app sidebar');
  assert.equal(renderedHtmlByRoute.get('/admin/login')?.includes('보고기간'), false, 'admin login should not render user workflow navigation');

  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('CBAM Local PWA 무료 베타'), 'announcement should render beta announcement');
  assert.ok(renderedHtmlByRoute.get('/announcement')?.includes('openbrain.main@gmail.com'), 'announcement should render public support email');

  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('시작 가이드'), 'guide should render the first-run workflow');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('먼저 이것만 하세요'), 'guide should render the three-step beginner summary');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('전체 12단계 상세 보기'), 'guide should keep the detailed workflow available');
  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('Hot Rolled Coil'), 'guide should render the fictional HRC rehearsal path');

  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('개인정보'), 'privacy should render data handling notice');
  assert.ok(renderedHtmlByRoute.get('/privacy')?.includes('운영 서버로 업로드하지 않는 것을 원칙'), 'privacy should render local-first data boundary');

  assert.ok(renderedHtmlByRoute.get('/results')?.includes('CBAM 기준 SEE'), 'results should render CBAM-basis SEE labels');
  assert.ok(renderedHtmlByRoute.get('/results')?.includes('내부 검토용 total SEE'), 'results should render informational SEE labels');

  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('인증서 비용 시나리오'), 'scenarios should render the certificate-cost review page');
  assert.ok(renderedHtmlByRoute.get('/scenarios')?.includes('사전 검토용'), 'scenarios should render scenario review guidance');

  assert.ok(renderedHtmlByRoute.get('/export')?.includes('Summary_Products'), 'export should render Summary_Products review');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('공식 수식'), 'export should render official formula guidance');
  assert.ok(renderedHtmlByRoute.get('/export')?.includes('EU 원본 템플릿'), 'export should render official template upload guidance');

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
  env: {
    ...process.env,
    PORT: String(port),
    AUTH_SECRET: process.env.AUTH_SECRET ?? 'route-verification-only-secret-at-least-32-characters',
    AUTH_GOOGLE_ID: process.env.AUTH_GOOGLE_ID ?? 'route-verification-client-id',
    AUTH_GOOGLE_SECRET: process.env.AUTH_GOOGLE_SECRET ?? 'route-verification-client-secret',
    AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? 'true',
    ADMIN_ALLOWED_EMAILS: process.env.ADMIN_ALLOWED_EMAILS ?? 'openbrain.main@gmail.com',
  },
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
