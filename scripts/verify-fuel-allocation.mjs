// 공용 연료 나누기(지도 4단계)를 잠근다 — CBAM-ALLOC-RECF-01·02·03 (2026-10-05).
//
// 종전: 담당자가 엑셀로 공정별 몫을 계산해 공정마다 연료 행을 따로 넣었다. 엔진은 합계가 맞는지만 검사했다.
// 지금: 사업장 전체 값과 기준을 받아 앱이 나누고, 공정별 연료 행과 공용 계량기 기록을 한꺼번에 만든다.
//
// 여기서 못 박는 것:
//   1) 나눈 행을 **실제 엔진에 넣으면** 공정별 직접배출의 합이 고지서 전체 배출과 같다(기준 세 가지 모두).
//   2) 기준은 2025/2547에 있는 셋뿐이다 — 계량기 값(RecF) · 생산량(기능단위) · 설비용량×가동시간 추정(간접결정).
//   3) 생산량·계량기 값은 조용하고, 추정은 엔진이 「확인 필요(규정)」로 알린다. 계산은 바뀌지 않는다.
//   4) 화면은 필드 매핑을 직접 적지 않고 빌더만 거친다.
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
  strip('src/lib/fuel-allocation.ts'),
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  'globalThis.app = { calculateLocalResults, calculateSourceStreamEmissions, reconcileSourceStreams, sumReconciledSourceStreamEmissions, validateFuelSplitDraft, computeFuelSplit, describeFuelSplit, buildFuelSplitStreams, buildFuelSplitRelease, litresToTonnes, tonnesToLitres, shortProcessName, FUEL_SPLIT_BASIS_LABEL, FUEL_SPLIT_BASIS_ANCHOR, FUEL_SPLIT_STORED_BASIS };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const {
  calculateLocalResults, calculateSourceStreamEmissions, reconcileSourceStreams, validateFuelSplitDraft, computeFuelSplit, describeFuelSplit,
  buildFuelSplitStreams, buildFuelSplitRelease, litresToTonnes, tonnesToLitres, shortProcessName,
  FUEL_SPLIT_BASIS_LABEL, FUEL_SPLIT_BASIS_ANCHOR, FUEL_SPLIT_STORED_BASIS,
} = context.app;

