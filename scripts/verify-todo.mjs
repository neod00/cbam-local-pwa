// 할 일 화면 (UX 목업 4번, 2026-10-06).
//
// 잠그는 것:
//  1) 「누가 할 일인지」로 가르는 규칙: 안 한 질문·준비도 검사·엔진의 「확인 필요(규정)」·잠정 실측 전구물질·EU 기본값 전구물질을
//     우리 회사 / 공급사 / 규정 세 칸으로 나눈다. 같은 일이 두 번 나오지 않는다(질문과 같은 준비도 문장은 질문 쪽만).
//  2) 자체 산술이 없다 — 영향 상자의 숫자는 「EU 기본값 채우기」와 같은 함수 + 엔진 재계산이고(손계산과 같다), 저장하지 않는다.
//  3) 어조: 오류가 없으면 「막는 것은 없습니다 — 지금도 파일을 만들 수 있습니다」, 오류만 「먼저 해결」이라 말한다.
//  4) 구조: 저장 코드는 todo-writes.ts 한 곳뿐이다(밖에서 산 열 「안 씁니다」와 구매 강재 칸은 질문 화면과 같은 쓰기 함수를 부른다). 지도 머리글의 「할 일 N」·서비스 워커·경로 검사에 올라 있다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');
const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const referenceSource = readFileSync('src/lib/reference-workbooks.ts', 'utf8')
  .replace("import { strFromU8, unzipSync } from 'fflate';", 'const { strFromU8, unzipSync } = fflate;')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/fuel-allocation.ts'),
  strip('src/lib/source-stream-input.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  referenceSource,
  strip('src/lib/guided-edit.ts'),
  strip('src/lib/bundled-references.ts'),
  strip('src/lib/conversation-precursor.ts'),
  strip('src/lib/see-flow.ts'),
  strip('src/lib/talk-flow.ts'),
  strip('src/lib/supplier-request.ts'),
  strip('src/lib/default-substitution.ts'),
  strip('src/lib/todo-edits.ts'),
  strip('src/lib/todo-items.ts'),
  'globalThis.app = { normalizeUnlocode, validateInstallationFieldAnswers, buildInstallationFieldUpdate, buildStreamFactorSourceUpdate, validateStreamFactorSource, FACTOR_SOURCE_CHOICES, INSTALLATION_FIELD_SPECS, calculateLocalResults, expandBundledDefaultValues, computeDefaultSubstitutionImpact, buildTodoItems, splitTodoMessage, TODO_DUPLICATE_OF_QUESTION_FRAGMENTS, TODO_SUPPLIER_SPLIT_FRAGMENT, buildSeeFlowBinding };',
].join('\n');
const context = vm.createContext({ Intl, fflate, console, Date, Map, Number, Set, Uint8Array, navigator: undefined });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

const dv = app.expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-05T00:00:00.000Z');

// ── 자료 ────────────────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR', ...stamp };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const product = { id: 'g', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const process = { id: 'pr', product_id: 'g', period_id: 'per', name: '나사 공정', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 100, direct_emissions_input_mode: 'MANUAL',
  electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47, no_purchased_precursors: false, ...stamp };
const precursor = { id: 'p1', process_id: 'pr', period_id: 'per', product_id: 'g', name: 'STS 와이어', precursor_cn_code: '72230019', aggregated_goods_category: 'Iron or steel products', production_route: '', supplier_installation: '대만와이어', supplier_reporting_period: undefined,
  supplier_country: 'Taiwan', data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED', purchased_mass_t: 110, consumed_mass_t: 100, consumed_for_non_cbam_mass_t: 0, direct_see_tco2e_per_t: 2, indirect_see_tco2e_per_t: 0, source: '공급사 회신',
  default_value_justification: '', default_value_year: '2026', ...stamp };
const engine = { products: [product], periods: [period], processes: [process], precursors: [precursor], productOutputLines: [], sourceStreams: [] };

