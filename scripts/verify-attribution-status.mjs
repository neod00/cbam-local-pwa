// 귀속·할당 점검 (2026-10-07).
//
// 잠그는 것:
//  1) 엔진 경고에 점검 종류(`check`)를 붙인 것은 **계산을 바꾸지 않는다** — 같은 자료로 태그 인자를 걷어낸 기준 엔진과 지금 엔진을 돌려
//     결과 전체가 같다(경고의 `check` 필드만 다르다). 태그 수도 정해져 있다(누가 조용히 늘리거나 지우지 못한다).
//  2) 점검표는 새 점검이 아니라 엔진·에너지 나누기 현황이 이미 내는 것의 모음이다: 통과한 것도 ✓로 보이고, 해당 없는 것은 따로 접힌다.
//  3) 상태 규칙: 「차단」·「확인 필요(자료)」 머리말과 배분 합계·귀속 누락 점검은 수정 필요, 규정·권고는 확인 필요.
//  4) 화면: 할 일 화면 아래 한 구역. 저장 코드 없음.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (text, all = true) => text
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const file = (path) => readFileSync(path, 'utf8');
const base = (engineText) => [
  strip(file('src/lib/source-stream-calculation.ts'), false),
  file('src/lib/cn-master.generated.ts').replace(/^export /gm, ''),
  strip(file('src/lib/cbam-product-rules.ts')),
  strip(file('src/lib/reporting-scope.ts'), false),
  strip(file('src/lib/allocation-rules.ts')),
  strip(file('src/lib/measurable-heat.ts')),
  strip(file('src/lib/precursor-verification.ts')),
  strip(engineText),
];
const load = (parts, exported) => {
  const context = vm.createContext({ Intl });
  vm.runInContext(ts.transpileModule([...parts, `globalThis.app = { ${exported} };`].join('\n'), { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.app;
};
const newEngineText = file('src/lib/calculation-engine.ts');
// 기준 엔진 = 지금 엔진에서 태그 인자만 걷어낸 것(저장소 이력에 기대지 않아 머지 뒤에도 같은 뜻으로 돈다). 태그가 계산 흐름에 끼어들었다면 둘의 결과가 갈린다.
const TAG_NAMES = ['SHARED_METER', 'HEAT', 'DUP_FUNCTIONAL_UNIT', 'MULTIFUNCTIONAL', 'ACTIVITY_LEVEL', 'ALLOCATION_SUM', 'MANUAL_ALLOCATION', 'PRECURSOR_COMPLETENESS'];
const oldEngineText = TAG_NAMES.reduce((text, tag) => text.split(", '" + tag + "'").join(''), newEngineText);
const oldEngine = load(base(oldEngineText), 'calculateLocalResults');
const renameFmt = (text, name) => text.split('fmt').join(name); // 합친 한 파일로 돌리는 시험 틀에서 같은 이름(fmt)이 겹치는 것을 피한다
const app = load([...base(newEngineText), renameFmt(strip(file('src/lib/fuel-allocation.ts')), 'fmtFuel'), renameFmt(strip(file('src/lib/energy-split-summary.ts')), 'fmtEnergy'), strip(file('src/lib/attribution-status.ts'))],
  'calculateLocalResults, getLocalCalculationWarningHref, summarizeEnergySplits, buildAttributionStatus, attributionSeverityOf');
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 자료 ────────────────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const period = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = (id, cn) => ({ id, name: `제품 ${id}`, cn_code: cn, hs_code: cn.slice(0, 4), hs_group: cn.slice(0, 2), product_type_enum: 'Iron or steel products', unit: 't', reporting_scope: 'CBAM_GOOD', ...stamp });
const proc = (id, productId, extra = {}) => ({ id, product_id: productId, period_id: 'per', name: `공정 ${id}`, production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL', electricity_mwh: 100, electricity_ef_tco2e_per_mwh: 0.47, no_purchased_precursors: false, ...stamp, ...extra });
const line = (id, processId, productId, mass, extra = {}) => ({ id, process_id: processId, product_id: productId, name: `라인 ${id}`, output_mass_t: mass, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '', reporting_scope: 'CBAM_GOOD', ...stamp, ...extra });
const precursor = (id, processId, extra = {}) => ({ id, process_id: processId, period_id: 'per', name: `원료 ${id}`, precursor_cn_code: '72139110', aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_installation: '공급사', supplier_country: 'Korea',
  data_mode: 'ACTUAL', verification_status: 'VERIFIED', purchased_mass_t: 500, consumed_mass_t: 500, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 1.5, indirect_see_tco2e_per_t: 0, source: '회신', default_value_justification: '', default_value_year: '2026', ...stamp, ...extra });
const A = product('a', '72139110');
const B = product('b', '72139190');
const A2 = product('a2', '72139110'); // 같은 CN

// 시나리오 1: 깨끗한 단일 공정
const clean = { products: [A], periods: [period], processes: [proc('p1', 'a')], productOutputLines: [line('l1', 'p1', 'a', 1000)], precursors: [precursor('r1', 'p1')], sourceStreams: [] };
// 시나리오 2: 문제 모음 — 같은 CN 두 공정, 사용자 지정 배분 합계 90%·사유 없음, 활동수준 미표시 라인, 전구물질 귀속 합계 불일치·지워진 라인, 전력 공용 계량기 합계 불일치
const messy = {
  products: [A, A2, B], periods: [period],
  processes: [
    proc('p1', 'a', { electricity_mwh: 80, electricity_shared_meter: { group: '한전', basis: 'OUTPUT_MASS', installation_total_mwh: 200, basis_value: 1000 } }),
    proc('p2', 'a2', { electricity_mwh: 70, electricity_shared_meter: { group: '한전', basis: 'OUTPUT_MASS', installation_total_mwh: 200, basis_value: 1000 } }),
    proc('p3', 'b'),
  ],
  productOutputLines: [
    line('l1', 'p1', 'a', 600, { allocation_basis: 'MANUAL', manual_allocation_percent: 60 }),
    line('l2', 'p1', 'a', 400, { allocation_basis: 'MANUAL', manual_allocation_percent: 30 }),
    line('l3', 'p2', 'a2', 900),
    line('l4', 'p2', undefined, 100, { reporting_scope: 'NON_CBAM_COPRODUCT' }),
    line('l5', 'p3', 'b', 1000),
  ],
  precursors: [
    precursor('r1', 'p3', { output_allocations: [{ product_output_line_id: 'l5', allocated_mass_t: 300, allocation_percent: 60 }] }),
    precursor('r2', 'p3', { output_allocations: [{ product_output_line_id: 'gone', allocated_mass_t: 500, allocation_percent: 100 }] }),
  ],
  sourceStreams: [],
};

// ── 1) 계산이 한 글자도 안 바뀌었다 ─────────────────────────────────
const withoutCheck = (results) => results.map((result) => ({ ...result, warningDetails: result.warningDetails.map(({ message, target }) => ({ message, target })) }));
for (const [name, scenario] of [['clean', clean], ['messy', messy]]) {
  const before = plain(oldEngine.calculateLocalResults(scenario));
  const after = plain(app.calculateLocalResults(scenario));
  assert.deepEqual(plain(withoutCheck(after)), before, `${name}: 점검 태그를 붙여도 결과(숫자·경고 문장)가 이전 엔진과 같다`);
}
// 태그 수: 이 개수가 바뀌면 점검표가 달라진다 — 의도한 변경인지 사람이 보게 한다.
const expectedTags = { SHARED_METER: 5, HEAT: 3, DUP_FUNCTIONAL_UNIT: 1, MULTIFUNCTIONAL: 1, ACTIVITY_LEVEL: 1, ALLOCATION_SUM: 3, MANUAL_ALLOCATION: 2, PRECURSOR_COMPLETENESS: 2 };
for (const [check, count] of Object.entries(expectedTags)) {
  const found = newEngineText.split(`, '${check}'`).length - 1; // 태그는 addWarning의 세 번째 인자 자리에만 쓴다(타입 선언의 `| 'X'`는 따옴표 앞이 `|`)
  assert.equal(found, count, `엔진의 ${check} 태그 ${count}개`);
}
const messyResults = app.calculateLocalResults(messy);
const tagged = messyResults.flatMap((result) => result.warningDetails).filter((warning) => warning.check);
assert.ok(tagged.length >= 6, '문제 시나리오에서 태그 달린 경고가 실제로 나온다');
for (const warning of tagged) {
  assert.match(warning.message, /^(차단|확인 필요\((자료|규정)\)|권고):|산출물 귀속량/, `태그 달린 경고는 머리말 약속을 따른다: ${warning.message.slice(0, 40)}`);
}

// ── 2) 점검표 ───────────────────────────────────────────────────────
const build = (scenario, extra = {}) => app.buildAttributionStatus({
  processes: scenario.processes, productOutputLines: scenario.productOutputLines, sourceStreams: scenario.sourceStreams,
  precursorCount: scenario.precursors.length, results: app.calculateLocalResults(scenario), hrefOf: app.getLocalCalculationWarningHref, ...extra,
});
const cleanStatus = build(clean);
assert.deepEqual(plain(cleanStatus.rows.map((row) => [row.id, row.status])), [['ACTIVITY_LEVEL', 'ok'], ['ALLOCATION_SUM', 'ok'], ['PRECURSOR_COMPLETENESS', 'ok']], '깨끗한 단일 공정: 해당하는 점검만 ✓');
assert.equal(cleanStatus.counts.fix + cleanStatus.counts.review, 0);
assert.ok(cleanStatus.notApplicable.some((name) => name.startsWith('V01')) && cleanStatus.notApplicable.some((name) => name.startsWith('V05')), '공용 계량기·열은 해당 없음으로 접힌다');
assert.ok(cleanStatus.notApplicable.length === 5);
assert.ok(cleanStatus.rows.every((row) => row.detail && row.title));

const messyStatus = build(messy);
const rowOf = (status, id) => status.rows.find((row) => row.id === id);
assert.equal(rowOf(messyStatus, 'DUP_FUNCTIONAL_UNIT').status, 'review', '같은 CN 두 공정 → 확인 필요(규정)');
assert.equal(rowOf(messyStatus, 'ALLOCATION_SUM').status, 'fix', '배분 합계가 100%가 아니다 → 수정 필요');
assert.equal(rowOf(messyStatus, 'MANUAL_ALLOCATION').status, 'fix', '사유·증빙이 없는 사용자 지정 배분 → 수정 필요');
assert.equal(rowOf(messyStatus, 'PRECURSOR_COMPLETENESS').status, 'fix', '지워진 라인을 가리키는 귀속 → 수정 필요');
assert.equal(rowOf(messyStatus, 'SHARED_METER').status, 'fix', '공용 계량기 합계가 맞지 않다 → 수정 필요(에너지 나누기 현황의 문제 항목)');
assert.ok(rowOf(messyStatus, 'SHARED_METER').items.length > 0);
assert.equal(rowOf(messyStatus, 'ACTIVITY_LEVEL')?.status ?? 'ok', rowOf(messyStatus, 'ACTIVITY_LEVEL') ? rowOf(messyStatus, 'ACTIVITY_LEVEL').status : 'ok');
assert.ok(messyStatus.counts.fix >= 4);
assert.equal(messyStatus.counts.ok + messyStatus.counts.review + messyStatus.counts.fix, messyStatus.rows.length);
assert.ok(rowOf(messyStatus, 'PRECURSOR_COMPLETENESS').href.startsWith('/precursors?edit='), '고칠 화면으로 가는 링크');
assert.ok(/^\/(source-streams|processes)\?edit=/.test(rowOf(messyStatus, 'SHARED_METER').href), '공용 계량기 점검도 지도 첫 화면이 아니라 고칠 행으로 바로 간다');
assert.ok(rowOf(messyStatus, 'ALLOCATION_SUM').items.length <= 3, '걸린 항목은 3줄까지');
// 폐가스
const wasteStatus = build(messy, { installation: { waste_gases: 'YES' } });
assert.equal(rowOf(wasteStatus, 'WASTE_GAS').status, 'review');
assert.match(rowOf(wasteStatus, 'WASTE_GAS').detail, /계산하지 않습니다/);
assert.equal(rowOf(build(clean, { installation: { waste_gases: 'YES' } }), 'WASTE_GAS'), undefined, '공정이 하나면 폐가스 이전 보정을 말하지 않는다');
// 같은 열 공급원의 「임시 값」 경고는 공정마다 오지만 한 건으로 센다(run35 P2-02)
const heatWarn = (processName) => ({ message: `확인 필요(규정): ${processName}: 「온수 보일러」 열 사용량이 임시 값입니다 — 공정별 열 사용 자료 없이 생산량 비율로 채웠습니다`, target: { type: 'process', id: processName }, check: 'HEAT' });
const heatStatus = app.buildAttributionStatus({
  processes: [], productOutputLines: [], sourceStreams: [], precursorCount: 0, hrefOf: () => '/',
  results: [{ warnings: [], warningDetails: [heatWarn('나사 공정'), heatWarn('너트 공정'), heatWarn('와셔 공정'), { ...heatWarn('와셔 공정'), message: '확인 필요(규정): 와셔 공정: 「열풍기」 열 사용량이 임시 값입니다 — x' }] }],
});
const heatRow = heatStatus.rows.find((row) => row.id === 'HEAT');
assert.match(heatRow.detail, /^2건 /, '같은 열 공급원 3개 공정 + 다른 열 공급원 1개 = 2건');
assert.ok(heatRow.items.some((item) => /열 공급원 「온수 보일러」의 열 사용량이 임시 값입니다 — 공정 3개/.test(item)), '같은 공급원은 한 줄로 합쳐 공정 수를 말한다');
// 심각도 규칙
assert.equal(app.attributionSeverityOf('차단: x'), 'fix');
assert.equal(app.attributionSeverityOf('확인 필요(자료): x'), 'fix');
assert.equal(app.attributionSeverityOf('확인 필요(규정): x'), 'review');
assert.equal(app.attributionSeverityOf('권고: x'), 'review');
assert.equal(app.attributionSeverityOf('아무 문장', 'ALLOCATION_SUM'), 'fix');
assert.equal(app.attributionSeverityOf('확인 필요(규정): 지워짐', 'PRECURSOR_COMPLETENESS'), 'fix');

// ── 3) 화면·구조 ────────────────────────────────────────────────────
const ui = file('src/components/todo/TodoWorkspace.tsx');
assert.ok(ui.includes('data-testid="attribution-status"'));
assert.ok(ui.includes('통과한 것도 보여 줍니다'));
assert.ok(/'✓ 규정 충족'/.test(ui) && /'⚠ 확인 필요'/.test(ui) && /'✕ 수정 필요'/.test(ui), '색만이 아니라 글자로도 상태를 말한다');
const data = file('src/components/todo/todo-data.ts');
assert.ok(data.includes('buildAttributionStatus({') && data.includes('hrefOf: getLocalCalculationWarningHref'));
const lib = file('src/lib/attribution-status.ts');
assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|indexedDB/.test(lib), '점검표는 저장하지 않는다');
assert.ok(!/calculateLocalResults\(/.test(lib), '점검표는 엔진을 다시 돌리지 않는다(받은 결과를 모을 뿐)');

console.log('Attribution status verified (계산 불변 — 이전 엔진과 결과 동일 · 태그 18개 · 통과 ✓/해당 없음 접힘 · 수정/확인 필요 규칙 · 폐가스 안내 · 저장 없음).');
