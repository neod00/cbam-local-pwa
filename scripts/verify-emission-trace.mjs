// Emission Trace (2026-10-07).
//
// 잠그는 것:
//  1) 추적은 새 산정이 아니다 — 엔진 결과를 받아 구성 요소(배출원·열·전력·구매 강재·사내 이송)를 같은 자료·같은 보정(정합계수)·같은 귀속 비율로 다시 모으고,
//     그 합이 엔진의 SEE·직접 귀속배출과 맞는지 스스로 대조한다(손계산과도 같다). 어긋나면 숨기지 않고 차이를 낸다.
//  2) 방법·기준·규정 근거·증빙은 저장된 필드에서 재구성한다(새 저장소 없음): 공용 계량기 기준·나눈 근거, 배출원 출처·계수 근거 유형, 전구물질 출처·검증 상태.
//  3) 수기 입력 직접배출은 「거슬러 갈 수 없는 값」이라고 말한다. 미검증 실측은 잠정이라고 말한다.
//  4) 화면: 읽기 전용(저장 코드 없음), 고칠 곳 링크, 서비스 워커·경로 검사에 올라 있다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (text, all = true) => text
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const file = (path) => readFileSync(path, 'utf8');
const source = [
  strip(file('src/lib/source-stream-calculation.ts'), false),
  file('src/lib/cn-master.generated.ts').replace(/^export /gm, ''),
  strip(file('src/lib/cbam-product-rules.ts')),
  strip(file('src/lib/reporting-scope.ts'), false),
  strip(file('src/lib/allocation-rules.ts')),
  strip(file('src/lib/measurable-heat.ts')),
  strip(file('src/lib/precursor-verification.ts')),
  strip(file('src/lib/calculation-engine.ts')),
  strip(file('src/lib/fuel-allocation.ts')),
  strip(file('src/lib/source-stream-input.ts')),
  strip(file('src/lib/conversation-energy.ts')),
  strip(file('src/lib/emission-trace.ts')),
  'globalThis.app = { calculateLocalResults, buildEmissionTrace };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const close = (a, b, message, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a} vs ${b}`);

const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = (id, cn) => ({ id, name: `제품 ${id}`, cn_code: cn, hs_code: cn.slice(0, 4), hs_group: cn.slice(0, 2), product_type_enum: 'Iron or steel products', unit: 't', reporting_scope: 'CBAM_GOOD', ...stamp });
const A = product('a', '72139110');
const B = product('b', '72139190');
const gas = (id, amount, extra = {}) => ({ id, process_id: 'p1', period_id: 'per', name: `도시가스 ${id}`, stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3', activity_data: amount, ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1,
  emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY', source: '고지서 2025',
  shared_meter: { group: '도시가스', installation_total_activity_data: 1100, basis: 'SUB_METER', note: '공정별 보조계량기 검침' }, ...stamp, ...extra });
const process1 = { id: 'p1', product_id: 'a', period_id: 'per', name: '가공 공정', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 0,
  direct_emissions_input_mode: 'SOURCE_STREAM_SUM', electricity_mwh: 100, electricity_ef_tco2e_per_mwh: 0.5, electricity_ef_source: 'COUNTRY_GRID_DEFAULT', no_purchased_precursors: false, ...stamp };
const line = (id, productId, mass) => ({ id, process_id: 'p1', product_id: productId, name: `라인 ${id}`, output_mass_t: mass, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '', reporting_scope: 'CBAM_GOOD', ...stamp });
const precursor = (id, extra = {}) => ({ id, process_id: 'p1', period_id: 'per', name: `원료 ${id}`, precursor_cn_code: '72139110', aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_installation: '공급사', supplier_country: 'Korea',
  data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED', purchased_mass_t: 300, consumed_mass_t: 300, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0.1, source: '공급사 회신 2025-03', default_value_justification: '', default_value_year: '2026', ...stamp, ...extra });

const scenario = {
  products: [A, B], periods: [period], processes: [process1], productOutputLines: [line('l1', 'a', 600), line('l2', 'b', 400)],
  sourceStreams: [gas('s1', 500), gas('s2', 500)], precursors: [precursor('r1')],
};
const results = app.calculateLocalResults(scenario);
const resultOf = (lineId) => results.find((candidate) => candidate.product_output_line_id === lineId);
const trace = (lineId, overrides = {}) => app.buildEmissionTrace({ result: resultOf(lineId), process: scenario.processes[0], sourceStreams: scenario.sourceStreams, precursors: scenario.precursors, ...overrides });

// ── 1) 손계산 ────────────────────────────────────────────────────────
// 가스 한 줄: 500 Nm³ × 0.037 GJ × 56.1 tCO₂e/TJ ÷ 1,000 = 1.03785 → 정합계수 1,100 ÷ 1,000 = 1.1 → 1.141635. 두 줄 합 2.28327. 이 상품(600/1,000) 몫 1.369962.
const streamEach = 500 * 0.037 * 56.1 / 1000 * 1.1;
const t1 = trace('l1');
close(t1.see, (2 * streamEach * 0.6 + 180 * 2) / 600, '엔진 SEE = 손계산', 1e-9);
assert.equal(t1.check.ok, true, '구성 요소를 모은 SEE가 엔진과 같다');
assert.ok(Math.abs(t1.check.delta) < 1e-9 && Math.abs(t1.check.directDelta) < 1e-9);
close(t1.basisTotalEmissions, 2 * streamEach * 0.6 + 180 * 2, '인증서 기준 총 내재배출');
const direct = t1.root.children.find((node) => node.id === 'direct');
close(direct.value, 2 * streamEach * 0.6, '① 직접 귀속배출');
assert.equal(direct.children.length, 2);
close(direct.children[0].value, streamEach * 0.6, '배출원 하나의 이 상품 몫');
assert.match(direct.children[0].formula, /정합계수 1\.1/, '정합계수를 식에 보인다');
assert.match(direct.children[0].method, /보조계량기 정합\(식 41·42\)/);
assert.match(direct.children[0].anchor, /Equations 41–42/);
assert.equal(direct.children[0].evidence, '고지서 2025', '증빙은 저장된 출처 글');
assert.match(direct.children[0].note, /계수 근거 유형: 국가 인벤토리/);
assert.match(direct.children[0].note, /나눈 근거: 공정별 보조계량기 검침/);
assert.equal(direct.children[0].href, '/source-streams?edit=s1');
assert.match(direct.method, /질량 기준 — 이 상품 몫 60\.00%/);
const indirect = t1.root.children.find((node) => node.id === 'own-indirect');
close(indirect.value, 100 * 0.5 * 0.6, '② 자체 전력');
assert.match(indirect.formula, /100 MWh × 0\.5 tCO₂e\/MWh × 이 상품 몫 60\.00%/);
assert.match(indirect.note, /원산지국 계통 평균/);
assert.match(indirect.note, /인증서 기준 SEE에서 빠지지만 보고에는 포함/, '철강 간접은 기준 제외라고 말한다');
const precursors = t1.root.children.find((node) => node.id === 'precursors');
close(precursors.value, 180 * 2.1, '③ 구매 전구물질(직접+간접)');
assert.equal(precursors.children.length, 1);
assert.match(precursors.children[0].method, /실측 — 공급사 확인\(제3자 검증 아님\)/);
assert.match(precursors.children[0].note, /잠정/, '미검증 실측은 잠정이라고 말한다');
assert.equal(precursors.children[0].evidence, '공급사 회신 2025-03');
// 총 SEE(검토용)에는 간접이 들어간다: 직접 + 자체 간접 + 구매 간접
close(t1.totalSee, (2 * streamEach * 0.6 + 180 * 2 + 100 * 0.5 * 0.6 + 180 * 0.1) / 600, '총 SEE = 직접 + 간접(검토용)', 1e-9);

// 둘째 상품(40%)도 같은 방식으로 맞는다
const t2 = trace('l2');
assert.equal(t2.check.ok, true);
close(t2.see, (2 * streamEach * 0.4 + 120 * 2) / 400, '둘째 상품 SEE = 손계산');
assert.equal(t2.productName, '제품 b');

// ── 2) 수기 입력·열·사내 이송 ────────────────────────────────────────
const manualProcess = { ...process1, direct_emissions_input_mode: 'MANUAL_TOTAL', direct_attributable_emissions_tco2e: 50 };
const manualScenario = { ...scenario, processes: [manualProcess], sourceStreams: [] };
const manualResults = app.calculateLocalResults(manualScenario);
const manualTrace = app.buildEmissionTrace({ result: manualResults.find((r) => r.product_output_line_id === 'l1'), process: manualProcess, sourceStreams: [], precursors: scenario.precursors });
assert.equal(manualTrace.check.ok, true, '수기 입력값도 합이 맞는다');
const manualDirect = manualTrace.root.children[0];
assert.equal(manualDirect.children.length, 1);
assert.match(manualDirect.children[0].method, /사용자 입력\(수기 값\)/);
assert.match(manualDirect.children[0].note, /거슬러 올라갈 수 없는 값/, '수기 값은 원천을 못 댄다고 말한다');
close(manualDirect.children[0].value, 50 * 0.6, '수기 직접배출 × 이 상품 몫');

// 사내 이송: 받는 공정의 결과에 사내 전구물질이 붙는다
const p2 = { ...process1, id: 'p2', product_id: 'b', name: '후공정', output_mass_t: 500, market_output_mass_t: 500, electricity_mwh: 0, direct_attributable_emissions_tco2e: 20, direct_emissions_input_mode: 'MANUAL_TOTAL', no_purchased_precursors: true };
const transferScenario = {
  ...scenario, processes: [{ ...process1, internal_consumption_mass_t: 0 }, p2], productOutputLines: [line('l1', 'a', 1000), { ...line('l3', 'b', 500), process_id: 'p2' }], precursors: [],
  internalTransfers: [{ id: 't1', period_id: 'per', source_process_id: 'p1', target_process_id: 'p2', mass_t: 400 }],
};
const transferResults = app.calculateLocalResults(transferScenario);
const receiver = transferResults.find((r) => r.process_id === 'p2');
const receiverTrace = app.buildEmissionTrace({ result: receiver, process: p2, sourceStreams: scenario.sourceStreams, precursors: [] });
assert.equal(receiverTrace.check.ok, true, '사내 이송이 있어도 합이 맞는다');
const internal = receiverTrace.root.children.find((node) => node.id === 'internal');
assert.ok(internal && internal.children.length === 1, '사내 이송 노드');
assert.match(internal.children[0].label, /가공 공정에서 받음/);
assert.match(internal.children[0].method, /사내 이송/);

// ── 3) 어긋나면 숨기지 않는다 ────────────────────────────────────────
const tampered = { ...resultOf('l1'), direct_emissions_tco2e: resultOf('l1').direct_emissions_tco2e + 5 };
const bad = app.buildEmissionTrace({ result: tampered, process: scenario.processes[0], sourceStreams: scenario.sourceStreams, precursors: scenario.precursors });
assert.equal(bad.check.ok, false, '엔진 결과와 원천 합계가 다르면 ok=false');
assert.ok(Math.abs(bad.check.directDelta + 5) < 1e-9, '차이를 그대로 낸다');
assert.equal(app.buildEmissionTrace({ result: { ...resultOf('l1'), output_mass_t: 0 }, process: scenario.processes[0], sourceStreams: scenario.sourceStreams, precursors: scenario.precursors }), undefined, '생산량 0이면 추적하지 않는다');

// ── 4) 화면·구조 ─────────────────────────────────────────────────────
const lib = file('src/lib/emission-trace.ts');
assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|indexedDB|localStorage/.test(lib), '읽기 전용');
assert.ok(!/calculateLocalResults\(/.test(lib), '엔진을 다시 돌리지 않는다(받은 결과를 푼다)');
const ui = file('src/components/trace/TraceWorkspace.tsx');
assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|indexedDB|localStorage/.test(ui), '화면에 저장 코드가 없다');
assert.ok(ui.includes('data-testid="trace-check"') && ui.includes('원천 합계가 엔진 결과와 일치합니다'), '자체 대조 결과를 보인다');
assert.ok(ui.includes('차이'), '맞지 않으면 차이를 보인다');
assert.ok(ui.includes('<details'), '단계별로 펼친다(Expert Disclosure)');
assert.match(file('src/app/trace/page.tsx'), /TraceWorkspace/);
assert.ok(file('public/sw.js').includes('"/trace"'));
assert.ok(file('scripts/verify-production-routes.mjs').includes("'/trace'"));
assert.ok(file('src/components/AppShell.tsx').includes("'/trace': 'SEE 추적'"));
assert.ok(file('src/components/todo/TodoWorkspace.tsx').includes('href="/trace"'), '할 일 화면의 점검표에서 추적으로 간다');

console.log('Emission Trace verified (구성 요소 합 = 엔진 SEE·직접배출(손계산) · 정합계수·귀속 비율·방법·근거·증빙 재구성 · 수기값·잠정·사내 이송 표시 · 어긋남 숨기지 않음 · 읽기 전용).');