// ── 1) 영향 상자: 손계산과 같다 ─────────────────────────────────────────
// 지금: (직접 100 + 구매 강재 100 t × 2.0) ÷ 1,000 t = 0.3. Taiwan 72230019 EU 기본값은 11(간접 없음)이라 바꾸면 (100 + 100 × 11) ÷ 1,000 = 1.2.
const impact = app.computeDefaultSubstitutionImpact({ engine, precursorId: 'p1', defaultValues: dv });
close(impact.fromSee, 0.3, '지금 기준 SEE');
close(impact.toSee, 1.2, '이 원료만 EU 기본값(대만 72230019 = 11)으로 바꾸면');
assert.equal(impact.reason, undefined);
assert.equal(app.computeDefaultSubstitutionImpact({ engine, precursorId: 'none', defaultValues: dv }).toSee, null);
const noDv = app.computeDefaultSubstitutionImpact({ engine, precursorId: 'p1', defaultValues: undefined });
assert.equal(noDv.toSee, null, '기본값 자료가 없으면 숫자를 지어내지 않는다');
assert.match(noDv.reason, /EU 기본값 자료를 아직 불러오지 못했습니다/);
assert.equal(noDv.fromSee !== null, true, '지금 값은 그대로 보인다');
const noCountry = app.computeDefaultSubstitutionImpact({ engine: { ...engine, precursors: [{ ...precursor, supplier_country: '' }] }, precursorId: 'p1', defaultValues: dv });
assert.equal(noCountry.toSee, null, '공급국가가 없으면 채우지 않는다(「EU 기본값 채우기」와 같다)');
const other = app.computeDefaultSubstitutionImpact({ engine: { ...engine, periods: [period, { ...period, id: 'per2' }] }, periodId: 'per', precursorId: 'p1', defaultValues: dv });
close(other.toSee, 1.2, '기간을 고르면 그 기간 결과만 본다');
// 저장하지 않는다: 입력 자료가 바뀌지 않는다.
assert.equal(engine.precursors[0].direct_see_tco2e_per_t, 2);
assert.equal(engine.precursors[0].data_mode, 'ACTUAL');

// ── 2) 가르는 규칙 ──────────────────────────────────────────────────
const base = { installations: [inst], periods: [period], products: [product], processes: [process], precursors: [], sourceStreams: [], readinessIssues: [], engineWarnings: [] };
const issue = (severity, area, message, extra = {}) => ({ severity, area, message, ...extra });
const owners = (result) => plain(result.items.map((item) => [item.id, item.owner, item.severity]));

