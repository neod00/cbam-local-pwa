import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const adminDir = 'src/app/admin';
const adminPagePath = `${adminDir}/page.tsx`;
const appShell = readFileSync('src/components/AppShell.tsx', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const adminPlan = readFileSync('docs/harness/admin-console-plan.md', 'utf8');
const skillPath = 'C:/Users/NT940XHA/.codex/skills/cbam-admin-panel/SKILL.md';

assert.ok(existsSync(adminPagePath), 'admin page should exist');

const adminPage = readFileSync(adminPagePath, 'utf8');

for (const required of [
  'CBAM Local 관리자 콘솔',
  '무료 PWA 배포, 라이선스, 공지, 업데이트 정책',
  '생산량, 배출량, EU 템플릿',
  '.cbam 백업 파일은 저장하거나 조회하지 않습니다',
  '사용자/라이선스',
  '현재 업데이트 정책',
  '공지',
  '약관 버전',
  '감사/보안 체크',
  'NEXT_PUBLIC_LICENSE_API_URL',
]) {
  assert.ok(adminPage.includes(required), `admin page should include ${required}`);
}

for (const required of [
  '관리자 콘솔은 무료 PWA의 배포, 라이선스, 공지, 업데이트 정책',
  'license_users',
  'update_manifests',
  'announcements',
  'Data Boundary',
]) {
  assert.ok(adminPlan.includes(required), `admin plan should include ${required}`);
}

assert.ok(appShell.includes("'/admin': '관리자 콘솔'"), 'app shell should include admin route title');
assert.ok(serviceWorker.includes('"/admin"'), 'service worker should include admin route in the app shell');

if (existsSync(skillPath)) {
  const skill = readFileSync(skillPath, 'utf8');
  assert.ok(skill.includes('cbam-admin-panel'), 'cbam-admin-panel skill should be available');
  assert.ok(skill.includes('Forbidden data'), 'cbam-admin-panel skill should define forbidden data');
}

function listFiles(dir) {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    return stats.isDirectory() ? listFiles(path) : [path];
  });
}

const adminSource = listFiles(adminDir)
  .filter((file) => /\.(tsx|ts|js|mjs)$/.test(file))
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

for (const forbiddenImport of [
  '@/lib/local-db',
  '@/lib/calculation-engine',
  '@/lib/eu-template-export',
  '@/lib/scenario-calculation',
  '@/lib/reference-workbooks',
]) {
  assert.equal(adminSource.includes(forbiddenImport), false, `admin source should not import ${forbiddenImport}`);
}

for (const forbiddenApiField of [
  'source_stream',
  'precursor_id',
  'output_mass_t',
  'direct_emissions_tco2e',
  'indirect_emissions_tco2e',
  'see_cbam_basis',
  'see_informational_total',
  'template_file',
  'backup_file',
]) {
  assert.equal(adminSource.includes(forbiddenApiField), false, `admin source should not define forbidden API field ${forbiddenApiField}`);
}

console.log('Admin boundary verification passed.');
