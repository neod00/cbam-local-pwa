// 할 일 화면 (UX 목업 4번, 2026-10-06).
//
// 잠그는 것:
//  1) 「누가 할 일인지」로 가르는 규칙: 안 한 질문·준비도 검사·엔진의 「확인 필요(규정)」·잠정 실측 전구물질·EU 기본값 전구물질을
//     우리 회사 / 공급사 / 규정 세 칸으로 나눈다. 같은 일이 두 번 나오지 않는다(질문과 같은 준비도 문장은 질문 쪽만).
//  2) 자체 산술이 없다 — 영향 상자의 숫자는 「EU 기본값 채우기」와 같은 함수 + 엔진 재계산이고(손계산과 같다), 저장하지 않는다.
//  3) 어조: 오류가 없으면 「막는 것은 없습니다 — 지금도 파일을 만들 수 있습니다」, 오류만 「먼저 해결」이라 말한다.
//  4) 구조: 이 화면에는 저장 코드가 없다(밖에서 산 열 「안 씁니다」는 질문 화면과 같은 쓰기 함수를 부른다). 지도 머리글의 「할 일 N」·서비스 워커·경로 검사에 올라 있다.
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
  strip('src/lib/todo-items.ts'),
  'globalThis.app = { calculateLocalResults, expandBundledDefaultValues, computeDefaultSubstitutionImpact, buildTodoItems, splitTodoMessage, TODO_DUPLICATE_OF_QUESTION_FRAGMENTS, TODO_SUPPLIER_SPLIT_FRAGMENT, buildSeeFlowBinding };',
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
  assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(text), `${name}: 이 화면에는 저장 코드가 없다`);
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

console.log('Todo verified (세 칸 가르기 · 질문과 중복 없음 · 영향 상자 = 기본값 채우기+엔진(손계산 0.3 → 1.2) · 저장 코드 없음 · 머리글·서비스 워커·경로 배선).');
