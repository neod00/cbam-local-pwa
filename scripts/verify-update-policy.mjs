import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
const updateManifest = JSON.parse(readFileSync('public/update-manifest.json', 'utf8'));
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const updatePolicy = readFileSync('src/lib/update-policy.ts', 'utf8');
const updateNotice = readFileSync('src/components/UpdateNotice.tsx', 'utf8');
const serviceWorkerRegistration = readFileSync('src/components/ServiceWorkerRegistration.tsx', 'utf8');
const appShell = readFileSync('src/components/AppShell.tsx', 'utf8');
const settingsPage = readFileSync('src/app/settings/page.tsx', 'utf8');
const releaseNotesPage = readFileSync('src/app/release-notes/page.tsx', 'utf8');
const policyDoc = readFileSync('docs/harness/update-policy.md', 'utf8');

assert.equal(updateManifest.latest_version, packageJson.version, 'update manifest should start at the package version');
assert.equal(updateManifest.minimum_supported_version, packageJson.version, 'minimum supported version should start at the package version');
assert.equal(updateManifest.update_policy, 'none', 'initial update policy should not interrupt MVP users');
assert.equal(updateManifest.target_audience, 'free-pwa', 'update manifest should target the free PWA');
assert.equal(updateManifest.release_notes_url, '/release-notes', 'update manifest should link the in-app release notes page');

for (const field of [
  'latest_version',
  'minimum_supported_version',
  'update_policy',
  'notice_title',
  'notice_body',
  'release_notes_url',
]) {
  assert.ok(Object.hasOwn(updateManifest, field), `update manifest should include ${field}`);
}

assert.ok(serviceWorker.includes('"/update-manifest.json"'), 'service worker should cache the update manifest');
assert.ok(updatePolicy.includes("UpdatePolicyMode = 'none' | 'optional' | 'recommended' | 'required'"), 'update policy should model every update mode');
assert.ok(updatePolicy.includes('compareVersions'), 'update policy should compare semantic versions');
assert.ok(updatePolicy.includes('minimum_supported_version'), 'update policy should evaluate minimum supported version');
assert.ok(updatePolicy.includes("mode === 'required'"), 'update policy should force required updates below the minimum version');
assert.ok(updatePolicy.includes("cache: 'no-store'"), 'update manifest fetch should bypass stale HTTP cache');

assert.ok(appShell.includes('UpdateNotice'), 'app shell should render the update notice');
assert.ok(updateNotice.includes('강제 업데이트'), 'update notice should explain required updates');
assert.ok(updateNotice.includes('업데이트 확인'), 'update notice should expose an update action');
assert.ok(updateNotice.includes('릴리스 노트'), 'update notice should expose release notes');
assert.ok(updateNotice.includes('releaseNotesUrl'), 'update notice should use the manifest release notes URL');
assert.ok(updateNotice.includes('CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 전송하지 않습니다'), 'update notice should state the data boundary');
assert.ok(updateNotice.includes('localStorage'), 'dismissed optional/recommended updates should stay local');
assert.ok(updateNotice.includes('navigator.serviceWorker'), 'update action should check the service worker');
assert.ok(serviceWorkerRegistration.includes('updateViaCache: "none"'), 'service worker registration should bypass stale HTTP cache when checking for updates');
assert.ok(serviceWorkerRegistration.includes('controllerchange'), 'service worker registration should reload when a new worker takes control');

assert.ok(settingsPage.includes('업데이트 상태 확인'), 'settings should expose manual update status checks');
assert.ok(settingsPage.includes('업데이트 확인은 배포 정책과 공지만 확인합니다'), 'settings should explain the update-check data boundary');
assert.ok(settingsPage.includes('CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 전송하지 않습니다'), 'settings should repeat the update data boundary');

assert.ok(releaseNotesPage.includes('CBAM Local v0.1.0'), 'release notes page should document the current release');
assert.ok(releaseNotesPage.includes('공식 EU 템플릿은 앱에 내장하지 않으며'), 'release notes should restate official template handling');
assert.ok(releaseNotesPage.includes('CBAM 계산 데이터는 수집하지 않습니다'), 'release notes should restate update data boundary');

for (const required of ['optional', 'recommended', 'required', 'service worker', 'IndexedDB']) {
  assert.ok(policyDoc.includes(required), `update policy documentation should include ${required}`);
}

console.log('Update policy verification passed.');
