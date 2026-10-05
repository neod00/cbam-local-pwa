// 부속서 II A.4 — 크기·형상만 다른 철강제품은 단일 다기능 생산공정 (CBAM-ALLOC-ROUTE-02, 2026-10-05).
//
// 규정: 철강제품에서 크기·형상만 다른 재화(기능단위 = CN이 달라도)를 종류·양·비율이 같은 전구물질로 만들면, 그 재화 묶음에 대해
// 단일 다기능 생산공정을 정의하고 부속서 III A.2(질량)로 귀속해야 한다. 앱은 같은 CN을 여러 공정으로 나눈 경우(Art 4(6))만 알렸다.
// 공정을 CN별로 따로 만들고 에너지를 임의로 나누면 이 규정을 우회하는데도 막지 못했다.
//
// 앱은 원료의 양·비율을 모른다 — 「같은 종류의 구매 원료(CN)를 쓰는 철강제품 공정이 둘 이상」일 때 확인을 요구한다(경고만, 숫자는 불변).
// 재질이 다르면(STS와 탄소강) 원료 CN이 달라 걸리지 않는다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import .*;\r?\n/gm : /^import type .*;\r?\n/gm, '')
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
  'globalThis.app = { calculateLocalResults, ALLOCATION_RULES };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, ALLOCATION_RULES } = context.app;

const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = (id, cn, extra = {}) => ({ id, name: `제품 ${cn}`, cn_code: cn, hs_code: cn.slice(0, 4), hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp, ...extra });
const screw = product('screw', '73181552');
const bolt = product('bolt', '73181558');
const makeProcess = (id, productId, extra = {}) => ({
  id, product_id: productId, period_id: period.id, name: `공정 ${id}`, production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp, ...extra,
});
const precursor = (id, processId, cn, extra = {}) => ({
  id, process_id: processId, period_id: period.id, name: `원료 ${cn}`, precursor_cn_code: cn, aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_country: 'South Korea', supplier_installation: '', data_mode: 'DEFAULT',
  verification_status: 'UNVERIFIED', default_value_year: '2026', purchased_mass_t: 1000, consumed_mass_t: 1000, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0,
  source: 'EU default', default_value_justification: '미회신', ...stamp, ...extra,
});
const run = (products, processes, precursors, extra = {}) => calculateLocalResults({ products, periods: [period], processes, precursors, productOutputLines: [], ...extra });
const a4 = (results) => results.flatMap((result) => result.warnings).filter((warning) => warning.includes('ANNEX II, point A.4'));

// ── 1) 같은 종류의 원료(CN)를 쓰는 철강제품 공정이 둘 이상이고 CN이 다르면 → 양쪽에 확인 필요 ──
const procA = makeProcess('A', screw.id);
const procB = makeProcess('B', bolt.id);
const shared = run([screw, bolt], [procA, procB], [precursor('p1', 'A', '72139110'), precursor('p2', 'B', '72139110')]);
const warnings = a4(shared);
assert.equal(warnings.length, 2, '두 공정 모두에 알린다');
assert.match(warnings[0], /확인 필요\(규정\): 공정 A과\(와\) 공정 B은\(는\) 둘 다 철강제품이고 같은 종류의 구매 원료\(CN 72139110\)를 씁니다/);
assert.match(warnings[0], /CN이 달라도 단일 다기능 생산공정/);
assert.match(warnings[0], /공정을 하나로 합치고 제품을 생산라인으로 넣으세요/);
assert.match(warnings[0], /재질이나 비율이 다르면 해당하지 않으니/);
assert.ok(shared.every((result) => result.direct_emissions_tco2e === 100), '경고만 한다 — 숫자는 바뀌지 않는다');

