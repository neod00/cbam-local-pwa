import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const sidebar = readFileSync('src/components/Sidebar.tsx', 'utf8');
const appShell = readFileSync('src/components/AppShell.tsx', 'utf8');
const layout = readFileSync('src/app/layout.tsx', 'utf8');
const dashboard = readFileSync('src/app/page.tsx', 'utf8');
const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
const resultsPage = readFileSync('src/app/results/page.tsx', 'utf8');
const scenariosPage = readFileSync('src/app/scenarios/page.tsx', 'utf8');
const settingsPage = readFileSync('src/app/settings/page.tsx', 'utf8');

const workflowRoutes = [
  ['품목 관리', '/products'],
  ['생산공정', '/processes'],
  ['배출원 자료', '/source-streams'],
  ['구매 전구물질', '/precursors'],
  ['산정 결과', '/results'],
  ['시나리오', '/scenarios'],
  ['EU Export', '/export'],
  ['데이터 안전', '/settings'],
];

for (const [label, href] of workflowRoutes) {
  assert.ok(sidebar.includes(label), `sidebar should include ${label}`);
  assert.ok(sidebar.includes(href), `sidebar should link ${href}`);
}

for (const label of ['홈', '품목', '결과', '설정']) {
  assert.ok(sidebar.includes(label), `mobile navigation should include ${label}`);
}

for (const label of ['대시보드', '품목 관리', '생산공정', '시나리오', 'EU 템플릿 Export', '데이터 안전']) {
  assert.ok(appShell.includes(label), `topbar route title should include ${label}`);
}

assert.ok(layout.includes('로컬 우선 CBAM 내재배출량 산정 도구'), 'metadata should describe the local-first CBAM tool');
assert.ok(dashboard.includes('사업장, 제품, 생산공정, 전구물질'), 'dashboard should describe the core local workflow');
assert.ok(dashboard.includes('CBAM 제출 준비 작업실'), 'dashboard should present the guided workspace');
assert.ok(dashboard.includes('다음 작업 계속하기'), 'dashboard should expose a next action CTA');
assert.ok(dashboard.includes('자료 준비 체크리스트'), 'dashboard should show evidence preparation guidance');
assert.ok(exportPage.includes('공식 수식 셀이 계산하도록 직접 덮어쓰지 않습니다'), 'Export should preserve official formula cells');
assert.ok(exportPage.includes('Excel에서 생성된 복사본을 열면'), 'Export should tell users to review Excel formula outputs');
assert.ok(resultsPage.includes('제품별 SEE 산정 결과'), 'Results page should show product-level SEE results');
assert.ok(scenariosPage.includes('SEFA 및 CBAM 인증서 시나리오'), 'Scenarios page should show SEFA/certificate review');
assert.ok(settingsPage.includes('법률 자문, 공식 검증, 최종 제출 책임을 대체하지 않습니다'), 'Settings should show the liability notice');
assert.ok(settingsPage.includes('.cbam 백업'), 'Settings should guide backup handling');
assert.ok(settingsPage.includes('무료 라이선스'), 'Settings should include the free license placeholder');
assert.ok(settingsPage.includes('CBAM 산정 데이터, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다'), 'Settings should explain the license data boundary');
assert.ok(settingsPage.includes('업데이트 상태'), 'Settings should include update status in the free license area');
assert.ok(settingsPage.includes('업데이트 상태 확인'), 'Settings should expose a manual update status check');
assert.ok(settingsPage.includes('CBAM 입력자료와 백업 파일은 로컬에 남습니다'), 'Settings should keep license/update data boundaries clear');
assert.ok(settingsPage.includes('license:free-registration'), 'Settings should store free license mock registration in local settings');

console.log('MVP flow verification passed.');
