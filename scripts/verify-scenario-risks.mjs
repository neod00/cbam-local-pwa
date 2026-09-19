import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadScenarioModule() {
  const scenarioSource = readFileSync('src/lib/scenario-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from '\.\/reference-workbooks';\r?\n/, '')
    .replace(/^export /gm, '');

  // The benchmark selector is the code under test: load the real one, not a stand-in.
  const referenceSource = readFileSync('src/lib/reference-workbooks.ts', 'utf8');
  const selectorStart = referenceSource.indexOf('export type BenchmarkPeriodIndicator');
  const selectorEnd = referenceSource.indexOf(' * 공식 워크북은 국가를') - 4;
  assert.ok(selectorStart >= 0 && selectorEnd > selectorStart, 'benchmark selector block not found');
  const selectorSource = referenceSource.slice(selectorStart, selectorEnd).replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `
${selectorSource}

const normalizeCode = (value) => String(value ?? '').replace(/[^0-9]/g, '');
function defaultValueCandidates(references, country, cnCode) {
  return (references?.rows ?? [])
    .filter((row) => row.country === country && (row.cn_code === cnCode || cnCode.startsWith(row.cn_code)))
    .sort((a, b) => b.cn_code.length - a.cn_code.length);
}

function findDefaultValueReference(references, originCountry, cnCode) {
  return references?.rows?.find((row) => row.country === originCountry && row.cn_code === cnCode);
}

function getDefaultValueTotalForYear(defaultValue, year) {
  if (year === '2026') return defaultValue.total_2026;
  if (year === '2027') return defaultValue.total_2027;
  return defaultValue.total_2028_onwards;
}

${scenarioSource}

globalThis.scenarioCalculation = {
  calculateProductScenarios,
  DEFAULT_SCENARIO_ASSUMPTIONS,
  getScenarioReviewAction,
  normalizeScenarioAssumptions,
  summarizeScenarioRisks,
  selectBenchmarkValues,
  parseBenchmarkIndicator,
  inferBenchmarkRouteLetters,
  defaultBenchmarkRouteLetters,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({});
  vm.runInContext(compiled, context);
  return context.scenarioCalculation;
}

const {
  calculateProductScenarios,
  DEFAULT_SCENARIO_ASSUMPTIONS,
  getScenarioReviewAction,
  normalizeScenarioAssumptions,
  summarizeScenarioRisks,
  selectBenchmarkValues,
  parseBenchmarkIndicator,
  inferBenchmarkRouteLetters,
  defaultBenchmarkRouteLetters,
} = loadScenarioModule();

function assertClose(actual, expected, delta = 0.0000001) {
  assert.ok(Math.abs(actual - expected) < delta, `Expected ${actual} to be close to ${expected}`);
}

function assertAction(actual, expected) {
  assert.equal(JSON.stringify(actual), JSON.stringify(expected));
}

const baseResult = {
  id: 'result-1',
  product_name: 'Hot Rolled Coil',
  cn_code: '72083900',
  hs_code: '7208',
  production_route: 'Flat steel processing',
  output_mass_t: 100,
  see_cbam_basis: 1.6,
  reporting_scope: 'CBAM_GOOD',
  is_cbam_reportable: true,
  see_informational_total: 2.4,
  total_see: 2.4,
};

const assumptions = DEFAULT_SCENARIO_ASSUMPTIONS;
assert.equal(assumptions.origin_country, 'South Korea');
assert.equal(assumptions.default_value_year, '2026');
assert.equal(assumptions.cbam_factor, 0.975);
assert.equal(assumptions.cscf, 1);
assert.equal(assumptions.certificate_price_eur, 80);
assert.equal(assumptions.eu_import_share_percent, 100);
assert.equal(assumptions.de_minimis_threshold_t, 50);
assert.equal(assumptions.paid_carbon_price_eur_per_tco2e, 0);
assert.equal(normalizeScenarioAssumptions(undefined).certificate_price_eur, 80);
assert.equal(normalizeScenarioAssumptions({ certificate_price_eur: 95 }).certificate_price_eur, 95);
assert.equal(normalizeScenarioAssumptions({ cbam_factor: Number.NaN }).cbam_factor, 0.975);
assert.equal(normalizeScenarioAssumptions({ eu_import_share_percent: 40 }).eu_import_share_percent, 40);
assert.equal(normalizeScenarioAssumptions({ eu_import_share_percent: 140 }).eu_import_share_percent, 100);
assert.equal(normalizeScenarioAssumptions({ cbam_factor: 2 }).cbam_factor, 1);
assert.equal(normalizeScenarioAssumptions({ cscf: -0.5 }).cscf, 0);
assert.equal(normalizeScenarioAssumptions({ certificate_price_eur: -10 }).certificate_price_eur, 0);
assert.equal(normalizeScenarioAssumptions({ de_minimis_threshold_t: -1 }).de_minimis_threshold_t, 0);
assert.equal(normalizeScenarioAssumptions({ paid_carbon_price_eur_per_tco2e: 20 }).paid_carbon_price_eur_per_tco2e, 20);

const references = {
  benchmarks: {
    rows: [
      {
        cn_code: '7208',
        production_route: 'Flat steel processing',
        column_a_benchmark: 1.5,
        column_b_benchmark: 1.7,
      },
    ],
  },
  defaultValues: {
    rows: [
      {
        country: 'South Korea',
        cn_code: '72083900',
        total_2026: 2,
        total_2027: 1.9,
        total_2028_onwards: 1.8,
      },
    ],
  },
};

const readyScenarios = calculateProductScenarios([baseResult], assumptions, references);
assert.equal(readyScenarios.length, 1);
const scenariosWithNonCbamCoproduct = calculateProductScenarios([
  baseResult,
  { ...baseResult, id: 'result-scale', product_name: 'Mill scale', reporting_scope: 'NON_CBAM_COPRODUCT', is_cbam_reportable: false, see_cbam_basis: null },
], assumptions, references);
assert.equal(scenariosWithNonCbamCoproduct.length, 1);
assert.equal(scenariosWithNonCbamCoproduct[0].result_id, baseResult.id);

assert.equal(readyScenarios[0].data_quality, 'READY');
assert.equal(readyScenarios[0].default_see, 2);
assertClose(readyScenarios[0].default_gap, -0.4);
assert.equal(readyScenarios[0].import_mass_t, 100);
assert.equal(readyScenarios[0].actual_see, 1.6);
assert.equal(readyScenarios[0].informational_total_see, 2.4);
assert.equal(readyScenarios[0].benchmark_column_a, 1.5);
assert.equal(readyScenarios[0].benchmark_column_b, 1.7);
assert.equal(readyScenarios[0].sefa_indicator, 1.4625);
assertClose(readyScenarios[0].gross_certificate_quantity_indicator, 13.75);
assert.equal(readyScenarios[0].paid_carbon_price_adjustment_tco2e_per_t, 0);
assertClose(readyScenarios[0].certificate_quantity_indicator, 13.75);
assertClose(readyScenarios[0].certificate_cost_indicator_eur, 1100);
assertClose(readyScenarios[0].default_sefa_indicator, 1.6575);
assertClose(readyScenarios[0].gross_default_certificate_quantity_indicator, 34.25);
assertClose(readyScenarios[0].default_certificate_quantity_indicator, 34.25);
assertClose(readyScenarios[0].default_certificate_cost_indicator_eur, 2740);
assertClose(readyScenarios[0].certificate_quantity_delta_indicator, -20.5);
assertClose(readyScenarios[0].certificate_cost_delta_eur, -1640);
assert.equal(readyScenarios[0].lower_certificate_basis, 'ACTUAL');
assert.equal(
  readyScenarios[0].review_message,
  '공식 기준값과 연결되었습니다. 실제자료/기본값 SEFA 및 인증서 지표를 검토하세요.'
);

const readySummary = summarizeScenarioRisks(readyScenarios);
assert.equal(readySummary.missing_cn_count, 0);
assert.equal(readySummary.missing_official_reference_count, 0);
assert.equal(readySummary.missing_reference_count, 0);
assert.equal(readySummary.above_default_count, 0);
assert.equal(readySummary.certificate_exposure_count, 1);
assert.equal(readySummary.default_certificate_exposure_count, 1);
assert.equal(readySummary.actual_lower_certificate_count, 1);
assert.equal(readySummary.default_lower_certificate_count, 0);
assert.equal(readySummary.equal_certificate_count, 0);
assertClose(readySummary.total_certificate_quantity_indicator, 13.75);
assertClose(readySummary.total_certificate_cost_indicator_eur, 1100);
assertClose(readySummary.total_default_certificate_quantity_indicator, 34.25);
assertClose(readySummary.total_default_certificate_cost_indicator_eur, 2740);
assert.equal(readySummary.is_ready_for_review, true);
assertAction(getScenarioReviewAction(readySummary, true, true), { href: '/scenarios', label: '시나리오 검토' });
assertAction(getScenarioReviewAction(readySummary, false, true), { href: '/upload', label: '기준자료 가져오기' });

const adjustedAssumptions = normalizeScenarioAssumptions({
  ...assumptions,
  eu_import_share_percent: 50,
  paid_carbon_price_eur_per_tco2e: 20,
});
const adjustedScenarios = calculateProductScenarios([baseResult], adjustedAssumptions, references);
assert.equal(adjustedScenarios[0].import_mass_t, 50);
assertClose(adjustedScenarios[0].gross_certificate_quantity_indicator, 6.875);
assertClose(adjustedScenarios[0].paid_carbon_price_adjustment_tco2e_per_t, 0.4);
assert.equal(adjustedScenarios[0].certificate_quantity_indicator, 0);
assertClose(adjustedScenarios[0].gross_default_certificate_quantity_indicator, 17.125);
assertClose(adjustedScenarios[0].default_paid_carbon_price_adjustment_tco2e_per_t, 0.5);
assert.equal(adjustedScenarios[0].default_certificate_quantity_indicator, 0);

const missingCnScenarios = calculateProductScenarios([{ ...baseResult, id: 'result-2', cn_code: '', hs_code: '' }], assumptions, references);
assert.equal(missingCnScenarios[0].data_quality, 'MISSING_CN');
assert.equal(missingCnScenarios[0].import_mass_t, 100);
assert.equal(missingCnScenarios[0].lower_certificate_basis, 'UNKNOWN');
assert.equal(missingCnScenarios[0].review_message, 'CN 코드가 없어 공식 기준값과 비교할 수 없습니다.');
assert.equal(summarizeScenarioRisks(missingCnScenarios).missing_cn_count, 1);
assert.equal(summarizeScenarioRisks(missingCnScenarios).is_ready_for_review, false);
assertAction(getScenarioReviewAction(summarizeScenarioRisks(missingCnScenarios), true, true), { href: '/products', label: '품목 관리' });

const missingReferenceScenarios = calculateProductScenarios([baseResult], assumptions, {});
assert.equal(missingReferenceScenarios[0].data_quality, 'MISSING_REFERENCE');
assert.equal(missingReferenceScenarios[0].review_message, '벤치마크 또는 국가/CN 기본값 연결이 필요합니다.');
assert.equal(summarizeScenarioRisks(missingReferenceScenarios).missing_official_reference_count, 1);
assert.equal(summarizeScenarioRisks(missingReferenceScenarios).is_ready_for_review, false);
assertAction(getScenarioReviewAction(summarizeScenarioRisks(missingReferenceScenarios), true, true), { href: '/upload', label: '기준자료 가져오기' });

// ── [씨밤이 run11 · 2025/2620 부속서 식 (4)] 복합제품의 실측 SEFA = 공정 몫 + 전구물질 몫 ──
// 대일기업 STS 나사: 공식 워크북 벤치마크 7318 15 52 (A 0.038 / B 1.154), 전구물질 7223 00 19 (B 1.225).
// 와이어 3,520 t → 나사 3,240 t. 종전에는 공정 몫(0.038)만 빼서, 실측 SEE가 기본값보다 낮은데도 「기본값이 유리」였다.
const daeilReferences = {
  benchmarks: { rows: [
    { cn_code: '73181552', production_route: '', column_a_benchmark: 0.038, column_b_benchmark: 1.154, column_a_route: '', column_b_route: '(1)' },
    { cn_code: '72230019', production_route: '', column_a_benchmark: 0.109, column_b_benchmark: 1.225, column_a_route: '', column_b_route: '(1)' },
  ] },
  defaultValues: { rows: [{ country: 'South Korea', cn_code: '73181552', total_2026: 3.8214, total_2027: 4.1688, total_2028_onwards: 4.5162 }] },
};
const daeilResult = {
  ...baseResult, id: 'daeil', cn_code: '73181552', hs_code: '7318', output_mass_t: 3240,
  see_cbam_basis: 3.7637, see_informational_total: 5.1117, total_see: 5.1117,
  precursor_inputs: [
    { precursor_id: 'kr', name: 'KR wire', cn_code: '72230019', supplier_country: 'South Korea', mass_t: 2910 },
    { precursor_id: 'tw', name: 'TW wire', cn_code: '72230019', supplier_country: 'Taiwan', mass_t: 610 },
  ],
};
const [daeil] = calculateProductScenarios([daeilResult], { ...assumptions, eu_import_share_percent: (620 / 3240) * 100 }, daeilReferences);
const near = (actual, expected, tolerance, label) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} (기대 ${expected})`);
near(daeil.sefa_process_indicator, 0.038 * 0.975, 1e-9, '공정 몫 = A열 × CBAM factor × CSCF');
near(daeil.sefa_precursor_indicator, (3520 / 3240) * 1.225 * 0.975, 1e-9, '전구물질 몫 = Σ mᵢ × 전구물질 B열 × CBAM factor × CSCF');
near(daeil.sefa_indicator, 0.03705 + 1.29759, 1e-4, '실측 SEFA = 공정 몫 + 전구물질 몫');
near(daeil.certificate_quantity_indicator, 620 * (3.7637 - daeil.sefa_indicator), 1e-6, '인증서 수량 = 수입량 × (SEE − SEFA)');
assert.ok(
  daeil.certificate_quantity_indicator < daeil.default_certificate_quantity_indicator,
  `실측 SEE(3.7637)가 기본값(3.8214)보다 낮으면 인증서도 적어야 한다: 실측 ${daeil.certificate_quantity_indicator} vs 기본값 ${daeil.default_certificate_quantity_indicator}`
);
// 전구물질 벤치마크를 못 찾으면 그 몫은 0으로 두고 내역에 드러낸다(값을 지어내지 않는다).
const [daeilMissing] = calculateProductScenarios([daeilResult], assumptions, { ...daeilReferences, benchmarks: { rows: [daeilReferences.benchmarks.rows[0]] } });
assert.equal(daeilMissing.sefa_precursor_indicator, 0);
assert.equal(daeilMissing.sefa_precursor_breakdown.every((item) => item.benchmark_column_b === undefined), true);
// 전구물질이 없는 결과(단순제품)는 종전과 같다.
assert.equal(readyScenarios[0].sefa_precursor_indicator, 0);

// ── [2025/2620 부속서 3.3(1)] 공급사가 준 **검증된** SEFAᵢ는 B열 대신 쓴다 ──
// SEFAᵢ는 CBAM factor·CSCF가 이미 반영된 최종값이라 계수를 다시 곱하지 않는다.
const withSupplierSefa = (status, value = 1.3) => ({
  ...daeilResult,
  precursor_inputs: [
    { ...daeilResult.precursor_inputs[0], supplier_sefa_tco2e_per_t: value, verification_status: status },
    daeilResult.precursor_inputs[1],
  ],
});
const [verified] = calculateProductScenarios([withSupplierSefa('VERIFIED')], assumptions, daeilReferences);
near(verified.sefa_precursor_indicator, (2910 / 3240) * 1.3 + (610 / 3240) * 1.225 * 0.975, 1e-9, '검증된 공급사 SEFA는 그대로, 나머지는 B열 × 계수');
assert.equal(verified.sefa_precursor_breakdown[0].sefa_basis, 'SUPPLIER_VERIFIED');
assert.equal(verified.sefa_precursor_breakdown[1].sefa_basis, 'COLUMN_B');
// 검증완료가 아니면 입력돼 있어도 쓰지 않고, 쓰지 않았다는 사실을 드러낸다.
for (const status of ['UNVERIFIED', 'SUPPLIER_CONFIRMED', undefined]) {
  const [unverified] = calculateProductScenarios([withSupplierSefa(status)], assumptions, daeilReferences);
  near(unverified.sefa_precursor_indicator, daeil.sefa_precursor_indicator, 1e-9, `미검증(${status}) 공급사 SEFA는 계산에 쓰이면 안 된다`);
  assert.equal(unverified.sefa_precursor_breakdown[0].supplier_sefa_unverified, true);
}
// 음수·NaN은 값이 없는 것으로 본다. 0은 유효한 값이다(무상할당이 없는 공급사).
const [negative] = calculateProductScenarios([withSupplierSefa('VERIFIED', -1)], assumptions, daeilReferences);
near(negative.sefa_precursor_indicator, daeil.sefa_precursor_indicator, 1e-9, '음수 SEFA는 무시한다');
const [zero] = calculateProductScenarios([withSupplierSefa('VERIFIED', 0)], assumptions, daeilReferences);
near(zero.sefa_precursor_indicator, (610 / 3240) * 1.225 * 0.975, 1e-9, '검증된 SEFA 0은 0으로 쓴다');
// 벤치마크 파일에 전구물질 행이 없어도 검증된 공급사 값은 쓸 수 있다.
const [verifiedNoBenchmark] = calculateProductScenarios([withSupplierSefa('VERIFIED')], assumptions, { ...daeilReferences, benchmarks: { rows: [daeilReferences.benchmarks.rows[0]] } });
near(verifiedNoBenchmark.sefa_precursor_indicator, (2910 / 3240) * 1.3, 1e-9, '벤치마크가 없어도 검증된 공급사 SEFA는 반영');

// ── [2025/2620 부속서 5.1 · 5.3] 값이 여럿인 CN에서 벤치마크 고르기 ─────────────
// 행은 공식 워크북(CBAM Benchmarks_20260206.xlsx)에서 그대로 옮겼다. 이어지는 행은 CN을 물려받는다.
const officialRows = [
  // 7223 00 19 STS 와이어: 생산연도로 갈린다
  { cn_code: '72230019', column_a_benchmark: 0.109, column_a_route: '', column_b_benchmark: 1.225, column_b_route: '(1)' },
  { cn_code: '72230019', column_a_benchmark: undefined, column_a_route: '', column_b_benchmark: 1.187, column_b_route: '(2)' },
  // 7207 11 11 반제품: A·B열 모두 경로로 갈린다
  { cn_code: '72071111', column_a_benchmark: 0.188, column_a_route: '(C)', column_b_benchmark: 1.364, column_b_route: '(C)' },
  { cn_code: '72071111', column_a_benchmark: 0.065, column_a_route: '(D)', column_b_benchmark: 0.475, column_b_route: '(D)' },
  { cn_code: '72071111', column_a_benchmark: 0.065, column_a_route: '(E)', column_b_benchmark: 0.066, column_b_route: '(E)' },
  // 합금강: 등급(F·G·H·J) × 생산연도 — 값은 구조 확인용
  { cn_code: '72249002', column_a_benchmark: 0.2, column_a_route: '(F)', column_b_benchmark: 1.5, column_b_route: '(F)(1)' },
  { cn_code: '72249002', column_a_benchmark: 0.07, column_a_route: '(G)', column_b_benchmark: 0.6, column_b_route: '(G)(1)' },
  { cn_code: '72249002', column_a_benchmark: 0.07, column_a_route: '(H)', column_b_benchmark: 0.3, column_b_route: '(H)(1)' },
  { cn_code: '72249002', column_a_benchmark: 0.09, column_a_route: '(J)', column_b_benchmark: 0.4, column_b_route: '(J)(1)' },
  { cn_code: '72249002', column_a_benchmark: undefined, column_a_route: '', column_b_benchmark: 1.4, column_b_route: '(F)(2)' },
  { cn_code: '72249002', column_a_benchmark: undefined, column_a_route: '', column_b_benchmark: 0.5, column_b_route: '(G)(2)' },
  { cn_code: '72249002', column_a_benchmark: undefined, column_a_route: '', column_b_benchmark: 0.25, column_b_route: '(H)(2)' },
  { cn_code: '72249002', column_a_benchmark: undefined, column_a_route: '', column_b_benchmark: 0.35, column_b_route: '(J)(2)' },
  // 값이 하나뿐인 CN
  { cn_code: '72011011', column_a_benchmark: 1.089, column_a_route: '', column_b_benchmark: 1.21, column_b_route: '' },
];
const official = { rows: officialRows };
const plain = (value) => JSON.parse(JSON.stringify(value));

assert.deepEqual(plain(parseBenchmarkIndicator('(F)(2)')), { letters: ['F'], period: '2' });
assert.deepEqual(plain(parseBenchmarkIndicator('(C)/(F)')), { letters: ['C', 'F'] });
assert.deepEqual(plain(parseBenchmarkIndicator('\u00a0')), { letters: [] }, '워크북의 빈칸(nbsp)은 경로 없음이다');

// 생산연도: 2026~27은 (1), 2028~은 (2). (2) 행에는 A열 값이 없으므로 A열은 공통값을 쓴다.
const wire1 = selectBenchmarkValues(official, '72230019', { period: '1' });
const wire2 = selectBenchmarkValues(official, '72230019', { period: '2' });
assert.equal(wire1.column_b, 1.225);
assert.equal(wire2.column_b, 1.187, '2028년 이후 기간에 (1) 값이 나간다');
assert.equal(wire2.column_a, 0.109, '(2) 기간에 A열 값을 잃는다');
assert.equal(wire2.column_b_ambiguous, false, '생산연도로 하나만 남으면 모호하지 않다');

// 경로: 원산국 기본 경로(기본값 워크북의 경로 열)로 고른다.
assert.equal(selectBenchmarkValues(official, '72071111', { period: '1', columnBRouteLetters: ['C'] }).column_b, 1.364);
assert.equal(selectBenchmarkValues(official, '72071111', { period: '1', columnBRouteLetters: ['E'] }).column_b, 0.066, '전기로 원료에 고로 값이 나간다');
assert.equal(selectBenchmarkValues(official, '72071111', { period: '1', columnARouteLetters: ['D', 'G'] }).column_a, 0.065);
// 경로 근거가 없으면 가장 높은 값을 고르되, 그 사실을 알린다.
const unknownRoute = selectBenchmarkValues(official, '72071111', { period: '1' });
assert.equal(unknownRoute.column_b, 1.364);
assert.equal(unknownRoute.column_b_ambiguous, true, '근거 없이 고른 값임을 알려야 한다');
// 표에 없는 문자를 받으면 근거 없는 것과 같다.
assert.equal(selectBenchmarkValues(official, '72071111', { period: '1', columnBRouteLetters: ['K'] }).column_b_ambiguous, true);

// 5.1: 같은 CN에 합금 등급이 여럿이면 그 생산연도의 가장 높은 값. 「(C)/(F)」처럼 경로가 등급을 가로지르면 그 안에서 최고값.
const alloy2 = selectBenchmarkValues(official, '72249002', { period: '2', columnBRouteLetters: ['C', 'F'] });
assert.equal(alloy2.column_b, 1.4);
assert.equal(alloy2.column_b_indicator, '(F)(2)');
assert.equal(alloy2.column_b_ambiguous, false);
assert.equal(selectBenchmarkValues(official, '72249002', { period: '1', columnBRouteLetters: ['E', 'H', 'J'] }).column_b, 0.4, '전기로 계열(H·J) 중 최고값');

// 값이 하나뿐인 CN은 종전과 같다. 8자리에 없으면 짧은 코드로 내려간다.
const single = selectBenchmarkValues(official, '72011011', { period: '2', columnBRouteLetters: ['C'] });
assert.equal(single.column_a, 1.089);
assert.equal(single.column_b, 1.21);
assert.equal(single.column_b_ambiguous, false);
assert.equal(selectBenchmarkValues(official, '99999999', { period: '1' }), undefined);

// 글자에서 실제 경로 읽기(5.2 — 실제 자료의 A열)
assert.deepEqual(plain(inferBenchmarkRouteLetters('스크랩 전기로(EAF)')), ['E', 'H', 'J']);
assert.deepEqual(plain(inferBenchmarkRouteLetters('BF/BOF 일관제철')), ['C', 'F']);
assert.deepEqual(plain(inferBenchmarkRouteLetters('DRI-EAF')), ['D', 'G'], 'DRI/EAF는 DRI 경로다 — EAF로 읽으면 안 된다');
assert.deepEqual(plain(inferBenchmarkRouteLetters('가공(압연·신선·열처리)')), [], '가공 공정 글자에서는 경로를 지어내지 않는다');

// 원산국 기본 경로: 기본값 워크북의 경로 열에서 읽는다.
const dvWithRoutes = { rows: [
  { country: 'South Korea', cn_code: '720711', production_route: '(C)' },
  { country: 'Nowhere', cn_code: '720711', production_route: '(E)' },
  { country: 'South Korea', cn_code: '7224', production_route: '(C)/(F)' },
  { country: 'South Korea', cn_code: '7223', production_route: '\u00a0' },
] };
assert.deepEqual(plain(defaultBenchmarkRouteLetters(dvWithRoutes, 'South Korea', '72071111')), ['C']);
assert.deepEqual(plain(defaultBenchmarkRouteLetters(dvWithRoutes, 'South Korea', '72249002')), ['C', 'F']);
assert.deepEqual(plain(defaultBenchmarkRouteLetters(dvWithRoutes, 'South Korea', '72230019')), []);
assert.deepEqual(plain(defaultBenchmarkRouteLetters(dvWithRoutes, undefined, '72071111')), []);

// 시나리오에 연결: 전구물질의 B열은 **그 전구물질의 원산국** 경로로, 기간은 가정의 연도로 고른다.
const billetResult = {
  ...baseResult, id: 'billet', cn_code: '72011011', hs_code: '7201', output_mass_t: 1000,
  precursor_inputs: [
    { precursor_id: 'kr', name: 'KR billet', cn_code: '72071111', supplier_country: 'South Korea', mass_t: 500 },
    { precursor_id: 'xx', name: 'EAF billet', cn_code: '72071111', supplier_country: 'Nowhere', mass_t: 500 },
    { precursor_id: 'zz', name: 'Unknown billet', cn_code: '72071111', supplier_country: 'Atlantis', mass_t: 100 },
  ],
};
const [billet] = calculateProductScenarios([billetResult], assumptions, { benchmarks: official, defaultValues: dvWithRoutes });
assert.deepEqual(plain(billet.sefa_precursor_breakdown.map((item) => [item.benchmark_column_b, item.benchmark_indicator, item.benchmark_ambiguous])), [
  [1.364, '(C)', false],
  [0.066, '(E)', false],
  [1.364, '(C)', true],
]);
const [wire2028] = calculateProductScenarios([daeilResult], { ...assumptions, default_value_year: '2028_ONWARDS' }, daeilReferences);
assert.equal(wire2028.benchmark_column_b, 1.154, '대일 나사 시험 자료에는 (2) 행이 없으므로 (1) 값을 그대로 쓴다');

console.log('Scenario risk verification passed.');
