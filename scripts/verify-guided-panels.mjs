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

// 인자를 변수로 넘기는 경우도 있다 — 저장 전에 검증을 돌려야 해서 한 줄 앞에서 만든다.
// 그 변수가 **기존 엔티티를 펼쳐** 만들어졌으면 안전하다. 이걸 알아보지 못하면
// 게이트를 만족시키려고 의미 없는 재-스프레드를 덧붙이게 된다(코드가 게이트에 맞춰 휘는 것).
const safeSpreadVars = new Set(
  [...source.matchAll(/const ([A-Za-z0-9_]+) = \{\s*\.\.\./g)].map((match) => match[1])
);
for (const match of source.matchAll(/const ([A-Za-z0-9_]+) = build[A-Za-z]+Update\(/g)) {
  safeSpreadVars.add(match[1]);
}

for (const call of updates) {
  const identifier = call.args.match(/^\s*'[a-z_]+',\s*([A-Za-z0-9_]+)\s*$/)?.[1];
  const ok = /^\s*'[a-z_]+',\s*(build[A-Za-z]+Update\(|\{\s*\.\.\.)/.test(call.args)
    || Boolean(identifier && safeSpreadVars.has(identifier));
  assert.ok(
    ok,
    `panels.tsx:${lineOf(call.index)} updateLocalItem이 기존 엔티티를 펼치지도, build*Update()를 쓰지도 않는다.\n`
    + `updateLocalItem은 put이라 id를 잃으면 오류 없이 새 행이 생기고 옛 행이 남는다.\n`
    + `  인자: ${call.args.replace(/\s+/g, ' ').slice(0, 120)}`
  );
}

// guided-edit가 담당하는 스토어는 **신규도** 빌더를 거친다.
// 이걸 막지 않으면 panels.tsx가 매핑을 다시 인라인할 수 있는데, 그게 바로 이 저장소가
// 아홉 번 반복한 실패 모양이다 — 같은 필드 매핑이 두 곳에 살고 한쪽만 고쳐진다.
// (source_streams·processes·product_output_lines는 아직 빌더가 없어 제외한다.)
const BUILDER_OWNED_STORES = ['installations', 'periods', 'products', 'precursors'];
for (const call of callsTo('createLocalItem')) {
  const store = call.args.match(/^\s*'([a-z_]+)'/)?.[1];
  if (!store || !BUILDER_OWNED_STORES.includes(store)) continue;
  assert.match(
    call.args,
    /build[A-Za-z]+(Payload|Create)\(/,
    `panels.tsx:${lineOf(call.index)} '${store}' 신규 저장이 guided-edit의 빌더를 쓰지 않는다.\n`
    + '매핑을 여기서 다시 적으면 신규와 수정이 갈라지고, 한쪽만 고쳐진다.\n'
    + `  인자: ${call.args.replace(/\s+/g, ' ').slice(0, 120)}`
  );
}

// 배출원 저장은 **신규·수정 두 경로 모두** 공유 검증을 거친다.
//
// 「파일 어딘가에 검증 호출이 있는가」로 보면, 한 경로에서만 빼도 통과한다.
// 실제로 그렇게 새어나갔다 — 신규 경로에서만 검증을 지운 변형이 잡히지 않았다.
// 경로별로 본다.
function bodyOf(name) {
  const at = source.indexOf(`const ${name} = async (`);
  assert.ok(at > 0, `${name}이 사라졌다`);
  const bodyStart = source.indexOf('{', at + `const ${name} = async (`.length);
  let depth = 0;
  for (let i = bodyStart; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}') {
      depth--;
      if (depth === 0) return source.slice(bodyStart, i + 1);
    }
  }
  throw new Error(`${name} 본문이 닫히지 않았다`);
}

for (const name of ['addStream', 'saveEdit']) {
  assert.match(
    bodyOf(name),
    /createSourceStreamValidationErrors\(/,
    `${name}이 공유 검증(createSourceStreamValidationErrors)을 거치지 않는다.\n`
    + '지도에서 물질수지·공정배출까지 넣게 됐으므로, 상세 화면과 같은 규칙을 써야 한다 —\n'
    + '여기서 규칙을 따로 적으면 화석+바이오 비율 합 같은 것이 지도에서만 새어나간다.'
  );
}
// 신규·수정이 같은 payload 빌더를 쓰는가(필드 매핑이 두 벌이 되지 않도록).
for (const name of ['addStream', 'saveEdit']) {
  assert.match(bodyOf(name), /buildDraft\(\)/, `${name}이 공유 payload 빌더를 쓰지 않는다`);
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

// 공정 수정으로 생산라인이 지워지기 전에 전구물질 배분을 확인한다.
// 이 삭제는 삭제 버튼이 아니라 saveProcess 안에 숨어 있어(생산량 0/공란) 위 remove* 검사에
// 걸리지 않는다. 배분이 갈 곳을 잃으면 엔진이 조용히 건너뛰어 질량이 사라진다.
const saveProcessStart = source.indexOf('const saveProcess = async ()');
assert.ok(saveProcessStart > 0, 'saveProcess가 사라졌다');
const outputLineDeleteAt = source.indexOf("deleteLocalItem('product_output_lines'", saveProcessStart);
const outputLineGuardAt = source.indexOf('getOutputLineDeleteBlockers', saveProcessStart);
assert.ok(outputLineGuardAt > 0, 'saveProcess가 getOutputLineDeleteBlockers로 배분을 확인하지 않는다');
assert.ok(
  outputLineGuardAt < outputLineDeleteAt,
  'saveProcess는 생산라인을 지우기 **전에** 전구물질 배분을 확인해야 한다'
);

// ── 3) 공정별 값을 읽는 폼은 공정 id로 key잉한다 ────────────────────────
// key가 없으면 useState 초깃값이 처음 연 공정 값으로 굳는다 → 공정을 바꾼 뒤 저장하면
// 다른 공정의 전력이 이 공정에 기록된다. 화면에는 이상이 없어 보인다.
assert.match(
  source,
  /<ElectricityForm\s+key=\{process\.id\}/,
  'ElectricityForm은 key={process.id}로 렌더해야 한다 — 없으면 공정 전환 시 옛 값이 남아 다른 공정에 기록된다'
);

// 상단 공정 탭이 권위를 갖는다. 공정에 매인 패널의 processId는 useState 초깃값이라
// 탭을 바꿔도 따라가지 않는다 — key가 없으면 지도는 공정 2를, 패널은 공정 1을 보여준다.
for (const panel of ['FuelPanel', 'ElectricityPanel', 'PrecursorPanel']) {
  assert.match(
    source,
    new RegExp(`<${panel}\\s+key=\\{selectedProcessId\\}`),
    `${panel}은 key={selectedProcessId}로 렌더해야 한다 — 없으면 상단 공정 탭과 패널이 다른 공정을 가리킨다`
  );
}

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

// ── 6) 씨밤이 run08 나머지 회귀 ──────────────────────────────────────

// [P2-run08-04] EU 문서 D_Processes는 시장 출하량·내부 소비량을 따로 묻는다.
// 지도가 둘 다 0으로 만들면 총 생산량이 있는데도 「시장 0 · 내부 0」이 문서에 나간다.
// 입력은 **하나만** 받고 나머지를 빼서 구한다 — 그러면 합이 어긋날 수가 없다.
assert.ok(
  !/market_output_mass_t: 0,/.test(source),
  '지도가 시장 출하량을 0으로 굳혀 만든다 — EU 문서에 총 생산량과 앞뒤가 안 맞는 값이 나간다'
);
assert.match(source, /internal_consumption_mass_t: num\(internalMass\)/, '사내 이송량 입력이 저장되지 않는다');
assert.match(
  source,
  /market_output_mass_t: (totalMass|editedTotal) - num\(internalMass\)/,
  '시장 출하량을 총량에서 빼서 구하지 않는다 — 둘 다 받으면 합이 총량과 어긋날 수 있다'
);
// 신규·수정 두 경로 모두에서.
for (const branch of ['totalMass - num(internalMass)', 'editedTotal - num(internalMass)']) {
  assert.ok(source.includes(branch), `시장 출하량 산출이 한쪽 경로에만 있다: ${branch}`);
}

// [P2-run08-03] 배출계수를 지도에서 고칠 수 있어야 한다.
// 종전 수정 폼은 이름·사용량만 받고 계수는 저장값을 그대로 썼다. 프리셋이 클라이언트
// 실측(예: LNG 56.1 tCO2/TJ)과 다르면 지우고 다시 등록하는 수밖에 없었다.
// 지금은 신규·수정이 같은 폼이라 계수 칸이 양쪽에 있다 — 그 폼이 하나임을 못 박는다.
assert.equal(
  [...source.matchAll(/onClick=\{editingStreamId \? saveEdit : addStream\}/g)].length,
  1,
  '배출원 신규·수정이 한 폼을 쓰지 않는다 — 폼이 두 벌이면 계수 칸이 한쪽에만 생긴다'
);
assert.match(source, /value=\{factor\}/, '배출계수 입력 칸이 없다 — 프리셋 값을 자기 실측으로 바꿀 수 없다');
assert.match(source, /kind\.needsNcv && \(/, '순발열량 칸이 유형에 따라 나타나지 않는다');

// [P2-run08-05] 저장하면 화면이 다음 단계로 떠나 방금 넣은 값을 확인할 수 없었다.
const workspace = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(
  workspace,
  /setSelectedStep\(\(current\) => current \?\? activeStepRef\.current\)/,
  '저장 후 보고 있던 단계를 고정하지 않는다 — 저장하는 순간 화면이 다음 단계로 떠난다'
);

// [P3-run08-06] 빈 지도가 예시 생산량(1,000 t)을 예시 표시 없이 보여줬다.
assert.match(
  workspace,
  /binding\.isExample \? '생산량 미입력'/,
  '데이터가 없을 때 예시 생산량을 그대로 인쇄한다 — 사용자가 자기 값으로 읽는다'
);

console.log('Guided panel wiring verification passed (수정 펼치기 · 삭제 차단·확인 · 공정 키잉 · 직접배출 재계산 · 목록 수정·삭제 · run08 잔여 회귀).');
