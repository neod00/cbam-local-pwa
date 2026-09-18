import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadLocalCalculationModule() {
  const sourceStreamCalculationSource = readFileSync('src/lib/source-stream-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // cn-master.generated.ts 를 cbam-product-rules 가 import 한다. 이 로더는 import를 지우므로
  // 생성 파일 소스를 앞에 붙여 심볼을 제공한다. 안 붙이면 CN 마스터가 undefined가 된다.
  const cnMasterSource = readFileSync('src/lib/cn-master.generated.ts', 'utf8')
    .replace(/^export /gm, '');
  const productRulesSource = [
    cnMasterSource,
    readFileSync('src/lib/cbam-product-rules.ts', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/^export /gm, ''),
  ].join('\n');
  const reportingScopeSource = readFileSync('src/lib/reporting-scope.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // import를 개별 문자열로 지우면 import 목록이 바뀔 때 조용히 깨진다(실제로 깨졌다).
  // 위에서 의존 소스를 전부 앞에 붙이므로 import 줄은 일괄 제거한다.
  const calculationEngineSource = readFileSync('src/lib/calculation-engine.ts', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // 할당 규칙(allocation-rules.ts)은 엔진이 import 한다. 앞에 붙이지 않으면 reconcileSourceStreams 가
  // undefined 가 되어 vm 안에서 조용히 죽는다(실제로 죽었다).
  const allocationRulesSource = readFileSync('src/lib/allocation-rules.ts', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${sourceStreamCalculationSource}
${productRulesSource}
${reportingScopeSource}
${allocationRulesSource}
${calculationEngineSource}
globalThis.localCalculation = {
  calculateLocalResults,
  getLocalCalculationWarningHref,
  getIndirectEmissionsApplicability,
  summarizeProductOutputLines,
  reconcileSourceStreams,
  resolveActivityLevelRole,
  getDirectEmissionsInputMode,
  sumReconciledSourceStreamEmissions,
  ALLOCATION_RULES,
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
  reconcileSourceStreams,
  resolveActivityLevelRole,
  getDirectEmissionsInputMode,
  sumReconciledSourceStreamEmissions,
  ALLOCATION_RULES,
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
assert.equal(productLineResults[0].indirect_emissions_relevance, 'NOT_RELEVANT');
assert.equal(productLineResults[0].indirect_emissions_rule, 'GOODS_INDIRECT_NOT_RELEVANT');
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

// --- CN 마스터 판정 (접두 휴리스틱 제거 회귀) ---
// 아래 두 좌표는 접두 휴리스틱도 CN 마스터도 똑같이 통과시킨다. 이것만으로는 두 구현을
// 구분하지 못하므로, 그 아래에 「휴리스틱이 통과할 수 없는」 케이스를 둔다.
assert.equal(getIndirectEmissionsApplicability({ cn_code: '72083900', hs_code: '7208' }).relevance, 'NOT_RELEVANT');
assert.equal(getIndirectEmissionsApplicability({ cn_code: '26011200', hs_code: '2601' }).relevance, 'INCLUDED');
// Sintered Ore 예외가 하드코딩이 아니라 조회 결과임을 고정한다.
assert.equal(getIndirectEmissionsApplicability({ cn_code: '26011200', hs_code: '2601' }).good, 'Sintered Ore');
assert.equal(getIndirectEmissionsApplicability({ cn_code: '72083900', hs_code: '7208' }).good, 'Iron or steel products');

// 판정 근거는 사실 진술이어야 한다 — 보고서가 그대로 인용한다.
assert.match(getIndirectEmissionsApplicability({ cn_code: '72083900' }).lookup, /Communication Template/);

// [휴리스틱이 통과할 수 없는 케이스 1] 73류인데 공식 목록에 없는 CN.
// startsWith('73')은 이것을 "철강 direct-only"로 오판했다. 템플릿의 73류 헤딩은 13개뿐
// (7301~7311, 7318, 7326)이라 7312~7317·7319~7325는 목록에 없다.
// 주의: 7326은 등재돼 있다 — 73류라고 다 없는 게 아니라 헤딩 단위로 갈린다.
for (const cn of ['73151100', '73121010', '73201000', '73249000']) {
  const judged = getIndirectEmissionsApplicability({ cn_code: cn });
  assert.equal(judged.relevance, 'UNDETERMINED', `${cn}: 공식 목록에 없으므로 판정 불가여야 한다`);
  assert.equal(judged.rule_code, 'CN_NOT_IN_MASTER');
}

// [휴리스틱이 통과할 수 없는 케이스 2] 확정기간 간접배출 비관련인데 휴리스틱은 "포함"이라 했다.
for (const [cn, good] of [['28041000', 'Hydrogen'], ['28142000', 'Ammonia'], ['76011010', 'Unwrought aluminium'], ['76031000', 'Aluminium products']]) {
  const judged = getIndirectEmissionsApplicability({ cn_code: cn });
  assert.equal(judged.relevance, 'NOT_RELEVANT', `${cn}(${good}): 확정기간 간접배출 비관련이어야 한다`);
  assert.equal(judged.good, good);
}

// [휴리스틱이 통과할 수 없는 케이스 3] 마스터 밖 임의 CN은 INCLUDED도 NOT_RELEVANT도 아니다.
// 종전 DEFAULT_INCLUDED가 정확히 여기서 죽는다 — 판정 실패를 판정으로 위장하지 않는다.
for (const cn of ['99999999', '84069000', '85030000', '39269097', '61091000']) {
  assert.equal(getIndirectEmissionsApplicability({ cn_code: cn }).relevance, 'UNDETERMINED', `${cn}: 목록 밖 CN`);
}

// CN 미기재도 판정 불가다(종전에는 "임시 포함"이었다).
assert.equal(getIndirectEmissionsApplicability({ cn_code: '', hs_code: '' }).relevance, 'UNDETERMINED');
assert.equal(getIndirectEmissionsApplicability(undefined).rule_code, 'CN_MISSING');

// 4자리 CN rollup — 하위가 모두 같으면 적용하고, 갈리면 판정하지 않는다.
const heading7208 = getIndirectEmissionsApplicability({ cn_code: '7208' });
assert.equal(heading7208.relevance, 'NOT_RELEVANT', 'CN 7208: 하위가 모두 Iron or steel products');
assert.equal(heading7208.matched_by_prefix, true);
const heading2601 = getIndirectEmissionsApplicability({ cn_code: '2601' });
assert.equal(heading2601.relevance, 'INCLUDED', 'CN 2601: 하위가 Sintered Ore 뿐');

// 판정 불가면 엔진이 인증서 기준 SEE를 산출하지 않는다 — 정당화할 수 없는 숫자는 존재하면 안 된다.
const unknownProduct = { ...product, id: 'p-unknown', cn_code: '73151100', hs_code: '7315', reporting_scope: 'CBAM_GOOD' };
const unknownResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-unknown', product_id: 'p-unknown' }],
  precursors: [], products: [unknownProduct], periods: [period],
  sourceStreams: [{ ...sourceStream, id: 'ss-unknown', process_id: 'proc-unknown' }],
});
assert.equal(unknownResults[0].see_cbam_basis, null, '판정 불가 → 인증서 기준 SEE 미산출');
assert.ok(unknownResults[0].see_informational_total > 0, '정보 목적 총계는 남는다');
assert.match(unknownResults[0].warnings.join('\n'), /간접배출 관련성을 판정하지 못해/, '판정 불가를 경고로 노출');

// [P1] 3상태가 결과 경계에서 boolean으로 붕괴하면 안 된다.
// boolean만 보면 「판정 불가」와 「비관련」이 똑같이 false라 화면이 둘을 구분하지 못하고,
// 판정하지 못한 제품에 "Annex II direct-only" 같은 법적 단정을 인쇄하게 된다(씨밤이 P1).
assert.equal(unknownResults[0].indirect_emissions_relevance, 'UNDETERMINED');
const steelResult = calculateLocalResults({
  processes: [{ ...process, id: 'proc-steel', product_id: 'p-steel' }],
  precursors: [], products: [{ ...product, id: 'p-steel', cn_code: '73063077', hs_code: '7306', reporting_scope: 'CBAM_GOOD' }],
  periods: [period], sourceStreams: [{ ...sourceStream, id: 'ss-steel', process_id: 'proc-steel' }],
})[0];
assert.equal(steelResult.indirect_emissions_relevance, 'NOT_RELEVANT');
// 두 제품은 relevance로 구분된다. boolean(indirect_emissions_applicable)은 타입에서 지웠다 —
// 남겨두면 둘 다 false라 화면이 구분하지 못하고, 소비자를 사람이 기억으로 찾아야 한다.
// 실제로 여섯 번 연속 일부만 고쳤고, 마지막엔 대시보드·SEE 흐름도를 놓쳤다.
assert.notEqual(steelResult.indirect_emissions_relevance, unknownResults[0].indirect_emissions_relevance);
assert.equal(steelResult.indirect_emissions_applicable, undefined, 'boolean은 결과에 존재하지 않는다');
// 진짜 비관련 품목은 기준 SEE가 산출된다. 판정 불가만 null이다.
assert.ok(steelResult.see_cbam_basis !== null, '비관련 품목은 기준 SEE 산출');

// [P2] 접두 rollup에서 하위 품목군이 여럿이면 대표를 자의로 고르지 않는다.
const cementHeading = getIndirectEmissionsApplicability({ cn_code: '2523' });
assert.equal(cementHeading.relevance, 'INCLUDED', 'CN 2523 하위는 모두 간접 포함');
assert.equal(cementHeading.good, undefined, '하위 품목군이 여럿이면 good을 단정하지 않음');
assert.ok((cementHeading.goods ?? []).length > 1, 'goods에는 걸린 품목군을 전부 담는다');
// 단일 품목군이면 good을 채운다.
const steelHeading = getIndirectEmissionsApplicability({ cn_code: '7208' });
assert.equal(steelHeading.good, 'Iron or steel products');

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
assert.equal(euP1Res.indirect_emissions_relevance, 'NOT_RELEVANT');
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

// --- 복합 철강 회귀: 공용 공정의 CBAM/비CBAM 산출물 + 서로 다른 전구물질 생산경로 ---
const complexPeriod = { id: 'complex-period', name: '2026 complex', start_date: '2026-01-01', end_date: '2026-12-31', status: 'READY' };
const complexProducts = [
  { id: 'complex-hrc', name: '열연강판', hs_code: '7208', cn_code: '72083900', hs_group: '72', product_type_enum: 'HS72_IRON_STEEL', unit: 'tonne', reporting_scope: 'CBAM_GOOD' },
  { id: 'complex-scale', name: '밀스케일', hs_code: '2619', cn_code: '26190090', hs_group: '26', product_type_enum: 'UNKNOWN_PRODUCT', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT' },
];
const complexProcess = {
  id: 'complex-process',
  period_id: complexPeriod.id,
  product_id: 'complex-hrc',
  name: '공용 열연 압연 공정',
  production_route: 'Hot rolling with mixed slab routes',
  output_mass_t: 8200,
  market_output_mass_t: 8000,
  internal_consumption_mass_t: 200,
  direct_attributable_emissions_tco2e: 830.28,
  electricity_mwh: 4500,
  electricity_ef_tco2e_per_mwh: 0.466,
};
const complexOutputLines = [
  { id: 'complex-line-hrc', process_id: complexProcess.id, product_id: 'complex-hrc', name: '열연강판', output_mass_t: 8000, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '', reporting_scope: 'CBAM_GOOD' },
  { id: 'complex-line-scale', process_id: complexProcess.id, product_id: 'complex-scale', name: '밀스케일', output_mass_t: 200, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '', reporting_scope: 'NON_CBAM_COPRODUCT' },
];
const complexSourceStreams = [{
  id: 'complex-gas',
  period_id: complexPeriod.id,
  process_id: complexProcess.id,
  name: '공용 가열로 도시가스',
  stream_type: 'FUEL',
  method: 'Combustion',
  activity_data: 400000,
  activity_unit: 'Nm3',
  ncv_gj_per_unit: 0.037,
  emission_factor_tco2e_per_unit: 56.1,
  emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1,
  conversion_factor: 1,
  fossil_fraction: 1,
  biomass_fraction: 0,
  source: 'test',
}];
const complexPrecursors = [
  {
    id: 'complex-precursor-eaf',
    process_id: complexProcess.id,
    product_id: 'complex-hrc',
    name: '구매 슬래브 A',
    production_route: 'Electric arc furnace',
    purchased_mass_t: 5000,
    consumed_mass_t: 5000,
    consumed_for_non_cbam_mass_t: 0,
    direct_see_tco2e_per_t: 0.55,
    indirect_see_tco2e_per_t: 0.35,
    source: 'supplier A',
  },
  {
    id: 'complex-precursor-bf',
    process_id: complexProcess.id,
    product_id: 'complex-hrc',
    name: '구매 슬래브 B',
    production_route: 'Blast furnace-basic oxygen furnace',
    purchased_mass_t: 3500,
    consumed_mass_t: 3500,
    consumed_for_non_cbam_mass_t: 0,
    direct_see_tco2e_per_t: 1.85,
    indirect_see_tco2e_per_t: 0.18,
    source: 'supplier B',
  },
];
const complexResults = calculateLocalResults({
  processes: [complexProcess],
  precursors: complexPrecursors,
  products: complexProducts,
  periods: [complexPeriod],
  sourceStreams: complexSourceStreams,
  productOutputLines: complexOutputLines,
});
assert.equal(complexResults.length, 2);
const complexHrcResult = complexResults.find((result) => result.product_id === 'complex-hrc');
const complexScaleResult = complexResults.find((result) => result.product_id === 'complex-scale');
assert.ok(complexHrcResult);
assert.ok(complexScaleResult);
assertClose(complexHrcResult.allocation_share, 8000 / 8200);
assertClose(complexScaleResult.allocation_share, 200 / 8200);
assertClose(complexHrcResult.direct_see, 830.28 / 8200);
assertClose(complexHrcResult.precursor_direct_see, 9225 / 8200);
assertClose(complexHrcResult.precursor_indirect_see, 2380 / 8200);
assertClose(complexHrcResult.see_cbam_basis, (830.28 + 9225) / 8200);
assertClose(complexHrcResult.see_informational_total, (830.28 + 2097 + 9225 + 2380) / 8200);
assert.equal(complexHrcResult.is_cbam_reportable, true);
assert.equal(complexHrcResult.indirect_emissions_relevance, 'NOT_RELEVANT');
// 밀스케일(CN 2619 00 90)은 공식 CN 목록에 없어 간접배출 관련성을 판정하지 못한다.
// 종전 접두 휴리스틱은 DEFAULT_INCLUDED로 "포함"이라 단정했다 — 근거 없는 단정이었다.
assert.equal(complexScaleResult.indirect_emissions_relevance, 'UNDETERMINED');
assert.equal(complexScaleResult.is_cbam_reportable, false);
assert.equal(complexScaleResult.see_cbam_basis, null);
assertClose(
  complexResults.reduce((sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t, 0),
  ((830.28 + 9225) / 8200) * 8000
);
assert.equal(new Set(complexPrecursors.map((item) => item.production_route)).size, 2);
// 명시적 전구물질 귀속: 두 슬래브 경로는 CBAM 열연강판에만 투입되고 밀스케일에는 귀속되지 않는다.
const explicitlyAllocatedPrecursors = complexPrecursors.map((item) => ({
  ...item,
  output_allocations: [{
    product_output_line_id: 'complex-line-hrc',
    product_id: 'complex-hrc',
    allocated_mass_t: item.consumed_mass_t,
  }],
}));
const explicitlyAllocatedResults = calculateLocalResults({
  processes: [complexProcess],
  precursors: explicitlyAllocatedPrecursors,
  products: complexProducts,
  periods: [complexPeriod],
  sourceStreams: complexSourceStreams,
  productOutputLines: complexOutputLines,
});
const explicitlyAllocatedHrc = explicitlyAllocatedResults.find((result) => result.product_id === 'complex-hrc');
const explicitlyAllocatedScale = explicitlyAllocatedResults.find((result) => result.product_id === 'complex-scale');
assert.ok(explicitlyAllocatedHrc);
assert.ok(explicitlyAllocatedScale);
assertClose(explicitlyAllocatedHrc.precursor_direct_see, 9225 / 8000);
assertClose(explicitlyAllocatedHrc.precursor_indirect_see, 2380 / 8000);
assertClose(
  explicitlyAllocatedHrc.see_cbam_basis,
  ((830.28 * 8000 / 8200) + 9225) / 8000
);
assertClose(explicitlyAllocatedScale.precursor_direct_see, 0);
assertClose(explicitlyAllocatedScale.precursor_indirect_see, 0);
assert.equal(explicitlyAllocatedScale.see_cbam_basis, null);
assertClose(
  explicitlyAllocatedResults.reduce(
    (sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t,
    0
  ),
  (830.28 * 8000 / 8200) + 9225
);
// ═══════════════════════════════════════════════════════════════════════
// 할당로직 (2025/2547 Art 4(6) · ANNEX II 점 F · ANNEX III A.1/A.2) — 규칙 ID는 allocation-rules.ts
// ═══════════════════════════════════════════════════════════════════════
const warningsOf = (result) => result.warnings.join('\n');

// 규칙 표가 「규정 필수」로 표시한 항목은 원문 인용을 갖고 있어야 한다 — 앱이 규정에 없는 의무를 주장하면 안 된다.
for (const rule of Object.values(ALLOCATION_RULES)) {
  assert.ok(rule.id.startsWith('CBAM-ALLOC-'), `${rule.id}: 규칙 ID 형식`);
  assert.ok(rule.anchor.length > 0 && rule.text.length > 20, `${rule.id}: 근거·본문이 비어 있다`);
}
assert.equal(ALLOCATION_RULES.ADJUSTMENTS.unsupported, true, '식 55 보정은 현재 버전에서 미지원으로 표시');
assert.equal(ALLOCATION_RULES.ACTIVITY_LEVEL.kind, '규정 필수');
assert.match(ALLOCATION_RULES.ACTIVITY_LEVEL.text, /shall not be included in the determination of the activity level/);
assert.match(ALLOCATION_RULES.RECONCILIATION.text, /RecF = DInst \/ DPP/);

// --- T1 직접배출 입력방식 (CBAM-ALLOC-DIRECT-01) ---
// SOURCE_STREAM_SUM: 수기 값(120)을 무시하고 배출원 합계(821.25)를 쓴다. 저장값이 낡았음은 경고로 알린다.
const sumModeResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-sum', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }],
  precursors: [], products: [product], periods: [period],
  sourceStreams: [{ ...sourceStream, id: 'ss-sum', process_id: 'proc-sum' }],
});
assert.equal(sumModeResults[0].direct_emissions_input_mode, 'SOURCE_STREAM_SUM');
assert.equal(sumModeResults[0].direct_emissions_tco2e, 821.25, '배출원 합계 방식은 합계를 직접배출로 쓴다');
assertClose(sumModeResults[0].direct_see, 821.25 / 1000);
assert.match(warningsOf(sumModeResults[0]), /저장된 직접귀속배출량 120\.0000 tCO2e가 배출원 합계 821\.2500 tCO2e와 다릅니다/);
assert.doesNotMatch(warningsOf(sumModeResults[0]), /배출원 자료 합계와 공정 직접배출량 입력값이/, '합계 방식에서는 수기 대조 경고를 내지 않는다');
// MANUAL_TOTAL: 수기 값을 쓰고 배출원 합계는 대조용(1% 초과 차이 경고).
const manualModeResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-man', direct_emissions_input_mode: 'MANUAL_TOTAL' }],
  precursors: [], products: [product], periods: [period],
  sourceStreams: [{ ...sourceStream, id: 'ss-man', process_id: 'proc-man' }],
});
assert.equal(manualModeResults[0].direct_emissions_input_mode, 'MANUAL_TOTAL');
assert.equal(manualModeResults[0].direct_emissions_tco2e, 120);
assert.match(warningsOf(manualModeResults[0]), /배출원 자료 합계와 공정 직접배출량 입력값이 701\.2500 tCO2e 차이납니다/);
// 기존 자료(방식 미기록): 수기 값을 쓰되 UNSPECIFIED 로 남긴다 — 어느 쪽으로도 단정하지 않는다.
assert.equal(resultsWithSourceStreams[0].direct_emissions_input_mode, 'UNSPECIFIED');
assert.equal(resultsWithSourceStreams[0].direct_emissions_tco2e, 120);
assert.equal(getDirectEmissionsInputMode({}), 'UNSPECIFIED');
// 템플릿 업로드 값은 수기 값과 같이 다루되 출처가 남는다.
const uploadResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-up', direct_emissions_input_mode: 'TEMPLATE_UPLOAD' }],
  precursors: [], products: [product], periods: [period],
  sourceStreams: [{ ...sourceStream, id: 'ss-up', process_id: 'proc-up' }],
});
assert.equal(uploadResults[0].direct_emissions_input_mode, 'TEMPLATE_UPLOAD');
assert.equal(uploadResults[0].direct_emissions_tco2e, 120);
// 합계 방식인데 배출원이 없으면 직접배출 0 — 조용히 0이 되면 안 되므로 경고한다.
const sumNoStream = calculateLocalResults({
  processes: [{ ...process, id: 'proc-sum0', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }],
  precursors: [], products: [product], periods: [period],
});
assert.equal(sumNoStream[0].direct_emissions_tco2e, 0);
assert.match(warningsOf(sumNoStream[0]), /연결된 배출원이 없어 직접배출이 0으로 산정됩니다/);
assert.doesNotMatch(warningsOf(sumNoStream[0]), /연결된 배출원 자료가 없습니다/, '합계 방식에서는 수기 방식용 경고를 내지 않는다');

// --- T2 공용 계량기 정합계수 (CBAM-ALLOC-RECF-01, 식 41·42): 10,000 / (5,700 + 3,800) → 6,000 / 4,000 ---
const unitFactorStream = {
  ...sourceStream, stream_type: 'FUEL', method: 'Combustion', emission_factor_basis: 'PER_ACTIVITY_UNIT',
  emission_factor_tco2e_per_unit: 2, ncv_gj_per_unit: 0, activity_unit: 'Nm3',
};
const sharedMeter = { group: '공용 보일러', installation_total_activity_data: 10000, basis: 'SUB_METER' };
const meterA = { ...unitFactorStream, id: 'ss-meter-a', process_id: 'proc-meter-a', activity_data: 5700, shared_meter: sharedMeter };
const meterB = { ...unitFactorStream, id: 'ss-meter-b', process_id: 'proc-meter-b', activity_data: 3800, shared_meter: sharedMeter };
const reconciled = reconcileSourceStreams([meterA, meterB]);
assert.equal(reconciled.groups.length, 1);
assert.equal(reconciled.groups[0].applied, true);
assertClose(reconciled.groups[0].factor, 10000 / 9500);
assertClose(reconciled.streams.find((s) => s.id === 'ss-meter-a').activity_data, 6000);
assertClose(reconciled.streams.find((s) => s.id === 'ss-meter-b').activity_data, 4000);
assert.equal(meterA.activity_data, 5700, '원본 행을 바꾸지 않는다');
assertClose(sumReconciledSourceStreamEmissions('proc-meter-a', [meterA, meterB]), 12000, 1e-6); // 화면·동기화용 합계도 보정값
const meterProducts = [product, { ...product, id: 'product-2', name: 'HRC 2', cn_code: '72083900' }];
const meterResults = calculateLocalResults({
  processes: [
    { ...process, id: 'proc-meter-a', product_id: 'product-1', period_id: 'p-a', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' },
    { ...process, id: 'proc-meter-b', product_id: 'product-2', period_id: 'p-b', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' },
  ],
  precursors: [], products: meterProducts, periods: [period],
  sourceStreams: [meterA, meterB],
});
const meterResultA = meterResults.find((r) => r.process_id === 'proc-meter-a');
const meterResultB = meterResults.find((r) => r.process_id === 'proc-meter-b');
assertClose(meterResultA.direct_emissions_tco2e, 12000, 1e-6); // 보정 활동량 6,000 × EF 2
assertClose(meterResultB.direct_emissions_tco2e, 8000, 1e-6); // 보정 활동량 4,000 × EF 2
assertClose(meterResultA.direct_emissions_tco2e + meterResultB.direct_emissions_tco2e, 20000, 1e-6); // 두 공정 합 = 사업장 계량 10,000 × EF 2
assert.equal(meterResultA.reconciliation.length, 1);
assert.equal(meterResultA.reconciliation[0].group, '공용 보일러');
assertClose(meterResultA.reconciliation[0].factor, 10000 / 9500);
assert.doesNotMatch(warningsOf(meterResultA), /정합계수를 적용하지 못했습니다|권고: 공용 계량기/, '정상 정합은 경고 없음');
// 그룹 없는 행은 그대로.
assert.equal(reconcileSourceStreams([unitFactorStream]).groups.length, 0);
assert.equal(reconcileSourceStreams([unitFactorStream]).streams[0].activity_data, unitFactorStream.activity_data);
// 보조계량기 1개 vs 사업장 계량기도 식 41이다(규정 조건은 계기 수이지 공정 수가 아니다).
const lonely = reconcileSourceStreams([meterA]);
assert.equal(lonely.groups[0].applied, true);
assertClose(lonely.streams[0].activity_data, 10000, 1e-6);
// 배분키(A.2)로 나눈 행에는 정합계수를 만들지 않는다 — 합계=총량만 검사한다.
const keyMeter = { ...sharedMeter, basis: 'OPERATING_HOURS' };
const keySplitBad = reconcileSourceStreams([{ ...meterA, shared_meter: keyMeter }, { ...meterB, shared_meter: keyMeter }]);
assert.equal(keySplitBad.groups[0].mode, 'KEY_SPLIT');
assert.equal(keySplitBad.groups[0].applied, false);
assert.equal(keySplitBad.groups[0].factor, 1);
assert.match(keySplitBad.groups[0].reason, /배분키로 나눈 행 합계 9500 Nm3가 전체 계량값 10000 Nm3와 다릅니다/);
assert.equal(keySplitBad.streams[0].activity_data, 5700, '배분키 행은 보정하지 않는다');
const keySplitOk = reconcileSourceStreams([{ ...meterA, activity_data: 6000, shared_meter: keyMeter }, { ...meterB, activity_data: 4000, shared_meter: keyMeter }]);
assert.equal(keySplitOk.groups[0].reason, '');
assert.equal(keySplitOk.groups[0].applied, false);
// 보조계량기와 배분키가 섞이면 보정하지 않는다.
assert.match(reconcileSourceStreams([meterA, { ...meterB, shared_meter: keyMeter }]).groups[0].reason, /섞여 있습니다/);
// 같은 그룹 이름이라도 보고기간이 다르면 따로 묶는다 — 두 해를 한 계수로 묶으면 안 된다.
const twoYears = reconcileSourceStreams([meterA, meterB, { ...meterA, id: 'ss-meter-a2', period_id: 'p-2027', activity_data: 9000 }]);
assert.equal(twoYears.groups.length, 2);
assertClose(twoYears.streams.find((s) => s.id === 'ss-meter-a2').activity_data, 10000, 1e-6);
assertClose(twoYears.streams.find((s) => s.id === 'ss-meter-a').activity_data, 6000, 1e-6);
assert.match(reconcileSourceStreams([meterA, { ...meterB, activity_unit: 't' }]).groups[0].reason, /단위가 다릅니다/);
assert.match(reconcileSourceStreams([meterA, { ...meterB, shared_meter: { ...sharedMeter, installation_total_activity_data: 9000 } }]).groups[0].reason, /서로 다릅니다/);
const zeroTotal = { ...sharedMeter, installation_total_activity_data: 0 };
assert.match(reconcileSourceStreams([{ ...meterA, shared_meter: zeroTotal }, { ...meterB, shared_meter: zeroTotal }]).groups[0].reason, /비어 있거나 0/);
const keySplitResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-meter-a', product_id: 'product-1', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }, { ...process, id: 'proc-meter-b', product_id: 'product-2', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }],
  precursors: [], products: meterProducts, periods: [period],
  sourceStreams: [{ ...meterA, shared_meter: keyMeter }, { ...meterB, shared_meter: keyMeter }],
});
assert.match(warningsOf(keySplitResults[0]), /확인 필요\(자료\): 공용 계량기 그룹 '공용 보일러' — 배분키로 나눈 행 합계/);
assert.match(warningsOf(keySplitResults[0]), /point A\.2/);
assert.equal(keySplitResults[0].direct_emissions_tco2e, 11400, '배분키 행은 보정하지 않는다 → 5,700 × 2');
assert.equal(keySplitResults[0].reconciliation[0].mode, 'KEY_SPLIT');
// 정합계수가 1에서 20% 넘게 벗어나면 권고 경고(규정 한도 아님 — 단위·계량 오류 의심).
const bigTotal = { ...sharedMeter, installation_total_activity_data: 20000 };
const bigResults = calculateLocalResults({
  processes: [{ ...process, id: 'proc-meter-a', product_id: 'product-1', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }, { ...process, id: 'proc-meter-b', product_id: 'product-2', direct_emissions_input_mode: 'SOURCE_STREAM_SUM' }],
  precursors: [], products: meterProducts, periods: [period],
  sourceStreams: [{ ...meterA, shared_meter: bigTotal }, { ...meterB, shared_meter: bigTotal }],
});
assert.match(warningsOf(bigResults[0]), /권고: 공용 계량기 그룹 '공용 보일러'의 정합계수 RecF = 2\.1053/);

// --- T3 활동수준 (CBAM-ALLOC-AL-01, 점 F): 1,000 t 생산 중 불량 50 t → 분모 950 t, 불량 라인 배출 0 ---
const alProducts = [
  { ...product, id: 'p-good', reporting_scope: 'CBAM_GOOD' },
  { ...product, id: 'p-offspec', name: '불량품', reporting_scope: 'WASTE_RECYCLE' },
];
const alProcess = { ...process, id: 'proc-al', product_id: 'p-good', output_mass_t: 950, direct_attributable_emissions_tco2e: 95, electricity_mwh: 0 };
const alLines = [
  { ...outputLineA, id: 'line-good', process_id: 'proc-al', product_id: 'p-good', name: '정규 제품', output_mass_t: 950, activity_level_role: 'GOOD' },
  { ...outputLineB, id: 'line-offspec', process_id: 'proc-al', product_id: 'p-offspec', name: '불량품', output_mass_t: 50, reporting_scope: 'WASTE_RECYCLE', activity_level_role: 'EXCLUDED' },
];
const alResults = calculateLocalResults({ processes: [alProcess], precursors: [], products: alProducts, periods: [period], productOutputLines: alLines });
const alGood = alResults.find((r) => r.product_output_line_id === 'line-good');
const alOffspec = alResults.find((r) => r.product_output_line_id === 'line-offspec');
assert.equal(alResults.length, 2, '제외 라인도 결과에 남는다(배출 0으로)');
assert.equal(alGood.activity_level_t, 950, '활동수준 = 포함 라인 합계');
assertClose(alGood.allocation_share, 1, 1e-6); // 정규 제품이 배출 전부를 받는다
assertClose(alGood.direct_see, 95 / 950, 1e-6); // SEE 분모는 950 (1,000이 아님)
assert.equal(alOffspec.allocation_basis, 'ACTIVITY_LEVEL_EXCLUDED');
assert.equal(alOffspec.allocation_share, 0);
assert.equal(alOffspec.direct_see, 0);
assert.equal(alOffspec.see_informational_total, 0, '배출 0 배정');
assert.equal(alOffspec.see_cbam_basis, null);
assert.equal(alOffspec.is_cbam_reportable, false);
assert.equal(alOffspec.output_mass_t, 50, '질량은 추적용으로 남긴다');
assert.doesNotMatch(warningsOf(alGood), /제품 생산라인 합계가 공정 총 생산량과/, '공정 생산량 950 = 활동수준 950');
assert.doesNotMatch(warningsOf(alGood), /확인 필요\(규정\)/, '역할을 명시했으면 확인 요구 없음');
// CBAM 재화 라인이라도 불량으로 제외되면 신고 대상이 아니다(재화가 아니라 스크랩) — 기준 SEE도 없다.
const cbamOffspecLines = [alLines[0], { ...alLines[1], product_id: 'p-good', reporting_scope: undefined, activity_level_role: 'EXCLUDED' }];
const cbamOffspec = calculateLocalResults({ processes: [alProcess], precursors: [], products: alProducts, periods: [period], productOutputLines: cbamOffspecLines })
  .find((r) => r.product_output_line_id === 'line-offspec');
assert.equal(cbamOffspec.reporting_scope, 'CBAM_GOOD');
assert.equal(cbamOffspec.is_cbam_reportable, false, 'CBAM 재화의 불량분도 신고 대상이 아니다');
assert.equal(cbamOffspec.see_cbam_basis, null);
// 공정 생산량(저장값)이 낡아 라인 합계와 달라도 활동수준은 라인에서 온다 — 저장값이 아니다. 차이는 경고로 남긴다.
const staleTotal = calculateLocalResults({ processes: [{ ...alProcess, output_mass_t: 1000 }], precursors: [], products: alProducts, periods: [period], productOutputLines: alLines })
  .find((r) => r.product_output_line_id === 'line-good');
assert.equal(staleTotal.activity_level_t, 950, '활동수준은 포함 라인 합계(950)이지 공정 저장값(1,000)이 아니다');
assertClose(staleTotal.direct_see, 95 / 950, 1e-9);
assert.match(warningsOf(staleTotal), /제품 생산라인 합계가 공정 총 생산량과 50\.0000 t 차이납니다/);
// 기존 자료(역할 미지정): 숫자는 종전대로(1,000 분모), 대신 확인을 요구한다 — 앱이 부산물 여부를 대신 정하지 않는다.
const legacyLines = alLines.map((line) => { const legacy = { ...line }; delete legacy.activity_level_role; return legacy; });
const legacyResults = calculateLocalResults({ processes: [{ ...alProcess, output_mass_t: 1000 }], precursors: [], products: alProducts, periods: [period], productOutputLines: legacyLines });
const legacyGood = legacyResults.find((r) => r.product_output_line_id === 'line-good');
assert.equal(legacyGood.activity_level_t, 1000);
assertClose(legacyGood.allocation_share, 0.95);
assertClose(legacyGood.direct_see, 95 * 0.95 / 950);
assert.match(warningsOf(legacyGood), /확인 필요\(규정\): '불량품' 라인\(폐기물·재활용\)이 활동수준에 포함되어 있습니다/);
assert.match(warningsOf(legacyGood), /ANNEX II, point F/);
assert.equal(legacyResults.find((r) => r.product_output_line_id === 'line-offspec').allocation_basis, 'MASS');
// 비CBAM 공동산출물도 미지정이면 확인 요구(부산물인지 정규 제품인지 앱이 모른다). CBAM 재화는 요구하지 않는다.
assert.equal(resolveActivityLevelRole({}, 'NON_CBAM_COPRODUCT').needsConfirmation, true);
assert.equal(resolveActivityLevelRole({}, 'WASTE_RECYCLE').needsConfirmation, true);
assert.equal(resolveActivityLevelRole({}, 'CBAM_GOOD').needsConfirmation, false);
assert.equal(resolveActivityLevelRole({}, 'INTERNAL_ONLY').needsConfirmation, false, '내부 전구물질 사용은 점 F가 포함한다');
assert.equal(resolveActivityLevelRole({ activity_level_role: 'GOOD' }, 'WASTE_RECYCLE').needsConfirmation, false, '명시하면 확인 요구 없음');
assert.equal(resolveActivityLevelRole({ activity_level_role: 'EXCLUDED' }, 'CBAM_GOOD').role, 'EXCLUDED', 'CBAM 재화도 불량이면 제외 가능');
// 복합 철강 회귀(밀스케일 역할 미지정)는 위에서 8,200 분모 그대로 통과했다 — 기존 숫자 불변.
assert.match(warningsOf(complexHrcResult), /확인 필요\(규정\): '밀스케일' 라인\(비CBAM 공동산출물\)/);
// 라인 요약도 제외 라인을 공정 생산량 비교에서 뺀다.
const alSummary = summarizeProductOutputLines(950, alLines);
assert.equal(alSummary.totalOutput, 950);
assert.equal(alSummary.excludedCount, 1);
assert.equal(alSummary.excludedOutput, 50);
assert.equal(alSummary.needsOutputReview, false);

// --- T4 사용자 지정 배분율 합계 (CBAM-ALLOC-MANUAL-01): 합계≠100% → 차단 문구 ---
const manualLineA = { ...outputLineA, allocation_basis: 'MANUAL', manual_allocation_percent: 60, manual_allocation_reason: '가열로 체류시간 비율', manual_allocation_evidence: '2026 운전일지' };
const manualLineB = { ...outputLineB, allocation_basis: 'MANUAL', manual_allocation_percent: 30, manual_allocation_reason: '가열로 체류시간 비율', manual_allocation_evidence: '2026 운전일지' };
const manualShort = calculateLocalResults({ processes: [process], precursors: [], products: [product], periods: [period], productOutputLines: [manualLineA, manualLineB] });
assert.match(warningsOf(manualShort[0]), /차단: 사용자 지정 배분율 합계가 90\.00%입니다/);
assertClose(manualShort[0].allocation_share, 60 / 90, 1e-6); // 산정 자체는 종전대로 정규화(숫자 불변)
const manualOk = calculateLocalResults({ processes: [process], precursors: [], products: [product], periods: [period], productOutputLines: [manualLineA, { ...manualLineB, manual_allocation_percent: 40 }] });
assert.doesNotMatch(warningsOf(manualOk[0]), /차단:/);
assertClose(manualOk[0].allocation_share, 0.6);
assert.equal(manualOk[0].allocation_reason, '가열로 체류시간 비율', '결과에 배분 사유를 실어 보낸다');
assert.equal(manualOk[0].allocation_basis, 'MANUAL');

// --- T5 사용자 지정 배분: 규정 예외 고지(CBAM-ALLOC-MANUAL-01) + 사유·증빙(CBAM-ALLOC-MANUAL-03) ---
// 사유가 있어도 「기능단위(질량) 원칙의 예외」임은 매번 알린다 — A.2 둘째 단락.
assert.match(warningsOf(manualOk[0]), /확인 필요\(규정\): 이 공정은 사용자 지정 배분을 씁니다/);
assert.match(warningsOf(manualOk[0]), /기능단위\(CN별 톤 = 질량\)가 원칙/);
assert.doesNotMatch(warningsOf(productLineResults[0]), /사용자 지정 배분을 씁니다/, '질량 기준 공정에는 고지 없음');
assert.equal(ALLOCATION_RULES.MANUAL_SCOPE.kind, '규정 필수');
assert.equal(ALLOCATION_RULES.MANUAL_REASON.kind, '앱 내부 통제', '사유 기재는 규정 필수가 아니라 문서화 통제');
const manualNoReason = calculateLocalResults({ processes: [process], precursors: [], products: [product], periods: [period], productOutputLines: [{ ...manualLineA, manual_allocation_reason: '' }, { ...manualLineB, manual_allocation_percent: 40 }] });
assert.match(warningsOf(manualNoReason[0]), /확인 필요\(자료\): 'Hot rolled coil A' 사용자 지정 배분의 사유·증빙이 비어 있습니다/);
assert.doesNotMatch(warningsOf(manualNoReason[0]), /'Hot rolled coil B' 사용자 지정 배분의 사유/, '사유가 있는 라인은 경고 없음');
assert.equal(manualNoReason[0].allocation_reason, undefined);
// 증빙만 없어도 확인 요구.
const manualNoEvidence = calculateLocalResults({ processes: [process], precursors: [], products: [product], periods: [period], productOutputLines: [{ ...manualLineA, manual_allocation_evidence: '  ' }, { ...manualLineB, manual_allocation_percent: 40 }] });
assert.match(warningsOf(manualNoEvidence[0]), /'Hot rolled coil A' 사용자 지정 배분의 사유·증빙/);
// 질량 기준 라인에는 사유를 묻지 않는다.
assert.doesNotMatch(warningsOf(productLineResults[0]), /사유·증빙/);

// --- T6 기존 자료 호환: 신규 필드가 전혀 없는 입력이 종전 숫자를 그대로 낸다 (위 회귀 전부) + 결과에 새 필드가 채워진다 ---
assert.equal(productLineResults[0].activity_level_t, 1000);
assert.equal(productLineResults[0].direct_emissions_input_mode, 'UNSPECIFIED');
assert.equal(productLineResults[0].reconciliation.length, 0); // vm realm 배열이라 deepEqual 프로토타입 비교가 실패한다
assert.equal(resultsWithoutSourceStreams[0].activity_level_t, 1000, '라인 없으면 공정 생산량이 활동수준');
assert.equal(resultsWithoutSourceStreams[0].allocation_basis, 'PROCESS_TOTAL');

// --- T7 Art 4(6) (CBAM-ALLOC-ROUTE-01): 같은 CN·같은 기간 공정 2개 → 확인 요구 ---
const splitResults = calculateLocalResults({
  processes: [
    { ...process, id: 'proc-eaf', name: 'EAF 라인', production_route: 'Electric arc furnace' },
    { ...process, id: 'proc-bof', name: 'BOF 라인', production_route: 'Basic oxygen furnace' },
  ],
  precursors: [], products: [product], periods: [period],
});
for (const result of splitResults) {
  assert.match(warningsOf(result), /확인 필요\(규정\): 같은 재화\(CN 72083900\)를 같은 보고기간에 생산공정 2개로 나누어 산정하고 있습니다/);
  assert.match(warningsOf(result), /Article 4\(6\)/);
}
// 기간이 다르면 문제 없다. 제품이 달라도(다른 CN) 문제 없다.
const splitByPeriod = calculateLocalResults({
  processes: [{ ...process, id: 'proc-y1', period_id: 'y1' }, { ...process, id: 'proc-y2', period_id: 'y2' }],
  precursors: [], products: [product], periods: [period],
});
for (const result of splitByPeriod) assert.doesNotMatch(warningsOf(result), /Article 4\(6\)/);
for (const result of euResults) assert.doesNotMatch(warningsOf(result), /Article 4\(6\)/, 'EU 예제(다른 CN 2공정)는 해당 없음');
// 같은 CN을 다른 제품 레코드로 나눠도 같은 기능단위다.
const sameCnTwoProducts = calculateLocalResults({
  processes: [{ ...process, id: 'proc-x', product_id: 'product-1' }, { ...process, id: 'proc-y', product_id: 'product-1b' }],
  precursors: [], products: [product, { ...product, id: 'product-1b', name: 'HRC (B 라인)', cn_code: '7208 39 00' }], periods: [period],
});
assert.match(warningsOf(sameCnTwoProducts[1]), /생산공정 2개로 나누어/);
// 사업장이 다르면 Art 4(7) 분할이지 4(6) 위반이 아니다.
const splitByInstallation = calculateLocalResults({
  processes: [{ ...process, id: 'proc-i1', product_id: 'product-i1' }, { ...process, id: 'proc-i2', product_id: 'product-i2' }],
  precursors: [], products: [{ ...product, id: 'product-i1', installation_id: 'inst-1' }, { ...product, id: 'product-i2', installation_id: 'inst-2' }], periods: [period],
});
for (const result of splitByInstallation) assert.doesNotMatch(warningsOf(result), /Article 4\(6\)/);
// 비CBAM 공동산출물은 기능단위 논의 대상이 아니다.
const nonCbamTwice = calculateLocalResults({
  processes: [{ ...process, id: 'proc-s1', product_id: 'complex-scale' }, { ...process, id: 'proc-s2', product_id: 'complex-scale' }],
  precursors: [], products: complexProducts, periods: [period],
});
for (const result of nonCbamTwice) assert.doesNotMatch(warningsOf(result), /Article 4\(6\)/);

// --- T8 전구물질을 활동수준 제외 라인에 귀속 → 배출이 사라지므로 확인 요구 ---
const misdirectedPrecursor = { ...precursor, id: 'pp-mis', process_id: 'proc-al', product_id: 'p-good', consumed_mass_t: 100, purchased_mass_t: 100, output_allocations: [
  { product_output_line_id: 'line-good', product_id: 'p-good', allocated_mass_t: 90 },
  { product_output_line_id: 'line-offspec', product_id: 'p-offspec', allocated_mass_t: 10 },
] };
const misdirected = calculateLocalResults({ processes: [alProcess], precursors: [misdirectedPrecursor], products: alProducts, periods: [period], productOutputLines: alLines });
const misGood = misdirected.find((r) => r.product_output_line_id === 'line-good');
assert.match(warningsOf(misGood), /확인 필요\(자료\): Purchased hot rolled coil의 귀속 10\.0000 t가 활동수준 제외 라인을 가리켜 배출에서 빠집니다/);
assertClose(misGood.precursor_direct_see, 90 * 1.2 / 950, 1e-6); // 자동으로 옮기지 않는다 — 90 t만 귀속
assert.equal(misdirected.find((r) => r.product_output_line_id === 'line-offspec').precursor_see, 0);
// 정상 귀속(전량 정규 제품)은 경고 없음.
const wellDirected = calculateLocalResults({ processes: [alProcess], precursors: [{ ...misdirectedPrecursor, output_allocations: [{ product_output_line_id: 'line-good', product_id: 'p-good', allocated_mass_t: 100 }] }], products: alProducts, periods: [period], productOutputLines: alLines });
assert.doesNotMatch(warningsOf(wellDirected[0]), /활동수준 제외 라인을 가리켜/);
// 명시 귀속이 없으면(레거시 공정 배분율) 제외 라인은 0, 정규 제품이 전량.
const implicitPrecursor = calculateLocalResults({ processes: [alProcess], precursors: [{ ...misdirectedPrecursor, output_allocations: undefined }], products: alProducts, periods: [period], productOutputLines: alLines });
assertClose(implicitPrecursor.find((r) => r.product_output_line_id === 'line-good').precursor_direct_see, 100 * 1.2 / 950);

console.log('Allocation-logic verification passed (T1 입력방식 · T2 RecF · T3 활동수준 · T4/T5 사용자 지정 배분 · T6 호환 · T7 Art 4(6) · T8 전구물질 귀속).');
console.log('Local calculation verification passed.');
