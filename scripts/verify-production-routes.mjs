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
  '/license',
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

  const aiStaffAdminResponse = await fetch(`${baseUrl}/admin/ai-staff`, { redirect: 'manual' });
  assert.ok([302, 303, 307, 308].includes(aiStaffAdminResponse.status), '/admin/ai-staff should redirect unauthenticated users');
  assert.ok(aiStaffAdminResponse.headers.get('location')?.includes('/admin/login'), '/admin/ai-staff should redirect to the admin login page');

  const adminApiResponse = await fetch(`${baseUrl}/api/admin/ping`, { redirect: 'manual' });
  assert.equal(adminApiResponse.status, 401, '/api/admin/* should reject unauthenticated requests');

  const updateManifestResponse = await fetch(`${baseUrl}/api/update-manifest`, { redirect: 'manual' });
  assert.equal(updateManifestResponse.status, 200, '/api/update-manifest should return HTTP 200');
  const updateManifest = await updateManifestResponse.json();
  assert.ok(updateManifest.update_policy, '/api/update-manifest should return an update policy');

  const announcementsResponse = await fetch(`${baseUrl}/api/announcements`, { redirect: 'manual' });
  assert.equal(announcementsResponse.status, 200, '/api/announcements should return HTTP 200');
  const announcements = await announcementsResponse.json();
  assert.ok(Array.isArray(announcements.announcements), '/api/announcements should return an announcements array');

  const forbiddenRegisterResponse = await fetch(`${baseUrl}/api/license/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      email: 'manager@example.co.kr',
      company_name: 'Boundary Test',
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

  assert.ok(renderedHtmlByRoute.get('/')?.includes('CBAM Local'), 'dashboard should render the app shell');

  assert.ok(renderedHtmlByRoute.has('/license'), 'license page should be included in rendered route checks');

  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('CBAM Local 관리자 로그인'), 'admin login should render the operator login page');
  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('Google 계정으로 로그인'), 'admin login should render Google OAuth CTA');
  assert.ok(renderedHtmlByRoute.get('/admin/login')?.includes('openbrain.main@gmail.com'), 'admin login should render the default operator email');
  assert.equal(renderedHtmlByRoute.get('/admin/login')?.includes('품목 관리'), false, 'admin login should not render the user app sidebar');

  assert.ok(renderedHtmlByRoute.get('/guide')?.includes('Hot Rolled Coil'), 'guide should render the fictional HRC rehearsal path');
  assert.ok(renderedHtmlByRoute.get('/settings')?.includes('.cbam'), 'settings should render backup guidance');
  assert.ok(renderedHtmlByRoute.has('/export'), 'export route should be included in rendered route checks');
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
