import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadScenarioModule() {
  const scenarioSource = readFileSync('src/lib/scenario-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from '\.\/reference-workbooks';\r?\n/, '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `
function findBenchmarkReference(references, cnCode, productionRoute) {
  const candidates = references?.rows
    ?.filter((row) => row.cn_code === cnCode || cnCode.startsWith(row.cn_code))
    .sort((a, b) => b.cn_code.length - a.cn_code.length) ?? [];

  return candidates.find((row) => !productionRoute || row.production_route === productionRoute) ?? candidates[0];
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

console.log('Scenario risk verification passed.');
