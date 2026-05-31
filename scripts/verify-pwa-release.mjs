import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync('public/manifest.webmanifest', 'utf8'));
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const readme = readFileSync('README.md', 'utf8');
const dashboardPage = readFileSync('src/app/page.tsx', 'utf8');
const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
const releaseChecklist = readFileSync('docs/mvp-release-checklist.md', 'utf8');
const rehearsalPlan = readFileSync('docs/mvp-rehearsal-plan.md', 'utf8');
const rehearsalReport = readFileSync('docs/mvp-rehearsal-report.md', 'utf8');
const fictionalDataset = readFileSync('docs/mvp-fictional-dataset.md', 'utf8');
const userNotices = readFileSync('docs/mvp-user-notices.md', 'utf8');
const freeTermsDraft = readFileSync('docs/free-pwa-terms-draft.md', 'utf8');
const deploymentGuide = readFileSync('docs/pwa-deployment-guide.md', 'utf8');
const securityPolicy = readFileSync('SECURITY.md', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

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

assert.ok(
  dashboardPage.includes('확인된 입력 셀에만 데이터를 반영합니다'),
  'dashboard should describe the current conservative export boundary'
);
assert.equal(
  dashboardPage.includes('D_Processes`, `E_PurchPrec` 입력 영역에만'),
  false,
  'dashboard should not describe export as D_Processes/E_PurchPrec only'
);
assert.ok(
  exportPage.includes('A_InstData') && exportPage.includes('SEE'),
  'export page should explain A_InstData boundary writes and deferred product-line SEE writes'
);
assert.ok(
  exportPage.includes('Summary_Products 반영 검토') && exportPage.includes('공식 수식 셀'),
  'export page should show the Summary_Products review section'
);
assert.ok(
  exportPage.includes('EU 행') && exportPage.includes('Export 미리보기에 표시할 산정 결과가 없습니다.') && exportPage.includes('md:hidden'),
  'export page should keep mobile card fallbacks for submission review'
);

for (const asset of ['file.svg', 'globe.svg', 'next.svg', 'vercel.svg', 'window.svg']) {
  assert.equal(existsSync(`public/${asset}`), false, `${asset} should not be kept in public assets`);
}

assert.ok(readme.includes('로컬 우선'), 'README should explain local-first direction');
assert.ok(readme.includes('서버 전송 없음'), 'README should state the no-server-upload posture');
assert.ok(readme.includes('소스 저장소는 비공개'), 'README should state the private-source distribution posture');
assert.ok(readme.includes('JavaScript 번들'), 'README should explain the PWA bundle visibility limit');
assert.ok(readme.includes('CBAM_documents/'), 'README should explain local reference document exclusion');
assert.ok(readme.includes('docs/mvp-release-checklist.md'), 'README should link the release checklist');
assert.ok(readme.includes('docs/mvp-rehearsal-plan.md'), 'README should link the MVP rehearsal plan');
assert.ok(readme.includes('docs/mvp-fictional-dataset.md'), 'README should link the MVP fictional dataset');
assert.ok(readme.includes('docs/mvp-rehearsal-report.md'), 'README should link the MVP rehearsal report');
assert.ok(readme.includes('docs/free-pwa-terms-draft.md'), 'README should link the free PWA terms draft');
assert.ok(readme.includes('docs/pwa-deployment-guide.md'), 'README should link the PWA deployment guide');
assert.ok(readme.includes('SECURITY.md'), 'README should link the security policy');

assert.ok(releaseChecklist.includes('CBAM_documents/'), 'release checklist should mention local reference document exclusion');
assert.ok(releaseChecklist.includes('저장소는 Private'), 'release checklist should require the repository to remain private');
assert.ok(releaseChecklist.includes('무료 사용 약관'), 'release checklist should include the free-use terms decision');
assert.ok(releaseChecklist.includes('docs/free-pwa-terms-draft.md'), 'release checklist should link the free PWA terms draft');
assert.ok(releaseChecklist.includes('docs/pwa-deployment-guide.md'), 'release checklist should link the PWA deployment guide');
assert.ok(releaseChecklist.includes('docs/mvp-rehearsal-plan.md'), 'release checklist should link the MVP rehearsal plan');
assert.ok(releaseChecklist.includes('docs/mvp-fictional-dataset.md'), 'release checklist should link the MVP fictional dataset');
assert.ok(releaseChecklist.includes('docs/mvp-rehearsal-report.md'), 'release checklist should link the MVP rehearsal report');
assert.ok(releaseChecklist.includes('Docker/on-premise'), 'release checklist should keep on-premise scope deferred');

for (const required of [
  '사업장 등록',
  '품목 등록',
  '생산공정 등록',
  '배출원 자료 등록',
  '전구물질 등록',
  '기준자료 업로드',
  'EU Export 준비',
  '.cbam',
]) {
  assert.ok(rehearsalPlan.includes(required), `MVP rehearsal plan should include ${required}`);
}

assert.ok(
  rehearsalPlan.includes('docs/mvp-fictional-dataset.md'),
  'MVP rehearsal plan should link the fictional dataset'
);

for (const required of [
  'Main Factory A',
  'Hot Rolled Coil',
  'Steel Pipe',
  'Natural gas combustion',
  'Purchased hot rolled coil',
  '.cbam',
  'Microsoft Excel',
]) {
  assert.ok(fictionalDataset.includes(required), `MVP fictional dataset should include ${required}`);
}

for (const required of [
  'Local EU Template Check',
  'Local Reference Workbook Check',
  'Manual follow-up',
  'Release Blockers',
]) {
  assert.ok(rehearsalReport.includes(required), `MVP rehearsal report should include ${required}`);
}

assert.ok(userNotices.includes('법률 자문'), 'user notices should state that the app does not replace legal advice');
assert.ok(userNotices.includes('브라우저 로컬 저장소'), 'user notices should explain local browser storage');
assert.ok(userNotices.includes('.cbam'), 'user notices should require local backup handling');
assert.ok(userNotices.includes('최신 공식 원본 템플릿'), 'user notices should require latest official EU template upload');
assert.ok(userNotices.includes('공식 수식 재계산 결과'), 'user notices should require Excel formula result review after Export');
assert.ok(userNotices.includes('무료 라이선스'), 'user notices should defer free license management beyond MVP');
assert.ok(userNotices.includes('Docker/on-premise'), 'user notices should defer on-premise scope beyond MVP');

assert.ok(freeTermsDraft.includes('재배포'), 'free PWA terms draft should restrict redistribution');
assert.ok(freeTermsDraft.includes('법률 자문'), 'free PWA terms draft should include liability limits');
assert.ok(freeTermsDraft.includes('JavaScript 번들'), 'free PWA terms draft should explain PWA bundle visibility');
assert.ok(freeTermsDraft.includes('브라우저 로컬 저장소'), 'free PWA terms draft should explain local browser storage');

assert.equal(packageJson.private, true, 'package.json should keep private true');
assert.ok(deploymentGuide.includes('GitHub 저장소는 Private'), 'deployment guide should keep the source repository private');
assert.ok(deploymentGuide.includes('CBAM_documents/'), 'deployment guide should forbid local reference documents in deploy artifacts');
assert.ok(deploymentGuide.includes('공식 EU 템플릿'), 'deployment guide should forbid bundling official EU templates');
assert.ok(deploymentGuide.includes('npm run verify'), 'deployment guide should require the standard verification command');
assert.ok(deploymentGuide.includes('JavaScript 번들'), 'deployment guide should explain browser bundle visibility');

assert.ok(securityPolicy.includes('.cbam'), 'security policy should mention backup files');
assert.ok(securityPolicy.includes('민감자료 공유 금지'), 'security policy should warn against sharing sensitive data');
assert.ok(securityPolicy.includes('EU Communication template'), 'security policy should mention EU template files');
assert.ok(securityPolicy.includes('소스 보호 한계'), 'security policy should explain source protection limits');

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);
assert.equal(
  trackedFiles.some((file) => file === 'CBAM_documents' || file.startsWith('CBAM_documents/')),
  false,
  'CBAM_documents should not be tracked by Git'
);

console.log('PWA release verification passed.');
