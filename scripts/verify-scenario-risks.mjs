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
  return references?.rows?.find((row) => row.cn_code === cnCode && (!productionRoute || row.production_route === productionRoute));
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
  normalizeScenarioAssumptions,
  summarizeScenarioRisks,
} = loadScenarioModule();

function assertClose(actual, expected, delta = 0.0000001) {
  assert.ok(Math.abs(actual - expected) < delta, `Expected ${actual} to be close to ${expected}`);
}

const baseResult = {
  id: 'result-1',
  product_name: 'Hot Rolled Coil',
  cn_code: '72083900',
  hs_code: '7208',
  production_route: 'Flat steel processing',
  output_mass_t: 100,
  total_see: 2.4,
};

const assumptions = DEFAULT_SCENARIO_ASSUMPTIONS;
assert.equal(assumptions.origin_country, 'South Korea');
assert.equal(assumptions.default_value_year, '2026');
assert.equal(assumptions.cbam_factor, 0.975);
assert.equal(assumptions.cscf, 1);
assert.equal(assumptions.certificate_price_eur, 80);
assert.equal(normalizeScenarioAssumptions(undefined).certificate_price_eur, 80);
assert.equal(normalizeScenarioAssumptions({ certificate_price_eur: 95 }).certificate_price_eur, 95);
assert.equal(normalizeScenarioAssumptions({ cbam_factor: Number.NaN }).cbam_factor, 0.975);

const references = {
  benchmarks: {
    rows: [
      {
        cn_code: '72083900',
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
assert.equal(readyScenarios[0].data_quality, 'READY');
assert.equal(readyScenarios[0].default_see, 2);
assertClose(readyScenarios[0].default_gap, 0.4);
assert.equal(readyScenarios[0].benchmark_column_a, 1.5);
assert.equal(readyScenarios[0].benchmark_column_b, 1.7);
assert.equal(readyScenarios[0].sefa_indicator, 1.4625);
assert.equal(readyScenarios[0].certificate_quantity_indicator, 93.75);
assert.equal(readyScenarios[0].certificate_cost_indicator_eur, 7500);

const readySummary = summarizeScenarioRisks(readyScenarios);
assert.equal(readySummary.missing_cn_count, 0);
assert.equal(readySummary.missing_official_reference_count, 0);
assert.equal(readySummary.missing_reference_count, 0);
assert.equal(readySummary.above_default_count, 1);
assert.equal(readySummary.certificate_exposure_count, 1);
assert.equal(readySummary.total_certificate_quantity_indicator, 93.75);
assert.equal(readySummary.total_certificate_cost_indicator_eur, 7500);
assert.equal(readySummary.is_ready_for_review, true);

const missingCnScenarios = calculateProductScenarios([{ ...baseResult, id: 'result-2', cn_code: '', hs_code: '' }], assumptions, references);
assert.equal(missingCnScenarios[0].data_quality, 'MISSING_CN');
assert.equal(summarizeScenarioRisks(missingCnScenarios).missing_cn_count, 1);
assert.equal(summarizeScenarioRisks(missingCnScenarios).is_ready_for_review, false);

const missingReferenceScenarios = calculateProductScenarios([baseResult], assumptions, {});
assert.equal(missingReferenceScenarios[0].data_quality, 'MISSING_REFERENCE');
assert.equal(summarizeScenarioRisks(missingReferenceScenarios).missing_official_reference_count, 1);
assert.equal(summarizeScenarioRisks(missingReferenceScenarios).is_ready_for_review, false);

console.log('Scenario risk verification passed.');
