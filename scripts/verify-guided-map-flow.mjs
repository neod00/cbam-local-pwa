// 지도 강화 (UX 컨셉 v4 §5, 2026-10-05) — 입력 상자에서 「÷ 생산량」으로 가는 선의 굵기·흐름과 값 출처 표시.
//
// 잠그는 것:
//  1) 굵기는 엔진 집계(SeeFlowBinding)의 비중이다. 새 산술이 없고, 입력 전에는 가는 선이며 흐르지 않는다.
//  2) 전력 선은 배출량만큼 굵게 그리지 않는다(보고용 흐름) — 전력을 아무리 많이 넣어도 가는 점선이다.
//  3) 값 출처 표시: EU 기본값 전구물질 = 「EU 기본값」(빗금), 전부 실측 = 「실측」, 섞이면 「일부 실측」. 막대와 같은 규칙.
//  4) 지도 본체: 8단계 상자·클릭·모션 축소 대응이 그대로이고, flow가 없으면 종전처럼 그린다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  strip('src/lib/guided-map-flow.ts'),
  'globalThis.app = { calculateLocalResults, buildSeeFlowBinding, buildMapFlow, EDGE_MIN_WIDTH, EDGE_MAX_WIDTH };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, buildSeeFlowBinding, buildMapFlow, EDGE_MIN_WIDTH, EDGE_MAX_WIDTH } = context.app;

