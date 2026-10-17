// 외주처 전력(간접배출) 몫 — 1단계(저장 칸 · 자체 몫 계산 · 세 곳 보정 · 점검). 설계: docs/harness/outsourced-electricity-design.md
//
// 잠그는 것:
//  1) 합계는 electricity_mwh에 이미 들어 있다 — 엔진 결과는 `outsourced_electricity` 기록이 있든 없든 같다(옛 앱도 같은 숫자).
//  2) 자체 몫 = 합계 − 외주 몫. 공용 계량기 합계 검사는 자체 몫으로 센다(외주 몫이 섞여도 거짓 경고가 없다).
//  3) 전력을 다시 나눠도 외주 몫이 합계에 남는다(덮어써지지 않는다). 전력 직접 수정도 마찬가지.
//  4) 점검 OUTE01·02·03·04와 귀속 점검 V10 줄(외주 전력도 연료와 같은 줄).
//  5) 외주 몫 계산은 연료와 같은 네 방법(MWh 단위).
//  6) 화면 배선: 세 입력 경로(지도 5단계·대화 모드·공정 상세)가 자체 몫을 보여 주고 합계를 지킨다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const fflate = createRequire(import.meta.url)('fflate');
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireFrom = (request) => (request === 'fflate' ? fflate : load(`${request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(full), request)}.ts`));
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Blob, Intl, Uint8Array, console, Date, navigator: undefined, DOMParser: undefined })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const own = load('src/lib/electricity-own-share.ts');
const O = load('src/lib/outsourced-process.ts');
const rules = load('src/lib/allocation-rules.ts');
const split = load('src/lib/electricity-allocation.ts');
const edit = load('src/lib/guided-edit.ts');
const attribution = load('src/lib/attribution-status.ts');
const engine = load('src/lib/calculation-engine.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

const times = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const shareBase = { subcontractor: '가상 코팅 B사', technique: 'ZINC_FLAKE_COATING', technique_evidence: '비전해 침지·소부 방식(공정 설명서)', basis: 'RECONSTRUCTED', company_total: 400, note: '설비 소비율 × 가동시간으로 재구성', evidence: '외주처 전력 고지서', mwh: 120, same_grid: true };

// ── 1) 자체 몫 계산 ────────────────────────────────────────────────
const proc = (patch = {}) => ({ id: 'p1', name: '볼트 공정', period_id: 'per', electricity_mwh: 520, electricity_ef_tco2e_per_mwh: 0.4747, ...patch });
const withOut = proc({ outsourced_electricity: [shareBase] });
assert.equal(own.outsourcedElectricityMwh(proc()), 0, '외주 몫이 없으면 0');
assert.equal(own.outsourcedElectricityMwh(withOut), 120);
assert.equal(own.ownElectricityMwh(withOut), 400, '자체 몫 = 520 − 120');
assert.equal(own.ownElectricityMwh(proc()), 520, '외주 몫이 없으면 합계가 곧 자체 몫(옛 자료 그대로)');
assert.equal(own.ownElectricityMwh(proc({ electricity_mwh: 100, outsourced_electricity: [shareBase] })), 0, '합계가 외주 몫보다 작으면 0(점검이 따로 알린다)');
assert.equal(own.electricityTotalFromOwn(withOut, 450), 570, '자체 몫을 바꾸면 합계 = 자체 + 외주');
assert.equal(own.electricityTotalFromOwn(proc(), 450), 450, '외주 몫이 없으면 합계 = 입력값');
assert.equal(own.outsourcedElectricityMwh(proc({ outsourced_electricity: [shareBase, { ...shareBase, subcontractor: '가상 열처리 C사', mwh: 30.5 }] })), 150.5, '외주처가 둘이면 합산');

// ── 2) 외주 몫 계산은 연료와 같은 네 방법(MWh) ─────────────────────────
// 설계 §3 사례: 총 400 MWh, 우리 코팅라인 600 h × 0.02 = 12, 타사 900 × 0.02 = 18, 기타 1,000 × 0.01 = 10 → 합 40, 보정계수 10 → 120
const reconstructed = O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', company_total: 400, equipment: [
  { name: '우리 코팅라인', hours: 600, rate_per_h: 0.02, ours: true }, { name: '타사 라인', hours: 900, rate_per_h: 0.02 }, { name: '기타', hours: 1000, rate_per_h: 0.01 }] });
