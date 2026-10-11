// 질문으로 입력(대화형 모드) S3 — 「구매한 강재」 질문과 EU 기본값 채우기 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md
//
// 잠그는 것:
//  1) 「모르겠어요」→ EU 기본값: 내장 DV로 나라×CN을 찾고(나라를 고르기 전엔 채우지 않는다), 직접·간접 분해와 출처·사유 문장이 지도 6단계 패널과 같다.
//  2) 저장은 지도 패널의 검증·빌더·연결(기간·공정·공정의 대표 제품)을 그대로 쓴다 — 초안의 필드가 패널의 `baseDraft`와 같다.
//  3) 차례: 첫 공정에 전구물질이 없고 「없음」 확인도 없으면 묻는다. 다른 공정의 전구물질은 세지 않는다. 확인한 「없음」은 지도 체크 칸과 같은 값이다.
//  4) 막대: 구매 강재가 필요한데 없거나 연료·전력이 아직 없으면 기본값과의 차이를 내지 않는다(run19 결함 02와 같은 원리).
//  5) 끝에서 끝까지: 답 → 초안 → 엔진 결과가 손계산과 같다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
  strip('src/lib/product-label.ts'),
  strip('src/lib/talk-flow.ts'),
  'globalThis.app = { calculateLocalResults, expandBundledDefaultValues, fillEuDefault, buildPrecursorDraft, validatePrecursorDraft, buildPrecursorCreate, deriveTalkState, describeTalkBarPartial };',
].join('\n');
const context = vm.createContext({ Intl, fflate, console, Date, Map, Number, Set, Uint8Array, navigator: undefined });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-9, `${message}: ${a} vs ${b}`);

const dv = app.expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-05T00:00:00.000Z');

// ── 1) EU 기본값 채우기 ──────────────────────────────────────────────
const tw = app.fillEuDefault({ reference: dv, country: 'Taiwan', cnDigits: '72230019' });
assert.equal(tw.ok, true);
assert.equal(tw.direct, 11, '대만 7223 00: 파일 10 → 2026 mark-up 포함 11');
assert.equal(tw.indirect, 0, '간접 N/A면 0 — 없는 간접을 만들어내지 않는다');
assert.equal(tw.hasIndirect, false);
assert.equal(tw.source, 'DVs as adopted_v20260204 .xlsx / Taiwan / 722300');
assert.equal(tw.justification, '공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026, markup 포함) 적용. 직접 11 · 이 CN의 공식 DV는 간접값 미제공(간접 0)');
assert.match(tw.message, /간접값을 제공하지 않아 간접을 0으로/);
const kr = app.fillEuDefault({ reference: dv, country: 'South Korea', cnDigits: '72230019' });
close(kr.direct, 4.015, '같은 CN이 한국이면 4.015 — 나라가 값을 바꾼다');
assert.match(app.fillEuDefault({ reference: dv, country: '', cnDigits: '72230019' }).reason, /먼저 「공급국가」를 고르세요/, '나라를 고르기 전에는 채우지 않는다');
assert.match(app.fillEuDefault({ reference: dv, country: 'Narnia', cnDigits: '72230019' }).reason, /Narnia · CN 72230019에 맞는 기본값을 찾지 못했습니다/);
assert.match(app.fillEuDefault({ reference: dv, country: 'Taiwan', cnDigits: '' }).reason, /CN 미입력/);
assert.match(app.fillEuDefault({ reference: undefined, country: 'Taiwan', cnDigits: '72230019' }).reason, /EU 기본값 자료를 아직 불러오지 못했습니다/);

