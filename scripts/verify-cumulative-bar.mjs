// 누적 막대 (UX 컨셉 v4 §6, 2026-10-05) — 「EU 기본값으로 신고하면 / 내 값으로 신고하면」 두 기둥.
//
// 잠그는 것:
//  1) 막대는 자기 산술을 만들지 않는다 — 대형 수치는 엔진의 기준 SEE(SeeFlowBinding)와 같고, 블록 합이 어긋나면 블록을 그리지 않는다.
//  2) EU 기본값 기둥은 공식 DV(내장본)의 원산국·CN·연도 값이다. 못 찾으면 숫자를 지어내지 않고 이유를 말한다.
//  3) 실측 비율은 전구물질 신고 방식(실측/기본값)을 따르고, 전력을 넣는다고 오르지 않는다.
//  4) 간접배출 문안은 describeSeeFlowIndirect만 쓴다. 배선(지도 아래 마운트).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');
const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const referenceSource = readFileSync('src/lib/reference-workbooks.ts', 'utf8')
  .replace("import { strFromU8, unzipSync } from 'fflate';", 'const { strFromU8, unzipSync } = fflate;')
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
  referenceSource,
  strip('src/lib/see-flow.ts'),
  strip('src/lib/cumulative-bar.ts'),
  strip('src/lib/bundled-references.ts'),
  'globalThis.app = { calculateLocalResults, buildSeeFlowBinding, buildCumulativeBar, expandBundledDefaultValues };',
].join('\n');
const context = vm.createContext({ Intl, fflate, console, Date, Map, Number, Set, Uint8Array, navigator: undefined });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, buildSeeFlowBinding, buildCumulativeBar, expandBundledDefaultValues } = context.app;

const dv = expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-05T00:00:00.000Z');
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
const bar = (processes, precursors, extra = {}) => {
  const results = calculateLocalResults({ products: [product], periods: [period], processes, precursors, productOutputLines: [] });
  const binding = buildSeeFlowBinding(results);
  return { results, binding, model: buildCumulativeBar({ binding, results, precursors, defaultValues: dv, originCountry: 'South Korea', year: '2026', ...extra }) };
};
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

// ── 1) 기본 — 자체 직접 0.1 + 전구물질(기본값) 2.0 = 기준 2.1 ─────────────
const base = bar([makeProcess()], [precursor('p1')]);
assert.equal(base.model.empty, false);
close(base.model.headline, base.binding.seeCbamBasis, '대형 수치는 엔진의 기준 SEE 그대로');
close(base.model.headline, 2.1, '기준 SEE');
assert.deepEqual(plain(base.model.blocks.map((block) => block.kind)), ['OWN', 'PRECURSOR_DEFAULT']);
close(base.model.blocks.reduce((sum, block) => sum + block.value, 0), base.model.headline, '블록 합 = 기준 SEE');
close(base.model.measuredShare, 0.1 / 2.1, '원료가 전부 기본값이면 실측 비율은 자사 입력 몫뿐');
// EU 기본값 기둥 — 한국 CN 7318 15는 2026년 mark-up 포함 3.8214
assert.equal(base.model.defaultColumn.available, true);
close(base.model.defaultColumn.value, 3.8214, 'EU 기본값(한국·7318 15·2026)');
close(base.model.gap.perTonne, 3.8214 - 2.1, '기본값 − 내 값');
close(base.model.reportOnly, 0, '전력을 안 넣었으면 보고용 조각 없음');

// ── 2) 원료를 실측으로 바꾸면 비율이 오른다 ───────────────────────────
const actual = bar([makeProcess()], [precursor('p1', { data_mode: 'ACTUAL', verification_status: 'VERIFIED' })]);
assert.deepEqual(plain(actual.model.blocks.map((block) => block.kind)), ['OWN', 'PRECURSOR_ACTUAL']);
close(actual.model.measuredShare, 1, '전부 실측이면 100%');
const mixed = bar([makeProcess()], [precursor('p1', { purchased_mass_t: 500, consumed_mass_t: 500 }), precursor('p2', { data_mode: 'ACTUAL', purchased_mass_t: 500, consumed_mass_t: 500 })]);
assert.ok(mixed.model.blocks.some((block) => block.kind === 'PRECURSOR_ACTUAL') && mixed.model.blocks.some((block) => block.kind === 'PRECURSOR_DEFAULT'));
close(mixed.model.blocks.reduce((sum, block) => sum + block.value, 0), mixed.model.headline, '섞여도 블록 합 = 기준 SEE');
assert.ok(mixed.model.measuredShare > base.model.measuredShare && mixed.model.measuredShare < 1, '일부 실측이면 중간');

