// 보고기간 선택 검증 — 「어느 기간이 EU 문서에 나가는가」.
//
// 씨밤이 run08(P1-run08-01)이 찾은 것: 보고기간 목록이 IndexedDB 키(`period_<uuid>`)
// 사전순으로 나와서, 나중에 만든 2026년 기간이 2025년 위로 올라갔다. 그리고
// eu-template-export가 그 「맨 위」(periods[0])를 A_InstData에 찍었다.
// 즉 **2025년을 산정하는 중에 문서에는 2026년이 적힐 수 있었다.**
//
// 더 나쁜 것도 같이 나왔다: createReportableExportScope가 보고범위만 거르고 **기간은
// 전혀 거르지 않았다.** 기간이 둘이면 2025·2026 자료가 섞인 문서에 한쪽 날짜만 찍힌다 —
// 문서가 스스로에 대해 거짓을 말하는 상태다.
//
// 여기서 못 박는 것:
//   1) 정렬은 결정적이다(시작일 → 종료일 → 이름 → id). 같은 입력이면 같은 문서가 나온다.
//   2) 기간이 둘 이상인데 고르지 않았으면 **오류**다. 앱이 대신 고르지 않는다.
//   3) 고른 기간 밖의 자료는 사본에서 빠지고, 그 사실을 화면에 알린다.
//   4) periods를 넘기지 않은 호출부는 종전대로 동작한다(대시보드 요약 등).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// ── 1) 정렬 (local-db.ts) ─────────────────────────────────────────────

