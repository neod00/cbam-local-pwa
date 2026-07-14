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
const excelReview = readFileSync('docs/excel-recalculation-review.md', 'utf8');
const userNotices = readFileSync('docs/mvp-user-notices.md', 'utf8');
const freeTermsDraft = readFileSync('docs/free-pwa-terms-draft.md', 'utf8');
const releaseAnnouncementDraft = readFileSync('docs/free-pwa-release-announcement-draft.md', 'utf8');
const operatorReview = readFileSync('docs/v0.1.0-beta-operator-review.md', 'utf8');
const goNoGoRecord = readFileSync('docs/v0.1.0-beta-go-no-go-record.md', 'utf8');
const deploymentGuide = readFileSync('docs/pwa-deployment-guide.md', 'utf8');
const firstDeploymentRunbook = readFileSync('docs/first-deployment-runbook.md', 'utf8');
const securityPolicy = readFileSync('SECURITY.md', 'utf8');
const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));

assert.equal(manifest.name, 'CBAM Local PWA');
assert.equal(manifest.short_name, 'CBAM Local');
assert.equal(manifest.start_url, '/');
assert.equal(manifest.scope, '/');
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.theme_color, '#123D32');
assert.ok(manifest.description.includes('브라우저 로컬'), 'manifest should explain local-first behavior');
assert.ok(manifest.icons.some((icon) => icon.src === '/icon.svg'), 'manifest should include the app icon');

const expectedShellRoutes = [
  '/',
  '/export',
  '/guide',
  '/installations',
  '/periods',
  '/privacy',
  '/precursors',
  '/processes',
  '/products',
  '/release-notes',
  '/results',
  '/scenarios',
  '/settings',
  '/source-streams',
  '/terms',
  '/announcement',
  '/upload',
  '/workspace',
];

for (const route of expectedShellRoutes) {
  assert.ok(serviceWorker.includes(`"${route}"`), `service worker should cache ${route}`);
}

assert.equal(serviceWorker.includes('"/admin"'), false, 'protected admin route should not be cached by the service worker');
assert.equal(serviceWorker.includes('"/admin/login"'), false, 'admin login should not be cached by the service worker');
assert.ok(serviceWorker.includes('cbam-local-v5'), 'service worker cache version should be current');
assert.ok(serviceWorker.includes('networkFirst(request)'), 'service worker should use network-first route handling to avoid stale pages');
assert.ok(serviceWorker.includes('request.mode === "navigate"'), 'service worker should detect navigation requests');
assert.ok(serviceWorker.includes('fetch(request, { cache: "no-store" })'), 'service worker should bypass stale HTTP cache for network-first requests');
assert.ok(serviceWorker.includes('caches.match(fallbackUrl)'), 'service worker should fall back to cached app routes only when network fails');

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
assert.ok(
  exportPage.includes('CBAM 산정 기준 SEE') && exportPage.includes('내부 검토용 total SEE'),
  'export page should distinguish CBAM-basis and informational SEE review values'
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
assert.ok(readme.includes('npm run release:status'), 'README should document the release status command');
assert.ok(readme.includes('docs/mvp-rehearsal-plan.md'), 'README should link the MVP rehearsal plan');
assert.ok(readme.includes('docs/mvp-fictional-dataset.md'), 'README should link the MVP fictional dataset');
assert.ok(readme.includes('docs/mvp-rehearsal-report.md'), 'README should link the MVP rehearsal report');
assert.ok(readme.includes('docs/excel-recalculation-review.md'), 'README should link the Excel recalculation review');
assert.ok(readme.includes('docs/free-pwa-terms-draft.md'), 'README should link the free PWA terms draft');
assert.ok(readme.includes('docs/free-pwa-release-announcement-draft.md'), 'README should link the release announcement draft');
assert.ok(readme.includes('docs/pwa-deployment-guide.md'), 'README should link the PWA deployment guide');
assert.ok(readme.includes('docs/first-deployment-runbook.md'), 'README should link the first deployment runbook');
assert.ok(readme.includes('SECURITY.md'), 'README should link the security policy');

assert.ok(releaseChecklist.includes('CBAM_documents/'), 'release checklist should mention local reference document exclusion');
assert.ok(releaseChecklist.includes('npm run release:status'), 'release checklist should include the release status command');
assert.ok(releaseChecklist.includes('저장소는 Private'), 'release checklist should require the repository to remain private');
assert.ok(releaseChecklist.includes('무료 사용 약관'), 'release checklist should include the free-use terms decision');
assert.ok(releaseChecklist.includes('docs/free-pwa-terms-draft.md'), 'release checklist should link the free PWA terms draft');
assert.ok(releaseChecklist.includes('docs/free-pwa-release-announcement-draft.md'), 'release checklist should link the release announcement draft');
assert.ok(releaseChecklist.includes('docs/pwa-deployment-guide.md'), 'release checklist should link the PWA deployment guide');
assert.ok(releaseChecklist.includes('docs/first-deployment-runbook.md'), 'release checklist should link the first deployment runbook');
assert.ok(releaseChecklist.includes('docs/mvp-rehearsal-plan.md'), 'release checklist should link the MVP rehearsal plan');
assert.ok(releaseChecklist.includes('docs/mvp-fictional-dataset.md'), 'release checklist should link the MVP fictional dataset');
assert.ok(releaseChecklist.includes('docs/mvp-rehearsal-report.md'), 'release checklist should link the MVP rehearsal report');
assert.ok(releaseChecklist.includes('docs/excel-recalculation-review.md'), 'release checklist should link the Excel recalculation review');
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
assert.ok(
  rehearsalPlan.includes('docs/excel-recalculation-review.md'),
  'MVP rehearsal plan should link the Excel recalculation review'
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
  'Beta Browser Rehearsal',
  'Vercel Deployment Browser Rehearsal',
  'Release Blockers',
  'docs/excel-recalculation-review.md',
]) {
  assert.ok(rehearsalReport.includes(required), `MVP rehearsal report should include ${required}`);
}

