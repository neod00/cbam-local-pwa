import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

assert.ok(existsSync('DESIGN.md'), 'DESIGN.md should exist');

const design = readFileSync('DESIGN.md', 'utf8');
const guidedWorkflow = readFileSync('docs/harness/user-guided-workflow.md', 'utf8');
const freeLicenseStrategy = readFileSync('docs/harness/free-license-strategy.md', 'utf8');
const updatePolicy = readFileSync('docs/harness/update-policy.md', 'utf8');
const adminPlan = readFileSync('docs/harness/admin-console-plan.md', 'utf8');

for (const required of [
  'Guided Compliance Workspace',
  'NextActionPanel',
  'WorkflowStepper',
  'FixCard',
  'ActionItemCard',
  'ExportGate',
  'LocalDataNotice',
  'EmptyState',
  '한국어',
  'EU 원본 템플릿',
  '무료 라이선스',
  'CBAM 입력 데이터 수집',
]) {
  assert.ok(design.includes(required), `DESIGN.md should include ${required}`);
}

for (const required of [
  '제출 준비 작업실',
  '다음 작업 계속하기',
  '사업장/보고기간',
  '품목 등록',
  '생산공정 설정',
  '배출원 자료',
  '전구물질 자료',
  'SEE 산정 결과',
  '시나리오 검토',
  'EU Export',
  '.cbam',
]) {
  assert.ok(guidedWorkflow.includes(required), `user-guided workflow should include ${required}`);
}

for (const required of [
  '배포 관리',
  '공지',
  '업데이트',
  'CBAM 입력 데이터',
  'Forbidden Data',
  'OFFLINE_ALLOWED',
  'BLOCKED',
]) {
  assert.ok(freeLicenseStrategy.includes(required), `free license strategy should include ${required}`);
}

for (const required of [
  'optional',
  'recommended',
  'required',
  'minimum_supported_version',
  'service worker',
  'IndexedDB',
]) {
  assert.ok(updatePolicy.includes(required), `update policy should include ${required}`);
}

for (const required of [
  'cbam-local',
  'cbam-admin',
  'license-api',
  '무료 라이선스 발급',
  '강제 업데이트',
  'Data Boundary',
  '.cbam',
]) {
  assert.ok(adminPlan.includes(required), `admin console plan should include ${required}`);
}

console.log('Design system verification passed.');
