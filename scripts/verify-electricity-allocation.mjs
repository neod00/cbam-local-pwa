// 공용 전력 계량기 나누기(CBAM-ALLOC-ELEC-01)를 잠근다 (2026-10-05).
//
// 종전: 담당자가 엑셀로 공정별 전력 몫을 계산해 공정마다 따로 적었다. 근거는 자유 서술 한 줄이었고,
// 공정 합계가 고지서와 맞는지는 아무도 검사하지 않았다(연료에는 공용 계량기 검사가 있었다).
// 지금: 사업장 전체 값과 기준을 받아 앱이 나누고, 엔진이 합계를 계속 검사한다.
//
// 여기서 못 박는 것:
//   1) 나눈 합계는 고지서 값과 **정확히** 같다(반올림 끝수는 가장 큰 몫에).
//   2) 기준은 2025/2547 원문에 있는 셋뿐이다 — 계량기 값(A.1 식 41·42) · 생산량(A.2 기능단위) · 간접결정 추정(부속서 II A.3(2)).
//   3) 엔진은 이 기록으로 **산술을 바꾸지 않는다.** 나눈 값은 electricity_mwh에 이미 들어 있다.
//      그래서 이 필드를 모르는 옛 버전 앱·옛 백업도 같은 숫자를 낸다.
//   4) 나눈 뒤 한 공정의 전력만 손으로 고치거나 생산량이 바뀌면 엔진이 알린다.
//   5) 화면은 필드 매핑을 직접 적지 않고 빌더만 쓴다.
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
  strip('src/lib/electricity-allocation.ts'),
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  'globalThis.app = { calculateLocalResults, checkElectricitySharedMeters, isElectricitySplitStale, validateElectricitySplitDraft, computeElectricitySplit, describeElectricitySplit, buildElectricitySplitUpdates, buildElectricitySplitRelease, ALLOCATION_RULES, ELECTRICITY_SPLIT_BASIS_ANCHOR, ELECTRICITY_SPLIT_BASIS_LABEL };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const {
  calculateLocalResults, checkElectricitySharedMeters, isElectricitySplitStale, validateElectricitySplitDraft,
  computeElectricitySplit, describeElectricitySplit, buildElectricitySplitUpdates, buildElectricitySplitRelease,
  ALLOCATION_RULES, ELECTRICITY_SPLIT_BASIS_ANCHOR, ELECTRICITY_SPLIT_BASIS_LABEL,
} = context.app;