for (const required of [
  'Summary_Products',
  'I10',
  'J10',
  'K10',
  'Microsoft Excel',
  'localSummaryProductReview',
  'CBAM basis SEE review',
  'Informational total SEE review',
  '.cbam',
]) {
  assert.ok(excelReview.includes(required), `Excel recalculation review should include ${required}`);
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

for (const required of [
  '로컬',
  '최신 EU 원본 템플릿',
  '.cbam',
  'Microsoft Excel',
  '공식 검증',
  'JavaScript 번들',
  '문의 채널',
  'openbrain.main@gmail.com',
]) {
  assert.ok(releaseAnnouncementDraft.includes(required), `release announcement draft should include ${required}`);
}

assert.ok(securityPolicy.includes('openbrain.main@gmail.com'), 'security policy should include the public contact email');
assert.ok(freeTermsDraft.includes('openbrain.main@gmail.com'), 'free terms draft should include the public contact email');
assert.ok(freeTermsDraft.includes('https://cbam-local-pwa.vercel.app/terms'), 'free terms draft should include the public terms URL');
assert.ok(firstDeploymentRunbook.includes('openbrain.main@gmail.com'), 'first deployment runbook should include the public contact email');
assert.ok(operatorReview.includes('https://cbam-local-pwa.vercel.app/'), 'operator review should include the deployed beta URL');
assert.ok(operatorReview.includes('https://cbam-local-pwa.vercel.app/announcement'), 'operator review should include the public announcement URL');
assert.ok(operatorReview.includes('https://cbam-local-pwa.vercel.app/terms'), 'operator review should include the public terms URL');
assert.ok(operatorReview.includes('LEGAL_REVIEW_REQUIRED'), 'operator review should keep legal review status visible before approval');
assert.ok(operatorReview.includes('OPERATOR_REVIEW_REQUIRED'), 'operator review should keep operator review status visible before approval');
assert.ok(goNoGoRecord.includes('DECISION_REQUIRED'), 'Go/No-Go record should remain decision-required before approval');
assert.ok(goNoGoRecord.includes('https://cbam-local-pwa.vercel.app/'), 'Go/No-Go record should include the deployed beta URL');
assert.ok(goNoGoRecord.includes('https://cbam-local-pwa.vercel.app/terms'), 'Go/No-Go record should include the public terms URL');
assert.ok(goNoGoRecord.includes('LEGAL_REVIEW_APPROVED'), 'Go/No-Go record should document the legal approval status value');
assert.ok(goNoGoRecord.includes('OPERATOR_REVIEW_APPROVED'), 'Go/No-Go record should document the operator approval status value');

assert.equal(packageJson.private, true, 'package.json should keep private true');
assert.ok(deploymentGuide.includes('GitHub 저장소는 Private'), 'deployment guide should keep the source repository private');
assert.ok(deploymentGuide.includes('CBAM_documents/'), 'deployment guide should forbid local reference documents in deploy artifacts');
assert.ok(deploymentGuide.includes('공식 EU 템플릿'), 'deployment guide should forbid bundling official EU templates');
assert.ok(deploymentGuide.includes('npm run verify'), 'deployment guide should require the standard verification command');
assert.ok(deploymentGuide.includes('JavaScript 번들'), 'deployment guide should explain browser bundle visibility');
assert.ok(deploymentGuide.includes('docs/first-deployment-runbook.md'), 'deployment guide should link the first deployment runbook');
assert.ok(firstDeploymentRunbook.includes('npm run release:status'), 'first deployment runbook should include release status check');
assert.equal(packageJson.scripts['release:status'], 'node scripts/release-status.mjs', 'package.json should expose release status command');
assert.equal(packageJson.scripts['release:approval'], 'node scripts/verify-release-approval.mjs', 'package.json should expose release approval command');
assert.ok(goNoGoRecord.includes('npm.cmd run release:approval'), 'Go/No-Go record should include the approval gate command');

for (const required of [
  'Private GitHub',
  'Vercel',
  'npm run verify',
  'CBAM_documents/',
  '.cbam',
  'Network',
  'docs/mvp-fictional-dataset.md',
  '롤백',
]) {
  assert.ok(firstDeploymentRunbook.includes(required), `first deployment runbook should include ${required}`);
}

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
