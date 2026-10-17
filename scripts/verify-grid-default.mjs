// 전력 배출계수: 앱에 내장하는 두 값(한국 0,475 · 「목록에 없는 나라」 0,465) — 2025/2621 부속서 II.
//
// 잠그는 것:
//  1) 값은 EU 관보 원문과 같다(2026-10-17 확인): Korea, Republic of (South Korea) 0,475 · Other countries and territories 0,465.
//     표 전체(IEA 자료, CC BY-NC-SA 4.0)는 내장하지 않는다 — 두 값만. 라이선스 고지가 화면에 함께 나온다.
//  2) 한국 사업장만 자동으로 채운다(국가 코드 KR). 다른 나라는 앱이 모른다 — 「목록에 없는 나라」 값을 대신 쓰지 않는다.
//  3) 내장 값을 계통 평균으로 쓰면 출처(공표기관·문서·연도)를 보고서 입력(제7장)에 자동으로 적는다. 사용자가 이미 적은 칸은 덮어쓰지 않는다.
//     다른 값·다른 출처 유형이면 아무것도 적지 않는다.
//  4) 화면 배선: 지도 5단계·대화 화면에 두 단추, 저장할 때 출처 기록, 한국 사업장은 미리 채움.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireFrom = (request) => load(`${path.resolve(path.dirname(full), request)}.ts`);
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Math, Object, Array, String, Number })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const B = load('src/lib/electricity-ef-basis.ts');
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 1) 값과 범위 ─────────────────────────────────────────────────
assert.deepEqual(plain(B.GRID_DEFAULT_FACTORS.map((item) => [item.key, item.value, item.tableRow])), [
  ['KR', 0.475, 'Korea, Republic of (South Korea)'],
  ['OTHER', 0.465, 'Other countries and territories'],
], '원문의 두 값과 행 이름');
const basisSource = readFileSync('src/lib/electricity-ef-basis.ts', 'utf8');
for (const other of ['Japan', 'Albania', 'Germany', 'China', '0,469', '0.469']) assert.ok(!basisSource.includes(other), `${other}: 표의 다른 행을 내장하지 않는다`);
assert.match(B.GRID_FACTOR_LICENSE_NOTE, /IEA/);
assert.match(B.GRID_FACTOR_LICENSE_NOTE, /CC BY-NC-SA 4\.0/);
assert.match(B.GRID_FACTOR_LICENSE_NOTE, /비상업/);
assert.match(B.ELECTRICITY_GRID_FACTOR_SOURCE, /2025\/2621 Annex II/);
assert.doesNotMatch(B.ELECTRICITY_GRID_FACTOR_GUIDE, /\d[.,]\d{2,}/, '안내문 자체에는 숫자가 없다');
assert.deepEqual(plain(B.GRID_FACTOR_META), { publisher: 'European Commission', document: 'Implementing Regulation (EU) 2025/2621 Annex II', vintage: '2025' });

// ── 2) 한국 사업장만 ─────────────────────────────────────────────
assert.equal(B.gridDefaultFor('KR').value, 0.475);
assert.equal(B.gridDefaultFor(' kr ').value, 0.475, '공백·소문자도 한국');
for (const other of ['JP', 'TW', 'DE', '', undefined, 'KP']) assert.equal(B.gridDefaultFor(other), undefined, `${String(other)}: 앱이 모른다 — 값을 지어내지 않는다`);
assert.equal(B.matchGridDefault(0.475).key, 'KR');
assert.equal(B.matchGridDefault(0.465).key, 'OTHER');
assert.equal(B.matchGridDefault(0.4747), undefined, '비슷한 값은 내장 값이 아니다');
assert.equal(B.matchGridDefault(0.47), undefined, '임시 자리값 0.47은 내장 값이 아니다');

