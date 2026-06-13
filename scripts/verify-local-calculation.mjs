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

function assertClose(actual, expected, delta = 0.0000001) {
  assert.ok(Math.abs(actual - expected) < delta, `Expected ${actual} to be close to ${expected}`);
}

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
assert.equal(resultsWithoutSourceStreams[0].warnings.length, 1);
assert.equal(resultsWithoutSourceStreams[0].warningDetails.length, 1);
assert.equal(resultsWithoutSourceStreams[0].warningDetails[0].target.type, 'process');
assert.equal(resultsWithoutSourceStreams[0].warningDetails[0].target.id, process.id);
assert.match(resultsWithoutSourceStreams[0].warningDetails[0].message, /연결된 배출원 자료가 없습니다/);
assert.equal(getLocalCalculationWarningHref(resultsWithoutSourceStreams[0].warningDetails[0]), '/processes?edit=process-1');

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
assert.equal(productLineResults[0].indirect_emissions_rule, 'IRON_STEEL_CERTIFICATE_BASIS_EXCLUDED');
assert.equal(productLineResults[0].indirect_emissions_gross_tco2e, 141);
assert.equal(productLineResults[0].indirect_emissions_excluded_tco2e, 141);
assert.equal(productLineResults[0].own_indirect_see, 0.235);
assert.equal(productLineResults[0].indirect_see, 0);
assert.equal(productLineResults[0].indirect_see_excluded, 0.235);
assert.equal(productLineResults[0].precursor_see, 1.45);
assert.equal(productLineResults[0].precursor_direct_see, 1.2);
assert.equal(productLineResults[0].precursor_indirect_see, 0.25);
// declarant 보고용 SEE(direct/indirect) = 자체 + 전구물질 기여 포함
assertClose(productLineResults[0].see_direct_incl_precursor, 1.32);
assertClose(productLineResults[0].see_indirect_incl_precursor, 0.485);
// 철강(Annex II direct-only): 인증서 기준은 자체 indirect + 전구물질 indirect 모두 제외 → SEE(direct)와 동일
assertClose(productLineResults[0].see_cbam_basis, 1.32);
assertClose(productLineResults[0].see_informational_total, 1.805);
assertClose(productLineResults[0].total_see, 1.805);
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

