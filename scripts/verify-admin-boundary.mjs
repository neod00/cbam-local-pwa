import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const adminDir = 'src/app/admin';
const adminApiDir = 'src/app/api/admin';
const adminPagePath = `${adminDir}/page.tsx`;
const adminLoginPath = `${adminDir}/login/page.tsx`;
const skillPath = 'C:/Users/NT940XHA/.codex/skills/cbam-admin-panel/SKILL.md';

assert.ok(existsSync(adminPagePath), 'admin page should exist');
assert.ok(existsSync(adminLoginPath), 'admin login page should exist');
assert.ok(existsSync('src/app/api/auth/[...nextauth]/route.ts'), 'Auth.js route handler should exist');

const adminPage = readFileSync(adminPagePath, 'utf8');
const adminLogin = readFileSync(adminLoginPath, 'utf8');
const appShell = readFileSync('src/components/AppShell.tsx', 'utf8');
const adminShell = readFileSync('src/components/AdminShell.tsx', 'utf8');
const serviceWorker = readFileSync('public/sw.js', 'utf8');
const adminPlan = readFileSync('docs/harness/admin-console-plan.md', 'utf8');
const authConfig = readFileSync('src/auth.ts', 'utf8');
const adminAuth = readFileSync('src/lib/admin-auth.ts', 'utf8');
const adminConsoleData = readFileSync('src/lib/admin-console-data.ts', 'utf8');
const adminActions = readFileSync('src/lib/admin-actions.ts', 'utf8');
const adminAnnouncement = readFileSync('src/lib/admin-announcement.ts', 'utf8');
const adminLicenseStatus = readFileSync('src/lib/admin-license-status.ts', 'utf8');
const adminUpdatePolicy = readFileSync('src/lib/admin-update-policy.ts', 'utf8');
const proxy = readFileSync('proxy.ts', 'utf8');

for (const required of [
  'CBAM Local 관리자 콘솔',
  '무료 PWA 배포, 라이선스, 공지, 업데이트 정책만 관리',
  '생산량, 배출량, 전구물질, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다',
  '사용자/라이선스',
  '현재 업데이트 정책',
  '공지',
  '약관 버전',
  '감사/보안 체크',
  '오늘 확인할 운영 작업',
  '연락처',
  'Neon 연결 상태',
  'getAdminConsoleData',
  'updateLicenseUserStatus',
  'createUpdateManifest',
  'createAnnouncement',
  'createTermsVersion',
  'ADMIN_ANNOUNCEMENT_SEVERITIES',
  'ADMIN_LICENSE_STATUSES',
  'ADMIN_UPDATE_POLICIES',
  '상태 변경 가능',
  '새 업데이트 정책 저장',
  '공지 등록',
  '새 약관 버전 등록',
  'admin_message',
]) {
  assert.ok(adminPage.includes(required), `admin page should include ${required}`);
}

for (const required of [
  'CBAM Local 관리자 로그인',
  'Google 계정으로 로그인',
  'ADMIN_ALLOWED_EMAILS',
  'AUTH_GOOGLE_ID / SECRET',
  'AUTH_TRUST_HOST=true',
  '생산량, 배출량, 전구물질, EU 템플릿',
  '.cbam 백업 파일은 서버로 전송하지',
]) {
  assert.ok(adminLogin.includes(required), `admin login page should include ${required}`);
}

for (const required of ['license_users', 'update_manifests', 'announcements', 'Data Boundary', 'Neon']) {
  assert.ok(adminPlan.includes(required), `admin plan should include ${required}`);
}

for (const required of [
  'getAdminSql',
  'license_users',
  'update_manifests',
  'announcements',
  'terms_versions',
  'sampleData',
  "source: 'live'",
  "source: 'sample'",
  'id',
  'contact_phone',
  'notice_title',
  'notice_body',
  'release_notes_url',
  'body',
  'severity',
  'body_url',
  'is_required',
]) {
  assert.ok(adminConsoleData.includes(required), `admin console data loader should include ${required}`);
}

for (const required of [
  'use server',
  'auth',
  'isAllowedAdminEmail',
  'license_users',
  'license_status',
  'updated_at = now()',
  'revalidatePath',
  'redirect',
  'update_manifests',
  'announcements',
  'terms_versions',
]) {
  assert.ok(adminActions.includes(required), `admin actions should include ${required}`);
}
assert.ok(adminAnnouncement.includes('ADMIN_ANNOUNCEMENT_SEVERITIES'), 'admin announcement helper should define allowed severities');
assert.ok(adminLicenseStatus.includes('ADMIN_LICENSE_STATUSES'), 'admin license status helper should define allowed statuses');
assert.ok(adminUpdatePolicy.includes('ADMIN_UPDATE_POLICIES'), 'admin update policy helper should define allowed policies');

assert.ok(appShell.includes("pathname.startsWith('/admin')"), 'app shell should route admin paths to the dedicated admin shell');
assert.ok(appShell.includes('<AdminShell>{children}</AdminShell>'), 'app shell should render AdminShell for admin paths');
assert.ok(adminShell.includes('CBAM Local Admin'), 'admin shell should render a dedicated admin header');
assert.ok(adminShell.includes('사용자 앱'), 'admin shell should link back to the user app without showing the user sidebar');
assert.equal(serviceWorker.includes('"/admin"'), false, 'protected admin route should not be pre-cached by the service worker');
assert.equal(serviceWorker.includes('"/admin/login"'), false, 'admin login should not be pre-cached by the service worker');

assert.ok(authConfig.includes('next-auth/providers/google'), 'auth config should use Google OAuth');
assert.ok(authConfig.includes('signIn({ profile, user })'), 'auth config should restrict sign-ins');
assert.ok(authConfig.includes("signIn: '/admin/login'"), 'auth config should use the custom admin login page');
assert.ok(adminAuth.includes('ADMIN_ALLOWED_EMAILS'), 'admin auth should support an email allowlist');
assert.ok(adminAuth.includes('openbrain.main@gmail.com'), 'admin auth should default to the provided operator email');
assert.ok(proxy.includes("pathname.startsWith('/admin')"), 'proxy should protect admin pages');
assert.ok(proxy.includes("pathname.startsWith('/api/admin')"), 'proxy should protect admin APIs');
assert.ok(proxy.includes("'/admin/login'"), 'proxy should keep admin login public');

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

const adminSource = [
  ...listFiles(adminDir)
    .filter((file) => /\.(tsx|ts|js|mjs)$/.test(file))
    .map((file) => readFileSync(file, 'utf8')),
  ...(existsSync(adminApiDir)
    ? listFiles(adminApiDir)
      .filter((file) => /\.(tsx|ts|js|mjs)$/.test(file))
      .map((file) => readFileSync(file, 'utf8'))
    : []),
  adminConsoleData,
  adminActions,
  adminAnnouncement,
  adminLicenseStatus,
  adminUpdatePolicy,
  adminAuth,
  authConfig,
  proxy,
].join('\n');

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
  'production_volume',
  'supplier_evidence',
]) {
  assert.equal(adminSource.includes(forbiddenApiField), false, `admin source should not define forbidden API field ${forbiddenApiField}`);
}

console.log('Admin boundary verification passed.');
