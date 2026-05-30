import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadLocalCalculationModule() {
  const sourceStreamCalculationSource = readFileSync('src/lib/source-stream-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const productRulesSource = readFileSync('src/lib/cbam-product-rules.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const calculationEngineSource = readFileSync('src/lib/calculation-engine.ts', 'utf8')
    .replace(/^import type .* from '\.\/local-db';\r?\n/gm, '')
    .replace("import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';", '')
    .replace("import { getIndirectEmissionsApplicability } from './cbam-product-rules';", '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${sourceStreamCalculationSource}
${productRulesSource}
${calculationEngineSource}
globalThis.localCalculation = {
  calculateLocalResults,
  getLocalCalculationWarningHref,
  getIndirectEmissionsApplicability,
  summarizeProductOutputLines,
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
  return context.localCalculation;
}

const {
  calculateLocalResults,
  getIndirectEmissionsApplicability,
  getLocalCalculationWarningHref,
  summarizeProductOutputLines,
} = loadLocalCalculationModule();

const product = {
  id: 'product-1',
  name: 'Hot Rolled Coil',
  hs_code: '7208',
  cn_code: '72083900',
  hs_group: '72',
  product_type_enum: 'HS72_PLATE_SHEET',
  unit: 'tonne',
};
const period = {
  id: 'period-1',
  name: '2024 Annual',
  start_date: '2024-01-01',
  end_date: '2024-12-31',
  status: 'DRAFT',
};
const process = {
  id: 'process-1',
  period_id: period.id,
  product_id: product.id,
  name: 'Rolling and finishing',
  production_route: 'Flat steel processing',
  output_mass_t: 1000,
  market_output_mass_t: 950,
  internal_consumption_mass_t: 50,
  direct_attributable_emissions_tco2e: 120,
  electricity_mwh: 500,
  electricity_ef_tco2e_per_mwh: 0.47,
};
const sourceStream = {
  id: 'source-stream-1',
  period_id: period.id,
  process_id: process.id,
  name: 'Natural gas combustion',
  stream_type: 'FUEL',
  method: 'Combustion',
  activity_data: 250,
  activity_unit: 't',
  ncv_gj_per_unit: 45,
  emission_factor_tco2e_per_unit: 73,
  oxidation_factor: 1,
  conversion_factor: 1,
  fossil_fraction: 1,
  biomass_fraction: 0,
  source: 'Monthly fuel invoice',
};
const precursor = {
  id: 'precursor-1',
  process_id: process.id,
  product_id: product.id,
  name: 'Purchased hot rolled coil',
  aggregated_goods_category: 'Iron or steel products',
  production_route: 'External precursor',
  purchased_mass_t: 1100,
  consumed_mass_t: 1000,
  consumed_for_non_cbam_mass_t: 0,
  direct_see_tco2e_per_t: 1.2,
  indirect_see_tco2e_per_t: 0.25,
  source: 'Supplier communication template',
  default_value_justification: '',
};
const outputLineA = {
  id: 'output-line-1',
  process_id: process.id,
  product_id: product.id,
  name: 'Hot rolled coil A',
  output_mass_t: 600,
  allocation_basis: 'MASS',
  manual_allocation_percent: 60,
  note: '',
};
const outputLineB = {
  id: 'output-line-2',
  process_id: process.id,
  product_id: product.id,
  name: 'Hot rolled coil B',
  output_mass_t: 400,
  allocation_basis: 'MASS',
  manual_allocation_percent: 40,
  note: '',
};

const resultsWithoutSourceStreams = calculateLocalResults({
  processes: [process],
  precursors: [precursor],
  products: [product],
  periods: [period],
});
assert.equal(resultsWithoutSourceStreams.length, 1);
assert.equal(resultsWithoutSourceStreams[0].source_stream_emissions_tco2e, 0);
assert.equal(resultsWithoutSourceStreams[0].warnings.length, 0);

const resultsWithSourceStreams = calculateLocalResults({
  processes: [process],
  precursors: [precursor],
  products: [product],
  periods: [period],
  sourceStreams: [sourceStream],
});
assert.equal(resultsWithSourceStreams.length, 1);
assert.equal(resultsWithSourceStreams[0].source_stream_emissions_tco2e, 821.25);
assert.equal(resultsWithSourceStreams[0].source_stream_energy_tj, 11.25);
assert.equal(resultsWithSourceStreams[0].warnings.length, 1);
assert.equal(resultsWithSourceStreams[0].warningDetails.length, 1);
assert.equal(resultsWithSourceStreams[0].warningDetails[0].target.type, 'process');
assert.equal(resultsWithSourceStreams[0].warningDetails[0].target.id, process.id);
assert.match(resultsWithSourceStreams[0].warningDetails[0].message, /배출원 자료 합계/);
assert.equal(getLocalCalculationWarningHref(resultsWithSourceStreams[0].warningDetails[0]), '/processes?edit=process-1');
assert.equal(
  getLocalCalculationWarningHref({
    message: '전구물질 확인 필요',
    target: { type: 'precursor', id: 'precursor 1' },
  }),
  '/precursors?edit=precursor%201'
);

const productLineResults = calculateLocalResults({
  processes: [process],
  precursors: [precursor],
  products: [product],
  periods: [period],
  sourceStreams: [sourceStream],
  productOutputLines: [outputLineA, outputLineB],
});
assert.equal(productLineResults.length, 2);
assert.equal(productLineResults[0].product_output_line_id, outputLineA.id);
assert.equal(productLineResults[0].allocation_share, 0.6);
assert.equal(productLineResults[0].output_mass_t, 600);
assert.equal(productLineResults[0].direct_emissions_tco2e, 72);
assert.equal(productLineResults[0].direct_see, 0.12);
assert.equal(productLineResults[0].indirect_emissions_applicable, false);
assert.equal(productLineResults[0].indirect_emissions_rule, 'IRON_STEEL_EXCLUDED');
assert.equal(productLineResults[0].indirect_emissions_excluded_tco2e, 141);
assert.equal(productLineResults[0].indirect_see, 0);
assert.equal(productLineResults[0].precursor_see, 1.45);
assert.equal(productLineResults[0].total_see, 1.57);
assert.equal(productLineResults[1].allocation_share, 0.4);

const mixedAllocationSummary = summarizeProductOutputLines(process.output_mass_t, [
  { ...outputLineA, allocation_basis: 'MASS' },
  { ...outputLineB, allocation_basis: 'MANUAL', manual_allocation_percent: 40 },
]);
assert.equal(mixedAllocationSummary.count, 2);
assert.equal(mixedAllocationSummary.activeCount, 2);
assert.equal(mixedAllocationSummary.totalOutput, 1000);
assert.equal(mixedAllocationSummary.delta, 0);
assert.equal(mixedAllocationSummary.hasMixedAllocationBasis, true);
assert.equal(mixedAllocationSummary.needsOutputReview, false);
assert.equal(mixedAllocationSummary.needsAllocationReview, true);
assert.equal(mixedAllocationSummary.needsReview, true);

const mixedAllocationResults = calculateLocalResults({
  processes: [process],
  precursors: [precursor],
  products: [product],
  periods: [period],
  productOutputLines: [
    { ...outputLineA, allocation_basis: 'MASS' },
    { ...outputLineB, allocation_basis: 'MANUAL', manual_allocation_percent: 40 },
  ],
});
assert.match(mixedAllocationResults[0].warnings.join('\n'), /배분기준이 섞여 있습니다/);

assert.equal(getIndirectEmissionsApplicability({ cn_code: '72083900', hs_code: '7208' }).applicable, false);
assert.equal(getIndirectEmissionsApplicability({ cn_code: '26011200', hs_code: '2601' }).applicable, true);

console.log('Local calculation verification passed.');
