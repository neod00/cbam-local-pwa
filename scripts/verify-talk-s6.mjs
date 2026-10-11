// 질문으로 입력(대화형 모드) S6 — 둘째 제품 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md §6-1
//
// 잠그는 것:
//  1) 질문 5~8은 「지금 묻는 제품」의 공정에 붙는다. 첫 제품은 예전 규칙 그대로(자기 공정, 없으면 첫 공정), 둘째 이후 제품은 자기 공정만 —
//     다른 제품의 공정에 질문이 붙거나 그 공정의 답이 둘째 제품의 답으로 세어지지 않는다.
//  2) 지금 묻는 제품은 (고른 제품 → 건너뛰지 않은 남은 질문이 있는 첫 제품 → 첫 제품) 순이고, 「나중에 입력」은 제품별로 기억한다.
//  3) 같은 CN의 둘째 제품은 막지 않고 알린다(2025/2547 제4조 6항). 한 제품이라도 비었으면 막대는 「일부일 뿐」이라고 말한다.
//  4) 새 저장 코드는 없다 — 제품 신규는 S1과 같은 saveProduct(지도 패널과 같은 빌더), 공정·구매 강재·연료·전력·열은 S2~S4 함수 그대로.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/talk-flow.ts'),
  'globalThis.app = { deriveTalkState, linkProcessesByOutputLines, pickFocusProcess, pickFocusProductId, talkSkipKey, describeDuplicateCn, describeTalkPartial, describeTalkBarPartial };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));

const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR' };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const prodA = { id: 'a', name: 'STS 나사', cn_code: '73181552' };
const prodB = { id: 'b', name: '냉간압조 와이어', cn_code: '72299020' };
const procA = { id: 'pa', name: 'STS 나사 공정', period_id: 'per', product_id: 'a', output_mass_t: 3240, electricity_mwh: 3500, electricity_ef_tco2e_per_mwh: 0.47, no_purchased_precursors: true, measurable_heat_import: 'NO', direct_attributable_emissions_tco2e: 266 };
const procB = { id: 'pb', name: '와이어 공정', period_id: 'per', product_id: 'b', output_mass_t: 800, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47 };
const streamA = { id: 's1', name: '도시가스', process_id: 'pa' };
const base = { installations: [inst], periods: [period], products: [prodA, prodB] };

// ── 1) 질문이 붙는 공정 ──────────────────────────────────────────────
assert.equal(app.pickFocusProcess([procA, procB], [prodA, prodB], prodB).id, 'pb', '둘째 제품은 자기 공정');
assert.equal(app.pickFocusProcess([procA], [prodA, prodB], prodB), undefined, '둘째 제품은 자기 공정이 없으면 없는 것이다 — 첫 공정을 빌리지 않는다');
assert.equal(app.pickFocusProcess([procB], [prodA, prodB], prodA).id, 'pb', '첫 제품은 예전 규칙: 자기 공정이 없으면 첫 공정(이미 있는 공정이 생산량 질문을 대신한다)');
assert.equal(app.pickFocusProcess([procA], [prodA], undefined), undefined);

// 둘째 제품에 공정이 없으면 생산량 질문 하나만 남는다 — 첫 제품의 공정이 있어도.
const s0 = app.deriveTalkState({ ...base, processes: [procA], precursors: [], sourceStreams: [streamA], focusProductId: 'b' });
assert.deepEqual(plain(s0.pending), ['output']);
assert.equal(s0.chips.find((chip) => chip.id === 'product').answer, '냉간압조 와이어 · CN 72299020', '칩의 제품은 지금 묻는 제품');
assert.equal(s0.chips.find((chip) => chip.id === 'output'), undefined, '첫 제품의 생산량을 둘째 제품의 답으로 보이지 않는다');
assert.equal(s0.focusProductId, 'b');
// 첫 제품 기준은 그대로(제품이 하나일 때와 같은 결과)
const sFirst = app.deriveTalkState({ ...base, processes: [procA], precursors: [], sourceStreams: [streamA], focusProductId: 'a' });
assert.deepEqual(plain(sFirst.pending), []);
assert.equal(plain(app.deriveTalkState({ installations: [inst], periods: [period], products: [prodA], processes: [procA], precursors: [], sourceStreams: [streamA] }).pending).length, 0, '제품이 하나면 focus 없이도 같다');