// ── 2) 지도 6단계 패널과 문장·호출 대조 ──────────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
const lib = readFileSync('src/lib/conversation-precursor.ts', 'utf8');
for (const fragment of [
  '공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026, markup 포함) 적용. 직접 ${direct}',
  "' · 이 CN의 공식 DV는 간접값 미제공(간접 0)'",
  '` · 간접 ${indirect}`',
  '`${reference.summary.filename} / ${match.country} / ${match.cn_code}`',
  "'EU 기본값을 채웠습니다. 공급사 실측자료를 받으면 교체하세요.'",
  '이 CN의 공식 DV는 간접값을 제공하지 않아 간접을 0으로 두었습니다(직접값은 2026 markup 포함). 공급사 실측자료를 받으면 교체하세요.',
  '」를 고르세요. EU 기본값은 원료를 만든 나라마다 다릅니다(예: 같은 STS 와이어가 한국 4.015 · 대만 11).',
  '에 맞는 기본값을 찾지 못했습니다. 공급국가와 CN 코드를 확인하세요.',
  "findDefaultValueReference(reference, supplierCountry, cnDigits, '2026')",
  "resolveDefaultSeeForYear(match, '2026')",
]) {
  assert.ok(panels.includes(fragment), `지도 패널에 「${fragment.slice(0, 40)}…」`);
  const asLib = fragment
    .replace('supplierCountry', 'input.country').replace('cnDigits, ', 'input.cnDigits, ').replace('(reference, ', '(input.reference, ')
    .replace('${reference.summary', '${input.reference.summary').replace('${match.country}', '${match.country}')
    .replace("(2026, markup", "(2026, markup").replace("'2026'", 'DEFAULT_FILL_YEAR');
  assert.ok(lib.includes(fragment) || lib.includes(asLib), `채우기 함수에도 같은 조각 「${fragment.slice(0, 40)}…」`);
}
// 초안 필드 = 패널의 baseDraft
const baseDraftBlock = panels.slice(panels.indexOf('const baseDraft: PrecursorDraft = {'));
const baseDraftLiteral = baseDraftBlock.slice(baseDraftBlock.indexOf('{') + 1, baseDraftBlock.indexOf('};'));
const panelKeys = baseDraftLiteral.split('\n').map((line) => line.match(/^\s+([a-zA-Z]+)[,:]/)?.[1]).filter(Boolean).sort();
const answer = { name: ' 대만산 선재 ', cn: '7223 0019', consumed: '1,050', purchased: '', country: 'Taiwan', mode: 'DEFAULT', directSee: '11', indirectSee: '0', source: tw.source, justification: tw.justification };
const draft = app.buildPrecursorDraft(answer);
assert.deepEqual(Object.keys(draft).sort(), panelKeys, '초안의 필드가 지도 패널의 baseDraft와 같다');
assert.deepEqual(plain(draft), {
  name: ' 대만산 선재 ', cnDigits: '72230019', consumedMass: 1050, purchasedMass: 0, directSee: 11, indirectSee: 0, bridgeUsage: 0, bridgeFactor: 0,
  source: tw.source, dataMode: 'DEFAULT', justification: tw.justification, supplierInstallation: '', supplierRoute: '', supplierPeriod: '', supplierCountry: 'Taiwan',
}, '쉼표·공백을 다듬고, 칸이 없는 값은 패널이 비워 두는 값과 같이 비운다');
assert.equal(app.buildPrecursorDraft({ ...answer, mode: 'ACTUAL', justification: '남은 사유' }).justification, '', '실측이면 기본값 사유를 싣지 않는다');
// 검증은 지도 패널과 같은 함수
assert.match(app.validatePrecursorDraft({ ...draft, consumedMass: 0 }), /소비량\(t\)을 입력하세요/);
assert.match(app.validatePrecursorDraft({ ...draft, supplierCountry: '' }), /공급국가/);
assert.match(app.validatePrecursorDraft(app.buildPrecursorDraft({ ...answer, mode: 'ACTUAL', source: '' })), /출처/);

// 쓰기: 같은 호출·같은 연결
const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8').replace(/\s+/g, ' ');
const panelSave = panels.replace(/\s+/g, ' ');
const link = "buildPrecursorCreate(draft, { period_id: process.period_id, process_id: process.id, product_id: process.product_id, })";
assert.ok(writes.includes("createLocalItem('precursors', " + link) && panelSave.includes("createLocalItem('precursors', " + link), '전구물질 신규 저장 호출과 연결(기간·공정·공정의 대표 제품)이 패널과 글자 그대로 같다');
assert.ok(writes.includes('validatePrecursorDraft(draft)') && panelSave.includes('validatePrecursorDraft(baseDraft)'), '같은 검증');
assert.ok(panelSave.includes("await updateLocalItem('processes', { ...process, no_purchased_precursors:") && writes.includes("updateLocalItem('processes', { ...process, no_purchased_precursors: true })"), '「구매 강재 없음」은 지도 체크 칸과 같은 필드');

