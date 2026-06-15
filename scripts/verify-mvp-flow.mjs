import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const files = {
  sidebar: readFileSync('src/components/Sidebar.tsx', 'utf8'),
  appShell: readFileSync('src/components/AppShell.tsx', 'utf8'),
  licenseGate: readFileSync('src/components/LicenseGate.tsx', 'utf8'),
  dashboard: readFileSync('src/app/page.tsx', 'utf8'),
  guide: readFileSync('src/app/guide/page.tsx', 'utf8'),
  license: readFileSync('src/app/license/page.tsx', 'utf8'),
  export: readFileSync('src/app/export/page.tsx', 'utf8'),
  settings: readFileSync('src/app/settings/page.tsx', 'utf8'),
  workflowGuide: readFileSync('src/lib/workflow-guide.ts', 'utf8'),
  freeLicenseClient: readFileSync('src/lib/free-license-client.ts', 'utf8'),
};

function includesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`);
  }
}

for (const routePath of [
  'src/app/page.tsx',
  'src/app/guide/page.tsx',
  'src/app/license/page.tsx',
  'src/app/settings/page.tsx',
  'src/app/terms/page.tsx',
  'src/app/privacy/page.tsx',
  'src/app/export/page.tsx',
  'src/app/products/page.tsx',
  'src/app/processes/page.tsx',
  'src/app/source-streams/page.tsx',
  'src/app/precursors/page.tsx',
  'src/app/results/page.tsx',
  'src/app/scenarios/page.tsx',
]) {
  assert.ok(existsSync(routePath), `${routePath} should exist`);
}

for (const href of [
  '/',
  '/guide',
  '/announcement',
  '/installations',
  '/periods',
  '/products',
  '/processes',
  '/source-streams',
  '/precursors',
  '/upload',
  '/results',
  '/scenarios',
  '/export',
  '/settings',
  '/terms',
  '/privacy',
]) {
  assert.ok(files.sidebar.includes(href), `sidebar should link ${href}`);
}

includesAll(files.appShell, ['LicenseGate', 'WorkflowRouteBanner', 'UpdateNotice', 'PeriodBadge', '무료 사용 등록'], 'app shell');
includesAll(files.licenseGate, [
  'FREE_LICENSE_SETTING_KEY',
  'canUseCoreApp',
  'isLicenseBlocked',
  'isLicenseExpired',
  '무료 라이선스 필요',
  '승인 대기',
  '사용기한 만료',
  '사용 제한',
  '/license',
  '.cbam 백업/복원',
  '생산량, 배출량, 품목/CN 산정값은 전송하지 않습니다',
], 'license gate');

includesAll(files.freeLicenseClient, [
  'license:free-registration',
  'LICENSE_GATE_OPEN_ROUTES',
  '/license',
  '/settings',
  '/api/license/register',
  '/api/license/status',
  'canUseCoreApp',
  'isLicenseBlocked',
  'isLicenseExpired',
  'OFFLINE_ALLOWED',
  'BLOCKED',
], 'free license client');

includesAll(files.license, [
  '무료 사용 등록',
  'CBAM Local 시작하기',
  '일반 회원가입처럼 먼저 등록',
  '관리자 승인 후',
  '이메일 *',
  '회사명 *',
  '담당자명 *',
  '연락처 *',
  '기존 등록자 복구',
  '인증코드 받기',
  '인증하고 라이선스 불러오기',
  '생산량, 배출량, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다',
  '.cbam 백업/복원',
  'registerFreeLicense',
  'requestFreeLicenseRecoveryCode',
  'verifyFreeLicenseRecoveryCode',
  'setLocalSetting',
], 'license registration page');

includesAll(files.settings, [
  '.cbam',
  '무료 라이선스',
  'handleLicenseStatusCheck',
  '무료 사용 등록/복구',
  'href="/license"',
  '배포 관리 정보만 사용됩니다',
], 'Settings page');

includesAll(files.export, [
  'Summary_Products',
  '.cbam',
  'EU',
  '수출 유형별 대응 범위',
  '유형 2',
], 'Export page');

includesAll(readFileSync('src/app/source-streams/page.tsx', 'utf8'), [
  'MRV 원칙 체크',
  '활동자료 산정요소',
  '배출계수 기준',
  '공용 배출원 배분',
  '완전성',
  '투명성',
], 'source-stream MRV guidance');

includesAll(readFileSync('src/app/processes/page.tsx', 'utf8'), [
  '산정경계 포함·제외 검토',
  '제외 후보',
  '같은 제품의 여러 생산경로 처리',
], 'process boundary guidance');

includesAll(files.dashboard, ['WorkflowGuideCard'], 'dashboard');
includesAll(files.guide, ['Hot Rolled Coil', '배출량 산정 5단계', 'CN 코드 확인', 'SEE 확인·전달'], 'guide page');
includesAll(files.workflowGuide, ['Excel', '.cbam'], 'workflow guide');

for (const [label, source] of Object.entries({
  dashboard: files.dashboard,
  export: files.export,
  settings: files.settings,
})) {
  assert.equal(source.includes('seedLocalData('), false, `${label} should not auto-seed sample data`);
}

for (const routePath of [
  'src/app/products/page.tsx',
  'src/app/installations/page.tsx',
  'src/app/periods/page.tsx',
  'src/app/processes/page.tsx',
  'src/app/source-streams/page.tsx',
  'src/app/precursors/page.tsx',
  'src/app/results/page.tsx',
  'src/app/scenarios/page.tsx',
]) {
  const source = readFileSync(routePath, 'utf8');
  assert.equal(source.includes('seedLocalData('), false, `${routePath} should not auto-seed sample data`);
}

console.log('MVP flow verification passed.');