const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = { id: 'screw', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const makeProcess = (extra = {}) => ({
  id: 'P', product_id: product.id, period_id: period.id, name: '가공', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp, ...extra,
});
const precursor = (id, extra = {}) => ({
  id, process_id: 'P', period_id: period.id, name: `원료 ${id}`, precursor_cn_code: '72139110', aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_country: 'South Korea', supplier_installation: '', data_mode: 'DEFAULT',
  verification_status: 'UNVERIFIED', default_value_year: '2026', purchased_mass_t: 1000, consumed_mass_t: 1000, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0,
  source: 'EU default', default_value_justification: '미회신', ...stamp, ...extra,
});
const step = (id, status) => ({ id, order: 1, title: id, status, summary: '' });
const allDone = ['fuel', 'electricity', 'precursors'].map((id) => step(id, 'done'));
const flow = (processes, precursors, steps = allDone) => {
  const results = calculateLocalResults({ products: [product], periods: [period], processes, precursors, productOutputLines: [] });
  return buildMapFlow({ binding: buildSeeFlowBinding(results), steps, results, precursors });
};
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

// ── 1) 굵기 = 인증서 기준 부분의 비중 (자체 연료 0.1, 구매 원료 2.0 → 5% / 95%) ──
const base = flow([makeProcess()], [precursor('p1')]);
close(base.edges.fuel.width, EDGE_MIN_WIDTH + (EDGE_MAX_WIDTH - EDGE_MIN_WIDTH) * (100 / 2100), '연료 선');
close(base.edges.precursors.width, EDGE_MIN_WIDTH + (EDGE_MAX_WIDTH - EDGE_MIN_WIDTH) * (2000 / 2100), '전구물질 선');
assert.ok(base.edges.precursors.width > base.edges.fuel.width * 2, '배출 핵심(전구물질)이 눈에 띄게 굵다');
assert.ok(base.edges.fuel.flowing && base.edges.precursors.flowing, '값이 들어온 선은 흐른다');
assert.match(base.edges.precursors.description, /인증서 기준 부분의 95%/, '호버 설명에 비중이 있다');

// ── 2) 전력은 굵게 그리지 않는다 ──────────────────────────────────────
const bigPower = flow([makeProcess({ electricity_mwh: 100000, electricity_ef_tco2e_per_mwh: 0.5 })], [precursor('p1')]);
assert.equal(bigPower.edges.electricity.width, EDGE_MIN_WIDTH, '전력이 아무리 커도 가는 선');
assert.equal(bigPower.edges.electricity.reportOnly, true, '점선 = 보고용 흐름');
assert.equal(bigPower.edges.electricity.flowing, false, '보고용 선은 흐르지 않는다');
close(bigPower.edges.precursors.width, base.edges.precursors.width, '전력이 다른 선의 굵기를 바꾸지 않는다(기준 SEE에 안 든다)');
assert.match(bigPower.edges.electricity.description, /인증서 계산에서만 제외/, '문안은 describeSeeFlowIndirect에서 온다');

// ── 3) 입력 전·예시에서는 가늘고 정지, 출처 표시 없음 ─────────────────────
const notDone = flow([makeProcess()], [precursor('p1')], ['fuel', 'electricity', 'precursors'].map((id) => step(id, 'todo')));
assert.ok(!notDone.edges.fuel.flowing && !notDone.edges.precursors.flowing, '입력 전 상자의 선은 흐르지 않는다');
assert.deepEqual(JSON.parse(JSON.stringify(notDone.provenance)), {}, '입력 전에는 값 출처 표시가 없다');
const empty = buildMapFlow({ binding: buildSeeFlowBinding([]), steps: allDone, results: [], precursors: [] });
assert.ok(Object.values(empty.edges).every((edge) => edge.width === EDGE_MIN_WIDTH && !edge.flowing), '예시 집계에서는 선이 가늘고 정지');
assert.deepEqual(JSON.parse(JSON.stringify(empty.provenance)), {}, '예시에서는 출처 표시를 만들지 않는다');

// ── 4) 값 출처 표시 — 막대와 같은 규칙 ────────────────────────────────
assert.equal(base.provenance.precursors.kind, 'DEFAULT');
assert.equal(base.provenance.precursors.label, 'EU 기본값');
assert.equal(base.provenance.fuel.label, '자사 입력', '연료는 실측이라 단정하지 않고 자사 입력으로 표시');
assert.equal(flow([makeProcess()], [precursor('p1', { data_mode: 'ACTUAL' })]).provenance.precursors.label, '실측');
const mixedFlow = flow([makeProcess()], [precursor('p1', { purchased_mass_t: 500, consumed_mass_t: 500 }), precursor('p2', { data_mode: 'ACTUAL', purchased_mass_t: 500, consumed_mass_t: 500 })]);
assert.equal(mixedFlow.provenance.precursors.label, '일부 실측');
assert.equal(flow([makeProcess()], [precursor('p1', { data_mode: 'SEMI_ACTUAL' })]).provenance.precursors.label, '일부 실측', '혼합 자료는 실측으로 단정하지 않는다');

// ── 5) 지도 본체 ─────────────────────────────────────────────────────
const map = readFileSync('src/components/guided/GuidedMap.tsx', 'utf8');
for (const id of ['setup', 'products', 'process', 'fuel', 'electricity', 'precursors', 'results', 'export']) {
  assert.match(map, new RegExp(`\\{ x: \\d+, y: \\d+, w: \\d+, h: \\d+ \\}`), '노드 기하가 있다');
  assert.ok(map.includes(`${id}: {`), `8단계 노드 ${id}`);
}
assert.match(map, /onClick=\{\(\) => onSelect\(step\.id\)\}/, '상자 클릭 동작 불변');
assert.match(map, /\.guided-edge--flow \{ animation: none; \}/, '모션 축소 설정에서는 흐름 애니메이션이 꺼진다');
assert.match(map, /markerUnits="userSpaceOnUse"/, '선이 굵어져도 화살촉이 커지지 않는다');
assert.match(map, /id="guided-hatch"/, 'EU 기본값 상자는 빗금');
assert.match(map, /const edges = flow\?\.edges \?\? NEUTRAL_EDGES;/, 'flow가 없으면 종전 지도 그대로');
const workspace = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(workspace, /flow=\{mapFlow\}/);
assert.ok(!/stroke-?[wW]idth\s*=\s*\{[^}]*(Emissions|binding\.)/.test(map), '지도 컴포넌트가 배출 값으로 직접 굵기를 계산하지 않는다');

console.log('Guided map flow verified (굵기=엔진 비중 · 전력은 가는 점선 · 입력 전 정지 · 출처 표시 막대와 동일 · 지도 본체 불변).');
