// 2025/2547 원문 대조로 찾은 세 가지를 잠근다(2026-09-28).
//
//  1. 부속서 II A.1 4·5항 — 제3국 전구물질의 실측값은 검증보고서가 있을 때만 쓸 수 있다. 「공급사 확인」은
//     제3자 검증이 아닌데 종전엔 아무 말 없이 통과했다.
//  2. 부속서 I 3.16.2 — 철강제품 경계: 아연도금·코팅은 포함, 도금(plating)·절단·용접·마무리는 제외.
//     종전 화면은 「최신 기준 확인 필요」로 미뤘고, 제품군 안내는 오히려 용접·절단 연료를 모으라고 했다.
//  3. 부속서 III A.2.2·식 52·55 — 밖에서 산 스팀·온수의 배출(EmH,imp)을 직접배출에 더한다. 종전엔 넣을 곳이 없었다.
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
  'globalThis.app = { calculateLocalResults, isUnverifiedActualPrecursor, resolveImportedHeat, validateImportedHeatDraft, buildImportedHeatUpdate, isIronOrSteelProductsGood, IRON_STEEL_PRODUCTS_BOUNDARY, ALLOCATION_RULES };',
].join('\n');
const context = vm.createContext({});
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, isUnverifiedActualPrecursor, resolveImportedHeat, validateImportedHeatDraft, buildImportedHeatUpdate, isIronOrSteelProductsGood, IRON_STEEL_PRODUCTS_BOUNDARY, ALLOCATION_RULES } = context.app;