const near = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} (기대 ${expected})`);
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const sts = { id: 'sts', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const carbon = { id: 'carbon', name: '탄소강 나사', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT', ...stamp };
const makeProcess = (overrides) => ({
  period_id: period.id, production_route: '가공', market_output_mass_t: 0, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 0, direct_emissions_input_mode: 'SOURCE_STREAM_SUM', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, ...stamp, ...overrides,
});
const processA = makeProcess({ id: 'A', product_id: sts.id, name: 'STS 나사 공정 (냉간압조·전조 공용라인 + STS 전용 산세·부동태)', output_mass_t: 3240 });
const processB = makeProcess({ id: 'B', product_id: carbon.id, name: '탄소강 나사 공정 — EU 수출 없음', output_mass_t: 1860 });
const template = {
  stream_type: 'FUEL', method: 'Combustion', activity_unit: 't', ncv_gj_per_unit: 43, emission_factor_tco2e_per_unit: 74.1, emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'EU_OR_IPCC_DEFAULT',
};
const DENSITY = 0.835;
const toStorage = (litres) => litresToTonnes(litres, DENSITY);
const rows = (values) => [{ processId: 'A', processName: processA.name, value: values[0] }, { processId: 'B', processName: processB.name, value: values[1] }];
const draftOf = (basis, values, extra = {}) => ({ group: '공용 경유 지게차', total: 12400, basis, rows: rows(values), note: '', ...extra });
const withIds = (created) => created.map((row, index) => ({ ...row, id: `row-${index}`, ...stamp }));
const run = (streams) => calculateLocalResults({ products: [sts, carbon], periods: [period], processes: [processA, processB], precursors: [], sourceStreams: streams });
const warningsOf = (results) => results.flatMap((result) => result.warnings).join('\n');
const totalEmissions = calculateSourceStreamEmissions({ ...template, activity_data: toStorage(12400) });
const build = (plan, extra = {}) => buildFuelSplitStreams({ streams: [], processes: [processA, processB], plan, template, fuelName: '경유', inputUnit: 'L', source: '주유 전표 2025', storedTotal: toStorage(plan.total), ...extra });

// ── 1) 생산량 비율 — 손으로 계산하던 값(6.578 / 3.776 t)과 같은 답, 합계는 정확히 고지서 값 ──
assert.equal(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 1860])), undefined);
const massPlan = computeFuelSplit(draftOf('OUTPUT_MASS', [3240, 1860]), toStorage);
assert.equal(massPlan.shares[0].amount, 7877.647059);
assert.equal(massPlan.shares[1].amount, 4522.352941);
near(massPlan.shares[0].amount + massPlan.shares[1].amount, 12400, '나눈 합계 = 고지서 값', 1e-9);
near(massPlan.shares[0].stored, 6.577835, '리터 몫을 t로 환산', 1e-6);
near(massPlan.shares[0].stored, 6.578, '손으로 계산하던 STS 몫 6.578 t와 같은 값', 1e-3);
near(massPlan.shares[1].stored, 3.776, '탄소강 몫 3.776 t', 1e-3);
const thirds = computeFuelSplit({ group: 'g', total: 100, basis: 'OUTPUT_MASS', note: '', rows: ['x', 'y', 'z'].map((id) => ({ processId: id, processName: id, value: 1 })) });
near(thirds.shares.reduce((sum, share) => sum + share.amount, 0), 100, '3등분 합계');
assert.equal(JSON.stringify(thirds.shares.map((share) => share.amount)), JSON.stringify([33.333334, 33.333333, 33.333333]), '반올림 끝수는 가장 큰 몫에');

// 끝에서 끝까지: 나눈 행을 엔진에 넣으면 공정별 직접배출의 합이 고지서 전체 배출과 같다.
const massBuilt = build(massPlan);
assert.equal(massBuilt.create.length, 2);
assert.equal(massBuilt.update.length, 0);
const massStreams = withIds(massBuilt.create);
const massResults = run(massStreams);
near(massResults[0].direct_emissions_tco2e + massResults[1].direct_emissions_tco2e, totalEmissions, '생산량 비율: 공정 직접배출 합 = 고지서 전체 배출', 1e-4);
near(massResults[0].direct_emissions_tco2e / (massResults[0].direct_emissions_tco2e + massResults[1].direct_emissions_tco2e), 3240 / 5100, 'STS 몫 63.53%', 1e-5);
assert.doesNotMatch(warningsOf(massResults), /규정에 없|공용 계량기 그룹/, '생산량 비율은 규정이 정한 방법 — 조용하다');
assert.equal(reconcileSourceStreams(massStreams).groups[0].reason, '', '합계 검사도 통과');

// ── 2) 계량기 값 — 행에는 계량값 그대로, 엔진이 정합계수로 맞춘다(식 41·42) ──
const meterPlan = computeFuelSplit(draftOf('SUB_METER', [7000, 5000]), toStorage);
near(meterPlan.factor, 12400 / 12000, 'RecF');
assert.equal(meterPlan.shares[0].amount, 7000, '계량값은 입력 그대로 저장한다 — 보정은 엔진이 한다');
near(meterPlan.shares[0].corrected, 7233.333333, '미리보기용 보정값', 1e-6);
assert.equal(meterPlan.caution, undefined);
const meterStreams = withIds(build(meterPlan).create);
assert.equal(meterStreams[0].shared_meter.basis, 'SUB_METER');
const meterResults = run(meterStreams);
near(meterResults[0].direct_emissions_tco2e + meterResults[1].direct_emissions_tco2e, totalEmissions, '계량기 값: 엔진의 정합계수가 합계를 고지서 값에 맞춘다', 1e-4);
assert.equal(meterResults[0].reconciliation[0].applied, true);
assert.match(describeFuelSplit(meterPlan, 'A', 'L'), /RecF = 1\.0333/);
assert.ok(computeFuelSplit(draftOf('SUB_METER', [3000, 2000]), toStorage).caution, '계량기 합계가 전체의 절반이면 단위·누락을 의심하라고 알린다');

// ── 3) 추정(설비용량 × 가동시간) — 근거 필수, 합계를 맞춰 저장, 엔진은 확인 필요를 알린다 ──
assert.match(validateFuelSplitDraft(draftOf('ESTIMATE', [7000, 5000])), /추정 근거/);
const estimateDraft = draftOf('ESTIMATE', [7000, 5000], { note: '라인별 계량기 없음. 명판 정격 × 2025 가동일지' });
assert.equal(validateFuelSplitDraft(estimateDraft), undefined);
const estimatePlan = computeFuelSplit(estimateDraft, toStorage);
near(estimatePlan.shares[0].amount + estimatePlan.shares[1].amount, 12400, '추정도 합계를 사업장 값에 맞춘다');
const estimateStreams = withIds(build(estimatePlan).create);
assert.equal(estimateStreams[0].shared_meter.basis, FUEL_SPLIT_STORED_BASIS.ESTIMATE, '추정은 기존 enum RATED_CAPACITY로 저장한다(하위호환)');
assert.equal(FUEL_SPLIT_STORED_BASIS.ESTIMATE, 'RATED_CAPACITY');
const estimateResults = run(estimateStreams);
near(estimateResults[0].direct_emissions_tco2e + estimateResults[1].direct_emissions_tco2e, totalEmissions, '추정: 합계 = 고지서 전체 배출', 1e-4);
assert.match(warningsOf(estimateResults), /확인 필요\(규정\): 공용 계량기 그룹 '공용 경유 지게차'를 「정격용량 비율/);
assert.doesNotMatch(warningsOf(estimateResults), /비고\(산출 근거\)가 비어 있습니다/, '근거를 적었다');
assert.match(describeFuelSplit(estimatePlan, 'A', 'L'), /간접결정방법.*근거: 라인별 계량기 없음/);
near(massResults[0].direct_emissions_tco2e + massResults[1].direct_emissions_tco2e, totalEmissions, '계산은 바뀌지 않는다 — 알림만', 1e-4);

// 근거 조문과 이름 — 운전시간·정격용량을 「A.2 배분키」로 부르지 않는다.
assert.match(FUEL_SPLIT_BASIS_ANCHOR.SUB_METER, /부속서 III A\.1/);
assert.match(FUEL_SPLIT_BASIS_ANCHOR.OUTPUT_MASS, /부속서 III A\.2/);
assert.match(FUEL_SPLIT_BASIS_ANCHOR.ESTIMATE, /부속서 II A\.3\(2\)/);
assert.equal(JSON.stringify(Object.keys(FUEL_SPLIT_BASIS_LABEL)), JSON.stringify(['SUB_METER', 'OUTPUT_MASS', 'ESTIMATE']), '기준은 셋뿐이다');
assert.match(describeFuelSplit(massPlan, 'A', 'L'), /기능단위 기준을 적용/);
assert.match(describeFuelSplit(massPlan, 'A', 'L'), /63\.53%/);
assert.equal(describeFuelSplit(massPlan, '없는 공정', 'L'), '');

// ── 4) 저장을 막는 입력 ──────────────────────────────────────────────
assert.match(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 1860], { group: ' ' })), /계량기 이름/);
assert.match(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 1860], { total: 0 })), /전체 사용량/);
assert.match(validateFuelSplitDraft({ ...draftOf('OUTPUT_MASS', [3240, 1860]), rows: [rows([1, 1])[0]] }), /둘 이상/);
assert.match(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 0])), /생산량이 0/);
assert.match(validateFuelSplitDraft(draftOf('SUB_METER', [7000, 0])), /계량기 값을 0보다 크게/);
assert.match(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 1860]), ['공용 경유 지게차']), /이미 있습니다/, '같은 이름이면 두 연료가 한 그룹으로 묶여 합계 검사가 틀어진다');
assert.equal(validateFuelSplitDraft(draftOf('OUTPUT_MASS', [3240, 1860]), ['다른 계량기']), undefined);

// ── 5) 저장 빌더 — 기존 행을 갱신하고, 빠진 공정은 기록만 지우고, 열 공급원은 건드리지 않는다 ──
const gasPlanForNames = () => computeFuelSplit({ group: '공용 경유 지게차', total: 38500, basis: 'OUTPUT_MASS', note: '', rows: rows([3240, 1860]) });
const dieselA = { ...template, id: 'old-a', ...stamp, period_id: period.id, process_id: 'A', name: '옛 행 A', activity_data: 1, source: '옛 출처', shared_meter: { group: '공용 경유 지게차', installation_total_activity_data: 1, basis: 'OUTPUT_MASS' } };
const dieselC = { ...template, id: 'old-c', ...stamp, period_id: period.id, process_id: 'C', name: '빠진 공정 행', activity_data: 3, source: '옛 출처', shared_meter: { group: '공용 경유 지게차', installation_total_activity_data: 1, basis: 'OUTPUT_MASS' } };
const boilerRow = { ...template, id: 'boiler', ...stamp, period_id: period.id, name: '보일러', activity_data: 9, source: 'x', heat_system: { name: '온수 보일러' }, shared_meter: { group: '공용 경유 지게차', installation_total_activity_data: 1, basis: 'OUTPUT_MASS' } };
const other = { ...template, id: 'other', ...stamp, period_id: period.id, process_id: 'A', name: '같은 공정의 다른 연료', activity_data: 5, source: 'y' };
const rebuilt = buildFuelSplitStreams({ streams: [dieselA, dieselC, boilerRow, other], processes: [processA, processB], plan: massPlan, template, fuelName: '경유', inputUnit: 'L', source: '주유 전표 2025', storedTotal: toStorage(12400) });
assert.equal(rebuilt.update.find((row) => row.id === 'old-a').created_at, dieselA.created_at, '기존 행은 갱신한다 — id·생성일을 지킨다');
assert.equal(rebuilt.update.find((row) => row.id === 'old-a').activity_data, massPlan.shares[0].stored);
const rebuiltGas = buildFuelSplitStreams({ streams: [dieselA], processes: [processA, processB], plan: gasPlanForNames(), template, fuelName: '도시가스', source: '삼천리 고지서', storedTotal: 38500 });
assert.equal(rebuiltGas.update[0].name, '옛 행 A', 'Nm³·t 연료는 다시 나눌 때 담당자가 붙인 행 이름을 지킨다');
assert.match(rebuilt.update.find((row) => row.id === 'old-a').name, /· 7,877\.647 L$/, '리터 연료는 이름에 몫이 들어가므로 새 몫에 맞춰 다시 만든다');
assert.equal(rebuilt.create.length, 1, '없던 공정(B)만 새로 만든다');
assert.equal(rebuilt.create[0].process_id, 'B');
const cleared = rebuilt.update.find((row) => row.id === 'old-c');
assert.equal(cleared.shared_meter, undefined, '빠진 공정의 행은 공용 계량기 기록만 지운다');
assert.equal(cleared.activity_data, 3, '활동량은 앱이 모르므로 그대로 둔다');
assert.ok(!rebuilt.update.some((row) => row.id === 'boiler' || row.id === 'other'), '열 공급원 행과 같은 공정의 다른 연료는 건드리지 않는다');
const releasedRows = buildFuelSplitRelease([dieselA, dieselC, boilerRow, other], '공용 경유 지게차', period.id);
assert.equal(JSON.stringify(releasedRows.map((row) => row.id)), JSON.stringify(['old-a', 'old-c']));
assert.ok(releasedRows.every((row) => row.shared_meter === undefined && row.activity_data > 0));
assert.equal(buildFuelSplitRelease([dieselA], '없는 계량기', period.id).length, 0);
assert.equal(buildFuelSplitRelease([dieselA], '공용 경유 지게차', 'other-period').length, 0, '다른 보고기간의 같은 이름은 다른 계량기다');

// 이름·출처·단위
assert.match(massBuilt.create[0].name, /^경유 · 공용 경유 지게차 · STS 나사 공정 · 7,877\.647 L$/);
assert.match(massBuilt.create[0].source, /^주유 전표 2025 · 공용 계량기 「공용 경유 지게차」 몫 7,877\.647 L$/);
assert.equal(massBuilt.create[0].activity_unit, 't', 'EU 템플릿 단위는 t·Nm³ — 리터는 t로 환산해 저장한다');
assert.equal(shortProcessName('STS 나사 공정 (냉간압조)'), 'STS 나사 공정');
assert.equal(shortProcessName('탄소강 나사 공정 — EU 수출 없음'), '탄소강 나사 공정');
assert.equal(shortProcessName('단순공정'), '단순공정');
near(tonnesToLitres(toStorage(12400), DENSITY), 12400, '다시 나누기 화면이 t를 리터로 되돌린다', 1e-2);

// Nm³ 연료(변환 없음)
const gasTemplate = { ...template, activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1 };
const gasPlan = computeFuelSplit({ group: '공용 가열로', total: 38500, basis: 'OUTPUT_MASS', note: '', rows: rows([3240, 1860]) });
assert.equal(gasPlan.shares[0].amount, 24458.823529, 'Nm³는 환산 없이 그대로');
assert.equal(gasPlan.shares[0].stored, gasPlan.shares[0].amount);
const gasBuilt = buildFuelSplitStreams({ streams: [], processes: [processA, processB], plan: gasPlan, template: gasTemplate, fuelName: '도시가스', source: '삼천리 고지서', storedTotal: 38500 });
assert.match(gasBuilt.create[0].name, /^도시가스 · 공용 가열로 · STS 나사 공정$/, 'Nm³ 이름에는 리터 표기가 없다');

// ── 6) 배선 — 화면은 빌더와 공유 검증만 거친다 ────────────────────────
const component = readFileSync('src/components/guided/FuelSplit.tsx', 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /<FuelSplit\s+processes=\{data\.processes\}\s+sourceStreams=\{data\.sourceStreams\}\s+results=\{data\.results\}\s+onApplied=\{onSaved\}\s*\/>/, '4단계 패널이 연료 나누기를 싣지 않는다');
const writes = [...component.matchAll(/(createLocalItem|updateLocalItem)\('([a-z_]+)', ([A-Za-z]+|\{)/g)].map((match) => `${match[1]}:${match[2]}`);
assert.equal(JSON.stringify(writes), JSON.stringify(['updateLocalItem:source_streams', 'createLocalItem:source_streams', 'updateLocalItem:processes']), '저장 경로가 늘거나 줄었다 — persistFuelChanges만 거쳐야 한다');
assert.equal([...component.matchAll(/await persistFuelChanges\(/g)].length, 2, '적용·해제 두 경로가 같은 저장 함수를 거친다');
assert.match(component, /direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions\(process\.id, nextStreams\)/, '바뀐 공정의 직접배출 캐시를 변경 후 연료 목록으로 다시 맞춘다');
assert.match(component, /createSourceStreamValidationErrors\(row\)/, '저장하는 행마다 상세 화면과 같은 검증을 거치지 않는다');
assert.match(component, /buildFuelSplitStreams\(\{/);
assert.ok(!/activity_data:/.test(component), '화면이 활동량 매핑을 직접 적는다 — 매핑은 fuel-allocation.ts 한 곳에만 둔다');
assert.ok(!/useState\([^\n]*process[.?]/.test(component), 'useState 초깃값이 공정 값을 읽는다 — 폼을 열 때 채워야 옛 값이 굳지 않는다');

console.log('Fuel allocation verification passed (합계 = 고지서 · 기준 3종 · 엔진 끝에서 끝까지 · 추정은 확인 필요 · 빌더 보존 · 배선).');
