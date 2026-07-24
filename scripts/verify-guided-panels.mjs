// 길잡이 지도 패널의 **배선** 검증 (구조 게이트).
//
// verify-guided-edit.mjs는 순수 로직(guided-edit.ts)을 검사한다. 그 로직을 panels.tsx가
// **어떻게 부르는지**는 아무도 안 본다 — 그런데 이 저장소에서 난 결함은 대부분 거기 있었다.
// React 컴포넌트는 노드에서 렌더할 수 없으므로, 렌더 대신 **불변식을 소스에서** 확인한다.
// (verify-ui-claims.mjs와 같은 방식이다.)
//
// 여기서 못 박는 것:
//   1) 수정 저장은 반드시 기존 엔티티를 펼치거나 build*Update()를 쓴다.
//      updateLocalItem은 put이라, 맨 객체를 넘기면 **오류 없이** 새 행이 생기고 옛 행이 남는다.
//   2) 삭제는 확인을 거치고, 참조가 있는 항목은 차단 규칙을 먼저 본다.
//   3) 공정별 값을 초깃값으로 읽는 폼은 공정 id로 key잉한다.
//      key가 없으면 useState 초깃값이 처음 연 공정 값으로 굳어, 공정을 바꾼 뒤 저장할 때
//      **다른 공정의 값이 이 공정에 기록된다**(실제로 그랬다).
//   4) 배출원을 건드리는 경로는 공정의 직접배출 캐시를 다시 맞춘다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/components/guided/panels.tsx', 'utf8');

/** 여는 괄호부터 짝이 맞는 닫는 괄호까지. 문자열 안의 괄호는 세지 않는다. */
function argsAt(text, openIndex) {
  let depth = 0;
  let quote = '';
  for (let i = openIndex; i < text.length; i++) {
    const char = text[i];
    if (quote) {
      if (char === '\\') i++;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') {
      depth--;
      if (depth === 0) return text.slice(openIndex + 1, i);
    }
  }
  throw new Error(`괄호가 닫히지 않았다 (offset ${openIndex})`);
}

function callsTo(name) {
  const calls = [];
  const needle = `${name}(`;
  let from = 0;
  for (;;) {
    const at = source.indexOf(needle, from);
    if (at === -1) return calls;
    // 정의부(function foo( / const foo = ()는 호출이 아니다.
    const before = source.slice(Math.max(0, at - 24), at);
    if (!/(function\s+|const\s+|async\s+function\s+)$/.test(before)) {
      calls.push({ index: at, args: argsAt(source, at + needle.length - 1) });
    }
    from = at + needle.length;
  }
}

const lineOf = (index) => source.slice(0, index).split('\n').length;

// ── 1) 수정 저장은 기존을 펼치거나 build*Update()를 쓴다 ────────────────
const updates = callsTo('updateLocalItem');
assert.ok(updates.length >= 8, `updateLocalItem 호출이 너무 적다(${updates.length}) — 패널이 수정을 잃었는지 확인할 것`);

