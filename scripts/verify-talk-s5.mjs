// 질문으로 입력(대화형 모드) S5 — 결과 요약 · 같이 쓴 에너지 나누기 · 전력 고치기 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md
//
// 잠그는 것:
//  1) 질문은 **지금 보는 제품을 만드는 공정**에 붙는다(같은 기간에 비CBAM 공정이 앞에 있어도 엉뚱한 공정에 붙지 않는다).
//  2) 결과 요약은 자기 산술이 없다: 숫자는 SeeFlowBinding 그대로, 간접배출 문안은 describeSeeFlowIndirect. 입력이 덜 찼으면 「최종」이라고 말하지 않는다. 오류가 먼저, 최대 5건.
//  3) 같이 쓴 에너지 나누기는 **지도 화면의 그 도구들**(ElectricitySplit·FuelSplit·SharedHeat)을 그대로 쓴다 — 이 폴더에 저장 코드가 늘지 않는다. 공정이 둘 이상일 때만 보인다.
//  4) 전력 고치기는 지도 5단계와 같은 저장 함수이고, 공용 계량기에서 나눈 값은 여기서 고치지 않는다(칩이 지도로 안내).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  strip('src/lib/see-flow.ts'),
  strip('src/lib/talk-flow.ts'),
  strip('src/lib/talk-summary.ts'),
  'globalThis.app = { calculateLocalResults, buildSeeFlowBinding, describeSeeFlowIndirect, deriveTalkState, pickTalkProcess, summarizeTalkResult };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 1) 질문이 붙는 공정 ──────────────────────────────────────────────
const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR' };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const product = { id: 'sts', name: 'STS 나사', cn_code: '73181552' };
const nonCbamProcess = { id: 'carbon', name: '탄소강 공정', period_id: 'per', product_id: 'carbon-product', output_mass_t: 1860, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47 };
const stsProcess = { id: 'sts-proc', name: 'STS 공정', period_id: 'per', product_id: 'sts', output_mass_t: 3240, electricity_mwh: 3250, electricity_ef_tco2e_per_mwh: 0.47, no_purchased_precursors: true, measurable_heat_import: 'NO' };
assert.equal(app.pickTalkProcess([nonCbamProcess, stsProcess], product).id, 'sts-proc', '비CBAM 공정이 앞에 있어도 이 제품의 공정을 고른다');
assert.equal(app.pickTalkProcess([nonCbamProcess], product).id, 'carbon', '이 제품의 공정이 없으면 첫 공정');
assert.equal(app.pickTalkProcess([], product), undefined);
const base = { installations: [inst], periods: [period], products: [product] };
const streams = [{ id: 's1', name: '도시가스', process_id: 'sts-proc' }, { id: 's2', name: '탄소강 열처리로', process_id: 'carbon' }];
const state = app.deriveTalkState({ ...base, processes: [nonCbamProcess, stsProcess], precursors: [], sourceStreams: streams });
assert.deepEqual(plain(state.pending), [], 'STS 공정 기준으로 모두 답했다 — 앞에 있는 탄소강 공정의 빈 칸에 끌려가지 않는다');
assert.equal(state.chips.find((chip) => chip.id === 'fuel').answer, '1건 · 도시가스');
assert.equal(state.chips.find((chip) => chip.id === 'electricity').answer, '3,250 MWh × 0.47');
assert.equal(state.more.processes, 1, '공정이 둘이면 나머지는 지도 화면으로 안내');