// ── 2) 걸리지 않아야 하는 경우 ───────────────────────────────────────
assert.equal(a4(run([screw, bolt], [procA, procB], [precursor('p1', 'A', '72230019'), precursor('p2', 'B', '72139110')])).length, 0, '원료가 다르다(STS 선재와 탄소강 선재) — 해당하지 않는다');
assert.equal(a4(run([screw, bolt], [procA, procB], [])).length, 0, '원료를 모르면 알 수 없다 — 추측하지 않는다');
assert.equal(a4(run([screw, bolt], [procA, procB], [precursor('p1', 'A', '72139110')])).length, 0, '한쪽만 원료가 있으면 같은 종류인지 알 수 없다');
assert.equal(a4(run([screw], [procA, makeProcess('B', screw.id)], [precursor('p1', 'A', '72139110'), precursor('p2', 'B', '72139110')])).length, 0, '같은 CN을 공정 둘로 나눈 것은 Art 4(6) 경고가 따로 다룬다');
assert.equal(a4(run([screw, bolt], [procA, makeProcess('B', bolt.id, { period_id: 'other' })], [precursor('p1', 'A', '72139110'), precursor('p2', 'B', '72139110', { period_id: 'other' })])).length, 0, '보고기간이 다르면 다른 문서의 공정이다');
const nonCbamBolt = product('bolt-non', '73181558', { reporting_scope: 'NON_CBAM_COPRODUCT' });
assert.equal(a4(run([screw, nonCbamBolt], [procA, makeProcess('B', nonCbamBolt.id)], [precursor('p1', 'A', '72139110'), precursor('p2', 'B', '72139110')])).length, 0, 'CBAM 대상이 아닌 제품 공정은 묶을 재화가 아니다');
const boltLine = { id: 'l1', process_id: 'A', product_id: bolt.id, name: '볼트', output_mass_t: 500, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '', reporting_scope: 'CBAM_GOOD', ...stamp };
assert.equal(a4(run([screw, bolt], [procA], [precursor('p1', 'A', '72139110')], { productOutputLines: [boltLine] })).length, 0, '한 공정에 제품 라인으로 넣은 것이 규정이 요구하는 모양이다 — 알리지 않는다');
assert.equal(a4(run([screw, bolt], [procA, procB], [precursor('p1', 'A', '123'), precursor('p2', 'B', '123')])).length, 0, '너무 짧은 CN은 같은 종류의 근거가 못 된다');

// ── 3) 셋 이상이면 모두 나열 ──────────────────────────────────────────
const nut = product('nut', '73181699');
const three = run([screw, bolt, nut], [procA, procB, makeProcess('C', nut.id)], [precursor('p1', 'A', '72139110'), precursor('p2', 'B', '72139110'), precursor('p3', 'C', '72139110')]);
assert.equal(a4(three).length, 3);
assert.match(a4(three)[0], /공정 B · 공정 C/);

// ── 4) 규정 문안과 배선 ──────────────────────────────────────────────
assert.equal(ALLOCATION_RULES.SINGLE_MULTIFUNCTIONAL.id, 'CBAM-ALLOC-ROUTE-02');
assert.equal(ALLOCATION_RULES.SINGLE_MULTIFUNCTIONAL.kind, '규정 필수');
assert.match(ALLOCATION_RULES.SINGLE_MULTIFUNCTIONAL.text, /only differ in size or shape are produced with the same precursors in types, quantities and proportions/);
assert.match(ALLOCATION_RULES.SINGLE_MULTIFUNCTIONAL.text, /a single multifunctional production process shall be defined/);
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /reportingProducts\.some\(\(item\) => isIronOrSteelProductsGood\(item\)\)/, '3단계 안내가 철강제품에만 뜬다');
assert.match(panels, /한 공정에 제품을 생산라인으로 추가/);
assert.match(panels, /원료 재질이 다르면\(예: STS와 탄소강\) 공정을 따로 두는 것이 맞습니다/, '안내가 STS·탄소강 같은 정당한 분리를 막지 않는다');

console.log('Annex II A.4 verification passed (같은 원료 철강제품 공정 둘 이상 → 확인 필요 · 원료가 다르면 조용 · 숫자 불변).');