assert.equal(reconstructed.ok, true);
close(reconstructed.share, 120, '재구성 120 MWh');
const byMass = O.computeOutsourcedShare({ basis: 'OUTPUT_MASS', line_quantity: 90, our_throughput_t: 300, line_throughput_t: 1000 });
close(byMass.share, 27, '처리 중량 비율 27 MWh');

// ── 3) 엔진 결과는 외주 기록이 있든 없든 같다 ───────────────────────────
{
  const period = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...times };
  const product = { id: 'g', name: '볼트', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...times };
  const row = (extra) => ({ id: 'p1', period_id: 'per', product_id: 'g', name: '볼트 공정', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 0, internal_consumption_mass_t: 0,
    direct_attributable_emissions_tco2e: 0, direct_emissions_input_mode: 'MANUAL_TOTAL', electricity_mwh: 520, electricity_ef_tco2e_per_mwh: 0.4747, no_purchased_precursors: true, ...times, ...extra });
  const run = (processRow) => engine.calculateLocalResults({ products: [product], periods: [period], processes: [processRow], precursors: [], sourceStreams: [] });
  const plainRun = run(row({}));
  const metaRun = run(row({ outsourced_electricity: [shareBase] }));
  assert.deepEqual(plain(metaRun), plain(plainRun), '`outsourced_electricity` 기록은 엔진 결과를 바꾸지 않는다(옛 앱도 같은 숫자)');
  const indirect = metaRun[0].own_indirect_see;
  close(indirect, (520 * 0.4747) / 1000, '간접 SEE는 합계 520 MWh × 계수 ÷ 생산량이다(외주 몫 포함)', 1e-9);
  // 저장했다 읽어도 필드가 남고, 필드가 없는 옛 공정도 그대로 유효하다
  assert.deepEqual(plain(JSON.parse(JSON.stringify(row({ outsourced_electricity: [shareBase] }))).outsourced_electricity), plain([shareBase]));
  assert.equal(JSON.parse(JSON.stringify(row({}))).outsourced_electricity, undefined);
}

// ── 4) 공용 계량기 합계 검사는 자체 몫으로 센다 ─────────────────────────
// 사업장 고지서 1,000 MWh를 두 공정이 나눠 쓴다. p1은 자체 400 + 외주 120 = 520, p2는 600.
const meter = { group: '본사 한전', installation_total_mwh: 1000, basis: 'OUTPUT_MASS', basis_value: 1 };
const p1 = proc({ id: 'p1', electricity_mwh: 520, outsourced_electricity: [shareBase], electricity_shared_meter: meter });
const p2 = proc({ id: 'p2', name: '2공정', electricity_mwh: 600, electricity_shared_meter: meter });
const meters = rules.checkElectricitySharedMeters([p1, p2]);
assert.equal(meters.length, 1);
assert.equal(meters[0].reason, '', '외주 몫이 섞여도 「합계가 다르다」는 거짓 경고가 없다');
close(meters[0].sum_mwh, 1000, '그룹 합계는 자체 몫의 합');
// 외주 몫이 없는 자료는 종전과 같다
assert.equal(rules.checkElectricitySharedMeters([{ ...p1, outsourced_electricity: undefined, electricity_mwh: 400 }, p2])[0].reason, '');
// 진짜로 어긋나면 여전히 잡는다
assert.ok(rules.checkElectricitySharedMeters([{ ...p1, electricity_mwh: 700 }, p2])[0].reason.includes('다릅니다'), '자체 몫이 어긋나면 경고');

