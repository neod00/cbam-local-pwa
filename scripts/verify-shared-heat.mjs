// 사내 공용 열(보일러·스팀 헤더)의 귀속을 잠근다 — CBAM-ALLOC-HEAT-02 (2026-10-05).
//
// 규정: 2025/2547 부속서 III A.3 — 측정가능열을 만드는 연료가 둘 이상의 생산공정에 쓰이면 그 연료 배출은 공정의
// 직접귀속배출(DirEm*)에 넣지 않고 EmH,import로 귀속한다(이중계상 방지). 귀속은 쓴 열량 기준(A.2.2 식 44·52).
// 종전: 보일러 연료를 생산량 비율로 쪼개 공정마다 직접배출에 넣었다. 합계는 같아도 공정별 몫이 열 사용과 무관했다.
//
// 여기서 못 박는 것:
//   1) 소비처 몫 + 공정 밖 몫 = 연료 배출 전체 — 누락도 이중계상도 없다.
//   2) 열 공급원 연료는 어느 공정의 배출원 합계(DirEm*)에도 들어가지 않는다(process_id가 있어도).
//   3) 열 사용량이 없거나 잘못되면 그 몫을 0으로 두고 알린다 — 조용히 다른 비율로 나누지 않는다.
//   4) 밖에서 산 열(EmH,imp)과 함께 있으면 합쳐진다.
//   5) 열 공급원이 없는 자료는 숫자가 그대로다(다른 검증이 잠근다).
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
  'globalThis.app = { calculateLocalResults, calculateSourceStreamEmissions, resolveSharedHeatSystems, resolveProcessSharedHeat, validateSharedHeatDraft, buildSharedHeatUpdates, buildSharedHeatRelease, SHARED_HEAT_RULE, HEAT_QUANTITY_BASIS_LABEL, HEAT_UNIT_TO_TJ };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { calculateLocalResults, calculateSourceStreamEmissions, resolveSharedHeatSystems, resolveProcessSharedHeat, validateSharedHeatDraft, buildSharedHeatUpdates, buildSharedHeatRelease, SHARED_HEAT_RULE, HEAT_QUANTITY_BASIS_LABEL, HEAT_UNIT_TO_TJ } = context.app;