// ── 3) 전력은 보고용 조각이고 실측 비율을 올리지 않는다 ─────────────────
const withPower = bar([makeProcess({ electricity_mwh: 100, electricity_ef_tco2e_per_mwh: 0.5 })], [precursor('p1')]);
close(withPower.model.headline, base.model.headline, '철강은 전력이 기준 SEE에 들어가지 않는다');
close(withPower.model.reportOnly, 0.05, '자체 전력 50 t ÷ 1,000 t = 보고용 조각');
close(withPower.model.measuredShare, base.model.measuredShare, '전력을 넣었다고 실측 비율이 오르지 않는다');

// ── 4) 숫자를 지어내지 않는 경우 ─────────────────────────────────────
assert.equal(bar([makeProcess()], [precursor('p1')], { originCountry: 'Narnia' }).model.defaultColumn.available, false, '원산국에 기본값이 없으면 기둥을 세우지 않는다');
assert.match(bar([makeProcess()], [precursor('p1')], { originCountry: 'Narnia' }).model.defaultColumn.reason, /Narnia/);
assert.equal(bar([makeProcess()], [precursor('p1')], { defaultValues: undefined }).model.defaultColumn.available, false, '기본값 자료가 없으면 기둥을 세우지 않는다');
const noProcess = calculateLocalResults({ products: [product], periods: [period], processes: [], precursors: [], productOutputLines: [] });
const emptyModel = buildCumulativeBar({ binding: buildSeeFlowBinding(noProcess), results: noProcess, precursors: [], defaultValues: dv, originCountry: 'South Korea', year: '2026' });
assert.equal(emptyModel.empty, true, '결과가 없으면 예시 수치를 막대로 그리지 않는다');
assert.equal(emptyModel.headline, null);

// 구매 원료가 결과의 합과 안 맞으면(기록이 사라진 경우) 블록을 지어내지 않는다 — 한 덩어리로만 보여준다
const orphan = bar([makeProcess()], [precursor('p1')]);
const orphanModel = buildCumulativeBar({ binding: orphan.binding, results: orphan.results, precursors: [], defaultValues: dv, originCountry: 'South Korea', year: '2026' });
assert.equal(orphanModel.measuredShare, null, '구분 못 하면 실측 비율을 내지 않는다');
close(orphanModel.headline, 2.1, '그래도 기준 SEE는 엔진 값');
assert.equal(orphanModel.blocks.some((block) => block.kind === 'OWN'), true);

// 연도가 바뀌면 기본값도 바뀐다(mark-up)
const y2028 = bar([makeProcess()], [precursor('p1')], { year: '2028_ONWARDS' });
close(y2028.model.defaultColumn.value, 4.5162, 'EU 기본값(2028~)');

// ── 5) 배선·문안 ─────────────────────────────────────────────────────
const component = readFileSync('src/components/guided/CumulativeBar.tsx', 'utf8');
assert.match(component, /describeSeeFlowIndirect\(binding\.indirectRelevance, binding\.basisExcludesUndetermined\)/, '간접배출 문안은 상태에서 파생한다');
assert.ok(!/\bcalculateLocalResults\b|\bbuildSeeFlowBinding\b/.test(component), '컴포넌트는 계산하지 않는다');
assert.match(component, /motion-reduce:transition-none/, '모션 축소 설정을 존중한다');
const workspace = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(workspace, /<CumulativeBar binding=\{binding\} results=\{scopedResults\} precursors=\{viewData\.precursors\} \/>/, '지도 아래에 붙는다');

console.log('Cumulative bar verified (엔진 기준 SEE와 일치 · EU 기본값 기둥 · 실측 비율 · 전력은 보고용 · 숫자 안 지어냄).');