// ── 2) 결과 요약 ─────────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const eperiod = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const eproduct = { id: 'g', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const eprocess = { id: 'pr', product_id: 'g', period_id: 'per', name: '가공', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 100, electricity_ef_tco2e_per_mwh: 0.5, ...stamp };
const eprecursor = { id: 'p1', process_id: 'pr', period_id: 'per', name: '원료', precursor_cn_code: '72139110', aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_country: 'South Korea', supplier_installation: '', data_mode: 'DEFAULT', verification_status: 'UNVERIFIED', default_value_year: '2026', purchased_mass_t: 1000, consumed_mass_t: 1000, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0, source: 'EU default', default_value_justification: '미회신', ...stamp };
const results = app.calculateLocalResults({ products: [eproduct], periods: [eperiod], processes: [eprocess], precursors: [eprecursor], productOutputLines: [] });
const binding = app.buildSeeFlowBinding(results);
const issue = (severity, area, message, href) => ({ severity, area, message, href });
const ok = app.summarizeTalkResult({ binding, issues: [] });
assert.equal(ok.headline, binding.seeCbamBasis, '요약의 큰 숫자는 엔진 집계 그대로(자기 산술 없음)');
assert.equal(ok.seeTotal, binding.seeTotal);
assert.equal(ok.relationNote, app.describeSeeFlowIndirect(binding.indirectRelevance, binding.basisExcludesUndetermined).basisVsTotalNote, '간접배출 문안은 상태에서 파생한다');
assert.equal(ok.nextStep, 'EXPORT');
assert.match(ok.message, /막는 항목이 없습니다/);
const withWarning = app.summarizeTalkResult({ binding, issues: [issue('warning', '사업장', '주소 확인')] });
assert.equal(withWarning.nextStep, 'REVIEW');
assert.match(withWarning.message, /확인하면 좋은 항목이 1건/);
const many = [...Array(4).keys()].map((n) => issue('warning', '경고', `경고 ${n}`)).concat([issue('error', '오류', '오류 A', '/precursors?edit=x'), issue('error', '오류', '오류 B'), issue('warning', '경고', '경고 4')]);
const fix = app.summarizeTalkResult({ binding, issues: many });
assert.equal(fix.nextStep, 'FIX');
assert.deepEqual(plain(fix.issues.map((item) => item.message)), ['오류 A', '오류 B', '경고 0', '경고 1', '경고 2'], '오류가 먼저, 최대 5건');
assert.equal(fix.errorCount, 2);
assert.equal(fix.warningCount, 5);
assert.equal(fix.issues[0].href, '/precursors?edit=x', '고칠 수 있는 화면 링크를 그대로 싣는다');
const partial = app.summarizeTalkResult({ binding, issues: [issue('error', '오류', 'x')], partialNote: '연료·전기는 아직 넣지 않았습니다' });
assert.equal(partial.nextStep, 'INPUT', '입력이 덜 찼으면 오류가 있어도 「최종」이 아니다');
assert.match(partial.message, /중간 값/);
assert.equal(partial.partialNote, '연료·전기는 아직 넣지 않았습니다');
const empty = app.summarizeTalkResult({ binding: app.buildSeeFlowBinding([]), issues: [] });
assert.equal(empty.empty, true);
assert.equal(empty.headline, null, '결과가 없으면 예시 수치를 결과처럼 내지 않는다');
assert.equal(empty.nextStep, 'INPUT');

// ── 3) 나누기: 지도 화면의 도구를 그대로 ──────────────────────────────────
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
for (const tool of ['ElectricitySplit', 'FuelSplit', 'SharedHeat']) {
  assert.match(ui, new RegExp(`import \\{ ${tool} \\} from '@/components/guided/${tool}'`), `${tool}는 지도 화면의 컴포넌트를 가져다 쓴다`);
}
assert.match(ui, /<ElectricitySplit processes=\{periodProcesses\} results=\{data\.results\} onApplied=\{reload\} \/>/);
assert.match(ui, /<FuelSplit processes=\{periodProcesses\} sourceStreams=\{data\.sourceStreams\} results=\{data\.results\} onApplied=\{reload\} \/>/);
assert.match(ui, /<SharedHeat processes=\{periodProcesses\} sourceStreams=\{data\.sourceStreams\} onApplied=\{reload\} \/>/);
assert.match(ui, /firstProcess && periodProcesses\.length >= 2 && \(/, '공정이 둘 이상일 때만 보인다');
assert.match(ui, /summarizeEnergySplits\(\{ processes: periodProcesses, sourceStreams: data\.sourceStreams \}\)/, '현황은 지도 화면과 같은 순수 요약');
for (const name of readdirSync('src/components/talk').filter((file) => /\.(ts|tsx)$/.test(file))) {
  const text = readFileSync(`src/components/talk/${name}`, 'utf8');
  assert.equal(/createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(text), name === 'talk-writes.ts', `${name}: 저장소 쓰기는 talk-writes.ts에만 있다(나누기 도구는 지도 화면 쪽 코드)`);
}
// 준비도 검사는 지도 7단계와 같은 함수·같은 인자
const workspace = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(workspace, /evaluateEuExportReadiness\(\{[\s\S]*periods, reportingPeriodId,/, '지도 화면은 고른 보고기간을 넘긴다');
assert.match(ui, /evaluateEuExportReadiness\(\{ internalTransfers, periods, reportingPeriodId,/, '이 화면도 같다');
assert.match(ui, /getLocalSetting<string>\(EXPORT_PERIOD_SETTING_KEY\)/);

// ── 4) 전력 고치기 ───────────────────────────────────────────────────
assert.match(ui, /openEditor\('electricity'\)|id === 'electricity'/, '전력 칩은 고칠 수 있다');
assert.match(ui, /chip\.id === 'electricity' && Boolean\(firstProcess\?\.electricity_shared_meter\)/, '공용 계량기에서 나눈 값이면 지도로 안내(여기서 고치면 합계가 고지서와 어긋난다)');
const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8');
assert.match(writes, /buildElectricityUpdate\(process, full\)/, '수정도 지도 5단계와 같은 빌더');
assert.match(writes, /allocationNote: process\.electricity_allocation_note \?\? ''/, '고치기가 저장된 배분 근거 메모를 지우지 않는다(지도 5단계는 칸에 되살려 같은 결과를 낸다)');
assert.ok(!/\bAI\b|챗봇/.test(ui));

console.log('Talk S5 verified (질문은 이 제품의 공정에 · 요약은 엔진 집계 그대로·덜 찬 입력은 중간 값 · 나누기는 지도 화면 도구 그대로 · 전력 고치기).');
