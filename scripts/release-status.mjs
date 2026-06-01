import { existsSync, readFileSync } from 'node:fs';

const requiredDocs = [
  'docs/mvp-release-checklist.md',
  'docs/v0.1.0-beta-release-checklist.md',
  'docs/mvp-rehearsal-plan.md',
  'docs/mvp-fictional-dataset.md',
  'docs/mvp-rehearsal-report.md',
  'docs/excel-recalculation-review.md',
  'docs/free-pwa-terms-draft.md',
  'docs/free-pwa-release-announcement-draft.md',
  'docs/v0.1.0-beta-operator-review.md',
  'docs/v0.1.0-beta-go-no-go-record.md',
  'docs/pwa-deployment-guide.md',
  'docs/first-deployment-runbook.md',
  'SECURITY.md',
];

const requiredCommands = [
  'npm run verify',
  'npm run verify:local-eu-template',
  'npm run verify:local-references',
  'npm run verify:excel-recalc-cases',
];

function read(path) {
  return readFileSync(path, 'utf8');
}

function extractReleaseBlockers(report) {
  const marker = '## Release Blockers';
  const start = report.indexOf(marker);

  if (start === -1) {
    return ['Release Blockers section is missing from docs/mvp-rehearsal-report.md'];
  }

  return report
    .slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

const missingDocs = requiredDocs.filter((path) => !existsSync(path));
const report = existsSync('docs/mvp-rehearsal-report.md') ? read('docs/mvp-rehearsal-report.md') : '';
const releaseChecklist = existsSync('docs/mvp-release-checklist.md') ? read('docs/mvp-release-checklist.md') : '';
const rehearsalPlan = existsSync('docs/mvp-rehearsal-plan.md') ? read('docs/mvp-rehearsal-plan.md') : '';
const deploymentGuide = existsSync('docs/pwa-deployment-guide.md') ? read('docs/pwa-deployment-guide.md') : '';
const firstDeploymentRunbook = existsSync('docs/first-deployment-runbook.md') ? read('docs/first-deployment-runbook.md') : '';
const termsDraft = existsSync('docs/free-pwa-terms-draft.md') ? read('docs/free-pwa-terms-draft.md') : '';
const announcementDraft = existsSync('docs/free-pwa-release-announcement-draft.md') ? read('docs/free-pwa-release-announcement-draft.md') : '';
const operatorReview = existsSync('docs/v0.1.0-beta-operator-review.md') ? read('docs/v0.1.0-beta-operator-review.md') : '';
const goNoGoRecord = existsSync('docs/v0.1.0-beta-go-no-go-record.md') ? read('docs/v0.1.0-beta-go-no-go-record.md') : '';
const releaseDocsText = [
  report,
  releaseChecklist,
  rehearsalPlan,
  deploymentGuide,
  firstDeploymentRunbook,
  operatorReview,
  goNoGoRecord,
].join('\n');

const blockers = extractReleaseBlockers(report);
const hasDeploymentRehearsal = report.includes('## Vercel Deployment Browser Rehearsal') &&
  report.includes('https://cbam-local-pwa.vercel.app/') &&
  report.includes('Status: passed');
const missingCommandReferences = requiredCommands.filter(
  (command) => !releaseDocsText.includes(command)
);
const unresolvedDraftSignals = [
  termsDraft.includes('LEGAL_REVIEW_REQUIRED')
    ? 'Free-use terms still require legal review.'
    : undefined,
  announcementDraft.includes('OPERATOR_REVIEW_REQUIRED')
    ? 'Release announcement still requires operator review.'
    : undefined,
  goNoGoRecord.includes('DECISION_REQUIRED')
    ? 'Go/No-Go decision record is not finalized.'
    : undefined,
  /\[[^\]]+\]/.test(announcementDraft) ? 'Release announcement still contains bracketed placeholder fields.' : undefined,
  report.includes('Complete manual Excel formula recalculation review')
    ? 'Manual Excel recalculation review is still recorded as incomplete.'
    : undefined,
  report.includes('Complete full browser walkthrough using a fictional company dataset')
    ? 'Manual browser walkthrough is still recorded as incomplete.'
    : undefined,
].filter(Boolean);

const isReady = missingDocs.length === 0 &&
  missingCommandReferences.length === 0 &&
  blockers.length === 0 &&
  unresolvedDraftSignals.length === 0;

console.log('CBAM Local PWA release status');
console.log(`Status: ${isReady ? 'READY' : 'NOT READY'}`);

if (missingDocs.length > 0) {
  console.log('\nMissing required documents:');
  for (const item of missingDocs) {
    console.log(`- ${item}`);
  }
}

if (missingCommandReferences.length > 0) {
  console.log('\nMissing command references:');
  for (const item of missingCommandReferences) {
    console.log(`- ${item}`);
  }
}

if (blockers.length > 0) {
  console.log('\nRelease blockers recorded in rehearsal report:');
  for (const item of blockers) {
    console.log(`- ${item}`);
  }
}

if (unresolvedDraftSignals.length > 0) {
  console.log('\nUnresolved draft/manual signals:');
  for (const item of unresolvedDraftSignals) {
    console.log(`- ${item}`);
  }
}

console.log('\nNext operator actions:');
if (report.includes('Complete full browser walkthrough using a fictional company dataset')) {
  console.log('- Run the browser rehearsal with docs/mvp-fictional-dataset.md.');
}
if (report.includes('Complete manual Excel formula recalculation review')) {
  console.log('- Open the generated EU workbook copy in Microsoft Excel and record formula review results.');
}
if (unresolvedDraftSignals.some((signal) => signal.includes('legal review') || signal.includes('operator review'))) {
  console.log('- Finalize legal/operational wording in the terms and announcement draft.');
  console.log('- After approval, change statuses to LEGAL_REVIEW_APPROVED and OPERATOR_REVIEW_APPROVED.');
}
if (goNoGoRecord.includes('DECISION_REQUIRED')) {
  console.log('- Complete docs/v0.1.0-beta-go-no-go-record.md with the final GO/NO-GO decision.');
}
if (hasDeploymentRehearsal) {
  console.log('- Use docs/v0.1.0-beta-operator-review.md for the limited beta Go/No-Go review.');
} else {
  console.log('- Execute docs/first-deployment-runbook.md for the first private-source deployment.');
}
