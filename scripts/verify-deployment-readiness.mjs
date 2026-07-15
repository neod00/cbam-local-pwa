import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const trackedFiles = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .split(/\r?\n/)
  .filter(Boolean);

const forbiddenTrackedPatterns = [
  /^CBAM_documents(?:\/|$)/,
  /^artifacts(?:\/|$)/,
  /^\.env(?:\.|$)/,
  /^\.vercel(?:\/|$)/,
  /\.(?:cbam|xlsx|xls|xlsm|pdf|zip)$/i,
];

// 정책 변경(약관 §3 개정): 공식 EU Communication Template 사본 1개는 편의를 위해 의도적으로
// 앱에 내장한다(public/templates). 그 외 Excel/PDF/ZIP/.cbam/로컬 자료는 여전히 추적 금지.
const allowedTrackedFiles = new Set([
  'public/templates/CBAM_Communication_template_for_installations_en_20241213.xlsx',
]);

for (const file of trackedFiles) {
  if (allowedTrackedFiles.has(file)) {
    continue;
  }

  for (const pattern of forbiddenTrackedPatterns) {
    assert.equal(pattern.test(file), false, `deployment artifact should not track forbidden file: ${file}`);
  }
}

for (const localOnlyPath of ['CBAM_documents', 'node_modules']) {
  assert.ok(
    existsSync(localOnlyPath),
    `${localOnlyPath} check should run from the project root`
  );
}

const gitignore = readFileSync('.gitignore', 'utf8');
for (const requiredIgnore of ['CBAM_documents/', 'artifacts', '.env*', '.vercel', '.next/']) {
  assert.ok(gitignore.includes(requiredIgnore), `.gitignore should exclude ${requiredIgnore}`);
}

const packageJson = JSON.parse(readFileSync('package.json', 'utf8'));
assert.equal(packageJson.private, true, 'package.json should remain private for private-source distribution');

const deploymentGuide = readFileSync('docs/pwa-deployment-guide.md', 'utf8');
for (const required of [
  'Vercel',
  'Private GitHub',
  'CBAM_documents/',
  'EU',
  '.cbam',
  'JavaScript',
  'npm run verify',
]) {
  assert.ok(deploymentGuide.includes(required), `deployment guide should include ${required}`);
}

const releaseChecklist = readFileSync('docs/mvp-release-checklist.md', 'utf8');
for (const required of [
  'Private',
  'docs/mvp-rehearsal-report.md',
  'docs/free-pwa-terms-draft.md',
  'JavaScript',
]) {
  assert.ok(releaseChecklist.includes(required), `release checklist should include ${required}`);
}

const rehearsalReport = readFileSync('docs/mvp-rehearsal-report.md', 'utf8');
for (const required of ['Status: passed', 'Release Blockers', 'Beta Browser Rehearsal', 'Microsoft Excel recalculation result']) {
  assert.ok(rehearsalReport.includes(required), `rehearsal report should include ${required}`);
}

console.log('Deployment readiness verification passed.');