// ── run35 P1-06) 한 공정에서 제품을 여럿 만들 때: 공정은 대표 제품 하나만 가리키고 나머지 제품은 생산 라인으로 이어진다 ──
const lineA = { id: 'la', process_id: 'pa', product_id: 'a', output_mass_t: 3000 };
const lineB = { id: 'lb', process_id: 'pa', product_id: 'b', output_mass_t: 240 };
assert.equal(app.pickFocusProcess([procA], [prodA, prodB], prodB, app.linkProcessesByOutputLines([lineA, lineB])).id, 'pa', '둘째 제품의 생산 라인이 든 공정이 그 제품의 공정이다');
assert.equal(app.pickFocusProcess([procA], [prodA, prodB], prodB, app.linkProcessesByOutputLines([lineA, { ...lineB, output_mass_t: 0 }])), undefined, '생산량 0인 라인은 만든다고 보지 않는다');
assert.equal(app.pickFocusProcess([procA], [prodA, prodB], prodB, app.linkProcessesByOutputLines([lineA, { ...lineB, activity_level_role: 'EXCLUDED' }])), undefined, '활동수준 제외 라인도 아니다');
const shared = app.deriveTalkState({ ...base, processes: [procA], precursors: [], sourceStreams: [streamA], productOutputLines: [lineA, lineB], focusProductId: 'b' });
assert.deepEqual(plain(shared.pending), [], '이미 생산량을 넣은 둘째 제품의 생산량을 다시 묻지 않는다');
assert.equal(shared.chips.find((chip) => chip.id === 'output').answer, 'STS 나사 공정 · 3,240 t', '답은 그 공정의 것');
assert.deepEqual(plain(shared.products.map((item) => item.pending)), [[], []], '제품별 남은 질문도 비어 있다');
assert.deepEqual(plain(app.deriveTalkState({ ...base, processes: [procA], precursors: [], sourceStreams: [streamA], focusProductId: 'b' }).pending), ['output'], '라인을 모르면(예전 호출) 종전과 같다');
assert.ok((app.describeTalkPartial({ products: [prodA, prodB], processes: [procA], precursors: [], sourceStreams: [streamA] }) ?? '').includes('냉간압조 와이어'), '라인이 없으면 생산량 없는 제품으로 센다');
assert.ok(!(app.describeTalkPartial({ products: [prodA, prodB], processes: [procA], precursors: [], sourceStreams: [streamA], productOutputLines: [lineA, lineB] }) ?? '').includes('냉간압조 와이어'), '라인이 있으면 세지 않는다');

// 공정이 생긴 뒤에는 그 공정에 대해 구매 강재·연료·전력·열이 차례로 남는다.
const s1 = app.deriveTalkState({ ...base, processes: [procA, procB], precursors: [], sourceStreams: [streamA], focusProductId: 'b' });
assert.deepEqual(plain(s1.pending), ['precursor', 'fuel', 'electricity', 'heat']);
assert.equal(s1.chips.find((chip) => chip.id === 'output').answer, '와이어 공정 · 800 t');
// 첫 제품의 연료는 둘째 제품의 연료로 세어지지 않는다(공정 id로 센다).
assert.equal(s1.chips.find((chip) => chip.id === 'fuel'), undefined);
const precursorB = { id: 'pr1', process_id: 'pb', name: '원료' };
const precursorA = { id: 'pr0', process_id: 'pa', name: '다른 원료' };
const s2 = app.deriveTalkState({ ...base, processes: [procA, procB], precursors: [precursorA, precursorB], sourceStreams: [streamA], focusProductId: 'b' });
assert.equal(s2.precursorCount, 1, '구매 강재 수도 이 제품의 공정 것만');
assert.deepEqual(plain(s2.pending), ['fuel', 'electricity', 'heat']);