const near = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} (기대 ${expected})`);
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const sts = { id: 'sts', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const carbon = { id: 'carbon', name: '탄소강 나사', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT', ...stamp };
const makeProcess = (overrides) => ({
  period_id: period.id, production_route: '가공', market_output_mass_t: 0, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 50, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp, ...overrides,
});
const entry = (system, quantity, extra = {}) => ({ system, quantity, unit: 'TJ', basis: 'METERED', ...extra });
const processA = makeProcess({ id: 'A', product_id: sts.id, name: 'STS 나사 공정', output_mass_t: 3240, heat_consumption: [entry('온수 보일러', 4)] });
const processB = makeProcess({ id: 'B', product_id: carbon.id, name: '탄소강 나사 공정', output_mass_t: 1860, heat_consumption: [entry('온수 보일러', 1)] });
const boilerFuel = (overrides = {}) => ({
  id: 'boiler', period_id: period.id, name: '도시가스 — 온수 보일러', stream_type: 'FUEL', method: 'Combustion',
  activity_data: 38500, activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY', source: '삼천리 고지서',
  heat_system: { name: '온수 보일러' }, ...stamp, ...overrides,
});
const run = (processes, sourceStreams) => calculateLocalResults({ products: [sts, carbon], periods: [period], processes, precursors: [], sourceStreams });
const warningsOf = (result) => result.warnings.join('\n');

const E = calculateSourceStreamEmissions(boilerFuel());
near(E, 38500 * 0.037 * 56.1 / 1000, '보일러 연료 배출 = 38,500 Nm³ × 0.037 GJ × 56.1 tCO₂/TJ');
near(E, 79.91445, '손계산 79.91445 tCO₂e', 1e-6);

// ── 1) 쓴 열량 비율로 귀속 — 합계는 연료 배출 전체 ──────────────────────
const base = run([processA, processB], [boilerFuel()]);
const [resultA, resultB] = base;
near(resultA.direct_emissions_tco2e, 50 + E * 0.8, 'A 직접배출 = 자기 50 + 보일러 80%');
near(resultB.direct_emissions_tco2e, 50 + E * 0.2, 'B 직접배출 = 자기 50 + 보일러 20%');
near(resultA.shared_heat_emissions_tco2e + resultB.shared_heat_emissions_tco2e, E, '소비처 몫의 합 = 연료 배출 전체(누락·이중계상 없음)');
near(resultA.imported_heat_emissions_tco2e, resultA.shared_heat_emissions_tco2e, 'EmH,imp 합계에 사내 공용 열이 들어 있다');
assert.equal(resultA.shared_heat_formulas.length, 1);
assert.match(resultA.shared_heat_formulas[0], /열 사용 4 TJ ÷ 전체 5 TJ = 80\.00%/);
assert.equal(resultA.source_stream_count, 0, '열 공급원 연료는 공정의 배출원 합계에 들지 않는다');
assert.equal(resultA.source_stream_emissions_tco2e, 0);
near(resultA.direct_see, (50 + E * 0.8) / 3240, 'A 직접 SEE');
assert.deepEqual(base.flatMap((result) => result.warnings.filter((warning) => /열 공급원|공용 열/.test(warning))), [], '정상 입력은 조용하다');

// 공정 단위 함수도 같은 값을 낸다 — 보고서·내보내기가 이 함수를 쓴다.
const directlyResolved = resolveProcessSharedHeat(processA, resolveSharedHeatSystems({ processes: [processA, processB], sourceStreams: [boilerFuel()], emissionsOf: calculateSourceStreamEmissions }));
near(directlyResolved.tj, 4, 'A가 받은 열(TJ)');
near(directlyResolved.emissionsTco2e, E * 0.8, 'A 몫');
assert.equal(directlyResolved.problems.length, 0);
assert.equal(directlyResolved.systems.length, 1);

// ── 2) 공정 밖 사용량(사무동·비대상) — 전체 열량에 넣어 그 몫의 배출을 뺀다 ──
const withOutside = run([processA, processB], [boilerFuel({ heat_system: { name: '온수 보일러', outside_quantity: 1, outside_unit: 'TJ', outside_note: '사무동 난방' } })]);
near(withOutside[0].shared_heat_emissions_tco2e, E * 4 / 6, '공정 밖 1 TJ → A는 4/6');
near(withOutside[1].shared_heat_emissions_tco2e, E * 1 / 6, 'B는 1/6');
const outsideSystem = resolveSharedHeatSystems({ processes: [processA, processB], sourceStreams: [boilerFuel({ heat_system: { name: '온수 보일러', outside_quantity: 1, outside_unit: 'TJ' } })], emissionsOf: calculateSourceStreamEmissions })[0];
near(outsideSystem.outsideEmissionsTco2e, E / 6, '공정 밖 몫의 배출');
near(outsideSystem.outsideEmissionsTco2e + outsideSystem.consumers.reduce((sum, consumer) => sum + consumer.emissionsTco2e, 0), E, '공정 밖 + 소비처 = 전체');
near(outsideSystem.efTco2PerTj, E / 6, '유효 배출계수 = 연료 배출 ÷ 전체 열량(손실 포함) — EU 문서 L+47');
near(outsideSystem.totalTj * outsideSystem.efTco2PerTj, E, '템플릿이 곱하는 Q × EF = 연료 배출');

// ── 3) process_id가 남아 있어도 열 공급원 연료는 직접배출에 두 번 들어가지 않는다 ──
const sumMode = (process) => ({ ...process, direct_emissions_input_mode: 'SOURCE_STREAM_SUM', direct_attributable_emissions_tco2e: 0 });
const ownFuel = { ...boilerFuel({ id: 'own', heat_system: undefined, activity_data: 1000, name: '경유 지게차(전용)' }), process_id: 'A' };
const withProcessId = run([sumMode(processA), sumMode(processB)], [{ ...boilerFuel(), process_id: 'A' }, ownFuel]);
near(withProcessId[0].direct_emissions_tco2e, calculateSourceStreamEmissions(ownFuel) + E * 0.8, 'process_id가 있어도 보일러는 열량 비율로만 들어간다(자기 연료 + 보일러 80%)');
assert.equal(withProcessId[0].source_stream_count, 1, '자기 연료 1건만 배출원 합계에 든다');
near(withProcessId[1].direct_emissions_tco2e, E * 0.2, 'B는 보일러 20%만');

// ── 4) 밖에서 산 열(식 52·55)과 함께 있으면 합쳐진다 ───────────────────
const boughtHeat = { measurable_heat_import: 'YES', imported_heat_amount: 1000, imported_heat_unit: 'Gcal', imported_heat_ef_basis: 'SUPPLIER', imported_heat_supplier_ef_tco2_per_tj: 60 };
const both = run([{ ...processA, ...boughtHeat }, processB], [boilerFuel()]);
const boughtEmissions = 1000 * HEAT_UNIT_TO_TJ.Gcal * 60;
near(both[0].imported_heat_emissions_tco2e, boughtEmissions + E * 0.8, 'EmH,imp = 산 열 + 사내 공용 열');
near(both[0].shared_heat_emissions_tco2e, E * 0.8, '그중 사내 공용 열 몫');
near(both[0].direct_emissions_tco2e, 50 + boughtEmissions + E * 0.8);

// ── 5) 단위 환산 ─────────────────────────────────────────────────────
const gcal = run([{ ...processA, heat_consumption: [entry('온수 보일러', 4 / HEAT_UNIT_TO_TJ.Gcal, { unit: 'Gcal' })] }, processB], [boilerFuel()]);
near(gcal[0].shared_heat_emissions_tco2e, E * 0.8, 'Gcal로 적어도 같은 TJ면 같은 몫', 1e-9);
const mwh = run([{ ...processA, heat_consumption: [entry('온수 보일러', 4 / HEAT_UNIT_TO_TJ.MWh, { unit: 'MWh' })] }, processB], [boilerFuel()]);
near(mwh[0].shared_heat_emissions_tco2e, E * 0.8, 'MWh로 적어도 같다');

// ── 6) 귀속하지 못하는 경우 — 그 몫은 0, 이유를 알린다. 조용히 다른 비율로 나누지 않는다 ──
const zeroQty = run([{ ...processA, heat_consumption: [entry('온수 보일러', 0)] }, processB], [boilerFuel()]);
near(zeroQty[0].shared_heat_emissions_tco2e, 0, '열 사용량 0 → 몫 0');
near(zeroQty[1].shared_heat_emissions_tco2e, 0, '같은 공급원은 다른 공정도 귀속하지 않는다 — 한쪽만 계산하면 연료가 모자라게 잡힌다');
assert.match(warningsOf(zeroQty[0]), /확인 필요\(자료\): STS 나사 공정: 「STS 나사 공정」의 「온수 보일러」 열 사용량이 비어 있거나 0입니다/);
assert.match(warningsOf(zeroQty[0]), /그 몫의 배출을 0으로 계산했습니다/);
assert.match(warningsOf(zeroQty[0]), /ANNEX III, point A\.3/);

const missingFuel = run([processA, processB], []);
near(missingFuel[0].shared_heat_emissions_tco2e, 0);
assert.match(warningsOf(missingFuel[0]), /열 공급원 「온수 보일러」의 연료 배출원이 없습니다/);

const otherPeriod = run([processA, processB], [boilerFuel({ period_id: 'other-period' })]);
assert.match(warningsOf(otherPeriod[0]), /연료 배출원이 없습니다/, '다른 보고기간의 연료는 이 기간 공정에 귀속하지 않는다');

const mismatch = resolveSharedHeatSystems({
  processes: [processA, processB],
  sourceStreams: [boilerFuel({ id: 'g1', heat_system: { name: '온수 보일러', outside_quantity: 1, outside_unit: 'TJ' } }), boilerFuel({ id: 'g2', heat_system: { name: '온수 보일러', outside_quantity: 2, outside_unit: 'TJ' } })],
  emissionsOf: calculateSourceStreamEmissions,
})[0];
assert.match(mismatch.problem, /공정 밖 사용량이 서로 다릅니다/);

const noConsumers = resolveSharedHeatSystems({ processes: [{ ...processA, heat_consumption: undefined }, { ...processB, heat_consumption: [] }], sourceStreams: [boilerFuel()], emissionsOf: calculateSourceStreamEmissions })[0];
assert.match(noConsumers.problem, /열을 받는 공정이 없습니다/);
near(noConsumers.fuelEmissionsTco2e, E, '소비처가 없어도 연료 배출은 계산해 둔다(readiness가 막는다)');
near(noConsumers.consumers.length, 0);

// ── 7) 추정(간접결정)은 근거가 있어야 한다 — 계산은 하되 규정 확인을 알린다 ──
const estimate = (note) => run([{ ...processA, heat_consumption: [entry('온수 보일러', 4, { basis: 'INDIRECT_ESTIMATE', note })] }, processB], [boilerFuel()]);
assert.match(warningsOf(estimate(undefined)[0]), /확인 필요\(규정\): STS 나사 공정: 「온수 보일러」 열 사용량을 추정\(간접결정\)으로 정했는데 근거가 비어 있습니다/);
near(estimate(undefined)[0].shared_heat_emissions_tco2e, E * 0.8, '근거가 비어도 계산은 한다 — 알리기만 한다');
assert.doesNotMatch(warningsOf(estimate('보일러 정격 × 2025 가동일지')[0]), /근거가 비어 있습니다/);
assert.doesNotMatch(warningsOf(resultA), /근거가 비어/, '계측은 조용하다');
assert.match(HEAT_QUANTITY_BASIS_LABEL.INDIRECT_ESTIMATE, /A\.3\(2\)/);

// ── 8) 한 공정이 열 공급원 둘에서 받는다 ─────────────────────────────
const steam = boilerFuel({ id: 'steam', name: '벙커C — 증기 헤더', heat_system: { name: '증기 헤더' }, activity_data: 10, activity_unit: 't', ncv_gj_per_unit: 40, emission_factor_tco2e_per_unit: 77.4 });
const Esteam = calculateSourceStreamEmissions(steam);
const twoSystems = run(
  [{ ...processA, heat_consumption: [entry('온수 보일러', 4), entry('증기 헤더', 1)] }, { ...processB, heat_consumption: [entry('온수 보일러', 1)] }],
  [boilerFuel(), steam]
);
near(twoSystems[0].shared_heat_emissions_tco2e, E * 0.8 + Esteam, '증기 헤더는 A만 쓰므로 전부 A로');
assert.equal(twoSystems[0].shared_heat_formulas.length, 2);

// ── 9) 열 공급원이 없는 자료는 그대로 ─────────────────────────────────
const plain = run([{ ...processA, heat_consumption: undefined }, { ...processB, heat_consumption: undefined }], []);
near(plain[0].direct_emissions_tco2e, 50);
assert.equal(plain[0].shared_heat_emissions_tco2e, 0);
assert.equal(plain[0].warnings.filter((warning) => /열 공급원|공용 열/.test(warning)).length, 0);

// ── 10) 규정 문안 — 원문 그대로 인용하고 앱의 판단과 섞지 않는다 ───────────
assert.equal(SHARED_HEAT_RULE.id, 'CBAM-ALLOC-HEAT-02');
assert.match(SHARED_HEAT_RULE.text, /used in more than one production process/);
assert.match(SHARED_HEAT_RULE.text, /without any omission or double counting/);
assert.match(SHARED_HEAT_RULE.anchor, /point A\.3/);

// ── 10-1) 입력 검사와 저장 빌더 — 화면은 이 함수만 거친다 ────────────────
{
  const bare = (process) => ({ ...process, heat_consumption: undefined });
  const barePA = bare(processA);
  const barePB = bare(processB);
  const ownedByA = { ...boilerFuel({ id: 'row-a', heat_system: undefined, activity_data: 24459, name: '보일러 — STS 몫' }), process_id: 'A' };
  const ownedByB = { ...boilerFuel({ id: 'row-b', heat_system: undefined, activity_data: 14041, name: '보일러 — 탄소강 몫' }), process_id: 'B' };
  const context = { processes: [barePA, barePB], sourceStreams: [ownedByA, ownedByB] };
  const draft = {
    name: '온수 보일러', streamIds: ['row-a', 'row-b'],
    consumers: [{ processId: 'A', quantity: 4, unit: 'TJ', basis: 'METERED', note: '' }, { processId: 'B', quantity: 1, unit: 'TJ', basis: 'METERED', note: '' }],
    outsideQuantity: 0, outsideUnit: 'Gcal', outsideNote: '',
  };
  assert.equal(validateSharedHeatDraft(draft, context), undefined);
  assert.match(validateSharedHeatDraft({ ...draft, name: ' ' }, context), /이름을 적으세요/);
  assert.match(validateSharedHeatDraft({ ...draft, streamIds: [] }, context), /연료를 하나 이상/);
  assert.match(validateSharedHeatDraft({ ...draft, consumers: [] }, context), /열을 받는 공정을 하나 이상/);
  assert.match(validateSharedHeatDraft({ ...draft, consumers: [{ ...draft.consumers[0], quantity: 0 }, draft.consumers[1]] }, context), /열 사용량을 0보다 크게/);
  assert.match(validateSharedHeatDraft({ ...draft, consumers: [{ ...draft.consumers[0], basis: 'INDIRECT_ESTIMATE' }, draft.consumers[1]] }, context), /추정 근거/);
  assert.equal(validateSharedHeatDraft({ ...draft, consumers: [{ ...draft.consumers[0], basis: 'INDIRECT_ESTIMATE', note: '정격 × 가동일지' }, draft.consumers[1]] }, context), undefined);
  assert.match(validateSharedHeatDraft({ ...draft, consumers: [draft.consumers[0], draft.consumers[0]] }, context), /두 번/);
  assert.match(validateSharedHeatDraft({ ...draft, streamIds: ['없는행'] }, context), /찾을 수 없습니다/);
  assert.match(validateSharedHeatDraft({ ...draft, consumers: [draft.consumers[0]] }, context), /한 공정만 쓰는 열이면/, '한 공정만 쓰면 열 공급원이 아니다 — 연료는 그 공정의 직접배출');
  assert.equal(validateSharedHeatDraft({ ...draft, consumers: [draft.consumers[0]], outsideQuantity: 1 }, context), undefined, '공정 + 공정 밖(사무동)이면 둘 이상이다');
  assert.match(validateSharedHeatDraft(draft, { ...context, sourceStreams: [{ ...ownedByA, stream_type: 'PROCESS_MATERIAL' }, ownedByB] }), /연료가 아닙니다/);
  assert.match(validateSharedHeatDraft(draft, { ...context, sourceStreams: [{ ...ownedByA, heat_system: { name: '증기 헤더' } }, ownedByB] }), /이미 열 공급원 「증기 헤더」/);
  assert.match(validateSharedHeatDraft(draft, { processes: [barePA, { ...barePB, period_id: 'other' }], sourceStreams: context.sourceStreams }), /보고기간이 서로 다릅니다/);

  const built = buildSharedHeatUpdates([barePA, barePB, { ...bare(processA), id: 'C', name: '무관', heat_consumption: [entry('증기 헤더', 2)] }], [ownedByA, ownedByB], draft);
  assert.equal(JSON.stringify(built.sourceStreams.map((stream) => stream.id)), JSON.stringify(['row-a', 'row-b']));
  assert.ok(built.sourceStreams.every((stream) => stream.process_id === undefined && stream.heat_system.name === '온수 보일러'), '연료는 공정에서 떼어 열 공급원에 단다');
  assert.equal(built.sourceStreams[0].created_at, ownedByA.created_at, '기존 필드(id·생성일)를 지킨다');
  assert.equal(built.sourceStreams[0].activity_data, 24459);
  assert.equal(JSON.stringify(built.processes.map((process) => process.id)), JSON.stringify(['A', 'B']), '바뀐 공정만 — 무관한 공정은 건드리지 않는다');
  assert.equal(JSON.stringify(built.processes[0].heat_consumption), JSON.stringify([{ system: '온수 보일러', quantity: 4, unit: 'TJ', basis: 'METERED' }]));
  assert.equal(built.processes[0].direct_attributable_emissions_tco2e, 50, '직접배출 값은 건드리지 않는다');
  // 두 연료 행을 합친 한 열 공급원이 쓴 열량 비율로 귀속된다 — 손으로 나눈 두 행(생산량 비율)이 한 덩어리가 된다.
  const merged = run(built.processes.map((process) => ({ ...process })), built.sourceStreams);
  near(merged[0].shared_heat_emissions_tco2e + merged[1].shared_heat_emissions_tco2e, E, '연료 두 행이 한 덩어리로 귀속된다');

  const withOutsideDraft = buildSharedHeatUpdates([barePA, barePB], [ownedByA, ownedByB], { ...draft, outsideQuantity: 2, outsideUnit: 'Gcal', outsideNote: '사무동' });
  assert.equal(JSON.stringify(withOutsideDraft.sourceStreams[0].heat_system), JSON.stringify({ name: '온수 보일러', outside_quantity: 2, outside_unit: 'Gcal', outside_note: '사무동' }));
  assert.equal(JSON.stringify(withOutsideDraft.sourceStreams[0].heat_system), JSON.stringify(withOutsideDraft.sourceStreams[1].heat_system), '행마다 같은 공정 밖 사용량 — 어긋나면 엔진이 막는다');

  // 다시 저장하면서 연료 한 행을 뺀다 → 그 행은 표시를 잃는다(공정 연결은 없다 — 다시 연결해야 한다)
  const afterFirst = { processes: [...built.processes, ...[barePA, barePB].filter((process) => !built.processes.some((item) => item.id === process.id))], sourceStreams: built.sourceStreams };
  const redo = buildSharedHeatUpdates(afterFirst.processes, afterFirst.sourceStreams, { ...draft, streamIds: ['row-a'] });
  assert.equal(redo.sourceStreams.find((stream) => stream.id === 'row-b').heat_system, undefined, '빠진 연료는 열 공급원 표시를 지운다');
  assert.equal(redo.sourceStreams.find((stream) => stream.id === 'row-a').heat_system.name, '온수 보일러');
  // 공정을 뺀다 → 그 공정의 이 공급원 항목만 지운다(다른 공급원은 그대로)
  const multi = { ...built.processes[0], heat_consumption: [entry('증기 헤더', 3), ...built.processes[0].heat_consumption] };
  const dropped = buildSharedHeatUpdates([multi, built.processes[1]], built.sourceStreams, { ...draft, consumers: [draft.consumers[1]], outsideQuantity: 1 });
  assert.equal(JSON.stringify(dropped.processes.find((process) => process.id === 'A').heat_consumption), JSON.stringify([entry('증기 헤더', 3)]), '다른 공급원 항목은 지키고 이 공급원 항목만 뺀다');

  const released = buildSharedHeatRelease(afterFirst.processes, afterFirst.sourceStreams, '온수 보일러', period.id);
  assert.ok(released.sourceStreams.every((stream) => stream.heat_system === undefined));
  assert.ok(released.processes.every((process) => process.heat_consumption === undefined), '해제하면 공정의 열 사용량도 지운다');
  assert.equal(released.sourceStreams[0].activity_data, 24459, '해제해도 연료 값은 남는다');
  assert.equal(buildSharedHeatRelease(afterFirst.processes, afterFirst.sourceStreams, '없는 공급원', period.id).sourceStreams.length, 0);
}

// ── 11) 배선 — 화면이 열 공급원 연료를 공정에 묶거나 옛 필드를 지우지 않는다 ──
const db = readFileSync('src/lib/local-db.ts', 'utf8');
assert.match(db, /heat_system\?: SourceStreamHeatSystem;/, '연료 배출원에 열 공급원 표시 자리가 없다');
assert.match(db, /heat_consumption\?: HeatConsumption\[\];/, '공정에 열 사용량 자리가 없다');
assert.match(db, /format_version: 1 \| 2 \| 3 \| 4;/, '열 공급원이 있으면 백업 판본을 4로 올려 옛 앱이 거부하게 한다');

const component = readFileSync('src/components/guided/SharedHeat.tsx', 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /<SharedHeat\s+processes=\{data\.processes\}\s+sourceStreams=\{data\.sourceStreams\}\s+onApplied=\{onSaved\}\s*\/>/, '4단계 패널이 열 공급원 입력을 싣지 않는다');
// 저장은 한 함수를 거친다 — 연료가 공정에서 떨어지면 그 공정의 캐시된 직접배출(EU 문서 D_Processes 값)을 다시 맞춘다.
// 안 맞추면 옛 보일러 몫이 직접배출에 한 번, 열 사용으로 또 한 번 — EU 문서가 두 번 센다.
const writes = [...component.matchAll(/updateLocalItem\('([a-z_]+)', ([A-Za-z]+)\)/g)].map((match) => `${match[1]}:${match[2]}`);
assert.equal(JSON.stringify(writes), JSON.stringify(['source_streams:stream', 'processes:next']), '저장 경로가 늘거나 줄었다 — persistHeatChanges만 거쳐야 한다');
assert.equal([...component.matchAll(/await persistHeatChanges\(/g)].length, 2, '적용·해제 두 경로가 모두 같은 저장 함수를 거친다');
assert.match(component, /releasedFrom\.has\(process\.id\) && next\.direct_emissions_input_mode === 'SOURCE_STREAM_SUM'/);
assert.match(component, /direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions\(process\.id, nextStreams\)/, '떨어진 공정의 직접배출 캐시를 변경 후 연료 목록으로 다시 맞춘다');
assert.ok(!/(source_streams|processes)', \{/.test(component), '화면이 레코드를 직접 만들어 저장한다 — 빌더(buildSharedHeatUpdates·Release)만 쓸 것');
assert.ok(!/useState\([^\n]*process[.?]/.test(component), 'useState 초깃값이 공정 값을 읽는다 — 폼을 열 때 채워야 옛 값이 굳지 않는다');
assert.match(component, /const draftError = validateSharedHeatDraft\(draft, \{ processes, sourceStreams \}\);/, '저장 전에 공유 검사를 거치지 않는다');

console.log('Shared heat verification passed (쓴 열량 비율 귀속 · 소비처 + 공정 밖 = 전체 · 직접배출에서 제외 · 귀속 실패 시 0과 경고 · 산 열과 합산 · 추정은 근거 요구).');
