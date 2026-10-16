// 외주 공정 몫 — 1단계(계산·저장 초안·점검). 설계: docs/harness/outsourced-process-input-design.md
//
// 잠그는 것:
//  1) 네 방법의 계산이 손계산과 같다(사용자가 준 검토 메모의 사례 A·B 포함): 재구성 36,000 · 처리 중량 18,000 Nm³.
//  2) 저장 전 검사: 전기도금은 거부, 보수적 추정은 근거 필수·항상 확인 필요, 코팅은 분류 근거 요구.
//  3) 공정별 나누기: 합 = 총 몫, 비율 합이 1이 아니면 거부.
//  4) 외주 몫 행은 보통 연료 배출원과 같은 배출을 낸다(엔진·옛 앱이 같은 숫자) — `outsourced`는 기록일 뿐.
//  5) 점검 OUT01~05와 귀속 점검 V10 줄(외주 행이 없으면 표가 그대로).
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
const O = load('src/lib/outsourced-process.ts');
const calc = load('src/lib/source-stream-calculation.ts');
const attribution = load('src/lib/attribution-status.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (actual, expected, message, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} vs ${expected}`);

// ── 1) 계산 ─────────────────────────────────────────────────────────
// 사례 A — 외주처 연간 총 120,000 Nm³, 설비: 우리 코팅 600 h × 50, 타사 코팅 900 h × 50, 기타 1,000 h × 25 → 합 100,000, 우리 30,000, 보정계수 1.2 → 36,000
const caseA = O.computeOutsourcedShare({
  basis: 'RECONSTRUCTED', company_total: 120000,
  equipment: [{ name: '우리 제품 코팅', hours: 600, rate_per_h: 50, ours: true }, { name: '타사 제품 코팅', hours: 900, rate_per_h: 50 }, { name: '기타 가스 사용공정', hours: 1000, rate_per_h: 25 }],
});
assert.equal(caseA.ok, true);
close(caseA.share, 36000, '사례 A: 재구성 → 고지서 총량에 맞춤');
close(caseA.reconciliationFactor, 1.2, '보정계수 = 총량 ÷ 재구성 합');
assert.equal(caseA.warnings.length, 0, '1.2는 허용 범위(±20%) 안이다');
// 사례 B — 코팅라인 연료 60,000 Nm³, 우리 300 t / 전체 1,000 t → 18,000
const caseB = O.computeOutsourcedShare({ basis: 'OUTPUT_MASS', line_quantity: 60000, our_throughput_t: 300, line_throughput_t: 1000 });
assert.equal(caseB.ok, true);
close(caseB.share, 18000, '사례 B: 처리 중량 비율');
// 계량 + 전용 설비(우리만 쓴다): 설비 연료량이 곧 우리 몫
assert.equal(O.computeOutsourcedShare({ basis: 'METERED_LINE', line_quantity: 25000 }).share, 25000);
// 계량 + 같은 설비를 여럿이 쓰면 처리량 비율
close(O.computeOutsourcedShare({ basis: 'METERED_LINE', line_quantity: 25000, our_throughput_t: 100, line_throughput_t: 400 }).share, 6250, '계량 × 처리량 비율');
// 보수적 추정: 입력 그대로
assert.equal(O.computeOutsourcedShare({ basis: 'CONSERVATIVE_ESTIMATE', estimate_quantity: 280 }).share, 280);
// 재구성이 고지서와 크게 어긋나면 알린다(막지는 않는다)
const off = O.computeOutsourcedShare({ basis: 'RECONSTRUCTED', company_total: 200000, equipment: [{ name: 'A', hours: 1000, rate_per_h: 50, ours: true }, { name: 'B', hours: 1000, rate_per_h: 50 }] });
assert.equal(off.ok, true);
assert.match(off.warnings[0], /100% 어긋납니다|어긋납니다/, '재구성 합계가 총량과 20% 넘게 다르면 설비 목록을 점검하라고 알린다');
// 나쁜 입력은 이유와 함께 거부한다
for (const [name, input, pattern] of [
  ['추정량 없음', { basis: 'CONSERVATIVE_ESTIMATE' }, /추정한 활동량/],
  ['설비 연료량 없음', { basis: 'OUTPUT_MASS', our_throughput_t: 1, line_throughput_t: 2 }, /설비의 연료량/],
  ['처리량 없음', { basis: 'OUTPUT_MASS', line_quantity: 100 }, /처리량/],
  ['우리 처리량 > 전체', { basis: 'OUTPUT_MASS', line_quantity: 100, our_throughput_t: 5, line_throughput_t: 2 }, /클 수 없습니다/],
  ['재구성 설비 없음', { basis: 'RECONSTRUCTED', company_total: 100, equipment: [] }, /설비 목록/],
  ['재구성 총량 없음', { basis: 'RECONSTRUCTED', equipment: [{ name: 'A', hours: 1, rate_per_h: 1, ours: true }] }, /총량/],
  ['우리 설비 표시 없음', { basis: 'RECONSTRUCTED', company_total: 100, equipment: [{ name: 'A', hours: 1, rate_per_h: 1 }] }, /우리 부품을 처리하는 설비/],
  ['음수 시간', { basis: 'RECONSTRUCTED', company_total: 100, equipment: [{ name: 'A', hours: -1, rate_per_h: 1, ours: true }] }, /0 이상/],
]) {
  const result = O.computeOutsourcedShare(input);
  assert.equal(result.ok, false, name);
  assert.match(result.reason, pattern, name);
}

// ── 2) 저장 전 검사 ───────────────────────────────────────────────
const base = { subcontractor: '가상 코팅 B사', technique: 'HEAT_TREATMENT', basis: 'METERED_LINE', note: '외주처 계량기 값', evidence: '가스 고지서 2025' };
assert.deepEqual(plain(O.validateOutsourcedInfo(base)), { errors: [], reviews: [] }, '근거가 갖춰지면 조용하다');
const plating = O.validateOutsourcedInfo({ ...base, technique: 'ELECTROPLATING' });
assert.match(plating.errors[0], /전기도금\(plating\)은 철강 제품의 시스템 경계 밖/, '전기도금은 저장하지 않는다');
assert.match(plating.errors[0], /2025\/2547 부속서 I 3\.16\.2/);
assert.match(O.validateOutsourcedInfo({ ...base, subcontractor: ' ' }).errors[0], /외주처 이름/);
const estimate = O.validateOutsourcedInfo({ ...base, basis: 'CONSERVATIVE_ESTIMATE', note: '' });
assert.match(estimate.errors[0], /근거/, '보수적 추정은 근거 없이 저장하지 않는다');
assert.ok(O.validateOutsourcedInfo({ ...base, basis: 'CONSERVATIVE_ESTIMATE', note: '400 kW × 1,000 h × 70%' }).reviews.some((text) => /보수적 추정/.test(text)), '추정은 항상 확인 필요');
const flake = O.validateOutsourcedInfo({ ...base, technique: 'ZINC_FLAKE_COATING' });
assert.ok(flake.reviews.some((text) => /비전해/.test(text)), '코팅은 분류 근거를 요구한다');
assert.equal(O.validateOutsourcedInfo({ ...base, technique: 'ZINC_FLAKE_COATING', technique_evidence: 'ISO 10683 비전해 아연 플레이크, 정류기 없음' }).reviews.length, 0);
assert.ok(O.validateOutsourcedInfo({ ...base, evidence: '' }).reviews.some((text) => /증빙/.test(text)));

// ── 3) 공정별 나누기 · 저장 초안 ─────────────────────────────────
assert.deepEqual(plain(O.splitOutsourcedShare(36000, [0.5, 0.3, 0.2])), [18000, 10800, 7200]);
const odd = O.splitOutsourcedShare(100, [1 / 3, 1 / 3, 1 / 3]);
close(odd.reduce((a, b) => a + b, 0), 100, '반올림 차이는 마지막 공정이 받아 합 = 총 몫');
assert.equal(O.splitOutsourcedShare(100, [0.5, 0.4]), undefined, '비율 합이 1이 아니면 거부');
assert.equal(O.splitOutsourcedShare(100, [-0.5, 1.5]), undefined);
const template = {
  stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3', ncv_gj_per_unit: 0.0385, emission_factor_tco2e_per_unit: 0.0561, emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'EU_OR_IPCC_DEFAULT',
};
const info = { ...base, technique: 'ZINC_FLAKE_COATING', technique_evidence: 'ISO 10683 비전해', basis: 'RECONSTRUCTED', company_total: 120000, equipment: caseA.ok ? [{ name: '우리 제품 코팅', hours: 600, rate_per_h: 50, ours: true }] : [], note: '사례 A' };
const built = O.buildOutsourcedStreamDrafts({
  info, total: 36000, template, fuelName: '도시가스', source: '외주처 고지서',
  processes: [{ id: 'p1', name: '볼트 공정', period_id: 'per', fraction: 0.75 }, { id: 'p2', name: '너트 공정', period_id: 'per', fraction: 0.25 }],
});
assert.equal(built.ok, true);
assert.deepEqual(plain(built.drafts.map((draft) => [draft.process_id, draft.activity_data])), [['p1', 27000], ['p2', 9000]], '공정별 몫의 합 = 36,000');
assert.match(built.drafts[0].name, /^\(외주\) 가상 코팅 B사 — 아연 플레이크 코팅/);
assert.match(built.drafts[0].source, /EC Q&A 4\.31/);
assert.equal(built.drafts[0].outsourced.total_share, 36000);
assert.equal(O.buildOutsourcedStreamDrafts({ info: { ...info, technique: 'ELECTROPLATING' }, total: 1, template, fuelName: '도시가스', source: 's', processes: [{ id: 'p1', name: 'A', fraction: 1 }] }).ok, false, '전기도금은 초안도 만들지 않는다');
assert.equal(O.buildOutsourcedStreamDrafts({ info, total: 1, template, fuelName: '도시가스', source: 's', processes: [{ id: 'p1', name: 'A', fraction: 0.5 }] }).ok, false, '비율 합이 1이 아니면 초안도 만들지 않는다');

// ── 4) 엔진이 읽는 배출은 보통 연료 배출원과 같다 ─────────────────────
const stamp = { id: 's', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const ordinary = { ...stamp, ...template, name: '도시가스', process_id: 'p1', period_id: 'per', activity_data: 27000, source: 'x' };
const withMeta = { ...ordinary, id: 's2', ...built.drafts[0] };
const emissionsOf = (stream) => calc.calculateSourceStreamEmissions(stream);
close(emissionsOf(withMeta), emissionsOf(ordinary), '`outsourced` 기록은 배출을 바꾸지 않는다(옛 앱도 같은 숫자)');
assert.ok(emissionsOf(withMeta) > 0, '우리 공정의 직접배출에 실린다');
// 저장했다 읽어도 필드가 남고, 필드가 없는 옛 행도 그대로 유효하다
assert.deepEqual(plain(JSON.parse(JSON.stringify(withMeta)).outsourced), plain(withMeta.outsourced));
assert.equal(JSON.parse(JSON.stringify(ordinary)).outsourced, undefined);

// 엔진 끝에서 끝까지: 우리 공정의 직접배출이 (자체 연료) + (외주 몫)이고, 외주 기록 때문에 경고가 새로 생기지 않는다.
{
  const engine = load('src/lib/calculation-engine.ts');
  const times = { created_at: stamp.created_at, updated_at: stamp.updated_at }; // 엔진 자료는 저마다 id가 있어야 해서 stamp의 id는 뺀다
  const period = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...times };
  const product = { id: 'g', name: '볼트', cn_code: '73181558', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...times };
  const processRow = { id: 'p1', period_id: 'per', product_id: 'g', name: '볼트 공정', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 0, internal_consumption_mass_t: 0,
    direct_attributable_emissions_tco2e: 0, direct_emissions_input_mode: 'SOURCE_STREAM_SUM', electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0, no_purchased_precursors: true, ...times };
  const own = { ...stamp, ...template, id: 'own', name: '자체 열처리 도시가스', process_id: 'p1', period_id: 'per', activity_data: 100000, source: '고지서' };
  const run = (streams) => engine.calculateLocalResults({ products: [product], periods: [period], processes: [processRow], precursors: [], sourceStreams: streams });
  const resultOf = (streams) => run(streams).find((item) => item.process_id === 'p1');
  const outsourcedRow = { ...stamp, ...template, id: 'out', name: '(외주) 코팅', process_id: 'p1', period_id: 'per', activity_data: 36000, source: '외주처', outsourced: withMeta.outsourced };
  const asOrdinary = { ...outsourcedRow, id: 'plain', outsourced: undefined };
  const alone = resultOf([own]);
  const both = resultOf([own, outsourcedRow]);
  const plainBoth = resultOf([own, asOrdinary]);
  close(both.direct_emissions_tco2e, alone.direct_emissions_tco2e + emissionsOf(outsourcedRow), '외주 몫이 우리 공정의 직접배출에 더해진다', 1e-6);
  close(both.direct_emissions_tco2e, plainBoth.direct_emissions_tco2e, '`outsourced` 기록이 있든 없든 직접배출이 같다', 1e-9);
  assert.deepEqual(plain(both.warnings), plain(plainBoth.warnings), '외주 기록 때문에 엔진 경고가 새로 생기지 않는다');
}

// ── 5) 점검 OUT01~05와 귀속 점검 V10 ────────────────────────────────
const row = (patch, infoPatch = {}) => ({ ...withMeta, id: patch.id ?? 'r', ...patch, outsourced: { ...withMeta.outsourced, ...infoPatch } });
const codes = (streams, precursors) => plain(O.checkOutsourcedStreams(streams, precursors).map((issue) => issue.code));
assert.deepEqual(codes([row({ id: 'a' }), row({ id: 'b', activity_data: 9000, process_id: 'p2' })]), [], '갖춰진 외주 몫은 조용하다');
assert.deepEqual(codes([row({ id: 'a' }, { basis: 'CONSERVATIVE_ESTIMATE' })]), ['OUT01'], '추정은 확인 필요');
assert.deepEqual(codes([row({ id: 'a' }, { note: '' })]), ['OUT01'], '근거가 비면 확인 필요');
assert.ok(codes([row({ id: 'a', activity_data: 130000 })]).includes('OUT02'), '우리 몫이 외주처 총량보다 크면 오류');
assert.ok(codes([row({ id: 'a' }, { our_throughput_t: 500, line_throughput_t: 100 })]).includes('OUT02'), '우리 처리량이 설비 전체보다 크면 오류');
assert.deepEqual(codes([row({ id: 'a' }, { technique_evidence: '' })]), ['OUT03'], '코팅의 분류 근거가 비면 확인 필요');
assert.deepEqual(codes([row({ id: 'a' })], [{ name: '구매 강재', supplier_installation: '가상 코팅 B사 김해공장' }]), ['OUT04'], '같은 외주처가 구매 강재에도 있으면 이중계산 경고');
assert.ok(codes([row({ id: 'a', activity_data: 27000 }), row({ id: 'b', activity_data: 20000, process_id: 'p2' })]).includes('OUT05'), '같은 총 몫에서 나온 행들의 합이 총 몫보다 크면 오류');
const levels = plain(O.checkOutsourcedStreams([row({ id: 'a', activity_data: 130000 }), row({ id: 'b' }, { basis: 'CONSERVATIVE_ESTIMATE' })]).map((issue) => issue.level));
assert.ok(levels.includes('fix') && levels.includes('review'));

const statusOf = (streams) => attribution.buildAttributionStatus({ processes: [], productOutputLines: [], sourceStreams: streams, precursorCount: 0, results: [], hrefOf: () => '/' });
const none = statusOf([ordinary]);
assert.equal(none.rows.some((item) => item.id === 'OUTSOURCED'), false, '외주 행이 없으면 표는 그대로다');
const okTable = statusOf([row({ id: 'a' }), row({ id: 'b', activity_data: 9000, process_id: 'p2' })]);
assert.equal(okTable.rows.find((item) => item.id === 'OUTSOURCED').status, 'ok');
const reviewTable = statusOf([row({ id: 'a' }, { basis: 'CONSERVATIVE_ESTIMATE' })]);
assert.equal(reviewTable.rows.find((item) => item.id === 'OUTSOURCED').status, 'review');
const fixTable = statusOf([row({ id: 'a', activity_data: 130000 })]);
assert.equal(fixTable.rows.find((item) => item.id === 'OUTSOURCED').status, 'fix');
assert.equal(fixTable.rows.find((item) => item.id === 'OUTSOURCED').code, 'V10');
assert.equal(none.counts.na, okTable.counts.na, '외주 행이 있어도 「해당 없음」 개수는 변하지 않는다');

console.log('Outsourced process verified (사례 A 36,000 · 사례 B 18,000 · 전기도금 거부 · 추정은 근거 필수 · 합 = 총 몫 · 엔진 배출 불변 · OUT01~05 · V10).');