// 첫 제품도 자기 공정이 있고 공정이 여럿이면 자기 공정만 말한다. 자기 공정이 없으면(예전 규칙) 전체 합계.
const sBoth = app.deriveTalkState({ ...base, processes: [procA, procB], precursors: [], sourceStreams: [streamA], focusProductId: 'a' });
assert.equal(sBoth.chips.find((chip) => chip.id === 'output').answer, 'STS 나사 공정 · 3,240 t');
const sLegacy = app.deriveTalkState({ ...base, products: [prodA], processes: [{ ...procB, product_id: 'other' }, { ...procA, product_id: 'other2' }], precursors: [], sourceStreams: [] });
assert.equal(sLegacy.chips.find((chip) => chip.id === 'output').answer, '공정 2개 · 4,040 t', '자기 공정이 없으면 예전처럼 전체');

// 제품별 남은 질문(전체 현황)
const ov = app.deriveTalkState({ ...base, processes: [procA, procB], precursors: [], sourceStreams: [streamA] });
assert.deepEqual(plain(ov.products.map((item) => [item.id, item.pending])), [['a', []], ['b', ['precursor', 'fuel', 'electricity', 'heat']]]);
const ovNoProc = app.deriveTalkState({ ...base, processes: [procA], precursors: [], sourceStreams: [streamA] });
assert.deepEqual(plain(ovNoProc.products.map((item) => item.pending)), [[], ['output']]);
assert.deepEqual(plain(app.deriveTalkState({ installations: [inst], periods: [], products: [prodA, prodB] }).products.map((item) => item.pending)), [[], []], '기간이 없으면 제품별 질문은 아직 없다');

// ── 2) 지금 묻는 제품 ────────────────────────────────────────────────
const key = app.talkSkipKey;
assert.notEqual(key('a', 'fuel'), key('b', 'fuel'), '건너뛰기는 제품별로');
assert.equal(app.pickFocusProductId(ov.products, []), 'b', '남은 질문이 있는 첫 제품');
assert.equal(app.pickFocusProductId(ov.products, [key('b', 'precursor'), key('b', 'fuel'), key('b', 'electricity'), key('b', 'heat')]), 'a', '다 건너뛰었으면 첫 제품(완료 카드로)');
assert.equal(app.pickFocusProductId(ov.products, [key('b', 'precursor')]), 'b', '일부만 건너뛰면 그 제품에 남은 질문이 있다');
assert.equal(app.pickFocusProductId(ov.products, [], 'a'), 'a', '사용자가 고른 제품이 먼저');
assert.equal(app.pickFocusProductId(ov.products, [], 'gone'), 'b', '없는 제품 id는 무시');
assert.equal(app.pickFocusProductId([], []), undefined);
assert.equal(app.pickFocusProductId(ovNoProc.products, []), 'b', '새로 만든 제품(공정 없음)으로 자동으로 넘어간다');

// ── 3) 같은 CN 알림 · 부분 입력 안내 ───────────────────────────────────
const dup = app.describeDuplicateCn('73181552', [{ name: 'STS 나사', cnCode: '73181552' }]);
assert.match(dup, /「STS 나사」과 CN 코드가 같습니다/);
assert.match(dup, /제4조 6항/);
assert.match(dup, /제품 라인/, '고치는 길(지도 3단계의 제품 라인)을 알려 준다');
assert.equal(app.describeDuplicateCn('72299020', [{ name: 'STS 나사', cnCode: '73181552' }]), undefined);
assert.equal(app.describeDuplicateCn('7318155', [{ name: 'STS 나사', cnCode: '73181552' }]), undefined, '8자리가 되기 전에는 말하지 않는다');
assert.equal(app.describeDuplicateCn('73181552', [{ name: 'x', cnCode: '' }]), undefined);