// 한 공정에서 만드는 둘째 제품(수출분·내수분, 같은 원료의 다른 CN): 생산 라인이 있으면 「생산량을 알려 주세요」를 다시 묻지 않는다(run35 P1-06).
const productTwo = { ...product, id: 'g2', name: 'STS 나사 (비수출)', cn_code: '73181552', reporting_scope: 'CBAM_GOOD' };
const twoGoods = { ...base, products: [product, productTwo], processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO', no_purchased_precursors: true }], sourceStreams: [{ id: 's', process_id: 'pr', name: '도시가스' }] };
const outputAsked = (result) => plain(result.items.filter((item) => /:output$/.test(item.id)).map((item) => item.id));
assert.deepEqual(outputAsked(app.buildTodoItems(twoGoods)), ['q:g2:output'], '생산 라인을 모르면 둘째 제품의 생산량을 묻는다(종전)');
assert.deepEqual(outputAsked(app.buildTodoItems({ ...twoGoods, productOutputLines: [{ id: 'l1', process_id: 'pr', product_id: 'g', output_mass_t: 600 }, { id: 'l2', process_id: 'pr', product_id: 'g2', output_mass_t: 400 }] })), [], '둘 다 생산 라인이 있으면 묻지 않는다');

// 시작 전: 가장 앞 질문 하나만.
const fresh = app.buildTodoItems({ ...base, installations: [], periods: [], products: [], processes: [] });
assert.deepEqual(owners(fresh), [['q:company', 'company', 'notice']]);
assert.equal(fresh.hasData, false);
assert.equal(fresh.items[0].href, '/talk');
// 막 시작한 프로젝트(공정 없음)에는 EU 문서 점검 오류를 보이지 않는다 — 안 한 질문만.
const freshWithIssues = app.buildTodoItems({ ...base, installations: [], periods: [], products: [], processes: [], readinessIssues: [issue('error', '보고기간', '보고기간이 없습니다. 1단계에서 보고기간을 등록하세요.')], engineWarnings: [{ message: '확인 필요(규정): x. y.', targetType: 'process', targetId: 'z' }] });
assert.deepEqual(owners(freshWithIssues), [['q:company', 'company', 'notice']]);
assert.equal(freshWithIssues.counts.errors, 0);

// 공정이 있고 입력이 비어 있으면 질문 4개(구매 강재·연료·전력·열), 열은 이 자리에서 답할 수 있다.
const empty = app.buildTodoItems(base);
assert.deepEqual(owners(empty).map((row) => row[0]), ['q:g:precursor', 'q:g:fuel', 'q:g:electricity', 'q:g:heat']);
assert.ok(empty.items.every((item) => item.owner === 'company'));
const heat = empty.items.find((item) => item.id === 'q:g:heat');
assert.deepEqual(plain(heat.action), { kind: 'heat-none', processId: 'pr', processName: '나사 공정' });
assert.equal(empty.items.find((item) => item.id === 'q:g:fuel').action, undefined);
assert.equal(empty.hasData, true);
assert.equal(empty.counts.total, 4);
assert.equal(empty.counts.errors, 0);

// 준비도 검사
const mixed = app.buildTodoItems({
  ...base,
  processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO', no_purchased_precursors: true }],
  sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }],
  readinessIssues: [
    issue('warning', '사업장', '대일기업: 비어 있는 「법정 필수」 항목 — 운영자명. 검증인이 반드시 확인합니다.', { href: '/installations?edit=i' }),
    issue('error', '생산공정', '나사 공정: 시장 출하량이 맞지 않습니다. 3단계에서 고치세요.', { href: '/processes?edit=pr' }),
    issue('warning', '생산공정', '나사 공정: 사업장 밖에서 산 스팀·온수(측정가능열)를 쓰는지 답하지 않았습니다. 쓰면 더해야 합니다.'),
    issue('warning', '구매 전구물질', '나사 공정: 구매 전구물질이 없습니다. 강재를 사다 가공하는 공정이면 등록하세요.'),
    issue('warning', '구매 전구물질', 'STS 와이어: 간접 SEE 0.94의 전력사용량(MWh/t)·전력계수가 없습니다. EU 문서에는 1 MWh × 0.94로 적힙니다.', { precursorId: 'p1' }),
    issue('warning', '생산공정', '나사 공정: 확인 필요(규정) 배분 기준이 섞여 있습니다. 근거를 확인하세요.'),
    issue('error', '템플릿 한계', '현재 Export MVP는 생산공정 10개까지 지원합니다. 현재 11개입니다.'),
  ],
  precursors: [{ ...precursor, data_mode: 'DEFAULT' }],
});
const byId = (result, id) => result.items.find((item) => item.id === id);
assert.equal(byId(mixed, 'r:0').owner, 'company');
assert.equal(byId(mixed, 'r:1').owner, 'company');
assert.equal(byId(mixed, 'r:1').severity, 'error');
assert.equal(byId(mixed, 'r:2'), undefined, '질문과 같은 일(산 열 미답)은 준비도 쪽에서 뺀다');
assert.equal(byId(mixed, 'r:3'), undefined, '질문과 같은 일(구매 전구물질 없음)도');
assert.equal(byId(mixed, 'r:4').owner, 'supplier', '전구물질 간접 SEE 분해 요청은 공급사에게 받을 것');
assert.equal(byId(mixed, 'r:4').supplier.name, '대만와이어');
assert.equal(byId(mixed, 'r:5').owner, 'regulation', '「확인 필요(규정)」는 규정 칸');
assert.equal(byId(mixed, 'r:6').owner, 'company', '템플릿 한계는 회사가 줄이거나 지도로 가야 하는 것');
assert.equal(byId(mixed, 'r:0').href, '/installations?edit=i');
assert.equal(byId(mixed, 'r:0').title, '대일기업: 비어 있는 「법정 필수」 항목 — 운영자명');
assert.equal(byId(mixed, 'r:0').detail, '검증인이 반드시 확인합니다.');
assert.deepEqual(plain(app.splitTodoMessage('문장 하나뿐입니다.')), { title: '문장 하나뿐입니다', detail: '' });
assert.deepEqual(plain(app.splitTodoMessage('Daeil Industrial Co., Ltd. Ansan: 비어 있는 「법정 필수」 항목입니다. 검증인이 확인합니다.')), { title: 'Daeil Industrial Co., Ltd. Ansan: 비어 있는 「법정 필수」 항목입니다', detail: '검증인이 확인합니다.' }, '영문 약어의 마침표에서 자르지 않는다');
assert.deepEqual(plain(app.splitTodoMessage('SEE 3.764 → 5.70(약)입니다. 영향이 큽니다.')), { title: 'SEE 3.764 → 5.70(약)입니다', detail: '영향이 큽니다.' }, '숫자의 소수점에서 자르지 않는다');
// 오류가 맨 앞
assert.deepEqual(plain(mixed.items.slice(0, 2).map((item) => item.severity)), ['error', 'error']);
assert.equal(mixed.counts.errors, 2);
assert.equal(mixed.counts.total, mixed.items.length);
assert.equal(mixed.counts.company + mixed.counts.supplier + mixed.counts.regulation, mixed.counts.total);