// ── 5) 전력을 다시 나눠도 외주 몫이 남는다 ───────────────────────────────
{
  const draft = { group: '본사 한전', totalMwh: 1000, basis: 'OUTPUT_MASS', note: '', rows: [
    { processId: 'p1', processName: '볼트 공정', value: 3000 }, { processId: 'p2', processName: '2공정', value: 2000 }] };
  const plan = split.computeElectricitySplit(draft);
  const updates = split.buildElectricitySplitUpdates([p1, p2], plan);
  const u1 = updates.find((item) => item.id === 'p1');
  const u2 = updates.find((item) => item.id === 'p2');
  close(u1.electricity_mwh, 600 + 120, '나눈 자체 몫 600 + 외주 몫 120 = 720');
  close(u2.electricity_mwh, 400, '외주 몫이 없는 공정은 나눈 값 그대로');
  assert.deepEqual(plain(u1.outsourced_electricity), plain([shareBase]), '외주 몫 기록이 유지된다');
  assert.equal(rules.checkElectricitySharedMeters(updates)[0].reason, '', '나눈 직후 합계 검사가 조용하다');
  // 두 번 나눠도 같다(합계가 불어나지 않는다)
  const again = split.buildElectricitySplitUpdates(updates, plan);
  close(again.find((item) => item.id === 'p1').electricity_mwh, 720, '다시 나눠도 합계가 불어나지 않는다');
  // 해제해도 전력량·외주 몫은 건드리지 않는다
  const released = split.buildElectricitySplitRelease(updates, '본사 한전', 'per');
  close(released.find((item) => item.id === 'p1').electricity_mwh, 720);
  assert.ok(released.find((item) => item.id === 'p1').outsourced_electricity);
}

// ── 6) 전력 직접 수정은 자체 몫으로 받고 합계에 외주 몫을 얹는다 ─────────
{
  const draft = { mwh: 450, ef: 0.4747, efSource: 'COUNTRY_GRID_DEFAULT' };
  const updated = edit.buildElectricityUpdate(withOut, draft);
  close(updated.electricity_mwh, 570, '자체 450 + 외주 120');
  assert.deepEqual(plain(updated.outsourced_electricity), plain([shareBase]));
  close(edit.buildElectricityUpdate(proc(), draft).electricity_mwh, 450, '외주 몫이 없으면 입력값 그대로(종전과 같다)');
}

// ── 7) 저장 전 검사와 점검 OUTE01~04 · 귀속 점검 V10 ─────────────────────
assert.deepEqual(plain(O.validateOutsourcedElectricityShare(shareBase).errors), [], '갖춰진 외주 전력 몫은 저장된다');
assert.ok(O.validateOutsourcedElectricityShare({ ...shareBase, technique: 'ELECTROPLATING' }).errors.some((message) => message.includes('전기도금')), '전기도금은 거부');
assert.ok(O.validateOutsourcedElectricityShare({ ...shareBase, mwh: 0 }).errors.some((message) => message.includes('우리 몫')), '우리 몫 0은 거부');
assert.ok(O.validateOutsourcedElectricityShare({ ...shareBase, same_grid: false }).errors.some((message) => message.includes('같은 나라')), '다른 나라 계통이면 받지 않는다');
assert.ok(O.validateOutsourcedElectricityShare({ ...shareBase, basis: 'CONSERVATIVE_ESTIMATE', note: '' }).errors.length >= 1, '보수적 추정은 근거 필수');

const codes = (processes) => plain(O.checkOutsourcedElectricity(processes).map((issue) => issue.code));
assert.deepEqual(codes([p1, p2]), [], '갖춰진 외주 전력 몫은 조용하다');
assert.deepEqual(codes([{ ...p1, outsourced_electricity: [{ ...shareBase, basis: 'CONSERVATIVE_ESTIMATE' }] }]), ['OUTE01'], '추정은 확인 필요');
assert.deepEqual(codes([{ ...p1, outsourced_electricity: [{ ...shareBase, note: '' }] }]), ['OUTE01'], '근거가 비면 확인 필요');
assert.deepEqual(codes([{ ...p1, electricity_mwh: 80 }]), ['OUTE02'], '합계가 외주 몫보다 작으면 수정 필요');
assert.deepEqual(codes([{ ...p1, outsourced_electricity: [{ ...shareBase, same_grid: false }] }]), ['OUTE03'], '같은 나라 확인이 없으면 수정 필요');
assert.deepEqual(codes([{ ...p1, outsourced_electricity: [{ ...shareBase, mwh: 450 }], electricity_mwh: 900 }]), ['OUTE04'], '우리 몫이 외주처 전체 전력보다 크면 수정 필요');
assert.deepEqual(codes([proc()]), [], '외주 몫이 없는 공정은 점검하지 않는다');
assert.equal(O.checkOutsourcedElectricity([{ ...p1, electricity_mwh: 80 }])[0].level, 'fix');
assert.equal(O.checkOutsourcedElectricity([{ ...p1, outsourced_electricity: [{ ...shareBase, note: '' }] }])[0].level, 'review');