function loadSortReportingPeriods() {
  const source = readFileSync('src/lib/local-db.ts', 'utf8');
  const start = source.indexOf('export function sortReportingPeriods');
  assert.ok(start > 0, 'local-db.ts에 sortReportingPeriods가 없다 — 정렬이 사라지면 순서가 다시 UUID 운으로 돌아간다');
  const body = source.slice(start, source.indexOf('\nexport async function listLocalItems', start));
  const compiled = ts.transpileModule(
    `${body.replace(/^export /gm, '')}\nglobalThis.sortReportingPeriods = sortReportingPeriods;`,
    { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  const context = vm.createContext({});
  vm.runInContext(compiled, context);
  return context.sortReportingPeriods;
}

const sortReportingPeriods = loadSortReportingPeriods();

const period = (id, name, start, end) => ({ id, name, start_date: start, end_date: end });

// vm 안에서 만든 배열은 프로토타입이 다른 realm의 것이라 deepEqual이 거부한다.
const names = (periods) => [...sortReportingPeriods(periods)].map((p) => p.name);
const ids = (periods) => [...sortReportingPeriods(periods)].map((p) => p.id);

// run08에서 실제로 나온 배치: 나중에 만든 2026이 UUID 순으로 앞에 왔다.
const asStored = [
  period('period_c4767137-54da-4111-8730-4397133faf49', '2026년 연간', '2026-01-01', '2026-12-31'),
  period('period_f65bc2b9-bd90-47aa-8d84-dc5facd642ba', '2025 Annual', '2025-01-01', '2025-12-31'),
];
assert.deepEqual(
  names(asStored),
  ['2025 Annual', '2026년 연간'],
  '시작일이 이른 기간이 먼저 와야 한다 — 저장 순서(UUID)를 따르면 안 된다'
);

// 입력 순서를 바꿔도 결과가 같아야 한다(결정적).
assert.deepEqual(
  names([...asStored].reverse()),
  ['2025 Annual', '2026년 연간'],
  '입력 순서가 달라도 같은 순서가 나와야 한다'
);

// 원본 배열을 건드리지 않는다.
const original = [...asStored];
sortReportingPeriods(asStored);
assert.deepEqual(asStored.map((p) => p.id), original.map((p) => p.id), '정렬이 원본 배열을 뒤집으면 안 된다');

// 시작일이 같으면 종료일 → 이름 → id 순으로 갈린다. 완전히 같은 두 기간도 순서가 흔들리면 안 된다.
const sameStart = [
  period('period_zz', '하반기', '2026-01-01', '2026-12-31'),
  period('period_aa', '상반기', '2026-01-01', '2026-06-30'),
];
assert.deepEqual(names(sameStart), ['상반기', '하반기'], '시작일이 같으면 종료일이 이른 쪽이 먼저');
const tie = [period('period_b', '연간', '2026-01-01', '2026-12-31'), period('period_a', '연간', '2026-01-01', '2026-12-31')];
assert.deepEqual(ids(tie), ['period_a', 'period_b'], '전부 같으면 id로 확정한다');

// listLocalItems가 실제로 이 정렬을 쓰는지 — 안 쓰면 화면과 Export가 갈라진다.
const localDbSource = readFileSync('src/lib/local-db.ts', 'utf8');
const listStart = localDbSource.indexOf('export async function listLocalItems');
const listBody = localDbSource.slice(listStart, listStart + 900);
assert.match(
  listBody,
  /sortReportingPeriods\(/,
  'listLocalItems가 보고기간을 정렬하지 않는다 — 화면 목록과 Export가 다른 순서를 볼 수 있다'
);

// ── 2~4) Export 기간 판정 (eu-template-export.ts) ─────────────────────
// 이 파일은 fflate·CN 마스터 등에 얽혀 있어 통째로 vm에 올리기 어렵다.
// 대신 실제 앱이 쓰는 경로 그대로 evaluateEuExportReadiness를 부르는 하네스가
// verify-eu-export.mjs에 이미 있으므로, 여기서는 **소스 불변식**을 확인한다.
const exportSource = readFileSync('src/lib/eu-template-export.ts', 'utf8');

assert.match(
  exportSource,
  /reportingPeriodId\?: string;/,
  'EuTemplateExportData에 reportingPeriodId가 없다 — 호출부가 기간을 지정할 방법이 사라졌다'
);

// A_InstData에 찍히는 기간은 **자료를 거른 기준과 같은 기간**이어야 한다.
assert.match(
  exportSource,
  /createInstallationCellWrites\(data\.installations, exportScope\.period, countryMaps\)/,
  'A_InstData가 exportScope.period가 아닌 다른 기간을 쓴다 — 거른 기준과 찍히는 날짜가 갈라진다'
);
assert.ok(
  !/createInstallationCellWrites\([^)]*data\.periods/.test(exportSource),
  'createInstallationCellWrites가 아직 periods 배열을 받는다 — 안에서 다시 [0]을 고를 수 있다'
);

// periods[0]을 말없이 고르는 자리가 남아 있으면 안 된다(resolveExportPeriod 안은 예외 —
// 거기서는 「지정이 없으면 정렬상 첫 기간」이라는 규칙을 한 곳에 모아둔 것이다).
// 주석은 걷어내고 본다 — 「왜 안 되는지」를 설명하는 주석까지 막으면 다음 사람이
// 같은 실수를 다시 한다.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const resolveStart = exportSource.indexOf('export function resolveExportPeriod');
const resolveEnd = exportSource.indexOf('\n}', resolveStart);
const outsideResolve = stripComments(exportSource.slice(0, resolveStart) + exportSource.slice(resolveEnd));
assert.ok(
  !/periods\[0\]/.test(outsideResolve),
  'resolveExportPeriod 밖에서 periods[0]을 고르는 곳이 있다 — 기간 선택이 두 곳에 있으면 갈라진다'
);

// 기간 필터가 실제로 걸려 있는가.
for (const [needle, why] of [
  ['const inPeriod = (row: { period_id?: string })', '기간 판정 함수가 없다'],
  ['const processes = scopedProcesses.filter(inPeriod);', '공정을 기간으로 거르지 않는다'],
  ['inPeriodProcessIds.has(sourceStream.process_id', '배출원이 기간 밖 공정에 붙은 채 남을 수 있다'],
  ['excludedByPeriod', '기간 밖으로 빠진 건수를 세지 않는다 — 사용자가 무엇이 빠졌는지 모른다'],
  ['unassignedPeriod', '기간 미지정 자료를 세지 않는다'],
]) {
  assert.ok(exportSource.includes(needle), `${why} (${needle})`);
}

// 「안 넘김」과 「없음」을 구분하는가 — 구분하지 않으면 대시보드 요약이 멀쩡한 자료에
// 「보고기간이 없습니다」를 띄운다.
assert.match(
  exportSource,
  /const allPeriods = data\.periods;/,
  'allPeriods가 `data.periods ?? []`면 periods를 안 넘긴 호출부가 오류를 뒤집어쓴다'
);
assert.match(exportSource, /allPeriods && allPeriods\.length > 1 && !data\.reportingPeriodId/, '다중 기간 미선택을 오류로 올리지 않는다');
assert.match(exportSource, /allPeriods && allPeriods\.length === 0/, '기간 없음 검사가 `안 넘김`까지 잡는다');

// 미선택은 **오류**여야 한다. 경고면 그대로 Export가 되고, 앱이 대신 고른 셈이 된다.
//
// 창을 넉넉히 잡으면 **다음 분기의 severity까지** 창 안에 들어와, 이 분기를 경고로
// 낮춰도 검사가 통과한다. 실제로 그렇게 한 번 새어나갔다. 첫 push 하나만 본다.
const sliceFirstPush = (marker) => {
  const at = exportSource.indexOf(marker);
  assert.ok(at > 0, `${marker} 분기가 사라졌다`);
  const pushAt = exportSource.indexOf('issues.push({', at);
  const endAt = exportSource.indexOf('});', pushAt);
  assert.ok(pushAt > at && endAt > pushAt, `${marker} 분기에서 issues.push를 찾지 못했다`);
  return exportSource.slice(pushAt, endAt);
};
assert.match(
  sliceFirstPush('allPeriods && allPeriods.length > 1'),
  /severity: 'error'/,
  '기간 미선택이 경고면 그대로 문서가 나간다 — 앱이 대신 고른 것과 같아진다'
);
assert.match(
  sliceFirstPush('allPeriods && allPeriods.length === 0'),
  /severity: 'error'/,
  '보고기간 없음이 경고면 신고 범위가 빈 문서가 나간다'
);
assert.match(
  sliceFirstPush('if (unassignedTotal > 0)'),
  /severity: 'error'/,
  '기간 미지정 자료가 경고면 다른 기간 배출이 섞인 채 나간다'
);

// ── 5) 화면이 선택을 프로젝트 자료로 저장하는가 ───────────────────────
const panelsSource = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panelsSource, /EXPORT_PERIOD_SETTING_KEY/, '8단계가 고른 기간을 저장하지 않는다 — 새로고침하면 선택이 사라진다');
assert.match(panelsSource, /reportingPeriodId: exportPeriod\?\.id/, 'Export 호출이 고른 기간을 넘기지 않는다');
assert.match(
  panelsSource,
  /data\.periods\.length === 1[\s\S]{0,120}data\.periods\[0\]/,
  '기간이 하나일 때 자동 확정하는 분기가 없다 — 매번 고르게 하면 단일 기간 사용자가 막힌다'
);

// [핵심] 고르는 자리는 **1단계(SetupPanel)** 여야 한다.
// 8단계에 두면 미선택 오류가 8단계를 잠가서 고치러 갈 수 없는 막다른 길이 된다.
const setupStart = panelsSource.indexOf('function SetupPanel(');
const setupEnd = panelsSource.indexOf('// ── 2단계', setupStart);
const setupBody = panelsSource.slice(setupStart, setupEnd);
assert.ok(setupStart > 0 && setupEnd > setupStart, 'SetupPanel을 찾지 못했다');
assert.match(
  setupBody,
  /chooseExportPeriod/,
  '1단계에 기간 선택이 없다 — 8단계는 미선택 오류로 잠기므로, 거기에만 두면 고칠 방법이 사라진다'
);
const exportStart = panelsSource.indexOf('function ExportPanel(');
const exportBody = panelsSource.slice(exportStart);
assert.ok(
  !/setLocalSetting\(EXPORT_PERIOD_SETTING_KEY/.test(exportBody),
  '8단계에서 기간을 고르게 하면 안 된다 — 그 화면은 미선택일 때 잠긴다'
);
assert.match(exportBody, /onSelectStep\('setup'\)/, '8단계가 미선택일 때 1단계로 보내는 길이 없다');

const workspaceSource = readFileSync('src/components/guided/GuidedWorkspace.tsx', 'utf8');
assert.match(
  workspaceSource,
  /evaluateEuExportReadiness\(\{[\s\S]{0,200}periods,[\s\S]{0,200}reportingPeriodId/,
  '지도의 준비도 계산이 기간을 넘기지 않는다 — 8단계에 가야만 문제를 알게 된다'
);

console.log('Reporting period verification passed (정렬 결정성 · 단일 선택 지점 · 기간 필터 · 미선택 차단 · 선택 저장).');
