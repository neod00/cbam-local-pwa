// EU 문서의 품목군 매핑 검증 — 「조회가 먼저, 접두 규칙은 최후 수단」.
//
// 씨밤이 run09(P1-run09-01)가 찾은 것: 2단계는 「CN 26011200 → Sintered Ore로 조회됨」이라
// 하고, 7단계는 「EU CBAM goods category로 매핑할 수 없습니다」로 Export를 막았다.
// 같은 앱이 같은 CN을 두고 반대로 말했다.
//
// 원인 두 겹:
//   1) eu-template-export가 접두 사슬(7201·7203·7206·72xx·73)로만 매핑했다.
//      소결광은 2601이라 안 걸린다. 이 파일은 cn-master.generated.ts를 쓰지 않았다 —
//      CN 마스터 작업이 Export 경로에는 닿지 않았다.
//   2) 화면이 쓰는 준비도 검사는 cnCodeMap 없이 계산돼 **실제 Export보다 엄격했다.**
//      소결광은 Export 시점이면 통과할 값인데 그 앞에서 버튼이 잠겼다.
//
// 여기서 못 박는 것:
//   · CN 마스터를 조회한다(업로드 워크북 없이도 같은 답).
//   · 접두 사슬은 조회 실패 시에만 닿는다.
//   · 지원 범위 밖 품목군은 2단계에서 알린다(7단계에서 만나면 원인을 알 수 없다).
//   · 화면과 Export가 **같은 함수**로 판정한다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/lib/eu-template-export.ts', 'utf8');
const master = readFileSync('src/lib/cn-master.generated.ts', 'utf8');

// ── 1) CN 마스터를 쓰는가 ─────────────────────────────────────────────
assert.match(
  source,
  /import \{ CN_MASTER \} from '\.\/cn-master\.generated'/,
  'Export가 CN 마스터를 쓰지 않는다 — 접두 규칙만 남으면 2601 같은 CN이 영영 안 걸린다'
);
assert.match(source, /export function lookupEuGoodForCn\(/, 'CN 조회 함수가 없다');

// 조회 순서: 업로드 워크북 → CN 마스터. 둘 다 접두 사슬보다 **먼저**여야 한다.
const lookupStart = source.indexOf('export function lookupEuGoodForCn(');
const lookupEnd = source.indexOf('\n}', lookupStart);
const lookupBody = source.slice(lookupStart, lookupEnd);
assert.match(lookupBody, /cnCodeMap\?\.get\(cnDigits\)/, '업로드 워크북 맵을 먼저 보지 않는다');
assert.match(lookupBody, /CN_MASTER\[cnDigits\]/, 'CN 마스터를 조회하지 않는다');

const mapStart = source.indexOf('function mapProductToEuGood(');
const mapEnd = source.indexOf('\nfunction mapPrecursorToEuGood', mapStart);
const mapBody = source.slice(mapStart, mapEnd);
const lookupAt = mapBody.indexOf('lookupEuGoodForCn(');
const prefixAt = mapBody.indexOf('PIG_IRON_PREFIXES');
assert.ok(lookupAt > 0, 'mapProductToEuGood이 조회를 쓰지 않는다');
assert.ok(prefixAt > 0, '접두 사슬이 통째로 사라졌다 — 마스터에 없는 옛 자료의 최후 수단이 필요하다');
assert.ok(
  lookupAt < prefixAt,
  '접두 규칙이 조회보다 먼저 온다 — 조회가 먼저여야 소결광 같은 CN이 걸린다'
);

// ── 2) 소결광이 실제로 마스터에 있고 지원 범위 안인가 ─────────────────
assert.match(master, /"26011200": "Sintered Ore"/, 'CN 마스터에 소결광이 없다');
const steelSetStart = source.indexOf('const STEEL_EU_GOODS_SET = new Set([');
const steelSetEnd = source.indexOf(']);', steelSetStart);
const steelSet = source.slice(steelSetStart, steelSetEnd);
assert.match(steelSet, /'Sintered Ore'/, '소결광이 Export 지원 범위에서 빠졌다');

// ── 3) 화면과 Export가 같은 함수로 판정하는가 ─────────────────────────
assert.match(
  source,
  /export function getEuExportGoodsSupport\(/,
  '지원 여부를 묻는 공개 함수가 없다 — 화면이 자기 목록을 따로 적게 된다'
);
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /getEuExportGoodsSupport\(cnDigits\)/, '2단계가 Export 지원 여부를 묻지 않는다');
assert.ok(
  !/STEEL_EU_GOODS|'Sintered Ore'|'Crude steel'/.test(panels),
  '패널이 품목군 목록을 따로 적는다 — 화면과 Export가 갈라진다'
);

// 범위 밖 안내가 **2단계에** 있어야 한다. 7단계에서 만나면 원인도 해법도 알 수 없다.
const productsStart = panels.indexOf('function ProductsPanel(');
const productsEnd = panels.indexOf('// ── 3단계', productsStart);
const productsBody = panels.slice(productsStart, productsEnd);
assert.match(
  productsBody,
  /아직 EU 문서 생성이 지원되지 않습니다/,
  '2단계가 지원 범위를 말하지 않는다 — 등록은 되는데 8단계에서야 막힌다'
);
assert.match(productsBody, /exportSupport\.supported/, '2단계가 지원 여부를 화면 조건으로 쓰지 않는다');

// ── 4) 준비도 문구가 원인을 말하는가 ──────────────────────────────────
assert.ok(
  !/EU CBAM goods category로 매핑할 수 없습니다\.`/.test(source),
  '옛 문구가 남아 있다 — 「매핑할 수 없습니다」만으로는 무엇을 고쳐야 할지 알 수 없다'
);
assert.match(source, /아직 EU 문서 생성이 지원되지 않습니다\(현재 철강 계열만\)/, '지원 범위를 밝히지 않는다');
assert.match(source, /CN 코드가 EU 공식 목록에서 조회되지 않습니다/, 'CN 자체가 틀린 경우를 구분하지 않는다');

console.log('Export goods mapping verification passed (마스터 조회 우선 · 접두는 최후 수단 · 범위를 2단계에서 고지 · 화면·Export 동일 판정).');