const statusOf = (processes) => attribution.buildAttributionStatus({ processes, productOutputLines: [], sourceStreams: [], precursorCount: 0, results: [], hrefOf: () => '/' });
assert.equal(statusOf([proc()]).rows.some((item) => item.id === 'OUTSOURCED'), false, '외주 몫이 없으면 표는 그대로다');
assert.equal(statusOf([p1, p2]).rows.find((item) => item.id === 'OUTSOURCED').status, 'ok');
assert.equal(statusOf([{ ...p1, outsourced_electricity: [{ ...shareBase, note: '' }] }]).rows.find((item) => item.id === 'OUTSOURCED').status, 'review');
const fixRow = statusOf([{ ...p1, electricity_mwh: 80 }]).rows.find((item) => item.id === 'OUTSOURCED');
assert.equal(fixRow.status, 'fix');
assert.equal(fixRow.code, 'V10');

// ── 8) 화면 배선: 세 입력 경로가 자체 몫을 보여 주고 합계를 지킨다 ───────────
{
  const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
  assert.ok(panels.includes('ownElectricityMwh(process)') && panels.includes('outsourcedElectricityMwh(process)'), '지도 5단계 입력은 자체 몫으로 채우고 외주 몫을 따로 보여 준다');
  const talk = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
  assert.ok(talk.includes('ownElectricityMwh(focusProcess)'), '대화 모드 전력 입력은 자체 몫으로 채운다');
  const page = readFileSync('src/app/processes/page.tsx', 'utf8');
  assert.ok(page.includes('ownElectricityMwh(editProcess)') && page.includes('ownElectricityMwh(process)'), '공정 상세 화면은 자체 몫을 보여 준다');
  assert.ok(page.includes('electricityTotalFromOwn(existingProcess, newItem.electricity_mwh)'), '공정 상세 화면은 저장할 때 외주 몫을 합계에 얹는다');
  assert.ok(readFileSync('src/components/guided/ElectricitySplit.tsx', 'utf8').includes('ownElectricityMwh(process)'), '전력 나누기 미리 채움은 자체 몫 합계');
}

