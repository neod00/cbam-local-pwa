import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const readme = readFileSync('README.md', 'utf8');

assert.equal(manifest.name, 'CBAM Local PWA');
assert.equal(manifest.short_name, 'CBAM Local');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#0F766E');
assert.ok(manifest.description.includes('브라우저 로컬'), 'manifest should explain local-first behavior');
assert.ok(manifest.icons.some((icon) => icon.src === '/icon.svg'), 'manifest should include the app icon');

const expectedShellRoutes = [
  '/',
  '/export',
  '/installations',
  '/periods',
  '/precursors',
  '/processes',
  '/products',
  '/results',
  '/scenarios',
  '/settings',
  '/source-streams',
  '/upload',
];

for (const route of expectedShellRoutes) {
  assert.ok(serviceWorker.includes(`"${route}"`), `service worker should cache ${route}`);
}

assert.ok(serviceWorker.includes('cbam-local-v2'), 'service worker cache version should be current');
assert.ok(serviceWorker.includes('caches.match("/")'), 'service worker should fall back to the app root');

for (const asset of ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']) {
  assert.equal(existsSync(`public/${asset}`), false, `${asset} should not be kept in public assets`);
}

assert.ok(readme.includes('로컬 우선'), 'README should explain local-first direction');
assert.ok(readme.includes('서버 전송 없음'), 'README should state the no-server-upload posture');
assert.ok(readme.includes('CBAM_documents/'), 'README should explain local reference document exclusion');
assert.ok(readme.includes('docs/mvp-release-checklist.md'), 'README should link the release checklist');

console.log('PWA release verification passed.');
