// 질문으로 입력(대화형 모드) S1 — 사업장 → 보고기간 → 무엇을 만드시나요 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md
//
// 잠그는 것:
//  1) 어느 질문이 차례인지·칩·「더 있음」은 저장된 자료에서만 도출한다(상태를 따로 두지 않는다).
//  2) CN 안내는 막지 않고 알린다: 비대상·범위 밖·제품군 후보와 다른 앞자리·자리수.
//  3) 이 폴더의 쓰기는 talk-writes.ts 하나뿐이고, 지도 화면 패널과 같은 빌더 표현식을 쓴다 — 같은 답이면 같은 레코드(동등성).
//  4) 진입로·배선: 시작 안내 카드, 지도 하단 링크, 서비스 워커, 페이지 제목. 없는 기능(AI·자유 대화)을 말하지 않는다.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/product-label.ts'),
  strip('src/lib/talk-flow.ts'),
  'globalThis.app = { deriveTalkState, yearlyPeriodDraft, describeCnInput };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { deriveTalkState, yearlyPeriodDraft, describeCnInput } = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 1) 차례와 칩 ─────────────────────────────────────────────────────
const inst = { id: 'i', name: 'Daeil Fastener Co.', local_name: '대일기업', country: 'KR' };
const period = { id: 'p', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const product = { id: 'g', name: 'STS 나사', cn_code: '73181552' };
assert.equal(deriveTalkState({ installations: [], periods: [], products: [] }).current, 'company', '비어 있으면 회사부터');
assert.equal(deriveTalkState({ installations: [], periods: [period], products: [product] }).current, 'company', '사업장이 없으면 다른 답이 있어도 사업장부터(제품을 저장할 곳이 없다)');
assert.equal(deriveTalkState({ installations: [inst], periods: [], products: [] }).current, 'period');
assert.equal(deriveTalkState({ installations: [inst], periods: [period], products: [] }).current, 'product');
// S1 질문(사업장·기간·제품)까지만 보는 검사다. 제품 다음에는 S2의 「생산량」 질문이 있다(verify-talk-s2.mjs).
const asked = deriveTalkState({ installations: [inst], periods: [period], products: [product] });
assert.equal(asked.current, 'output', '제품까지 답하면 다음은 생산량(S2)');
assert.deepEqual(plain(asked.chips.map((chip) => chip.id)), ['company', 'period', 'product']);
const done = deriveTalkState({ installations: [inst], periods: [period], products: [product], processes: [{ id: 'pr', name: '공정', period_id: 'p', output_mass_t: 10, no_purchased_precursors: true, electricity_mwh: 5, measurable_heat_import: 'NO' }], sourceStreams: [{ id: 's', name: '연료', process_id: 'pr' }] });
assert.equal(done.current, undefined, '모든 질문에 답했으면 차례가 없다');
assert.equal(done.chips[0].answer, '대일기업 · KR', '이름은 한글 표기가 있으면 그것');
assert.equal(done.chips[2].answer, 'STS 나사 · CN 73181552');
const many = deriveTalkState({ installations: [inst, inst], periods: [period, period, period], products: [product] });
assert.deepEqual(plain(many.more), { installations: 1, periods: 2, products: 0, processes: 0 }, '첫 번째만 다루고 나머지는 알린다');
assert.deepEqual(plain(yearlyPeriodDraft(2025)), { name: '2025년 연간', startDate: '2025-01-01', endDate: '2025-12-31' }, '지도 1단계의 「2025년 연간」과 같은 값');

// ── 2) CN 안내 ───────────────────────────────────────────────────────
assert.equal(describeCnInput('', ['7318']).level, 'idle');
assert.match(describeCnInput('731815', ['7318']).text, /6자리 입력됨 — 8자리가 필요합니다/);
assert.equal(describeCnInput('731815521', []).level, 'warn');
assert.equal(describeCnInput('73181552', ['7318']).level, 'ok', '후보 앞자리와 같은 대상 품목');
const mismatch = describeCnInput('72139110', ['7318']);
assert.equal(mismatch.level, 'warn', '제품군 후보와 앞자리가 다르면 알린다(막지 않는다)');
assert.match(mismatch.text, /앱이 코드를 바꾸지 않습니다/);
assert.equal(describeCnInput('83111000', []).level, 'blocked', '피복봉(8311)은 대상이 아니다');
assert.equal(describeCnInput('72041000', []).level, 'blocked', '고철은 CN 목록에 없다');
assert.equal(describeCnInput('25232900', []).level, 'blocked', '시멘트는 앱 범위 밖(철강 전용)');
assert.equal(describeCnInput('76011000', []).level, 'warn', '템플릿 CN 목록에 없는 코드는 비대상이라 단정하지 않고 확인 필요');
assert.match(describeCnInput('76011000', []).text, /확인 필요/);
assert.equal(describeCnInput('73181552', []).level, 'ok', '후보를 안 골랐으면(직접 입력) 앞자리 비교를 하지 않는다');

// ── 3) 쓰기는 한 곳, 지도 패널과 같은 표현식 ─────────────────────────────
const talkDir = 'src/components/talk';
const files = readdirSync(talkDir).filter((name) => /\.(ts|tsx)$/.test(name));
for (const name of files) {
  const text = readFileSync(`${talkDir}/${name}`, 'utf8');
  const writes = /createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(text);
  assert.equal(writes, name === 'talk-writes.ts', `${name}: 저장소 쓰기는 talk-writes.ts에만 있다`);
}
const writes = readFileSync(`${talkDir}/talk-writes.ts`, 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
for (const expression of [
  "createLocalItem('installations', buildInstallationPayload(draft))",
  "updateLocalItem('installations', buildInstallationUpdate(",
  "createLocalItem('periods', { ...buildPeriodPayload(draft), status: 'DRAFT' as const })",
  "updateLocalItem('periods', buildPeriodUpdate(",
  "updateLocalItem('products', buildProductUpdate(",
]) {
  assert.ok(writes.includes(expression), `talk-writes에 「${expression}」`);
  assert.ok(panels.includes(expression), `지도 패널에도 같은 표현식 「${expression}」 — 같은 답은 같은 레코드`);
}
assert.ok(writes.includes("createLocalItem('products', buildProductPayload(draft, installationId))") && panels.includes("createLocalItem('products', buildProductPayload(draft, data.installations[0]?.id))"), '제품 신규도 같은 빌더(설치 id만 인자로 받는다)');
for (const validator of ['validateInstallationDraft', 'validatePeriodDraft', 'validateProductDraft']) {
  assert.ok(writes.includes(`${validator}(draft)`) && panels.includes(`${validator}(draft)`), `${validator}를 지도 패널과 같이 쓴다`);
}

// ── 4) 막대·진입로·배선 ──────────────────────────────────────────────
const workspace = readFileSync(`${talkDir}/TalkWorkspace.tsx`, 'utf8');
assert.match(workspace, /<CumulativeBar binding=\{binding\} results=\{data\.results\} precursors=\{data\.precursors\} products=\{data\.products\} partialReason=\{barPartial\} \/>/, '막대는 지도 화면과 같은 엔진 결과를 받는다(내 값을 지어내지 않는다 — S3부터 결과가 있다)');
assert.match(workspace, /같은 곳<\/span>에 저장되어서/, '같은 곳에 저장된다고 말한다');
assert.ok(!/\bAI\b|챗봇|자유 대화/.test(workspace), '없는 기능을 말하지 않는다');
const guide = readFileSync('src/components/guided/StartGuide.tsx', 'utf8');
assert.match(guide, /href="\/talk"[\s\S]*data-talk-card/, '시작 안내 카드');
assert.match(guide, /질문에 답만 하면 됩니다/);
assert.ok(!/\bAI\b|챗봇/.test(guide));
assert.match(readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8'), /href: '\/talk', label: '질문으로 입력\(시험\)'/, '지도 화면 하단 링크(기본 화면은 그대로 지도)');
assert.ok(readFileSync('public/sw.js', 'utf8').includes('"/talk"'), '오프라인 첫 실행용 서비스 워커');
assert.match(readFileSync('src/components/AppShell.tsx', 'utf8'), /'\/talk': '질문으로 입력'/);
assert.match(readFileSync('src/app/talk/page.tsx', 'utf8'), /<TalkWorkspace \/>/);

console.log('Talk S1 verified (차례·칩 저장 자료에서 도출 · CN 안내 막지 않음 · 쓰기 한 곳·지도 패널과 같은 빌더 · 진입로 배선).');