// ── 9) 2단계: 입력 화면이 쓰는 순수 저장·삭제·묶기 ──────────────────────
{
  const infoOf = (patch = {}) => { const info = { ...shareBase }; delete info.mwh; delete info.same_grid; return { ...info, ...patch }; };
  const base1 = proc({ id: 'p1', electricity_mwh: 400 });
  const base2 = proc({ id: 'p2', name: '2공정', electricity_mwh: 600 });
  const processes = [base1, base2];
  // 두 공정에 3 : 1로 나눠 저장 — 자체 몫은 그대로, 합계 = 자체 + 외주 몫
  const saved = O.buildOutsourcedElectricityUpdates(processes, { info: infoOf(), sameGrid: true, total: 120, targets: [{ processId: 'p1', fraction: 0.75 }, { processId: 'p2', fraction: 0.25 }] });
  assert.equal(saved.ok, true);
  assert.equal(saved.updates.length, 2);
  const s1 = saved.updates.find((item) => item.id === 'p1');
  const s2 = saved.updates.find((item) => item.id === 'p2');
  close(s1.electricity_mwh, 400 + 90, 'p1 합계 = 자체 400 + 외주 90');
  close(s2.electricity_mwh, 600 + 30, 'p2 합계 = 자체 600 + 외주 30');
  assert.equal(s1.outsourced_electricity[0].total_share, 120, '총 몫이 기록된다');
  assert.equal(s1.outsourced_electricity[0].same_grid, true);
  close(own.ownElectricityMwh(s1), 400, '저장해도 자체 몫은 그대로');
  // 묶기: 두 공정이 한 건
  const groups = O.groupOutsourcedElectricity(saved.updates);
  assert.equal(groups.length, 1);
  close(groups[0].total, 120, '묶은 합계는 총 몫');
  assert.equal(groups[0].members.length, 2);
  // 고치기(editKey): 옛 몫을 걷어내고 새로 — 합계가 불어나지 않는다
  const edited = O.buildOutsourcedElectricityUpdates(saved.updates, { editKey: groups[0].key, info: infoOf({ subcontractor: '가상 코팅 B사' }), sameGrid: true, total: 60, targets: [{ processId: 'p1', fraction: 1 }] });
  assert.equal(edited.ok, true);
  const e1 = edited.updates.find((item) => item.id === 'p1');
  const e2 = edited.updates.find((item) => item.id === 'p2');
  close(e1.electricity_mwh, 400 + 60, '고친 뒤 p1 = 자체 400 + 새 몫 60');
  close(e2.electricity_mwh, 600, '고르지 않은 공정에서는 옛 몫이 빠진다');
  assert.equal(e2.outsourced_electricity, undefined);
  // 외주처가 둘이면 서로 다른 건으로 쌓인다
  const second = O.buildOutsourcedElectricityUpdates(saved.updates, { info: infoOf({ subcontractor: '가상 열처리 C사', technique: 'HEAT_TREATMENT' }), sameGrid: true, total: 10, targets: [{ processId: 'p1', fraction: 1 }] });
  assert.equal(O.groupOutsourcedElectricity([second.updates[0], saved.updates.find((item) => item.id === 'p2')]).length, 2);
  close(second.updates[0].electricity_mwh, 400 + 90 + 10, '두 번째 외주처는 합계에 더해진다');
  // 지우기: 그 몫만 빠지고 자체 몫은 그대로
  const removed = O.buildOutsourcedElectricityRemoval(saved.updates, groups[0].key);
  assert.equal(removed.length, 2);
  close(removed.find((item) => item.id === 'p1').electricity_mwh, 400);
  close(removed.find((item) => item.id === 'p2').electricity_mwh, 600);
  assert.equal(removed[0].outsourced_electricity, undefined, '다 지우면 필드 자체가 사라진다(옛 자료와 같은 모양)');
  // 거부: 같은 나라 확인 없음 · 전기도금 · 비율 합이 1이 아님
  assert.equal(O.buildOutsourcedElectricityUpdates(processes, { info: infoOf(), sameGrid: false, total: 120, targets: [{ processId: 'p1', fraction: 1 }] }).ok, false, '다른 나라 계통이면 저장하지 않는다');
  assert.equal(O.buildOutsourcedElectricityUpdates(processes, { info: infoOf({ technique: 'ELECTROPLATING' }), sameGrid: true, total: 120, targets: [{ processId: 'p1', fraction: 1 }] }).ok, false, '전기도금은 저장하지 않는다');
  assert.equal(O.buildOutsourcedElectricityUpdates(processes, { info: infoOf(), sameGrid: true, total: 120, targets: [{ processId: 'p1', fraction: 0.5 }] }).ok, false, '비율 합이 1이 아니면 저장하지 않는다');
  // 저장한 직후에는 점검이 조용하고, 전력 배출계수가 비었으면 OUTE05
  assert.deepEqual(codes(saved.updates), [], '저장 직후 점검이 조용하다');
  assert.deepEqual(codes(saved.updates.map((item) => ({ ...item, electricity_ef_tco2e_per_mwh: 0 }))), ['OUTE05', 'OUTE05'], '전력 배출계수가 비면 알린다');
  // 저장한 뒤 전력을 다시 나눠도 몫이 유지된다(1단계 규칙과 이어서)
  const re = split.buildElectricitySplitUpdates(saved.updates.map((item) => ({ ...item, electricity_shared_meter: meter })), split.computeElectricitySplit({ group: '본사 한전', totalMwh: 1000, basis: 'OUTPUT_MASS', note: '', rows: [{ processId: 'p1', processName: '볼트 공정', value: 1 }, { processId: 'p2', processName: '2공정', value: 1 }] }));
  close(re.find((item) => item.id === 'p1').electricity_mwh, 500 + 90, '다시 나눈 뒤에도 외주 몫 90이 얹혀 있다');
  // kW → MWh/h 환산(화면은 kW로 받아 /1000으로 저장): 600 h × 20 kW = 12 MWh
  const viaKw = O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', company_total: 400, equipment: [{ name: '우리', hours: 600, rate_per_h: 20 / 1000, ours: true }, { name: '타사', hours: 900, rate_per_h: 20 / 1000 }, { name: '기타', hours: 1000, rate_per_h: 10 / 1000 }] });
  close(viaKw.share, 120, 'kW로 받아 환산해도 설계 사례 120 MWh');
}