const near = (actual, expected, label, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${label}: ${actual} (기대 ${expected})`);
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'period', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const sts = { id: 'sts', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const carbon = { id: 'carbon', name: '탄소강 나사', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'NON_CBAM_COPRODUCT', ...stamp };
const makeProcess = (overrides) => ({
  period_id: period.id, production_route: '가공', market_output_mass_t: 0, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 50, electricity_ef_tco2e_per_mwh: 0.4747, electricity_ef_source: 'COUNTRY_GRID_DEFAULT', ...stamp, ...overrides,
});
const processA = makeProcess({ id: 'A', product_id: sts.id, name: 'STS 나사 공정', output_mass_t: 3240, electricity_mwh: 3438.2 });
const processB = makeProcess({ id: 'B', product_id: carbon.id, name: '탄소강 나사 공정', output_mass_t: 1860, electricity_mwh: 1973.8 });
const run = (processes) => calculateLocalResults({ products: [sts, carbon], periods: [period], processes, precursors: [] });
const massDraft = {
  group: '한전 계량기', totalMwh: 5412, basis: 'OUTPUT_MASS', note: '',
  rows: [{ processId: 'A', processName: processA.name, value: 3240 }, { processId: 'B', processName: processB.name, value: 1860 }],
};

// ── 1) 생산량 비율 — 손으로 계산하던 값(3,438.2 / 1,973.8)과 같은 답, 합계는 정확히 고지서 값 ──
assert.equal(validateElectricitySplitDraft(massDraft), undefined);
const massPlan = computeElectricitySplit(massDraft);
assert.equal(massPlan.shares[0].mwh, 3438.2118, 'STS 몫 = 5,412 × 3,240 / 5,100');
assert.equal(massPlan.shares[1].mwh, 1973.7882, '탄소강 몫 = 5,412 × 1,860 / 5,100');
near(massPlan.shares[0].mwh + massPlan.shares[1].mwh, 5412, '나눈 합계 = 고지서 값');
near(massPlan.factor, 5412 / 5100, '계수');
assert.equal(massPlan.caution, undefined, '생산량 비율에는 계량 편차 경고가 없다');

// 반올림 끝수는 가장 큰 몫에 — 3등분해도 합계가 100이다.
const thirds = computeElectricitySplit({ group: 'm', totalMwh: 100, basis: 'OUTPUT_MASS', note: '', rows: ['x', 'y', 'z'].map((id) => ({ processId: id, processName: id, value: 1 })) });
near(thirds.shares.reduce((sum, share) => sum + share.mwh, 0), 100, '3등분 합계');
assert.equal(JSON.stringify(thirds.shares.map((share) => share.mwh)), JSON.stringify([33.3334, 33.3333, 33.3333]));

// ── 2) 계량기 값 — 합계를 사업장 값에 맞춘다(식 41·42) ─────────────────
const meterDraft = { ...massDraft, basis: 'SUB_METER', rows: [{ ...massDraft.rows[0], value: 3000 }, { ...massDraft.rows[1], value: 2000 }] };
const meterPlan = computeElectricitySplit(meterDraft);
near(meterPlan.factor, 1.0824, 'RecF = 5,412 / 5,000');
assert.equal(meterPlan.shares[0].mwh, 3247.2);
assert.equal(meterPlan.shares[1].mwh, 2164.8);
assert.equal(meterPlan.caution, undefined, '8% 차이는 권고 한도(20%) 안이다');
assert.match(describeElectricitySplit(meterPlan, 'A'), /RecF = 1\.0824/);
assert.match(describeElectricitySplit(meterPlan, 'A'), /식 41·42/);
assert.ok(computeElectricitySplit({ ...meterDraft, totalMwh: 10000 }).caution, '계량기 합계가 전체의 절반이면 단위·누락을 의심하라고 알린다');

// 근거 조문이 기준마다 다르다 — 운전시간·정격용량을 「A.2 배분키」로 부르지 않는다.
assert.match(ELECTRICITY_SPLIT_BASIS_ANCHOR.SUB_METER, /부속서 III A\.1/);
assert.match(ELECTRICITY_SPLIT_BASIS_ANCHOR.OUTPUT_MASS, /부속서 III A\.2/);
assert.match(ELECTRICITY_SPLIT_BASIS_ANCHOR.INDIRECT_ESTIMATE, /부속서 II A\.3\(2\)/);
assert.equal(JSON.stringify(Object.keys(ELECTRICITY_SPLIT_BASIS_LABEL)), JSON.stringify(['SUB_METER', 'OUTPUT_MASS', 'INDIRECT_ESTIMATE']), '기준은 셋뿐이다');
assert.match(describeElectricitySplit(massPlan, 'A'), /기능단위 기준/);
assert.match(describeElectricitySplit(massPlan, 'A'), /3,438\.2118 MWh \(63\.53%\)/);
assert.equal(describeElectricitySplit(massPlan, '없는 공정'), '');
assert.equal(ALLOCATION_RULES.ELECTRICITY_SHARED_METER.id, 'CBAM-ALLOC-ELEC-01');

// ── 3) 저장을 막는 입력 ──────────────────────────────────────────────
assert.match(validateElectricitySplitDraft({ ...massDraft, group: ' ' }), /계량기 이름/);
assert.match(validateElectricitySplitDraft({ ...massDraft, totalMwh: 0 }), /공장 전체 전력 사용량/);
assert.match(validateElectricitySplitDraft({ ...massDraft, rows: [massDraft.rows[0]] }), /둘 이상/);
assert.match(validateElectricitySplitDraft({ ...massDraft, rows: [massDraft.rows[0], { ...massDraft.rows[1], value: 0 }] }), /생산량이 0/);
assert.match(validateElectricitySplitDraft({ ...meterDraft, rows: [meterDraft.rows[0], { ...meterDraft.rows[1], value: 0 }] }), /계량기 값/);
const estimateDraft = { ...meterDraft, basis: 'INDIRECT_ESTIMATE' };
assert.match(validateElectricitySplitDraft(estimateDraft), /추정 근거/, '추정으로 나누면 근거가 필수다(부속서 II A.3(7)·(8))');
assert.equal(validateElectricitySplitDraft({ ...estimateDraft, note: '명판 정격 × 가동일지' }), undefined);
assert.match(describeElectricitySplit(computeElectricitySplit({ ...estimateDraft, note: '명판 정격 × 가동일지' }), 'B'), /간접결정방법.*근거: 명판 정격 × 가동일지/);

// ── 4) 공정 레코드에 얹기 — 기존 필드를 지키고, 빠진 공정은 기록을 지운다 ──
const processC = makeProcess({ id: 'C', product_id: carbon.id, name: '예전 멤버', output_mass_t: 10, electricity_mwh: 7, electricity_shared_meter: { group: '한전 계량기', installation_total_mwh: 5000, basis: 'OUTPUT_MASS', basis_value: 10 }, electricity_allocation_note: '옛 근거' });
const processD = makeProcess({ id: 'D', product_id: carbon.id, name: '무관한 공정', output_mass_t: 10, electricity_mwh: 9 });
const updates = buildElectricitySplitUpdates([processA, processB, processC, processD], massPlan);
assert.equal(JSON.stringify(updates.map((process) => process.id)), JSON.stringify(['A', 'B', 'C']), '바뀐 공정만 돌려준다');
const [updatedA, updatedB, updatedC] = updates;
assert.equal(updatedA.electricity_mwh, 3438.2118);
assert.equal(updatedA.electricity_ef_tco2e_per_mwh, 0.4747, '배출계수는 건드리지 않는다');
assert.equal(updatedA.created_at, processA.created_at);
assert.equal(updatedA.direct_attributable_emissions_tco2e, 50);
assert.equal(JSON.stringify(updatedA.electricity_shared_meter), JSON.stringify({ group: '한전 계량기', installation_total_mwh: 5412, basis: 'OUTPUT_MASS', basis_value: 3240 }));
assert.equal(updatedA.electricity_allocation_note, describeElectricitySplit(massPlan, 'A'));
assert.equal(updatedB.electricity_shared_meter.basis_value, 1860);
assert.equal(updatedC.electricity_shared_meter, undefined, '그룹에서 빠진 공정은 기록을 지운다 — 남기면 합계 검사가 계속 센다');
assert.equal(updatedC.electricity_allocation_note, undefined);
assert.equal(updatedC.electricity_mwh, 7, '빠진 공정의 전력량은 건드리지 않는다');

const released = buildElectricitySplitRelease([updatedA, updatedB, processD], '한전 계량기', period.id);
assert.equal(released.length, 2);
assert.ok(released.every((process) => process.electricity_shared_meter === undefined && process.electricity_allocation_note === undefined));
assert.equal(released[0].electricity_mwh, 3438.2118, '해제해도 전력량은 남는다');

// ── 5) 합계 검사 ─────────────────────────────────────────────────────
const healthy = checkElectricitySharedMeters([updatedA, updatedB, processD]);
assert.equal(healthy.length, 1);
assert.equal(healthy[0].reason, '');
assert.equal(healthy[0].basis, 'OUTPUT_MASS');
near(healthy[0].sum_mwh, 5412, '그룹 합계');
assert.equal(JSON.stringify(healthy[0].process_ids), JSON.stringify(['A', 'B']));
assert.equal(checkElectricitySharedMeters([processA, processB]).length, 0, '기록이 없는 옛 자료는 그룹이 없다');

const handEdited = { ...updatedA, electricity_mwh: 3000 };
assert.match(checkElectricitySharedMeters([handEdited, updatedB])[0].reason, /합계 4973\.7882 MWh가 사업장 계량값 5412 MWh와 다릅니다/);
assert.match(checkElectricitySharedMeters([updatedA])[0].reason, /하나만 남았습니다/);
const otherTotal = { ...updatedB, electricity_shared_meter: { ...updatedB.electricity_shared_meter, installation_total_mwh: 6000 } };
assert.match(checkElectricitySharedMeters([updatedA, otherTotal])[0].reason, /전체 계량값이 서로 다릅니다/);
const otherBasis = { ...updatedB, electricity_shared_meter: { ...updatedB.electricity_shared_meter, basis: 'SUB_METER' } };
const mixed = checkElectricitySharedMeters([updatedA, otherBasis])[0];
assert.equal(mixed.basis, 'MIXED');
assert.match(mixed.reason, /기준이 다릅니다/);
// 기간이 다르면 이름이 같아도 다른 계량기다 — 두 해를 한 합계로 묶지 않는다.
assert.equal(checkElectricitySharedMeters([updatedA, { ...updatedB, period_id: 'other' }]).length, 2);

assert.equal(isElectricitySplitStale(updatedA, 3240), false);
assert.equal(isElectricitySplitStale(updatedA, 3250), false, '0.5% 안쪽 변화는 넘긴다');
assert.equal(isElectricitySplitStale(updatedA, 3300), true);
assert.equal(isElectricitySplitStale({ electricity_shared_meter: { ...updatedA.electricity_shared_meter, basis: 'SUB_METER' } }, 9999), false, '계량기 값으로 나눈 것은 생산량과 무관하다');
assert.equal(isElectricitySplitStale(processA, 1), false);

// ── 6) 엔진은 산술을 바꾸지 않는다 ───────────────────────────────────
const NUMERIC_KEYS = ['indirect_emissions_gross_tco2e', 'indirect_emissions_excluded_tco2e', 'own_indirect_see', 'indirect_see', 'direct_see', 'see_cbam_basis', 'see_informational_total', 'activity_level_t'];
const numbersOf = (results) => JSON.stringify(results.map((result) => NUMERIC_KEYS.map((key) => result[key])));
const stripMeter = (process) => ({ ...process, electricity_shared_meter: undefined, electricity_allocation_note: undefined });
const withMeter = run([updatedA, updatedB]);
const withoutMeter = run([updatedA, updatedB].map(stripMeter));
assert.equal(numbersOf(withMeter), numbersOf(withoutMeter), '기록이 있든 없든 숫자가 같다 — 옛 버전 앱도 같은 답을 낸다');
near(withMeter[0].indirect_emissions_gross_tco2e, 3438.2118 * 0.4747, '전력 간접배출 = 나눈 몫 × 계수');
const meterWarnings = (results) => results.flatMap((result) => result.warnings).filter((warning) => warning.includes('전력 공용 계량기'));
assert.equal(meterWarnings(withMeter).length, 0, '합계가 맞으면 조용하다');
assert.equal(meterWarnings(run([processA, processB])).length, 0, '기록이 없는 옛 자료는 조용하다');

const edited = run([handEdited, updatedB]);
assert.ok(edited.every((result) => result.warnings.some((warning) => warning.includes("전력 공용 계량기 '한전 계량기'") && warning.includes('합계') && warning.includes(ALLOCATION_RULES.ELECTRICITY_SHARED_METER.anchor))), '합계가 어긋나면 같이 쓰는 공정 모두에 알린다');
near(edited[0].indirect_emissions_gross_tco2e, 3000 * 0.4747, '어긋나도 엔진이 값을 고쳐 쓰지 않는다 — 저장된 값 그대로 계산하고 알리기만 한다');

const grown = run([{ ...updatedA, output_mass_t: 3300 }, updatedB]);
assert.match(meterWarnings(grown).join('\n'), /생산량이 바뀌었습니다\(나눌 때 3240 t → 지금 3300 t\)/);
assert.equal(meterWarnings(grown).length, 1, '생산량이 바뀐 공정에만 알린다');

// ── 7) 배선 — 화면은 빌더만 쓴다 ─────────────────────────────────────
const component = readFileSync('src/components/guided/ElectricitySplit.tsx', 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
const db = readFileSync('src/lib/local-db.ts', 'utf8');
assert.match(db, /electricity_shared_meter\?: ElectricitySharedMeter;/, '공정 레코드에 기록 자리가 없다');
assert.match(panels, /<ElectricitySplit\b/, '5단계 패널이 나누기를 싣지 않는다');
assert.match(
  panels,
  /await onSaved\(\);\s*setSplitRevision\(\(revision\) => revision \+ 1\);/,
  '나눈 뒤 전력 폼을 다시 만들지 않는다 — 옛 값이 입력칸에 남아, 그대로 저장하면 나눈 값을 덮어쓴다'
);
assert.match(panels, /<Fragment key=\{splitRevision\}>\s*<ElectricityForm\s+key=\{process\.id\}/, '전력 폼이 나누기 개정 번호에 묶여 있지 않다');
const writes = [...component.matchAll(/updateLocalItem\('processes', ([A-Za-z]+)\)/g)].map((match) => match[1]);
assert.equal(JSON.stringify(writes), JSON.stringify(['updatedProcess', 'releasedProcess']), '공정 저장 경로가 늘거나 줄었다 — 빌더를 거치는지 확인할 것');
assert.match(component, /for \(const updatedProcess of splitUpdates\)/);
assert.match(component, /const splitUpdates = buildElectricitySplitUpdates\(processes, plan\);/);
assert.match(component, /const releaseUpdates = buildElectricitySplitRelease\(/);
assert.ok(!/electricity_mwh:/.test(component), '화면이 전력량 매핑을 직접 적는다 — 매핑은 electricity-allocation.ts 한 곳에만 둔다');
assert.ok(!/useState\([^\n]*process[.?]/.test(component), 'useState 초깃값이 공정 값을 읽는다 — 폼을 열 때 채워야 옛 값이 굳지 않는다');
// 백업: 나눈 값이 electricity_mwh에 있으므로 format_version을 올리지 않는다. 올리면 옛 앱이 멀쩡한 백업을 거부한다.
assert.ok(!/format_version:[^\n]*electricity_shared_meter/.test(db), '전력 나누기 기록으로 백업 format_version을 올리지 말 것');

console.log('Electricity shared meter verification passed (합계 = 고지서 · 기준 3종 · 엔진 산술 불변 · 어긋남·생산량 변경 알림 · 빌더 배선).');
