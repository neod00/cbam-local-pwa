import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const appShell = readFileSync('src/components/AppShell.tsx', 'utf8');
const workflowRouteBanner = readFileSync('src/components/WorkflowRouteBanner.tsx', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');
const dashboard = readFileSync('src/app/page.tsx', 'utf8');
const guidePage = readFileSync('src/app/guide/page.tsx', 'utf8');
const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
const installationsPage = readFileSync('src/app/installations/page.tsx', 'utf8');
const productsPage = readFileSync('src/app/products/page.tsx', 'utf8');
const uploadPage = readFileSync('src/app/upload/page.tsx', 'utf8');
const processesPage = readFileSync('src/app/processes/page.tsx', 'utf8');
const sourceStreamsPage = readFileSync('src/app/source-streams/page.tsx', 'utf8');
const precursorsPage = readFileSync('src/app/precursors/page.tsx', 'utf8');
const resultsPage = readFileSync('src/app/results/page.tsx', 'utf8');
const scenariosPage = readFileSync('src/app/scenarios/page.tsx', 'utf8');
const settingsPage = readFileSync('src/app/settings/page.tsx', 'utf8');
const workflowGuide = readFileSync('src/lib/workflow-guide.ts', 'utf8');

const workflowRoutes = [
  ['시작 가이드', '/guide'],
  ['배포 안내', '/announcement'],
  ['품목 관리', '/products'],
  ['생산공정', '/processes'],
  ['배출원 자료', '/source-streams'],
  ['구매 전구물질', '/precursors'],
  ['산정 결과', '/results'],
  ['인증서 비용 시나리오', '/scenarios'],
  ['EU Communication', '/export'],
  ['데이터 안전', '/settings'],
  ['약관/고지', '/terms'],
  ['개인정보 안내', '/privacy'],
];

for (const [label, href] of workflowRoutes) {
  assert.ok(sidebar.includes(label), `sidebar should include ${label}`);
  assert.ok(sidebar.includes(href), `sidebar should link ${href}`);
}

for (const label of ['홈', '품목', '결과', '설정']) {
  assert.ok(sidebar.includes(label), `mobile navigation should include ${label}`);
}

for (const label of ['대시보드', '시작 가이드', '베타 배포 안내', '품목 관리', '개인정보 및 데이터 처리', '생산공정', '인증서 비용 시나리오', 'EU Communication Template Export', '데이터 안전']) {
  assert.ok(appShell.includes(label), `topbar route title should include ${label}`);
}

assert.ok(layout.includes('로컬 우선 CBAM 내재배출량 산정 도구'), 'metadata should describe the local-first CBAM tool');
assert.ok(appShell.includes('WorkflowRouteBanner'), 'app shell should render the current-route workflow banner');
assert.ok(workflowRouteBanner.includes('현재 흐름'), 'workflow route banner should show the current workflow step');
assert.ok(workflowRouteBanner.includes('다음:'), 'workflow route banner should link the next workflow step');
assert.ok(workflowRouteBanner.includes('전체 흐름'), 'workflow route banner should link the guide page');
assert.ok(dashboard.includes('사업장, 제품, 생산공정, 전구물질'), 'dashboard should describe the core local workflow');
assert.ok(dashboard.includes('CBAM 신고 지원자료 작업실'), 'dashboard should present the guided workspace');
assert.ok(dashboard.includes('무엇부터 하면 되나요?'), 'dashboard should expose beginner-first start guidance');
assert.ok(dashboard.includes('사업장 등록') && dashboard.includes('품목 추가') && dashboard.includes('배출량 입력'), 'dashboard should show the first three beginner actions');
assert.equal(dashboard.includes('벤치마크와 국가/CN 기본값 기준자료를 가져오세요.'), false, 'dashboard should not put official reference upload as the first beginner CTA copy');
assert.ok(dashboard.includes('상세 가이드와 검토 정보 펼치기'), 'dashboard should keep detailed guidance behind an expandable section');
assert.ok(dashboard.includes('자료 준비 체크리스트'), 'dashboard should show evidence preparation guidance');
assert.ok(dashboard.includes('WorkflowGuideCard'), 'dashboard should include a compact first-run workflow guide');
assert.ok(guidePage.includes('시작 가이드'), 'guide page should introduce the first-run workflow');
assert.ok(guidePage.includes('먼저 이것만 하세요'), 'guide page should summarize the workflow into three beginner groups');
assert.ok(guidePage.includes('전체 12단계 상세 보기'), 'guide page should keep detailed steps behind an expandable section');
assert.ok(guidePage.includes('Hot Rolled Coil 리허설 기준'), 'guide page should expose the fictional HRC rehearsal path');
assert.ok(workflowGuide.includes('Excel 공식 수식 재계산'), 'guide workflow should include the manual Excel recalculation step');
assert.ok(workflowGuide.includes('.cbam 백업 보관'), 'guide workflow should include the local backup step');
assert.ok(exportPage.includes('게이트 요약'), 'Export should show a submission gate summary');
assert.ok(exportPage.includes('첫 번째 항목 수정'), 'Export should guide users to the first blocking issue');
assert.ok(exportPage.includes('수입자 전달용 복사본 생성'), 'Export should expose a clear final copy generation action');
assert.ok(exportPage.includes('공식 수식 셀이 계산하도록 직접 덮어쓰지 않습니다'), 'Export should preserve official formula cells');
assert.ok(exportPage.includes('Excel에서 생성된 복사본을 열면'), 'Export should tell users to review Excel formula outputs');
assert.ok(exportPage.includes('전달 전 최종 확인'), 'Export should show a final pre-transfer review card');
assert.ok(exportPage.includes('최신 EU 원본 템플릿'), 'Export should remind users to upload the latest official EU template');
assert.ok(exportPage.includes('법률 자문, 공식 검증, 회사 내부 승인, 최종 신고 책임을 대체하지 않습니다'), 'Export should repeat the final responsibility notice');
assert.ok(exportPage.includes('.cbam 백업 보관'), 'Export should remind users to keep a matching local backup');
assert.ok(installationsPage.includes('1. 사업장 식별정보'), 'Installations form should group required installation identification inputs');
assert.ok(installationsPage.includes('2. 주소와 위치'), 'Installations form should group address and location inputs');
assert.ok(installationsPage.includes('등록된 사업장이 없습니다'), 'Installations should show a guided empty state');
assert.ok(productsPage.includes('쉽게 말해 이 품목은 CBAM 인증서 산정 시 직접배출 중심'), 'Products should explain Annex II direct-only treatment in beginner-friendly Korean');
assert.ok(uploadPage.includes('공식 기준값 업로드') && uploadPage.includes('사용 가능'), 'Upload should identify official reference uploads as currently available');
assert.ok(uploadPage.includes('일괄 업로드 준비 중') && uploadPage.includes('MVP 이후'), 'Upload should mark activity-data bulk upload as post-MVP');
assert.ok(processesPage.includes('생산공정 다음 작업'), 'Processes should show next-action guidance');
assert.ok(processesPage.includes('제품 생산라인 배분'), 'Processes should guide allocation review');
assert.ok(processesPage.includes('배출원 자료부터 보완하세요'), 'Processes should guide missing source-stream evidence');
assert.ok(processesPage.includes('1. 공정 기본정보'), 'Processes form should group basic process information');
assert.ok(processesPage.includes('2. 제품 생산라인 배분'), 'Processes form should group product-line allocation inputs');
assert.ok(processesPage.includes('3. 생산량과 배출량'), 'Processes form should group production and emissions inputs');
assert.ok(sourceStreamsPage.includes('배출원 자료 다음 작업'), 'Source streams should show next-action guidance');
assert.ok(sourceStreamsPage.includes('생산공정 연결'), 'Source streams should guide process linking');
assert.ok(sourceStreamsPage.includes('증빙 출처'), 'Source streams should guide evidence sources');
assert.ok(sourceStreamsPage.includes('1. 배출원 기본정보'), 'Source stream form should group source-stream basics');
assert.ok(sourceStreamsPage.includes('2. 활동자료와 배출계수'), 'Source stream form should group activity and factor inputs');
assert.ok(sourceStreamsPage.includes('3. 계수와 근거'), 'Source stream form should group evidence coefficient inputs');
assert.ok(precursorsPage.includes('전구물질 다음 작업'), 'Precursors should show next-action guidance');
assert.ok(precursorsPage.includes('기본값 사용 사유'), 'Precursors should guide default-value justification');
assert.ok(precursorsPage.includes('실제자료 검증 상태'), 'Precursors should guide actual-data verification');
assert.ok(precursorsPage.includes('1. 전구물질 기본정보'), 'Precursor form should group precursor basics');
assert.ok(precursorsPage.includes('2. 자료 모드와 검증 상태'), 'Precursor form should group data mode and verification status');
assert.ok(precursorsPage.includes('5. SEE와 증빙'), 'Precursor form should group SEE and evidence inputs');
assert.ok(resultsPage.includes('제품별 SEE 산정 결과'), 'Results page should show product-level SEE results');
assert.ok(resultsPage.includes('CBAM 산정 기준 SEE') && resultsPage.includes('내부 검토용 total SEE'), 'Results page should separate CBAM-basis SEE from informational total SEE');
assert.ok(resultsPage.includes('제품 1톤당 CBAM 계산에 사용할 배출량입니다'), 'Results page should explain CBAM-basis SEE in beginner-friendly Korean');
assert.ok(resultsPage.includes('직접배출, 간접배출, 전구물질 배출을 모두 더한 참고값입니다'), 'Results page should explain informational total SEE in beginner-friendly Korean');
assert.ok(scenariosPage.includes('인증서 비용 시나리오'), 'Scenarios page should show certificate cost review');
assert.ok(scenariosPage.includes('비용을 대략 검토하는 고급 단계'), 'Scenarios page should position certificate scenarios as an advanced review step');
assert.ok(scenariosPage.includes('CBAM 산정 기준 SEE') && scenariosPage.includes('내부 검토용 total SEE'), 'Scenarios page should separate CBAM-basis SEE from informational total SEE');
assert.ok(scenariosPage.includes('사전 검토용 시나리오') && scenariosPage.includes('carbon price paid evidence'), 'Scenarios page should avoid outdated formula-not-final copy');
assert.equal(scenariosPage.includes('공식 산식 확인 전까지'), false, 'Scenarios page should not imply 2026 formulas are not final');
assert.ok(scenariosPage.includes('기본값 인증서 비용') && scenariosPage.includes('md:hidden'), 'Scenarios should keep a mobile card fallback for SEFA/certificate review');
assert.ok(exportPage.includes('CBAM 산정 기준 SEE') && exportPage.includes('내부 검토용 total SEE'), 'Export page should separate app review SEE values before Excel comparison');
assert.ok(settingsPage.includes('법률 자문, 공식 검증, 최종 신고 책임을 대체하지 않습니다'), 'Settings should show the liability notice');
assert.ok(settingsPage.includes('로컬 사용 안전 체크리스트'), 'Settings should show a local-use safety checklist');
assert.ok(settingsPage.includes('브라우저 로컬 저장'), 'Settings should explain browser-local storage in the checklist');
assert.ok(settingsPage.includes('중요 변경 후 .cbam 백업'), 'Settings should remind users to back up after important changes');
assert.ok(settingsPage.includes('전달 전 공식 확인'), 'Settings should remind users to review the official Excel output before transfer');
assert.ok(settingsPage.includes('.cbam 백업'), 'Settings should guide backup handling');
assert.ok(settingsPage.includes('무료 라이선스'), 'Settings should include the free license placeholder');
assert.ok(settingsPage.includes('CBAM 산정 데이터, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다'), 'Settings should explain the license data boundary');
assert.ok(settingsPage.includes('업데이트 상태'), 'Settings should include update status in the free license area');
assert.ok(settingsPage.includes('약관/고지 보기'), 'Settings should link to free terms and responsibility notice');
assert.ok(settingsPage.includes('업데이트 상태 확인'), 'Settings should expose a manual update status check');
assert.ok(settingsPage.includes('CBAM 입력자료와 백업 파일은 로컬에 남습니다'), 'Settings should keep license/update data boundaries clear');
assert.ok(settingsPage.includes('license:free-registration'), 'Settings should store free license mock registration in local settings');

console.log('MVP flow verification passed.');