// 전력 입력의 안내 문구는 「전력량」이다(연료 입력은 종전대로 「연료량」)
assert.ok(O.computeOutsourcedShare({ basis: 'METERED_LINE' }, 'electricity').reason.includes('전력량'));
assert.ok(O.computeOutsourcedShare({ basis: 'METERED_LINE' }).reason.includes('연료량'), '연료 입력의 문구는 그대로');
assert.ok(O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', equipment: [{ name: 'a', hours: 1, rate_per_h: 1, ours: true }] }, 'electricity').reason.includes('전력량'));
assert.ok(O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', company_total: 400, equipment: [{ name: 'a', hours: 100, rate_per_h: 1, ours: true }] }, 'electricity').warnings[0].includes('전기 사용처'));
assert.ok(O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', company_total: 400, equipment: [{ name: 'a', hours: 100, rate_per_h: 1, ours: true }] }).warnings[0].includes('가스 사용처'), '연료 입력의 문구는 그대로');
assert.ok(readFileSync('src/components/guided/OutsourcedElectricity.tsx', 'utf8').includes("computeOutsourcedShare(info, 'electricity')"), '화면이 전력 문구를 쓴다');

// ── 10) 화면 배선 ────────────────────────────────────────────────────
{
  const screen = readFileSync('src/components/guided/OutsourcedElectricity.tsx', 'utf8');
  assert.ok(screen.includes('buildOutsourcedElectricityUpdates') && screen.includes('buildOutsourcedElectricityRemoval'), '화면은 순수 저장·삭제 함수를 쓴다(따로 계산하지 않는다)');
  assert.ok(/disabled=\{busy \|\| technique === 'ELECTROPLATING'\}/.test(screen), '전기도금이면 저장 버튼이 꺼진다');
  assert.ok(screen.includes('checked={sameGrid}') && screen.includes('!sameGrid'), '같은 나라 확인 칸이 있고 없으면 저장하지 않는다');
  assert.ok(screen.includes('num(row.kw) / 1000'), '정격은 kW로 받아 MWh/h로 저장한다');
  assert.ok(!screen.includes('createLocalItem'), '전력 몫은 공정 레코드에만 쓴다(배출원 행을 만들지 않는다)');
  const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
  assert.ok(/<OutsourcedElectricity processes=\{data\.processes\}/.test(panels), '지도 4단계에 외주처 전기 입력이 있다');
  const talk = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
  assert.ok(/<OutsourcedElectricity processes=\{periodProcesses\}/.test(talk), '대화 모드에도 같은 컴포넌트가 있다');
  const fuelScreen = readFileSync('src/components/guided/OutsourcedProcess.tsx', 'utf8');
  assert.ok(fuelScreen.includes('외주처 전기」에서 따로 입력') || fuelScreen.includes('우리 부품에 쓴 전기」에서 따로 입력'), '연료 입력의 안내가 전기 입력으로 안내한다');
}

console.log('Outsourced electricity verified (엔진 불변 · 자체 몫 = 합계 − 외주 · 계량기 합계 검사 · 다시 나눠도 유지 · 직접 수정 · OUTE01~04 · V10).');