// ── 3) 차례 ──────────────────────────────────────────────────────────
const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR' };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const product = { id: 'g', name: 'STS 와이어', cn_code: '72230019' };
const proc = (extra = {}) => ({ id: 'pr', name: 'STS 와이어 공정', period_id: 'per', output_mass_t: 3240, ...extra });
const pre = (extra = {}) => ({ id: 'pre1', name: '대만산 선재', process_id: 'pr', ...extra });
const base = { installations: [inst], periods: [period], products: [product] };
assert.equal(app.deriveTalkState({ ...base, processes: [proc()], precursors: [] }).current, 'precursor', '공정까지 답했고 전구물질이 없으면 구매 강재');
assert.equal(app.deriveTalkState({ ...base, processes: [proc()] }).current, 'precursor', 'precursors를 안 넘겨도(S2 호출부) 같다');
assert.equal(app.deriveTalkState({ ...base, processes: [proc()], precursors: [pre({ process_id: 'other' })] }).current, 'precursor', '다른 공정의 전구물질은 이 공정의 답이 아니다');
const withPre = app.deriveTalkState({ ...base, processes: [proc()], precursors: [pre(), pre({ id: 'pre2', name: '국산 선재' })] });
assert.ok(!withPre.pending.includes('precursor'), '전구물질이 있으면 구매 강재는 답한 것(다음은 S4의 연료)');
assert.deepEqual(plain(withPre.chips.at(-1)), { id: 'precursor', title: '구매 강재', answer: '2건 · 대만산 선재, 국산 선재' });
assert.equal(withPre.precursorCount, 2);
const none = app.deriveTalkState({ ...base, processes: [proc({ no_purchased_precursors: true })], precursors: [] });
assert.ok(!none.pending.includes('precursor'), '「구매 강재 없음」을 확인했으면 구매 강재는 더 묻지 않는다');
assert.equal(none.chips.at(-1).answer, '없음 (확인함)');
assert.equal(app.deriveTalkState({ ...base, processes: [], precursors: [pre()] }).current, 'output', '공정이 없으면 전구물질이 있어도 생산량부터');

// ── 4) 막대 안내 ─────────────────────────────────────────────────────
assert.match(app.describeTalkBarPartial({ hasFuelOrElectricity: true, precursorsPending: true }), /구매한 강재\(전구물질\)를 아직 넣지 않았습니다/);
assert.match(app.describeTalkBarPartial({ hasFuelOrElectricity: false, precursorsPending: false }), /연료·전기는 아직 넣지 않았습니다/);
assert.equal(app.describeTalkBarPartial({ hasFuelOrElectricity: true, precursorsPending: false }), undefined, '입력이 갖춰지면 안내하지 않는다');

// ── 5) 끝에서 끝까지: 답 → 초안 → 레코드 → 엔진 ───────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const eperiod = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const eproduct = { id: 'g', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const eprocess = { id: 'pr', product_id: 'g', period_id: 'per', name: '가공', production_route: '가공', output_mass_t: 1000, market_output_mass_t: 1000, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 0, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47, ...stamp };
const record = { id: 'pre1', ...stamp, ...app.buildPrecursorCreate(draft, { period_id: 'per', process_id: 'pr', product_id: 'g' }) };
assert.equal(record.verification_status, 'UNVERIFIED');
assert.equal(record.default_value_year, '2026');
assert.equal(record.aggregated_goods_category, 'Iron or steel products');
const results = app.calculateLocalResults({ products: [eproduct], periods: [eperiod], processes: [eprocess], precursors: [{ ...record, consumed_mass_t: 610, purchased_mass_t: 610 }], productOutputLines: [] });
close(results[0].see_cbam_basis, (610 * 11) / 1000, '기준 SEE = 소비량 610 t × 기본값 11 ÷ 생산량 1,000 t');

// ── 6) 화면 ──────────────────────────────────────────────────────────
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
assert.match(ui, /EU 기본값 채우기/);
assert.match(ui, /모르겠어요 \(EU 기본값으로 채웁니다\)/);
assert.match(ui, /앱이 대신 고르지 않습니다/, '공급국가는 앱이 고르지 않는다');
assert.match(ui, /setPFill\(null\)/, '나라·CN을 바꾸면 채워 둔 값을 비운다(기본값은 나라마다 다르다)');
assert.match(ui, /먼저 「EU 기본값 채우기」를 누르세요/);
assert.match(ui, /지금은 모릅니다 — 나중에 입력/);
assert.match(ui, /<CumulativeBar binding=\{binding\} results=\{data\.results\} precursors=\{data\.precursors\} products=\{data\.products\} partialReason=\{barPartial\} \/>/, '막대는 지도 화면과 같은 엔진 결과를 받는다');
assert.ok(!/\bAI\b|챗봇/.test(ui));
const files = ['TalkWorkspace.tsx'];
for (const name of files) assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(readFileSync(`src/components/talk/${name}`, 'utf8')), `${name}에는 저장소 쓰기가 없다`);

console.log('Talk S3 verified (EU 기본값 채우기 = 지도 패널과 같은 문장·값 · 초안 필드 = 패널 baseDraft · 같은 저장 호출 · 차례 · 막대 부분 안내 · 엔진 손계산 일치).');
