// 질문으로 입력(대화형 모드) S2 — 「제품별 생산량」 질문과 새 공정 빌더 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md
//
// 잠그는 것:
//  1) 새 순수 빌더(conversation-process.ts)의 결과: 공정·생산라인·활동수준 제외 라인의 필드와 값.
//  2) **지도 3단계 패널의 신규 경로와 어긋나지 않는다** — panels.tsx의 생성 객체 리터럴에서 필드 이름과 고정값을 읽어 빌더 결과와 대조한다.
//     (패널을 뜯지 않는 대신, 둘 중 하나가 필드를 더하거나 바꾸면 여기서 깨진다.)
//  3) 차례: 첫 기간에 공정이 없으면 「생산량」 질문, 다른 기간의 공정은 세지 않는다. 생산량은 추정하지 않는다(나중에 입력).
//  4) 쓰기 순서와 범위: 공정 → 제품 라인 → 제외 라인, talk-writes.ts 한 곳.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path) => readFileSync(path, 'utf8').replace(/^import [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
const source = [
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts'),
  strip('src/lib/conversation-process.ts'),
  strip('src/lib/talk-flow.ts'),
  'globalThis.app = { buildProcessCreation, validateProcessAnswer, defaultProcessName, deriveTalkState, DEFAULT_PROCESS_ROUTE, PROCESS_PLACEHOLDER_EF, EXCLUDED_LINE_NAME, EXCLUDED_LINE_NOTE };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));
const keysOf = (object) => Object.keys(object).sort();

const product = { id: 'g', name: 'STS 나사', cn_code: '73181552', hs_code: '7318', reporting_scope: 'CBAM_GOOD' };
const draft = { name: ' STS 나사 공정 ', route: '', periodId: 'per', product, massT: 3240, excludedMassT: 265 };

// ── 1) 빌더 ──────────────────────────────────────────────────────────
const made = app.buildProcessCreation(draft);
assert.deepEqual(plain(made.process), {
  period_id: 'per', product_id: 'g', name: 'STS 나사 공정', production_route: '가공(압연·신선·열처리)', output_mass_t: 3240,
  internal_consumption_mass_t: 0, market_output_mass_t: 3240, direct_attributable_emissions_tco2e: 0, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47,
}, '공정: 이름은 다듬고, 방식은 기본값, 시장 = 총 생산량(사내 이송 없음), 배출·전력은 0');
assert.equal(made.process.electricity_ef_source, undefined);
assert.deepEqual(plain(made.productLine), { product_id: 'g', name: 'STS 나사', output_mass_t: 3240, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '', reporting_scope: 'CBAM_GOOD' });
assert.deepEqual(plain(made.excludedLine), {
  name: '활동수준 제외분 (불량·부산물·스크랩)', output_mass_t: 265, allocation_basis: 'MASS', manual_allocation_percent: 0,
  note: '지도 3단계 입력 — 2025/2547 ANNEX II 점 F에 따라 활동수준 제외·배출 0', reporting_scope: 'WASTE_RECYCLE', activity_level_role: 'EXCLUDED',
});
assert.equal(app.buildProcessCreation({ ...draft, excludedMassT: 0 }).excludedLine, undefined, '스크랩이 없으면 제외 라인을 만들지 않는다');
assert.equal(app.buildProcessCreation({ ...draft, route: ' 냉간압조 ' }).process.production_route, '냉간압조', '적은 방식은 다듬어서 쓴다');
assert.equal(app.buildProcessCreation({ ...draft, product: { ...product, reporting_scope: 'NON_CBAM_COPRODUCT' } }).productLine.reporting_scope, 'NON_CBAM_COPRODUCT', '제품의 신고 범위를 그대로 따른다');
assert.equal(app.defaultProcessName(' STS 나사 '), 'STS 나사 공정');

// 검증 문장(지도 패널과 같은 뜻)
assert.match(app.validateProcessAnswer({ ...draft, name: '  ' }), /공정 이름을 입력하세요/);
assert.match(app.validateProcessAnswer({ ...draft, periodId: undefined }), /먼저 보고기간/);
for (const bad of [0, -5, NaN, Infinity * 0]) assert.match(app.validateProcessAnswer({ ...draft, massT: bad }), /생산량\(t\)을 0보다 크게/, `생산량 ${bad}은 받지 않는다`);
assert.match(app.validateProcessAnswer({ ...draft, excludedMassT: -1 }), /0 이상/);
assert.equal(app.validateProcessAnswer(draft), null);

// ── 2) 지도 3단계 패널의 신규 경로와 대조 ───────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
function objectLiteralAfter(marker) {
  const start = panels.indexOf(marker);
  assert.ok(start > 0, `패널에서 「${marker}」를 찾는다`);
  let depth = 0; let i = panels.indexOf('{', start);
  const from = i;
  for (; i < panels.length; i++) { if (panels[i] === '{') depth++; if (panels[i] === '}') { depth--; if (depth === 0) break; } }
  return panels.slice(from + 1, i);
}
const topLevelKeys = (literal) => {
  const keys = []; let depth = 0;
  for (const line of literal.split('\n')) {
    const code = line.replace(/\/\/.*$/, '');
    if (depth === 0) { const m = code.match(/^\s*([a-z0-9_]+)\s*[:,]/) ?? code.match(/^\s*\.\.\.([A-Za-z_.]+)/); if (m) keys.push(m[1]); }
    for (const ch of code) { if (ch === '{' || ch === '(' || ch === '[') depth++; if (ch === '}' || ch === ')' || ch === ']') depth--; }
  }
  return keys.sort();
};
const panelProcess = objectLiteralAfter("const process = await createLocalItem('processes', {");
assert.deepEqual(topLevelKeys(panelProcess), keysOf(made.process), '공정 생성 필드 이름이 패널과 같다');
for (const fixed of ['direct_attributable_emissions_tco2e: 0', 'electricity_mwh: 0', 'electricity_ef_tco2e_per_mwh: 0.47', 'electricity_ef_source: undefined', "|| '가공(압연·신선·열처리)'", 'internal_consumption_mass_t: internalTotal', 'market_output_mass_t: totalMass - internalTotal']) {
  assert.ok(panelProcess.includes(fixed), `패널 공정 생성에 「${fixed}」`);
}
const panelLine = objectLiteralAfter("lines.map((line) => createLocalItem('product_output_lines', {");
assert.deepEqual(topLevelKeys(panelLine), [...keysOf(made.productLine), 'process_id'].sort(), '제품 라인 필드 이름이 패널과 같다(+process_id)');
for (const fixed of ["allocation_basis: 'MASS' as const", 'manual_allocation_percent: 100', "note: ''", 'reporting_scope: getProductReportingScope(line.product)', 'name: line.product.name']) {
  assert.ok(panelLine.includes(fixed), `패널 제품 라인 생성에 「${fixed}」`);
}
const panelExcluded = objectLiteralAfter('const payload = {\n                process_id: processId,');
assert.deepEqual(topLevelKeys(panelExcluded), [...keysOf(made.excludedLine), 'process_id'].sort(), '활동수준 제외 라인 필드 이름이 패널과 같다(+process_id)');
for (const fixed of [`name: '${app.EXCLUDED_LINE_NAME}'`, `note: '${app.EXCLUDED_LINE_NOTE}'`, "reporting_scope: 'WASTE_RECYCLE' as const", "activity_level_role: 'EXCLUDED' as const", 'manual_allocation_percent: 0']) {
  assert.ok(panelExcluded.includes(fixed), `패널 제외 라인 생성에 「${fixed}」`);
}
// 패널의 순서: 공정 → 제품 라인 → 제외 라인
assert.ok(panels.indexOf("const process = await createLocalItem('processes'") < panels.indexOf("lines.map((line) => createLocalItem('product_output_lines'") && panels.indexOf("lines.map((line) => createLocalItem('product_output_lines'") < panels.indexOf('await upsertExcludedLine(process.id, [])'), '패널의 저장 순서');

// ── 3) 차례 ──────────────────────────────────────────────────────────
const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR' };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const proc = (extra = {}) => ({ id: 'pr', name: 'STS 나사 공정', period_id: 'per', output_mass_t: 3240, ...extra });
const base = { installations: [inst], periods: [period], products: [product] };
assert.equal(app.deriveTalkState({ ...base, processes: [] }).current, 'output', '제품까지 답했고 공정이 없으면 생산량');
assert.equal(app.deriveTalkState(base).current, 'output', 'processes를 안 넘겨도(S1 호출부) 같다');
assert.equal(app.deriveTalkState({ ...base, processes: [proc({ period_id: 'other' })] }).current, 'output', '다른 기간의 공정은 이 기간의 답이 아니다');
const answered = app.deriveTalkState({ ...base, processes: [proc()] });
assert.equal(answered.current, 'precursor', '공정까지 답하면 다음은 구매 강재(S3)');
assert.deepEqual(plain(answered.chips.at(-1)), { id: 'output', title: '생산량', answer: 'STS 나사 공정 · 3,240 t' });
const several = app.deriveTalkState({ ...base, processes: [proc(), proc({ id: 'p2', output_mass_t: 1860 })] });
assert.equal(several.chips.at(-1).answer, '공정 2개 · 5,100 t');
assert.equal(several.more.processes, 1, '둘 이상이면 나머지는 지도 화면으로 안내');
assert.equal(app.deriveTalkState({ installations: [inst], periods: [period], products: [], processes: [proc()] }).current, 'product', '제품이 없으면 공정이 있어도 제품부터');

// ── 4) 쓰기·화면 ─────────────────────────────────────────────────────
const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8');
const outputStart = writes.indexOf('export async function saveOutput');
const saveOutput = writes.slice(outputStart, writes.indexOf('export async function', outputStart + 10) > 0 ? writes.indexOf('export async function', outputStart + 10) : undefined);
assert.ok(saveOutput.indexOf("createLocalItem('processes', creation.process)") < saveOutput.indexOf("createLocalItem('product_output_lines', { process_id: process.id, ...creation.productLine })") && saveOutput.indexOf("...creation.productLine") < saveOutput.indexOf('...creation.excludedLine'), '공정 → 제품 라인 → 제외 라인');
assert.match(saveOutput, /validateProcessAnswer\(draft\)/);
assert.ok(!/updateLocalItem|deleteLocalItem/.test(saveOutput), 'S2는 새로 만들기만 한다(고치기·지우기는 지도 화면)');
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
assert.match(ui, /지금은 모릅니다 — 나중에 입력 \(생산량은 추정할 수 없어서 비워 둡니다\)/, '생산량은 추정하지 않는다');
assert.match(ui, /skip\('output'\)/);
assert.ok(!/saveOutput\([^)]*localStorage/.test(ui) && !/localStorage/.test(ui), '건너뛰기는 저장하지 않는다');
assert.match(ui, /chip\.id === 'output'/, '생산량 칩은 지도 3단계로 안내한다(고치기는 지도에서)');
assert.doesNotMatch(ui, /아직 준비 중입니다/); // run20: 요약·나누기가 이미 있으니 「준비 중」이라 말하지 않는다
assert.match(ui, /지금까지의 결과는 아래에 있습니다/);

console.log('Talk S2 verified (공정 빌더 = 지도 패널 신규 경로와 필드·고정값 일치 · 차례 · 생산량은 추정하지 않음 · 쓰기 순서).');
