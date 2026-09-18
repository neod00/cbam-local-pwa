// 공식 기본값(DV) 한 행을 전구물질의 「직접 / 간접」 두 칸으로 옮기는 규칙을 잠근다.
//
// 씨밤이 run11 P0-03·04:
//   · 상세 화면이 `간접 = 연도 총액 − raw 직접`으로 계산해, 철강 DV(간접 N/A)의 mark-up 가산분이
//     「간접」 칸에 들어갔다. 철강은 간접이 인증서 기준에서 빠지므로 가산분이 사라졌다
//     (대만 7223 00: 파일 10 / N/A / 2026 11 → 앱 직접 10 · 간접 1 → 기준 SEE −5%).
//   · 지도 패널은 공급국가를 'South Korea'로 고정 조회해 대만 원료에 한국 값(4.015)을 넣었다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const referenceSource = readFileSync('src/lib/reference-workbooks.ts', 'utf8');

function extract(startMarker, source = referenceSource) {
  const start = source.indexOf(startMarker);
  assert.ok(start >= 0, `reference-workbooks.ts에서 ${startMarker} 를 찾지 못했다`);
  return source.slice(start);
}

const yearTotalSource = extract('export function getDefaultValueTotalForYear(');
const yearTotalEnd = yearTotalSource.indexOf('\n}\n') + 3;
const resolverSource = extract('const roundDefaultSee');
const compiled = ts.transpileModule(`${yearTotalSource.slice(0, yearTotalEnd)}\n${resolverSource}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const sandbox = { exports: {}, module: { exports: {} } };
vm.runInNewContext(compiled, sandbox);
const { resolveDefaultSeeForYear } = sandbox.exports;
assert.equal(typeof resolveDefaultSeeForYear, 'function');

const host = (value) => JSON.parse(JSON.stringify(value));

// 공식 워크북 원본 행 (DVs as adopted_v20260204, 시트 Taiwan / South Korea, CN 7223 00)
const taiwanWire = { country: 'Taiwan', cn_code: '722300', direct_default: 10, indirect_default: null, total_default: 10, markup_2026: 11, markup_2027: 12, markup_2028_onwards: 13 };
const koreaWire = { country: 'South Korea', cn_code: '722300', direct_default: 3.65, indirect_default: null, total_default: 3.65, markup_2026: 4.015000000000001, markup_2027: 4.38, markup_2028_onwards: 4.745 };

// 간접이 N/A면 mark-up 포함 총액이 **직접**에 들어가고 간접은 0이다. 가산분을 간접으로 빼돌리지 않는다.
assert.deepEqual(host(resolveDefaultSeeForYear(taiwanWire, '2026')), { direct: 11, indirect: 0, hasIndirect: false, total: 11 });
assert.deepEqual(host(resolveDefaultSeeForYear(taiwanWire, '2027')), { direct: 12, indirect: 0, hasIndirect: false, total: 12 });
assert.deepEqual(host(resolveDefaultSeeForYear(taiwanWire, '2028_ONWARDS')), { direct: 13, indirect: 0, hasIndirect: false, total: 13 });
// 부동소수 꼬리(4.015000000000001)를 화면·사유 문구·저장값에 흘리지 않는다.
assert.deepEqual(host(resolveDefaultSeeForYear(koreaWire, '2026')), { direct: 4.015, indirect: 0, hasIndirect: false, total: 4.015 });

// 간접값을 주는 품목(시멘트 등)은 mark-up 비율을 직접·간접에 같은 비율로 얹고, 합계는 연도 총액과 같다.
const koreaClinker = { country: 'South Korea', cn_code: '25231000', direct_default: 0.88, indirect_default: 0.03, total_default: 0.92, markup_2026: 1.012, markup_2027: 1.104, markup_2028_onwards: 1.196 };
const clinker = resolveDefaultSeeForYear(koreaClinker, '2026');
assert.equal(clinker.hasIndirect, true);
assert.ok(Math.abs(clinker.total - 1.012) < 1e-6, `시멘트 기본값 합계가 연도 총액과 달라졌다: ${clinker.total}`);
assert.ok(clinker.direct > 0.88 && clinker.indirect > 0.03, 'mark-up이 직접·간접 어디에도 얹히지 않았다');
assert.ok(Math.abs(clinker.direct / clinker.indirect - 0.88 / 0.03) < 1e-3, '직접:간접 비율이 원본과 달라졌다');

// mark-up 열이 비어 있으면 raw 값으로 되돌아간다(값을 지어내지 않는다).
assert.deepEqual(
  host(resolveDefaultSeeForYear({ ...taiwanWire, markup_2026: null }, '2026')),
  { direct: 10, indirect: 0, hasIndirect: false, total: 10 }
);

// ── 두 화면이 같은 함수를 쓰는지, 옛 계산식·고정 국가가 되살아나지 않았는지 ──
const precursorsPage = readFileSync('src/app/precursors/page.tsx', 'utf8');
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');

assert.match(precursorsPage, /resolveDefaultSeeForYear\(match, newItem\.default_value_year\)/, '상세 화면이 공용 분해 함수를 쓰지 않는다');
assert.doesNotMatch(
  precursorsPage,
  /indirect_see_tco2e_per_t:\s*Math\.max\(0,[^\n]*direct_default/,
  '상세 화면이 「연도 총액 − raw 직접」을 간접 칸에 넣는 계산을 되살렸다 (run11 P0-03)'
);
assert.equal((panels.match(/resolveDefaultSeeForYear\(match, '2026'\)/g) ?? []).length, 2, '지도 패널의 기본값 채우기·비교가 둘 다 공용 분해 함수를 써야 한다');
assert.doesNotMatch(
  panels,
  /findDefaultValueReference\([^)]*'South Korea'/,
  "지도 패널이 공급국가를 'South Korea'로 고정 조회한다 (run11 P0-04)"
);
assert.equal((panels.match(/findDefaultValueReference\(reference, supplierCountry,/g) ?? []).length, 2, '지도 패널의 기본값 조회는 사람이 고른 공급국가를 써야 한다');
assert.match(panels, /먼저 위의 「공급국가」를 고르세요/, '공급국가를 고르기 전에는 기본값을 채우지 않는다는 안내가 사라졌다');

const guidedEdit = readFileSync('src/lib/guided-edit.ts', 'utf8');
assert.doesNotMatch(guidedEdit, /supplier_country:\s*'South Korea'/, '신규 전구물질의 공급국가를 앱이 대신 정하면 안 된다 (run11 P0-04)');

console.log('Default SEE verification passed (mark-up은 직접분에 · 간접 N/A는 0 · 두 화면 공용 함수 · 공급국가 고정 금지).');