for (const call of updates) {
  const ok = /^\s*'[a-z_]+',\s*(build[A-Za-z]+Update\(|\{\s*\.\.\.)/.test(call.args);
  assert.ok(
    ok,
    `panels.tsx:${lineOf(call.index)} updateLocalItem이 기존 엔티티를 펼치지도, build*Update()를 쓰지도 않는다.\n`
    + `updateLocalItem은 put이라 id를 잃으면 오류 없이 새 행이 생기고 옛 행이 남는다.\n`
    + `  인자: ${call.args.replace(/\s+/g, ' ').slice(0, 120)}`
  );
}

// ── 2) 삭제는 확인을 거치고, 참조가 있으면 먼저 막는다 ──────────────────
// remove*로 시작하는 화살표 함수 본문을 잘라 검사한다.
const removers = [];
for (const match of source.matchAll(/const (remove[A-Za-z]+) = async \(/g)) {
  const bodyStart = source.indexOf('{', match.index + match[0].length);
  let depth = 0;
  let end = bodyStart;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  removers.push({ name: match[1], body: source.slice(bodyStart, end + 1), line: lineOf(match.index) });
}

const REMOVER_NAMES = removers.map((remover) => remover.name).sort();
assert.deepEqual(
  REMOVER_NAMES,
  ['removePeriod', 'removePrecursor', 'removeProcess', 'removeProduct', 'removeStream'],
  '삭제 함수가 늘거나 줄면 아래 차단 규칙도 함께 정하라 — 참조를 남긴 채 지우면 화면에서만 사라진다'
);

for (const remover of removers) {
  assert.ok(
    remover.body.includes('window.confirm'),
    `panels.tsx:${remover.line} ${remover.name}이 확인 없이 지운다`
  );
}

// 참조되는 항목은 차단 규칙을 **먼저** 본다.
const guards = {
  // 제품은 공정·생산라인·전구물질이 가리킨다. 특히 생산라인 — 공정의 product_id는 대표 제품
  // 하나만 가리키므로, 다제품 공정의 두 번째 제품은 공정 참조에 걸리지 않는다.
  removeProduct: 'getProductDeleteBlockers',
  // 기간은 공정·배출원·전구물질 셋이 가리킨다. 엔진의 기간 누락 경고는 period_id가 비었을
  // 때만 울리므로, dangling id는 아무도 알려주지 않는다.
  removePeriod: 'getPeriodDeleteBlockers',
};
for (const [name, guard] of Object.entries(guards)) {
  const remover = removers.find((item) => item.name === name);
  assert.ok(remover, `${name}이 사라졌다`);
  assert.ok(remover.body.includes(guard), `panels.tsx:${remover.line} ${name}이 ${guard}로 참조를 먼저 확인하지 않는다`);
  assert.ok(
    remover.body.indexOf(guard) < remover.body.indexOf('window.confirm'),
    `panels.tsx:${remover.line} ${name}은 확인창을 띄우기 **전에** 참조를 막아야 한다`
  );
}

// 공정 삭제는 하위 자료를 막고 생산라인은 함께 지운다(옛 화면과 같은 규칙).
const removeProcess = removers.find((item) => item.name === 'removeProcess');
for (const needle of ['data.precursors', 'data.sourceStreams', "deleteLocalItem('product_output_lines'"]) {
  assert.ok(removeProcess.body.includes(needle), `removeProcess가 ${needle}를 다루지 않는다`);
}

// 삭제 후에는 그 행을 가리키던 수정 세션을 닫는다. 안 닫으면 다음 저장이 조용히 아무것도 안 한다.
for (const name of ['removeProduct', 'removePeriod', 'removeProcess', 'removeStream', 'removePrecursor']) {
  const remover = removers.find((item) => item.name === name);
  assert.match(
    remover.body,
    /editing[A-Za-z]*(Id)? === |resetForm\(\)|closePeriodForm\(\)/,
    `panels.tsx:${remover.line} ${name}이 삭제한 행의 수정 세션을 닫지 않는다`
  );
}

// ── 3) 공정별 값을 읽는 폼은 공정 id로 key잉한다 ────────────────────────
// key가 없으면 useState 초깃값이 처음 연 공정 값으로 굳는다 → 공정을 바꾼 뒤 저장하면
// 다른 공정의 전력이 이 공정에 기록된다. 화면에는 이상이 없어 보인다.
assert.match(
  source,
  /<ElectricityForm\s+key=\{process\.id\}/,
  'ElectricityForm은 key={process.id}로 렌더해야 한다 — 없으면 공정 전환 시 옛 값이 남아 다른 공정에 기록된다'
);

// 공정별 저장값을 useState 초깃값으로 읽는 곳은 키잉된 ElectricityForm 안에만 있어야 한다.
const electricityFormStart = source.indexOf('function ElectricityForm(');
assert.ok(electricityFormStart > 0, 'ElectricityForm이 사라졌다');
const electricityFormEnd = source.indexOf('\n// ──', electricityFormStart);
for (const match of source.matchAll(/useState\(([^\n]*)\)/g)) {
  if (!/process[.?]/.test(match[1])) continue;
  const inKeyedForm = match.index > electricityFormStart && match.index < electricityFormEnd;
  assert.ok(
    inKeyedForm,
    `panels.tsx:${lineOf(match.index)} useState 초깃값이 공정별 값을 읽는데 키잉된 폼 밖이다 — `
    + `공정을 바꿔도 값이 갱신되지 않는다: ${match[1].trim().slice(0, 90)}`
  );
}

// ── 4) 배출원을 건드리면 공정의 직접배출 캐시를 다시 맞춘다 ─────────────
// processes.direct_attributable_emissions_tco2e는 배출원 합계를 캐시한 값이다.
// 다시 맞추지 않으면 지도의 ①이 옛 숫자를 인쇄한다.
const streamMutations = [
  ...callsTo('createLocalItem').filter((call) => call.args.includes("'source_streams'")),
  ...callsTo('updateLocalItem').filter((call) => call.args.includes("'source_streams'")),
  ...callsTo('deleteLocalItem').filter((call) => call.args.includes("'source_streams'")),
];
assert.ok(streamMutations.length >= 3, `배출원 변경 경로가 ${streamMutations.length}개뿐이다 — 추가/수정/삭제가 다 있는지 확인할 것`);
const syncCalls = callsTo('syncProcessDirectEmissions');
assert.ok(
  syncCalls.length >= streamMutations.length,
  `배출원을 바꾸는 경로 ${streamMutations.length}개에 대해 직접배출 재계산이 ${syncCalls.length}번뿐이다 — `
  + '재계산을 빠뜨린 경로가 있으면 지도의 ①이 옛 숫자를 인쇄한다'
);
// 재계산에 넘기는 목록은 **변경 후** 상태여야 한다. 원본 data.sourceStreams를 그대로 넘기면
// 방금 한 변경이 반영되지 않는다.
for (const call of syncCalls) {
  assert.ok(
    /\.map\(|\.filter\(|\[\s*\.\.\./.test(call.args),
    `panels.tsx:${lineOf(call.index)} syncProcessDirectEmissions에 변경 전 목록을 그대로 넘긴다: ${call.args.replace(/\s+/g, ' ').slice(0, 100)}`
  );
}

// ── 5) 목록이 있는 곳엔 수정·삭제가 있다 ────────────────────────────────
// 「만들기만 되고 고치려면 다른 화면으로」가 이 변경의 출발점이었다. 다시 그 상태로
// 돌아가지 않도록, 목록을 그리는 패널이 RowActions를 쓰는지 확인한다.
const rowActionUses = [...source.matchAll(/<RowActions\b/g)].length;
assert.ok(rowActionUses >= 5, `RowActions 사용이 ${rowActionUses}곳뿐이다 — 목록에 수정·삭제가 빠진 패널이 있는지 확인할 것`);
for (const match of source.matchAll(/<RowActions([\s\S]{0,220}?)\/>/g)) {
  assert.match(match[1], /label=\{?/, 'RowActions에 label이 없으면 스크린리더가 어느 줄인지 못 읽는다');
}

console.log('Guided panel wiring verification passed (수정 펼치기 · 삭제 차단·확인 · 공정 키잉 · 직접배출 재계산 · 목록 수정·삭제).');
