import { existsSync, readFileSync } from 'node:fs';

const files = {
  report: 'docs/mvp-rehearsal-report.md',
  terms: 'docs/free-pwa-terms-draft.md',
  announcement: 'docs/free-pwa-release-announcement-draft.md',
  decision: 'docs/v0.1.0-beta-go-no-go-record.md',
};

function read(path) {
  if (!existsSync(path)) {
    throw new Error(`Missing required file: ${path}`);
  }

  return readFileSync(path, 'utf8');
}

function statusOf(text) {
  return text.match(/^Status:\s*(.+)$/m)?.[1]?.trim() ?? '';
}

function fieldValue(text, fieldName) {
  return text.match(new RegExp(`^- ${fieldName}:[ \\t]*([^\\r\\n]*)$`, 'm'))?.[1]?.trim() ?? '';
}

function releaseBlockers(report) {
  const marker = '## Release Blockers';
  const start = report.indexOf(marker);

  if (start === -1) {
    return ['Release Blockers section is missing.'];
  }

  return report
    .slice(start + marker.length)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

const report = read(files.report);
const terms = read(files.terms);
const announcement = read(files.announcement);
const decision = read(files.decision);

const checks = [
  {
    label: 'Free-use terms approved',
    ok: statusOf(terms) === 'LEGAL_REVIEW_APPROVED',
    fix: 'Set docs/free-pwa-terms-draft.md to `Status: LEGAL_REVIEW_APPROVED` after review.',
  },
  {
    label: 'Release announcement approved',
    ok: statusOf(announcement) === 'OPERATOR_REVIEW_APPROVED',
    fix: 'Set docs/free-pwa-release-announcement-draft.md to `Status: OPERATOR_REVIEW_APPROVED` after review.',
  },
  {
    label: 'Go/No-Go record marked GO',
    ok: statusOf(decision) === 'GO' && fieldValue(decision, 'Decision') === 'GO',
    fix: 'Set docs/v0.1.0-beta-go-no-go-record.md to `Status: GO` and `- Decision: GO`.',
  },
  {
    label: 'Decision date recorded',
    ok: Boolean(fieldValue(decision, 'Decision date')),
    fix: 'Fill `- Decision date:` in docs/v0.1.0-beta-go-no-go-record.md.',
  },
  {
    label: 'Reviewer recorded',
    ok: Boolean(fieldValue(decision, 'Reviewer')),
    fix: 'Fill `- Reviewer:` in docs/v0.1.0-beta-go-no-go-record.md.',
  },
  {
    label: 'Reviewed commit recorded',
    ok: Boolean(fieldValue(decision, 'Commit reviewed')),
    fix: 'Fill `- Commit reviewed:` in docs/v0.1.0-beta-go-no-go-record.md.',
  },
  {
    label: 'Announcement channel recorded',
    ok: Boolean(fieldValue(decision, 'Announcement channel')),
    fix: 'Fill `- Announcement channel:` in docs/v0.1.0-beta-go-no-go-record.md.',
  },
  {
    label: 'Release blockers cleared',
    ok: releaseBlockers(report).length === 0,
    fix: 'Remove resolved blocker bullets from the Release Blockers section in docs/mvp-rehearsal-report.md.',
  },
  {
    label: 'Public privacy/data notice linked',
    ok: decision.includes('https://cbam-local-pwa.vercel.app/privacy') &&
      announcement.includes('https://cbam-local-pwa.vercel.app/privacy'),
    fix: 'Keep the privacy/data notice URL in the Go/No-Go record and release announcement.',
  },
];

const failed = checks.filter((check) => !check.ok);

console.log('CBAM Local v0.1.0-beta approval gate');
for (const check of checks) {
  console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.label}`);
}

if (failed.length > 0) {
  console.log('\nRequired before GO:');
  for (const check of failed) {
    console.log(`- ${check.fix}`);
  }
  process.exit(1);
}

console.log('\nRelease approval gate passed. v0.1.0-beta is approved for the recorded distribution channel.');