// 공급사에게 받을 것: EU 기본값(실측이 아닌) 원료만, 공급사별로 한 장
const two = app.buildTodoItems({ ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO' }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }],
  precursors: [precursor, { ...precursor, id: 'p2', data_mode: 'DEFAULT', name: '다른 원료' }, { ...precursor, id: 'p3', data_mode: 'DEFAULT', name: '또 다른 원료', purchased_mass_t: 5 }, { ...precursor, id: 'p4', data_mode: 'DEFAULT', supplier_installation: '일본선재', supplier_country: 'Japan' }] });
const suppliers = two.items.filter((item) => item.owner === 'supplier');
assert.equal(suppliers.length, 2, '대만와이어(2개 원료)와 일본선재(1개) — 실측 원료 p1은 대상이 아니다');
const taiwan = suppliers.find((item) => item.supplier.country === 'Taiwan');
assert.deepEqual(plain(taiwan.supplier.items.map((entry) => entry.name)), ['다른 원료', '또 다른 원료']);
assert.equal(taiwan.title, '실측값 받기 — 원료 2개', '공급사 이름은 카드 위 이름표로 보이고 제목에는 되풀이하지 않는다');
assert.match(taiwan.detail, /원료가 2개/);

// 규정상 확인 필요: 제3자 검증이 없는 실측 → 영향 상자·근거, 같은 엔진 경고는 한 장으로
const provisional = app.buildTodoItems({
  ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO' }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }], precursors: [precursor],
  impactOf: (id) => app.computeDefaultSubstitutionImpact({ engine, precursorId: id, defaultValues: dv }),
  engineWarnings: [
    { message: '확인 필요(규정): STS 와이어의 실측 SEE에 제3자 검증보고서가 없습니다(공급사 확인 — 제3자 검증 아님). 지금 결과는 잠정값입니다.', targetType: 'precursor', targetId: 'p1', href: '/precursors?edit=p1' },
    { message: '확인 필요(규정): 폐가스 이전 보정은 지원하지 않습니다. 따로 확인하세요.', targetType: 'process', targetId: 'pr', href: '/processes?edit=pr' },
    { message: '제품 생산라인 합계가 공정 총 생산량과 1.0000 t 차이납니다.', targetType: 'process', targetId: 'pr' },
  ],
});
// 같은 잠정 경고가 준비도 검사로도 오면(실제 앱이 그렇다) 한 장으로 합친다.
const provisionalAgain = app.buildTodoItems({
  ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO' }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }], precursors: [precursor],
  readinessIssues: [issue('warning', '구매 전구물질', '확인 필요(규정): STS 와이어의 실측 SEE에 제3자 검증보고서가 없습니다(공급사 확인 — 제3자 검증 아님). 지금 결과는 잠정값입니다.', { precursorId: 'p1' })],
});
assert.equal(provisionalAgain.items.filter((item) => item.owner === 'regulation').length, 1, '준비도 검사의 같은 잠정 경고는 영향 상자 카드 하나로');
const regs = provisional.items.filter((item) => item.owner === 'regulation');
assert.equal(regs.length, 2, '잠정 실측 1장 + 폐가스 1장. 같은 엔진 경고는 중복되지 않고, 「확인 필요(규정)」가 아닌 경고는 싣지 않는다');
const prov = byId(provisional, 'p:p1');
assert.match(prov.title, /「STS 와이어」의 실측값은 아직 「잠정」입니다/);
assert.match(prov.detail, /공급사가 확인한 값이지만 제3자 검증보고서가 없습니다/);
assert.match(prov.evidence, /2025\/2547 ANNEX II, point A\.1\(4\)–\(5\)/);
close(prov.impact.fromSee, 0.3, '영향 상자 전');
close(prov.impact.toSee, 1.2, '영향 상자 후');
const gas = regs.find((item) => item.id !== 'p:p1');
assert.equal(gas.title, '폐가스 이전 보정은 지원하지 않습니다');
assert.equal(gas.href, '/processes?edit=pr');
// 검증이 끝난 실측은 잠정이 아니다
const verified = app.buildTodoItems({ ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO' }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }], precursors: [{ ...precursor, verification_status: 'VERIFIED' }] });
assert.equal(verified.counts.total, 0, '모든 것이 갖춰지면 할 일이 없다');
assert.equal(verified.hasData, true);

// ── 3) 원문 대조: 준비도 검사의 문장 조각 ────────────────────────────
const readiness = readFileSync('src/lib/eu-template-export.ts', 'utf8');
for (const fragment of [...app.TODO_DUPLICATE_OF_QUESTION_FRAGMENTS, app.TODO_SUPPLIER_SPLIT_FRAGMENT]) {
  assert.ok(readiness.includes(fragment), `준비도 검사 원문에 「${fragment}」가 있다 — 문장이 바뀌면 이 규칙도 고쳐야 한다`);
}
assert.ok(readiness.includes('사업장 밖에서 산 스팀·온수(측정가능열)를 쓰는지 답하지 않았습니다'));
assert.ok(readFileSync('src/lib/precursor-verification.ts', 'utf8').includes('제3자 검증보고서가 없습니다'), '엔진의 잠정 경고 문장 조각(할 일이 한 장으로 합칠 때 쓴다)');

// ── 4) 구조 ─────────────────────────────────────────────────────────
const todoDir = 'src/components/todo';
for (const name of readdirSync(todoDir).filter((file) => /\.(ts|tsx)$/.test(file))) {
  const text = readFileSync(`${todoDir}/${name}`, 'utf8');
  const writes = /createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(text);
  assert.equal(writes, name === 'todo-writes.ts', `${name}: 저장소 쓰기는 todo-writes.ts에만 있다`);
}
const ui = readFileSync(`${todoDir}/TodoWorkspace.tsx`, 'utf8');
assert.match(ui, /import \{ confirmNoImportedHeat \} from '@\/components\/talk\/talk-writes'/, '밖에서 산 열 「안 씁니다」는 질문 화면과 같은 쓰기 함수');
assert.match(ui, /막는 것은 없습니다 — 지금도 파일을 만들 수 있습니다\. 정리할수록 서류가 탄탄해집니다\./);
assert.match(ui, /EU 문서를 만들기 전에 해결할 것이 \$\{result\.counts\.errors\}건 있습니다/);
assert.match(ui, /저장하지 않은 모의 계산입니다/, '영향 상자는 모의 계산임을 말한다');
assert.match(ui, /누가 할 일인지로 보기/);
assert.match(ui, /화면별로 보기/);
assert.ok(!/\bAI\b|챗봇/.test(ui));
const data = readFileSync(`${todoDir}/todo-data.ts`, 'utf8');
assert.match(data, /evaluateEuExportReadiness\(/, '지도 7단계와 같은 준비도 검사');
assert.match(data, /computeDefaultSubstitutionImpact\(/);
const substitution = readFileSync('src/lib/default-substitution.ts', 'utf8');
for (const piece of ['fillEuDefault(', 'calculateLocalResults(', 'buildSeeFlowBinding(']) {
  assert.ok(substitution.includes(piece), `영향 계산은 ${piece}를 그대로 쓴다(자체 산술 없음)`);
}
assert.ok(!/ \* | \/ /.test(substitution.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), '영향 계산에 곱셈·나눗셈이 없다');
assert.match(readFileSync('src/app/todo/page.tsx', 'utf8'), /TodoWorkspace/);
const shell = readFileSync('src/components/AppShell.tsx', 'utf8');
assert.match(shell, /import \{ TodoNavLink \} from '@\/components\/todo\/TodoNavLink'/);
assert.match(shell, /'\/todo': '할 일'/);
assert.ok(shell.slice(shell.indexOf('function GuidedShell')).includes('<TodoNavLink />'), '지도 화면 머리글에 「할 일 N」');
assert.ok(readFileSync('public/sw.js', 'utf8').includes('"/todo"'), '서비스 워커가 /todo를 미리 담는다');
assert.ok(readFileSync('scripts/verify-production-routes.mjs', 'utf8').includes("'/todo'"));

// ── 5) 입력칸(칸 하나 채우기) ──────────────────────────────────────────
// 5-1) 점검이 경고와 함께 「무엇을 채우면 되는지」를 낸다 — 문장을 해석하지 않는다. 원문에 그 조각이 있어야 한다.
for (const fragment of ["fix: { kind: 'installation-fields', fields: missingOperatorFields }", "fix: { kind: 'installation-fields', fields: ['unlocode'] }", "fix: { kind: 'stream-factor-source' }", "fix: { kind: 'precursor-source' }", "fix: { kind: 'precursor-justification' }"]) {
  assert.ok(readiness.includes(fragment), `점검 원문에 ${fragment}`);
}
assert.ok(readiness.includes("!installationForCheck.operator_name?.trim() ? 'operator_name' as const"), '조건은 점검 한 곳에만 있다(메시지와 같은 식에서 칸 목록을 만든다)');
// 5-2) 순수 규칙
assert.equal(app.normalizeUnlocode(' kr pus '), 'KRPUS');
assert.equal(app.validateInstallationFieldAnswers(['unlocode'], {}), '채울 칸에 값을 적어 주세요.');
assert.match(app.validateInstallationFieldAnswers(['unlocode'], { unlocode: '부산' }), /KRPUS/);
assert.match(app.validateInstallationFieldAnswers(['unlocode'], { unlocode: 'KRPU' }), /3자리/);
assert.equal(app.validateInstallationFieldAnswers(['unlocode'], { unlocode: 'kr pus' }), null, '띄어 쓴 것도 받아 KRPUS로 맞춘다');
assert.equal(app.validateInstallationFieldAnswers(['operator_name', 'operator_reg_number'], { operator_name: ' (주)대일 ' }), null, '채운 칸만 본다 — 하나만 채워도 저장된다');
const stored = { id: 'i', ...stamp, name: 'Daeil', country: 'KR', street: '기존 주소', email: 'a@b.kr', operator_name: '기존 법인', boundary_json: { x: 1 } };
const updatedInst = app.buildInstallationFieldUpdate(stored, ['operator_name', 'operator_reg_number', 'unlocode'], { operator_name: '  ', operator_reg_number: ' 110111-1234567 ', unlocode: 'kr pus' });
assert.equal(updatedInst.operator_reg_number, '110111-1234567', '앞뒤 공백을 자른다');
assert.equal(updatedInst.unlocode, 'KRPUS');
assert.equal(updatedInst.operator_name, '기존 법인', '비워 둔 칸은 저장된 값을 지우지 않는다');
for (const key of ['street', 'email', 'country', 'name', 'id', 'created_at']) assert.equal(updatedInst[key], stored[key], `사업장 ${key} 보존`);
assert.deepEqual(plain(updatedInst.boundary_json), { x: 1 });
// 배출원: 근거 유형
const gasKind = { stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0 };
const stream = { id: 's1', ...stamp, ...gasKind, period_id: 'per', process_id: 'pr', name: '도시가스', activity_data: 128400, source: '고지서', factor_source_type: 'UNCLASSIFIED', note: '메모' };
assert.match(app.validateStreamFactorSource(app.buildStreamFactorSourceUpdate(stream, 'UNCLASSIFIED')), /근거 유형을 하나 고르세요/, '「분류 전」으로는 저장하지 않는다');
const classified = app.buildStreamFactorSourceUpdate(stream, 'NATIONAL_INVENTORY');
assert.equal(app.validateStreamFactorSource(classified), null);
assert.equal(classified.factor_source_type, 'NATIONAL_INVENTORY');
assert.equal(classified.note, '메모', '다른 필드는 그대로');
assert.equal(classified.activity_data, 128400);
assert.match(app.validateStreamFactorSource(app.buildStreamFactorSourceUpdate({ ...stream, source: '' }, 'NATIONAL_INVENTORY')), /./, '그 밖의 검증은 지도 4단계와 같은 함수(출처가 비면 막는다)');
assert.deepEqual(plain(app.FACTOR_SOURCE_CHOICES.map((option) => option.value)), ['EU_OR_IPCC_DEFAULT', 'NATIONAL_INVENTORY', 'SUPPLIER_OR_LAB'], '고르는 칸에는 「분류 전」이 없다');
// 5-3) 경고 → 입력칸 연결
const withFix = app.buildTodoItems({
  ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO', no_purchased_precursors: true }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }],
  precursors: [{ ...precursor, id: 'pa', data_mode: 'ACTUAL' }, { ...precursor, id: 'pm', data_mode: 'SEMI_ACTUAL' }],
  readinessIssues: [
    issue('warning', '사업장', '대일: 비어 있는 「법정 필수」 항목 — 운영자(법인)명 · 운영자 주소. 검증인이 확인합니다.', { targetId: 'i', fix: { kind: 'installation-fields', fields: ['operator_name', 'operator_address'] } }),
    issue('warning', '사업장', '대일: UN/LOCODE가 비어 있습니다. EU 문서에 빈 채로 나갑니다.', { targetId: 'i', fix: { kind: 'installation-fields', fields: ['unlocode'] } }),
    issue('warning', '생산공정', '가스: 배출계수 출처 유형이 분류되지 않았습니다. 근거를 정리하세요.', { targetId: 's1', fix: { kind: 'stream-factor-source' } }),
    issue('warning', '구매 전구물질', 'STS 와이어: SEE 출처가 비어 있습니다.', { targetId: 'pa', precursorId: 'pa', fix: { kind: 'precursor-source' } }),
    issue('warning', '구매 전구물질', 'STS 와이어: 기본값을 사용하는 사유가 비어 있습니다. 근거를 남기세요.', { targetId: 'pa', precursorId: 'pa', fix: { kind: 'precursor-justification' } }),
    issue('warning', '구매 전구물질', '혼합 원료: SEE 출처가 비어 있습니다.', { targetId: 'pm', precursorId: 'pm', fix: { kind: 'precursor-source' } }),
    issue('warning', '생산공정', '다른 경고입니다. 입력칸이 없습니다.', { targetId: 'pr' }),
  ],
});
const inputsOf = (id) => plain(byId(withFix, id).inputs);
assert.deepEqual(inputsOf('r:0'), { kind: 'installation', installationId: 'i', fields: ['operator_name', 'operator_address'] });
assert.deepEqual(inputsOf('r:1'), { kind: 'installation', installationId: 'i', fields: ['unlocode'] });
assert.deepEqual(inputsOf('r:2'), { kind: 'stream-factor-source', streamId: 's1' });
// 같은 원료의 출처·사유 경고(r:3, r:4)는 칸 둘의 한 카드로 합쳐진다 — 기본값 모드는 둘이 다 있어야 저장되므로 따로 두면 막다른 길이 된다.
assert.deepEqual(inputsOf('r:3'), { kind: 'precursor-text', precursorId: 'pa', fields: ['source', 'justification'] });
assert.equal(byId(withFix, 'r:4'), undefined, '합쳐진 카드 하나만 남는다');
assert.match(byId(withFix, 'r:3').title, /STS 와이어: SEE 출처와 기본값 사용 사유가 비어 있습니다/);
// 하나만 비어 있으면 칸도 하나
const onlySource = app.buildTodoItems({ ...base, processes: [{ ...process, electricity_mwh: 10, measurable_heat_import: 'NO', no_purchased_precursors: true }], sourceStreams: [{ id: 's', process_id: 'pr', name: '가스' }], precursors: [{ ...precursor, id: 'pa' }], readinessIssues: [issue('warning', '구매 전구물질', 'STS 와이어: SEE 출처가 비어 있습니다.', { targetId: 'pa', precursorId: 'pa', fix: { kind: 'precursor-source' } })] });
assert.deepEqual(plain(byId(onlySource, 'r:0').inputs), { kind: 'precursor-text', precursorId: 'pa', fields: ['source'] });
assert.equal(byId(withFix, 'r:5').inputs, undefined, '혼합(일부 실측) 원료는 질문 화면 고치기가 받지 않으므로 링크만');
assert.equal(byId(withFix, 'r:6').inputs, undefined, 'fix가 없는 경고에는 칸이 없다');
assert.equal(byId(withFix, 'r:0').owner, 'company');

// 5-4) 구조: 입력칸 저장은 todo-writes.ts 한 곳, 규칙은 todo-edits.ts, 구매 강재는 질문 화면 고치기
const writesSource = readFileSync(`${todoDir}/todo-writes.ts`, 'utf8');
assert.ok(writesSource.includes('return savePrecursorEdit(precursor, { ...answer, ...(source ? { source } : {}), ...(justification ? { justification } : {}) });'), '구매 강재 칸은 질문 화면 고치기(S7)와 같은 경로 — 적은 칸만 덮는다');
assert.ok(writesSource.includes('describePrecursorEditBlock(precursor)'));
assert.ok(writesSource.includes("updateLocalItem('installations', buildInstallationFieldUpdate(installation, fields, answers))"));
assert.ok(writesSource.includes("updateLocalItem('source_streams', updated)"));
const installationsPage = readFileSync('src/app/installations/page.tsx', 'utf8');
assert.match(installationsPage, /\.\.\.existingInstallation,\s*\.\.\.normalizedItem,/, '사업장 상세 화면도 기존을 펼친 위에 덮는다 — 같은 모양');
const ui2 = readFileSync(`${todoDir}/TodoWorkspace.tsx`, 'utf8');
assert.match(ui2, /data-testid="todo-inputs"/);
assert.ok(ui2.includes('saveInstallationFields(installation, inputs.fields, draft)'));
assert.ok(ui2.includes('saveStreamFactorSource(stream,'));
assert.ok(ui2.includes('savePrecursorTexts(precursor, draft)'));
assert.ok(ui2.includes('FACTOR_SOURCE_CHOICES.map'), '「분류 전」은 고르는 칸에 없다');
assert.ok(ui2.includes('INSTALLATION_FIELD_SPECS[field].hint'), '무엇을 적는지 칸마다 설명한다');

console.log('Todo verified (세 칸 가르기 · 질문과 중복 없음 · 영향 상자 = 기본값 채우기+엔진(손계산 0.3 → 1.2) · 입력칸 = 점검이 낸 fix + 기존 레코드를 펼쳐 칸만 덮음 · 저장 코드는 todo-writes.ts 한 곳 · 머리글·서비스 워커·경로 배선).');
