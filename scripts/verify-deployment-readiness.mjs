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

for (const file of trackedFiles) {
  for (const pattern of forbiddenTrackedPatterns) {
    assert.equal(pattern.test(file), false, `deployment artifact should not track forbidden file: ${file}`);
  }
}

for (const localOnlyPath of ['CBAM_documents', 'artifacts', '.next', 'node_modules']) {
  assert.ok(
    existsSync(localOnlyPath) || localOnlyPath === 'artifacts',
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
for (const required of ['Status: passed', 'Release Blockers', 'Manual follow-up']) {
  assert.ok(rehearsalReport.includes(required), `rehearsal report should include ${required}`);
}

console.log('Deployment readiness verification passed.');