const partialInput = { products: [prodA, prodB], processes: [procA, procB], precursors: [precursorB], sourceStreams: [streamA, { id: 's2', process_id: 'pb' }] };
assert.equal(app.describeTalkPartial({ ...partialInput, processes: [] }), undefined, '공정이 하나도 없으면 막대는 기본값 기둥만이다');
assert.match(app.describeTalkPartial({ ...partialInput, processes: [procA] }), /「냉간압조 와이어」의 생산량을 아직 넣지 않았습니다.*일부 제품만 반영한 중간 값/, '한 제품의 생산량이 비면 말한다');
assert.match(app.describeTalkPartial({ ...partialInput, precursors: [] }), /구매한 강재\(전구물질\)를 아직 넣지 않았습니다/, '둘째 제품의 구매 강재가 비어도(첫 제품은 없음 확인) 일부일 뿐');
assert.match(app.describeTalkPartial({ ...partialInput, sourceStreams: [streamA] }), /연료·전기는 아직 넣지 않았습니다/, '둘째 제품의 연료·전력이 비면 일부일 뿐(첫 제품에 있어도)');
assert.equal(app.describeTalkPartial(partialInput), undefined, '모두 갖춰지면 안내하지 않는다');
// 제품 하나일 때는 예전 문안과 같다
assert.equal(app.describeTalkPartial({ products: [prodA], processes: [procA], precursors: [], sourceStreams: [streamA] }), undefined);
assert.equal(
  app.describeTalkPartial({ products: [prodA], processes: [{ ...procA, no_purchased_precursors: false, electricity_mwh: 0, direct_attributable_emissions_tco2e: 0 }], precursors: [], sourceStreams: [] }),
  app.describeTalkBarPartial({ hasFuelOrElectricity: false, precursorsPending: true }),
);

// ── 4) 화면 배선 ─────────────────────────────────────────────────────
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
assert.match(ui, /pickFocusProductId\(overview\.products, skipped, focusId\)/, '지금 묻는 제품: 고른 제품 → 남은 질문이 있는 첫 제품');
assert.match(ui, /deriveTalkState\(\{ \.\.\.data, focusProductId \}\)/);
assert.match(ui, /const allProducts = byCreation\(rawProducts\);/, '제품은 만든 순서로 고정한다 — 저장소는 id 순으로 돌려줘서 둘째 제품이 첫 제품으로 보일 수 있다(브라우저 시험에서 발견)');
assert.match(ui, /a\.created_at\.localeCompare\(b\.created_at\) \|\| a\.id\.localeCompare\(b\.id\)/);
assert.match(ui, /const processes = byCreation\(rawProcesses\);/);
assert.match(ui, /saveProduct\(addingProduct \? undefined : focusProduct,/, '새 제품은 만들고(S1과 같은 saveProduct), 아니면 지금 제품을 고친다');
assert.match(ui, /data-testid="talk-add-product"/, '완료 카드에서 제품 하나 더');
assert.match(ui, /describeDuplicateCn\(cnDigits,/, '같은 CN 알림');
assert.match(ui, /data-testid="talk-shared-fuel-note"/);
assert.match(ui, /data-testid="talk-shared-electricity-note"/);
assert.match(ui, /describeTalkPartial\(\{ products: data\.products, processes: periodProcesses/, '막대 부분 안내는 모든 제품을 본다');
assert.equal(ui.match(/data\.products\[0\]/g)?.length, 1, '제품 고치기는 첫 제품이 아니라 지금 묻는 제품 — 첫 제품은 focus를 못 찾을 때의 대비 한 곳뿐');
assert.match(ui, /const focusProduct = data\.products\.find\(\(product\) => product\.id === focusProductId\) \?\? data\.products\[0\];/);
assert.ok(!/firstProduct|firstProcess/.test(ui), '「첫」 제품·공정 이름이 남아 있지 않다');
assert.match(ui, /사내 이송은 지도 화면 3단계에서 연결/, '지원하지 않는 사내 이송은 지도로 안내한다');
assert.ok(!/\bAI\b|챗봇/.test(ui));

console.log('Talk S6 verified (질문은 지금 묻는 제품의 공정에 · 둘째 제품은 자기 공정만 · 제품별 건너뛰기·자동 이동 · 같은 CN 알림 · 모든 제품을 보는 부분 입력 안내 · 새 저장 코드 없음).');
