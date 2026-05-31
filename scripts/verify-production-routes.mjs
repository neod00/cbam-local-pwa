import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { join } from 'node:path';

const port = Number(process.env.CBAM_ROUTE_CHECK_PORT ?? 3219);
const baseUrl = `http://127.0.0.1:${port}`;
const nextCliPath = join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');

const routes = [
  '/',
  '/installations',
  '/periods',
  '/products',
  '/processes',
  '/source-streams',
  '/precursors',
  '/results',
  '/scenarios',
  '/upload',
  '/export',
  '/settings',
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
  for (const route of routes) {
    const response = await fetch(`${baseUrl}${route}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${route} should return HTTP 200`);
  }
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
