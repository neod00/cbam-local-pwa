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

  const compiled = ts.transpileModule(
    `${sourceStreamCalculationSource}
${productRulesSource}
${reportingScopeSource}
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
console.log('Local calculation verification passed.');