// --- EU 공식 예제 회귀 (CBAM SEE V2.1 "Example Steel 2 EAF alloys") ---
// 철강(Annex II direct-only) 인증서 기준 SEE가 전구물질 indirect를 제외해 EU SEE(direct)와 일치하고,
// 참고용 총 SEE(see_informational_total)는 EU SEE(total)과 일치하는지 검증한다.
const EU_EF = 0.833; // EU 예제 'Mix' 전력 배출계수 tCO2e/MWh
const euPeriod = { id: 'eu-per', name: '2023', start_date: '2023-01-01', end_date: '2023-12-31', status: 'DRAFT' };
const euProducts = [
  { id: 'eu-pr1', name: 'Alloy steel slabs V2A', hs_code: '7218', cn_code: '72189911', unit: 'tonne' },
  { id: 'eu-pr2', name: 'Stainless Sheets V2A', hs_code: '7219', cn_code: '72191310', unit: 'tonne' },
];
const euP1 = {
  id: 'eu-p1', period_id: euPeriod.id, product_id: 'eu-pr1', name: 'EAF incl. continuous casting',
  production_route: 'Electric arc furnace', output_mass_t: 2234000,
  direct_attributable_emissions_tco2e: 171005.31, electricity_mwh: 2234000 * 0.7, electricity_ef_tco2e_per_mwh: EU_EF,
};
const euP2 = {
  id: 'eu-p2', period_id: euPeriod.id, product_id: 'eu-pr2', name: 'Rolling mill and finishing',
  production_route: 'Flat steel processing', output_mass_t: 1133000,
  direct_attributable_emissions_tco2e: 402245.42, electricity_mwh: 324700, electricity_ef_tco2e_per_mwh: EU_EF,
};
const euPrecursors = [
  { id: 'eu-pp1', process_id: 'eu-p1', product_id: 'eu-pr1', name: 'Carbon steel ingots', consumed_mass_t: 80500, direct_see_tco2e_per_t: 1.48, indirect_see_tco2e_per_t: 0.20400, source: 's' },
  { id: 'eu-pp2', process_id: 'eu-p1', product_id: 'eu-pr1', name: 'FeNi', consumed_mass_t: 347000, direct_see_tco2e_per_t: 3.0, indirect_see_tco2e_per_t: 2.49983, source: 's' },
  { id: 'eu-pp3', process_id: 'eu-p1', product_id: 'eu-pr1', name: 'FeCr', consumed_mass_t: 331000, direct_see_tco2e_per_t: 2.5, indirect_see_tco2e_per_t: 2.34989, source: 's' },
  { id: 'eu-pp4', process_id: 'eu-p1', product_id: 'eu-pr1', name: 'FeMn', consumed_mass_t: 60600, direct_see_tco2e_per_t: 1.3, indirect_see_tco2e_per_t: 1.90007, source: 's' },
  { id: 'eu-int', process_id: 'eu-p2', product_id: 'eu-pr2', name: 'P1 crude steel (internal)', consumed_mass_t: 1227000, direct_see_tco2e_per_t: 1.00149, indirect_see_tco2e_per_t: 1.37842, source: 's' },
];
const euResults = calculateLocalResults({ processes: [euP1, euP2], precursors: euPrecursors, products: euProducts, periods: [euPeriod] });
const euP1Res = euResults.find((r) => r.process_id === 'eu-p1');
const euP2Res = euResults.find((r) => r.process_id === 'eu-p2');
// 자체 비배출(SE direct/indirect) — EU 예제값
assertClose(euP1Res.direct_see, 0.07655, 0.001);
assertClose(euP1Res.own_indirect_see, 0.5831, 0.001);
// 참고용 총 SEE = EU SEE(total)
assertClose(euP1Res.see_informational_total, 2.37991, 0.01);
assertClose(euP2Res.see_informational_total, 3.17109, 0.01);
// 인증서 기준(direct-only) = EU SEE(direct), 전구물질 indirect 제외 확인
assert.equal(euP1Res.indirect_emissions_applicable, false);
assertClose(euP1Res.see_cbam_basis, 1.00149, 0.01);
assertClose(euP2Res.see_cbam_basis, 1.43961, 0.01);
assertClose(euP1Res.see_direct_incl_precursor, 1.00149, 0.01);
assertClose(euP1Res.see_indirect_incl_precursor, 1.37842, 0.01);
// see_cbam_basis가 전구물질 indirect를 포함하던 과거 버그값(약 1.797)이 아님을 가드
assert.ok(euP1Res.see_cbam_basis < 1.2, `P1 see_cbam_basis(${euP1Res.see_cbam_basis})가 전구물질 indirect를 포함하면 안 됨`);

// --- #8 회귀: 소비량 경고는 "소비>생산"이 아니라 "소비>구매"에만 발생 ---
const yieldProcess = { ...process, id: 'proc-yield', output_mass_t: 1000, direct_attributable_emissions_tco2e: 0 };
// 소비 1200 > 생산 1000 (정상 수율 손실) 이지만 구매 1300 이내 → 소비량 경고가 없어야 함
const yieldPrecursor = { ...precursor, id: 'pp-yield', process_id: 'proc-yield', purchased_mass_t: 1300, consumed_mass_t: 1200, consumed_for_non_cbam_mass_t: 0 };
const yieldResults = calculateLocalResults({ processes: [yieldProcess], precursors: [yieldPrecursor], products: [product], periods: [period] });
assert.ok(
  !yieldResults[0].warnings.some((w) => w.includes('소비량')),
  '정상 수율(소비량>생산량, 소비량<=구매량)에서는 소비량 경고가 발생하면 안 됩니다.'
);
// 소비 1400 > 구매 1300 → 데이터 오류 경고 발생해야 함
const overProcess = { ...process, id: 'proc-over', output_mass_t: 1000, direct_attributable_emissions_tco2e: 0 };
const overPrecursor = { ...yieldPrecursor, id: 'pp-over', process_id: 'proc-over', consumed_mass_t: 1400 };
const overResults = calculateLocalResults({ processes: [overProcess], precursors: [overPrecursor], products: [product], periods: [period] });
assert.ok(
  overResults[0].warnings.some((w) => w.includes('소비량이 구매량을 초과')),
  '소비량이 구매량을 초과하면 경고가 발생해야 합니다.'
);

console.log('Local calculation verification passed.');