// ── 3) 출처 자동 기록 ────────────────────────────────────────────
{
  const filled = B.withGridFactorMeta(undefined, 'p1', 0.475, 'COUNTRY_GRID_DEFAULT');
  assert.deepEqual(plain(filled.electricity_ef_meta), [{ process_id: 'p1', publisher: 'European Commission', document: 'Implementing Regulation (EU) 2025/2621 Annex II', vintage: '2025' }]);
  // 다른 값이나 다른 출처 유형이면 적지 않는다
  assert.equal(B.withGridFactorMeta(undefined, 'p1', 0.4747, 'COUNTRY_GRID_DEFAULT'), undefined, '다른 값');
  for (const source of ['PPA', 'DIRECT_TECHNICAL_LINK', 'INSTALLATION_OWN', 'MIX', undefined, '']) assert.equal(B.withGridFactorMeta(undefined, 'p1', 0.475, source), undefined, `출처 ${String(source)}`);
  // 이미 적은 칸은 덮어쓰지 않고, 빈 칸만 채운다. 다른 공정·다른 입력은 그대로.
  const mine = { process_id: 'p1', publisher: '환경부', document: '국가 전력배출계수', vintage: '', basis: 'GRID_AVERAGE' };
  const other = { process_id: 'p2', publisher: 'X' };
  const merged = B.withGridFactorMeta({ rnr: [{ data: 'a' }], electricity_ef_meta: [mine, other] }, 'p1', 0.465, 'COUNTRY_GRID_DEFAULT');
  const row = merged.electricity_ef_meta.find((item) => item.process_id === 'p1');
  assert.deepEqual(plain([row.publisher, row.document, row.vintage, row.basis]), ['환경부', '국가 전력배출계수', '2025', 'GRID_AVERAGE'], '적어 둔 칸은 그대로, 빈 연도만 채운다');
  assert.equal(merged.electricity_ef_meta.length, 2, '공정마다 한 줄(중복 없음)');
  assert.deepEqual(plain(merged.electricity_ef_meta.find((item) => item.process_id === 'p2')), plain(other), '다른 공정은 그대로');
  assert.deepEqual(plain(merged.rnr), [{ data: 'a' }], '보고서 입력의 다른 값은 그대로');
  // 이미 다 적혀 있으면 바꾸지 않는다(저장할 필요 없음)
  const complete = { process_id: 'p1', publisher: 'A', document: 'B', vintage: 'C' };
  assert.equal(B.withGridFactorMeta({ electricity_ef_meta: [complete] }, 'p1', 0.475, 'COUNTRY_GRID_DEFAULT'), undefined);
  // 입력 객체를 바꾸지 않는다
  const before = JSON.stringify({ electricity_ef_meta: [mine, other] });
  const input = { electricity_ef_meta: [mine, other] };
  B.withGridFactorMeta(input, 'p1', 0.465, 'COUNTRY_GRID_DEFAULT');
  assert.equal(JSON.stringify(input), before, '읽기 전용');
}

// ── 4) 배선 ──────────────────────────────────────────────────────
{
  const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
  const talk = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
  const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8');
  const meta = readFileSync('src/lib/electricity-grid-meta.ts', 'utf8');
  for (const [name, text] of [['지도 5단계', panels], ['대화 화면', talk]]) {
    assert.ok(text.includes('GRID_DEFAULT_FACTORS.map') && text.includes('data-testid="grid-default-buttons"') && text.includes("'COUNTRY_GRID_DEFAULT'"), `${name}: 두 단추가 값과 출처를 채운다`);
    assert.ok(text.includes('GRID_FACTOR_LICENSE_NOTE'), `${name}: 라이선스 고지가 함께 나온다`);
    assert.ok(text.includes('gridDefaultFor('), `${name}: 한국 사업장은 미리 채운다`);
  }
  assert.ok(panels.includes('applyGridFactorMeta(process.id, draft.ef, draft.efSource)'), '지도 5단계는 저장할 때 출처를 적는다');
  assert.ok(writes.includes('applyGridFactorMeta(process.id, draft.ef, draft.efSource)'), '대화 화면도 같다');
  assert.ok(meta.includes('withGridFactorMeta(current, processId, ef, efSource)') && meta.includes('REPORT_INPUTS_SETTING_KEY'), '출처는 report:inputs에 적힌다(새 설정 키 없음)');
  const importSource = readFileSync('src/lib/activity-import.ts', 'utf8');
  assert.ok(importSource.includes('gridDefaultFor(installation?.country)') && /chosenSource === undefined \|\| chosenSource === 'COUNTRY_GRID_DEFAULT'/.test(importSource), '서식 가져오기: 한국 + 출처 비었거나 국가 전력망 평균일 때만 넣는다');
  assert.ok(importSource.includes('GRID_FACTOR_META.publisher'), '서식 가져오기도 출처를 적는다');
  assert.ok(readFileSync('package.json', 'utf8').includes('"verify:grid-default"'));
}

console.log('Grid default verified (한국 0,475 · 목록에 없는 나라 0,465 = 관보 원문 · 표 전체 비내장 · 한국 사업장만 자동 · 출처 자동 기록(덮어쓰지 않음) · 라이선스 고지 · 배선).');