const near = (actual, expected, label) => assert.ok(Math.abs(actual - expected) < 1e-9, `${label}: ${actual} (기대 ${expected})`);
const period = { id: 'period', name: '2026', start_date: '2026-01-01', end_date: '2026-12-31', status: 'OPEN', created_at: '', updated_at: '' };
const screw = { id: 'screw', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', created_at: '', updated_at: '' };
const process = { id: 'p', period_id: period.id, product_id: screw.id, name: '나사 공정', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 100, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, created_at: '', updated_at: '' };
const wireRod = (overrides) => ({ id: 'wr', period_id: period.id, process_id: process.id, product_id: screw.id, name: '선재', precursor_cn_code: '72139110', aggregated_goods_category: '', production_route: '', supplier_country: 'South Korea', supplier_installation: '', data_mode: 'ACTUAL', verification_status: 'VERIFIED', default_value_year: '2026', purchased_mass_t: 1100, consumed_mass_t: 1100, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0, source: '공급사 통지', default_value_justification: '', created_at: '', updated_at: '', ...overrides });
const run = (processes, precursors = []) => calculateLocalResults({ products: [screw], periods: [period], processes, precursors });
const rule = /A\.1 4·5항/;

// ── 1. 검증보고서 없는 실측 전구물질 ─────────────────────────────────
assert.equal(isUnverifiedActualPrecursor({ data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED' }), true, '「공급사 확인」은 제3자 검증이 아니다');
assert.equal(isUnverifiedActualPrecursor({ data_mode: 'SEMI_ACTUAL', verification_status: 'UNVERIFIED' }), true);
assert.equal(isUnverifiedActualPrecursor({ data_mode: 'ACTUAL', verification_status: 'VERIFIED' }), false);
assert.equal(isUnverifiedActualPrecursor({ data_mode: 'DEFAULT', verification_status: 'UNVERIFIED' }), false, '기본값은 검증보고서가 필요 없다');
const verified = run([process], [wireRod()])[0];
const supplierConfirmed = run([process], [wireRod({ verification_status: 'SUPPLIER_CONFIRMED' })])[0];
const defaults = run([process], [wireRod({ data_mode: 'DEFAULT', verification_status: 'UNVERIFIED' })])[0];
assert.ok(!verified.warnings.some((message) => rule.test(message)), '검증된 실측값에 경고를 낸다');
assert.ok(!defaults.warnings.some((message) => rule.test(message)), '기본값에 검증 경고를 낸다');
const warning = supplierConfirmed.warnings.find((message) => rule.test(message));
assert.ok(warning, '「공급사 확인」 실측값이 아무 말 없이 계산된다');
assert.match(warning, /공급사 확인 — 제3자 검증 아님/);
assert.match(warning, /기본값을 써야 합니다/);
assert.equal(supplierConfirmed.warningDetails.find((detail) => rule.test(detail.message)).target.type, 'precursor', '경고가 전구물질 화면으로 이어져야 한다');
// 숫자는 바꾸지 않는다 — 기본값을 대신 고르는 것은 사용자의 일이다(값을 지어내지 않는다).
near(supplierConfirmed.see_cbam_basis, verified.see_cbam_basis, '경고만 내고 SEE는 그대로');

// ── 2. 철강제품 시스템 경계(3.16.2) ──────────────────────────────────
assert.equal(isIronOrSteelProductsGood(screw), true, '나사(7318)는 철강제품 품목군이다');
assert.equal(isIronOrSteelProductsGood({ cn_code: '72189911' }), false, 'STS 반제품(7218)은 조강 — 경계가 다르다(3.15)');
assert.equal(isIronOrSteelProductsGood({ cn_code: '26011200' }), false, '소결광은 철강제품이 아니다');
assert.equal(isIronOrSteelProductsGood(undefined), false);
assert.match(IRON_STEEL_PRODUCTS_BOUNDARY.text, /excluding the following processes: plating, cutting, welding and finishing/);
assert.match(IRON_STEEL_PRODUCTS_BOUNDARY.included, /아연도금\(galvanizing\)/, '아연도금은 경계 안이다');
assert.match(IRON_STEEL_PRODUCTS_BOUNDARY.excluded, /도금\(plating\)·절단·용접·마무리/);
const presets = readFileSync('src/lib/product-family-presets.ts', 'utf8');
for (const stale of ['용접·절단 연료 사용량', '용접·도장 연료 사용량', "description: '용접, 절단, 열처리 관련 전력·연료 자료'", "description: '열처리로, 도금, 세척 등 에너지 사용량'"]) {
  assert.ok(!presets.includes(stale), `제품군 안내가 경계 밖 연료를 모으라고 한다: ${stale}`);
}
const processesPage = readFileSync('src/app/processes/page.tsx', 'utf8');
assert.doesNotMatch(processesPage, /최신 기준과 거래 품목을 기준으로 확인해야 합니다/, '규정이 정한 경계를 「확인 필요」로 미룬다');
assert.match(processesPage, /IRON_STEEL_PRODUCTS_BOUNDARY\.excluded/);
assert.match(readFileSync('src/components/guided/panels.tsx', 'utf8'), /isIronOrSteelProductsGood\(/, '연료를 넣는 4단계에 경계 안내가 없다');

// ── 3. 산 열(EmH,imp) ────────────────────────────────────────────────
// 1,000 Gcal = 4.1868 TJ. 표준값: 천연가스 56.1 ÷ 0.9 = 62.333… tCO₂/TJ → 260.978 tCO₂
const heatYes = { measurable_heat_import: 'YES', imported_heat_amount: 1000, imported_heat_unit: 'Gcal', imported_heat_ef_basis: 'STANDARD_FUEL_BOILER', imported_heat_standard_fuel: 'NATURAL_GAS' };
const standard = resolveImportedHeat(heatYes);
near(standard.tj, 4.1868, 'Gcal → TJ');
near(standard.efTco2PerTj, 56.1 / 0.9, '표준값 = 연료 표준계수 ÷ 보일러 효율 90%(A.2.2 (2))');
near(standard.emissionsTco2e, 4.1868 * 56.1 / 0.9, '식 52');
const supplier = resolveImportedHeat({ ...heatYes, imported_heat_ef_basis: 'SUPPLIER', imported_heat_supplier_ef_tco2_per_tj: 70, imported_heat_amount: 2, imported_heat_unit: 'TJ' });
near(supplier.emissionsTco2e, 140, '공급사 계수');
assert.equal(resolveImportedHeat({}).answered, false, '답하지 않은 옛 자료');
assert.equal(resolveImportedHeat({ measurable_heat_import: 'NO' }).emissionsTco2e, 0);
const missingEf = resolveImportedHeat({ ...heatYes, imported_heat_ef_basis: 'SUPPLIER' });
assert.ok(missingEf.problem && missingEf.emissionsTco2e === 0, '계수 없이 「쓴다」면 문제로 알리고 값을 지어내지 않는다');

// 엔진: 직접 SEE에 더하고, 배출원 대조(DirEm*)는 건드리지 않는다.
const withHeat = run([{ ...process, ...heatYes }])[0];
const withoutHeat = run([process])[0];
near(withHeat.direct_emissions_tco2e, 100 + standard.emissionsTco2e, 'AttrEmDir = DirEm* + EmH,imp');
near(withHeat.imported_heat_emissions_tco2e, standard.emissionsTco2e, '결과에 산 열 몫이 따로 남는다');
near(withHeat.direct_see, (100 + standard.emissionsTco2e) / 1000, '직접 SEE');
near(withHeat.see_cbam_basis, withHeat.direct_see, '철강은 직접만 기준 — 산 열은 직접배출이므로 기준에 들어간다');
near(withHeat.source_stream_delta_tco2e, withoutHeat.source_stream_delta_tco2e, '배출원 대조가 산 열 때문에 틀어지면 안 된다');
assert.equal(withoutHeat.imported_heat_emissions_tco2e, 0);
// 다제품 공정: 라인 배분을 따라간다.
const lines = [
  { id: 'l1', process_id: process.id, product_id: screw.id, name: 'A', output_mass_t: 600, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '' },
  { id: 'l2', process_id: process.id, product_id: screw.id, name: 'B', output_mass_t: 400, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '' },
];
const lineResults = calculateLocalResults({ products: [screw], periods: [period], processes: [{ ...process, ...heatYes }], precursors: [], productOutputLines: lines });
near(lineResults.reduce((sum, result) => sum + result.imported_heat_emissions_tco2e, 0), standard.emissionsTco2e, '라인에 나눈 산 열의 합 = 공정의 산 열');
near(lineResults[0].direct_see, lineResults[1].direct_see, '질량 배분이면 라인 SEE가 같다');
// 값이 모자라면 경고하고 0으로 둔다.
const broken = run([{ ...process, ...heatYes, imported_heat_amount: 0 }])[0];
assert.ok(broken.warnings.some((message) => /산 열\(스팀·온수\)을 쓴다고 했는데/.test(message) && /적게 나옵니다/.test(message)), '「쓴다」인데 양이 없으면 알려야 한다');

// 화면 입력 → 저장 레코드
const draft = { answer: 'YES', amount: 1000, unit: 'Gcal', basis: 'STANDARD_FUEL_BOILER', supplierEf: 0, fuel: 'NATURAL_GAS', source: '명세서' };
assert.equal(validateImportedHeatDraft(draft), undefined);
assert.match(validateImportedHeatDraft({ ...draft, answer: '' }), /먼저 고르세요/);
assert.match(validateImportedHeatDraft({ ...draft, amount: 0 }), /양/);
assert.match(validateImportedHeatDraft({ ...draft, basis: 'SUPPLIER' }), /배출계수/);
assert.match(validateImportedHeatDraft({ ...draft, fuel: 'PEAT' }), /연료/, '표 1에서 옮기지 않은 연료는 받지 않는다');
const saved = buildImportedHeatUpdate(process, draft);
near(resolveImportedHeat(saved).emissionsTco2e, standard.emissionsTco2e, '저장한 레코드로 같은 값이 나와야 한다');
const cleared = buildImportedHeatUpdate(saved, { ...draft, answer: 'NO' });
assert.equal(cleared.measurable_heat_import, 'NO');
assert.equal(cleared.imported_heat_amount, undefined, '「아니요」로 바꾸면 숨은 옛 값이 남으면 안 된다');

// 식 55 규칙: 산 열은 반영, 나머지 항은 미지원으로 계속 표시
assert.notEqual(ALLOCATION_RULES.HEAT_IMPORT.unsupported, true);
assert.equal(ALLOCATION_RULES.ADJUSTMENTS.unsupported, true);
assert.match(ALLOCATION_RULES.ADJUSTMENTS.text, /열 수출, 폐가스 수입·수출, 공정 내 자가발전 차감\)는 미지원/);

console.log('2547 alignment verification passed (미검증 실측 전구물질 경고 · 철강제품 경계 3.16.2 · 산 열 EmH,imp 산정·배분·입력).');
