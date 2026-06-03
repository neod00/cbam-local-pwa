import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const files = {
  sidebar: readFileSync('src/components/Sidebar.tsx', 'utf8'),
  appShell: readFileSync('src/components/AppShell.tsx', 'utf8'),
  workflowRouteBanner: readFileSync('src/components/WorkflowRouteBanner.tsx', 'utf8'),
  layout: readFileSync('src/app/layout.tsx', 'utf8'),
  dashboard: readFileSync('src/app/page.tsx', 'utf8'),
  guide: readFileSync('src/app/guide/page.tsx', 'utf8'),
  export: readFileSync('src/app/export/page.tsx', 'utf8'),
  installations: readFileSync('src/app/installations/page.tsx', 'utf8'),
  products: readFileSync('src/app/products/page.tsx', 'utf8'),
  upload: readFileSync('src/app/upload/page.tsx', 'utf8'),
  processes: readFileSync('src/app/processes/page.tsx', 'utf8'),
  sourceStreams: readFileSync('src/app/source-streams/page.tsx', 'utf8'),
  precursors: readFileSync('src/app/precursors/page.tsx', 'utf8'),
  results: readFileSync('src/app/results/page.tsx', 'utf8'),
  scenarios: readFileSync('src/app/scenarios/page.tsx', 'utf8'),
  settings: readFileSync('src/app/settings/page.tsx', 'utf8'),
  workflowGuide: readFileSync('src/lib/workflow-guide.ts', 'utf8'),
  freeLicenseClient: readFileSync('src/lib/free-license-client.ts', 'utf8'),
};

function includesAll(source, values, label) {
  for (const value of values) {
    assert.ok(source.includes(value), `${label} should include ${value}`);
  }
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

includesAll(files.appShell, ['WorkflowRouteBanner', 'UpdateNotice', 'PeriodBadge'], 'app shell');
includesAll(files.workflowRouteBanner, ['현재 흐름', '다음:', '전체 흐름'], 'workflow route banner');
assert.ok(files.layout.includes('local-first') || files.layout.includes('로컬'), 'metadata should describe the local-first CBAM tool');

includesAll(files.dashboard, [
  'CBAM 신고 지원자료 작업실',
  '무엇부터 하면 되나요?',
  '사업장 등록',
  '품목 추가',
  '배출량 입력',
  '상세 가이드와 검토 정보 펼치기',
  '자료 준비 체크리스트',
  'WorkflowGuideCard',
], 'dashboard');
assert.equal(files.dashboard.includes('벤치마크와 국가/CN 기본값 기준자료를 가져오세요.'), false, 'dashboard should not put official reference upload as the first beginner CTA copy');

includesAll(files.guide, ['시작 가이드', '먼저 이것만 하세요', '전체 12단계 상세 보기', 'Hot Rolled Coil'], 'guide page');
includesAll(files.workflowGuide, ['Excel 공식 수식 재계산', '.cbam 백업 보관'], 'workflow guide');

includesAll(files.export, [
  '게이트 요약',
  '첫 번째 항목 수정',
  '수입자 전달용 복사본 생성',
  '공식 수식',
  'Excel에서 생성된 복사본을 열면',
  '전달 전 최종 확인',
  '최신 EU 원본 템플릿',
  '.cbam 백업 보관',
], 'Export page');

includesAll(files.installations, ['1. 사업장 식별정보', '2. 주소와 위치', '등록된 사업장이 없습니다'], 'Installations page');
includesAll(files.products, ['직접배출 중심', 'EU 수출 품목 코드 목록', '고급 규정 정보'], 'Products page');
includesAll(files.upload, ['공식 기준값 업로드', '사용 가능', '일괄 업로드 준비 중', 'MVP 이후'], 'Upload page');
includesAll(files.processes, ['생산공정 다음 작업', '제품 생산라인 배분', '배출원 자료부터 보완하세요'], 'Processes page');
includesAll(files.sourceStreams, ['배출원 자료 다음 작업', '생산공정 연결', '증빙 출처'], 'Source streams page');
includesAll(files.precursors, ['전구물질 다음 작업', '기본값 사용 사유', '실제자료 검증 상태'], 'Precursors page');
includesAll(files.results, ['제품별 SEE 산정 결과', 'CBAM 산정 기준 SEE', '내부 검토용 total SEE', '제품 1톤당 CBAM 계산에 사용할 배출량'], 'Results page');
includesAll(files.scenarios, ['인증서 비용 시나리오', '비용을 대략 검토하는 고급 단계', '사전 검토용 시나리오', 'carbon price paid evidence'], 'Scenarios page');
assert.equal(files.scenarios.includes('공식 산식 확정 전까지'), false, 'Scenarios page should not imply 2026 formulas are not final');

includesAll(files.settings, [
  '법률 자문, 공식 검증, 최종 신고 책임을 대체하지 않습니다',
  '로컬 사용 안전 체크리스트',
  '브라우저 로컬 저장',
  '중요 변경 후 .cbam 백업',
  '전달 전 공식 확인',
  '.cbam 백업',
  '무료 라이선스',
  'CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 무료 PWA의 라이선스/업데이트 확인 과정에서 서버로 전송하지 않습니다',
  '업데이트 상태',
  '약관/고지 보기',
  '업데이트 상태 확인',
  '라이선스 등록에는 이메일, 회사명, 담당자명, 연락처, 국가, 업종, 앱 버전만 사용됩니다',
  'handleLicenseSubmit',
  'handleLicenseStatusCheck',
  'contact_phone',
], 'Settings page');

includesAll(files.freeLicenseClient, [
  'license:free-registration',
  'NEXT_PUBLIC_LICENSE_API_URL',
  '/api/license/register',
  '/api/license/status',
  'accepted_terms_version',
  'app_version',
  'OFFLINE_ALLOWED',
], 'free license client');

console.log('MVP flow verification passed.');
