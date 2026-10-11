// 제출 화면 (UX 목업 6번, 2026-10-07).
//
// 잠그는 것:
//  1) 판정·점검표는 읽고 모으기만 한다: 막는 것은 EU 문서 준비도 오류뿐이고, 나머지는 「보낼 수 있습니다. 다만 …」로 알린다(목업의 어조).
//  2) 파일을 만드는 호출은 상세 Export 화면(`/export`)과 **같은 자료·같은 인자**다 — 두 곳의 호출 인자 목록을 대조한다(한쪽만 바뀌어 파일이 달라지지 않게).
//  3) 쓰기는 submit-actions.ts 한 곳이고, 레코드를 만들거나 고치지 않는다(마지막 백업 시각 기록뿐).
//  4) 배선: 서비스 워커·경로 검사·페이지 제목·지도 머리글의 「제출」.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const file = (path) => readFileSync(path, 'utf8');
const source = file('src/lib/submission-status.ts').replace(/^import [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '') + '\nglobalThis.app = { buildSubmissionSummary };';
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const { buildSubmissionSummary } = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));

// ── 1) 판정 ─────────────────────────────────────────────────────────
const attributionOk = { rows: [{}], counts: { ok: 6, review: 0, fix: 0, na: 2 }, notApplicable: [] };
const base = {
  installation: { name: 'Daeil' }, exportPeriod: { name: '2025년 연간' }, periodCount: 1,
  products: [{ name: 'STS 나사', cnCode: '73181552', outputMassT: 3240 }],
  precursors: [{ data_mode: 'ACTUAL', verification_status: 'VERIFIED' }],
  fuelOrElectricityEntered: true, readiness: { errorCount: 0, warningCount: 0 }, todoItems: [], attribution: attributionOk,
};
const row = (summary, id) => summary.rows.find((item) => item.id === id);

const ready = buildSubmissionSummary(base);
assert.equal(ready.verdict.kind, 'ready');
assert.equal(ready.verdict.headline, '보낼 수 있습니다.');
assert.ok(ready.rows.every((item) => item.status === 'ok'), '모두 갖춰지면 전부 ✓');
assert.deepEqual(plain(ready.rows.map((item) => item.id)), ['products', 'period', 'output', 'energy', 'precursors', 'installation', 'attribution']);
assert.equal(row(ready, 'output').detail, '3,240 t');
assert.match(row(ready, 'precursors').detail, /모두 제3자 검증된 실측/);

const empty = buildSubmissionSummary({ ...base, products: [] });
assert.equal(empty.verdict.kind, 'empty');
assert.equal(row(empty, 'products').status, 'blocked');

// 막는 것: 준비도 오류만이 아니라 보고기간 미지정도(기간 둘, 안 고름)
const blockedByReadiness = buildSubmissionSummary({ ...base, readiness: { errorCount: 2, warningCount: 0 } });
assert.equal(blockedByReadiness.verdict.kind, 'blocked');
assert.match(blockedByReadiness.verdict.detail, /해결할 것이 2건/);
assert.deepEqual(plain(blockedByReadiness.verdict.blockers), [], '문장을 안 넘기면 막는 목록은 비어 있다');
const withBlockers = buildSubmissionSummary({ ...base, readiness: { errorCount: 7, warningCount: 0 }, blockingIssues: Array.from({ length: 7 }, (_, i) => ({ message: '막는 오류 ' + i, href: i === 0 ? '/map' : undefined })) });
assert.equal(withBlockers.verdict.blockers.length, 5, '막는 목록은 최대 5건');
assert.equal(withBlockers.verdict.blockers[0].href, '/map');
assert.equal(ready.verdict.blockers.length, 0);
assert.equal(empty.verdict.blockers.length, 0);
const periodUnchosen = buildSubmissionSummary({ ...base, periodCount: 2, exportPeriod: undefined });
assert.equal(periodUnchosen.verdict.kind, 'blocked');
assert.equal(row(periodUnchosen, 'period').status, 'blocked');
assert.match(row(periodUnchosen, 'period').detail, /2개인데 문서에 넣을 기간을 고르지 않았습니다/);
assert.equal(buildSubmissionSummary({ ...base, periodCount: 2, exportPeriod: { name: '2025' } }).verdict.kind, 'ready', '기간 둘이라도 고르면 통과');

// 보낼 수 있되 알릴 것(목업 어조): EU 기본값·잠정 구매 강재, 사업장 정보, 귀속 점검
const notice = buildSubmissionSummary({
  ...base,
  precursors: [{ data_mode: 'DEFAULT', verification_status: 'UNVERIFIED' }, { data_mode: 'ACTUAL', verification_status: 'SUPPLIER_CONFIRMED' }, { data_mode: 'ACTUAL', verification_status: 'VERIFIED' }],
  todoItems: [{ id: 'r:0', area: '사업장', title: 'Daeil: UN/LOCODE가 비어 있습니다' }],
  attribution: { ...attributionOk, counts: { ok: 4, review: 1, fix: 1, na: 0 } },
});
assert.equal(notice.verdict.kind, 'notice');
assert.equal(notice.verdict.headline, '보낼 수 있습니다.');
assert.match(notice.verdict.detail, /다만 아래 3가지는 파일에 「기본값」 또는 「잠정」으로 적히거나 비어 있습니다/);
assert.equal(notice.verdict.noticeCount, 3);
assert.match(row(notice, 'precursors').detail, /EU 기본값 1건\(또는 일부만 실측\)/);
assert.match(row(notice, 'precursors').detail, /제3자 검증 전\(잠정\) 1건/);
assert.equal(row(notice, 'installation').status, 'notice');
assert.match(row(notice, 'installation').detail, /UN\/LOCODE가 비어 있습니다/);
assert.match(row(notice, 'attribution').detail, /수정 필요 1건 · 확인 필요 1건/);
assert.equal(row(notice, 'attribution').status, 'notice', '귀속 점검은 알리되 이 화면이 새로 막지는 않는다(막는 것은 준비도 오류뿐)');
assert.ok(notice.rows.filter((item) => item.status === 'blocked').length === 0);

// 답하지 않은 질문
const asked = buildSubmissionSummary({ ...base, todoItems: [{ id: 'q:a:precursor', area: '구매 전구물질', title: '' }, { id: 'q:a:fuel', area: '배출원 자료', title: '' }, { id: 'q:a:heat', area: '생산공정', title: '' }] });
assert.equal(row(asked, 'precursors').status, 'notice');
assert.match(row(asked, 'precursors').detail, /구매한 강재가 있는지 아직 답하지 않았습니다/);
assert.match(row(asked, 'energy').detail, /답하지 않은 질문이 2개/);
assert.equal(row(buildSubmissionSummary({ ...base, fuelOrElectricityEntered: false }), 'energy').status, 'notice');
assert.equal(row(buildSubmissionSummary({ ...base, precursors: [] }), 'precursors').detail, '구매한 강재가 없다고 확인했습니다.');

// ── 자료가 덜 들어왔다(run35 P1-05): 올린 서식에서 넣지 못한 줄 · 구매 강재를 아직 안 넣고 확인도 안 함 ──
const unplaced = buildSubmissionSummary({ ...base, lastImport: { filename: 'x.xlsx', unplacedCount: 9, unplaced: [{ message: '5_구매강재 5번째 줄 — SCM435 와이어: 쓰는 공정을 찾지 못했습니다', href: '/upload' }] } });
assert.equal(unplaced.verdict.kind, 'incomplete', '넣지 못한 줄이 남았으면 「보낼 수 있습니다」라고만 하지 않는다');
assert.equal(unplaced.verdict.headline, '자료가 아직 덜 들어왔습니다.');
assert.match(unplaced.verdict.detail, /넣지 못한 줄이 9건 있어 그 자료가 빠진 채 계산됩니다/);
assert.equal(unplaced.verdict.blockers.length, 1, '무엇이 빠졌는지 그대로 보여 준다');
assert.equal(row(unplaced, 'upload').status, 'notice', '새로 막지는 않는다(막는 것은 준비도 오류뿐) — 파일은 만들 수 있다');
assert.match(row(unplaced, 'upload').detail, /9건/);
assert.equal(row(unplaced, 'upload').href, '/upload');
const noPrecursorAsked = buildSubmissionSummary({ ...base, precursors: [], todoItems: [{ id: 'q:a:precursor', area: '구매 전구물질', title: '' }] });
assert.equal(noPrecursorAsked.verdict.kind, 'incomplete', '구매 강재를 넣지도 확인하지도 않았으면 덜 들어온 것이다');
assert.match(noPrecursorAsked.verdict.detail, /SEE의 대부분이 여기서 나오므로/);
assert.equal(buildSubmissionSummary({ ...base, precursors: [], todoItems: [] }).verdict.kind, 'ready', '구매 강재가 없다고 확인했으면(질문이 없으면) 그대로 보낼 수 있다');
assert.equal(buildSubmissionSummary({ ...base, lastImport: { unplacedCount: 0, unplaced: [] } }).verdict.kind, 'ready', '넣지 못한 줄이 없으면 아무 말도 하지 않는다');
assert.equal(buildSubmissionSummary({ ...base, readiness: { errorCount: 1, warningCount: 0 }, lastImport: { unplacedCount: 2, unplaced: [] } }).verdict.kind, 'blocked', '준비도 오류가 있으면 그쪽이 먼저다');
assert.ok(!row(unplaced, 'upload') || row(buildSubmissionSummary(base), 'upload') === undefined, '알림 줄은 넣지 못한 줄이 있을 때만 생긴다');

// ── 2) /export와 같은 호출 ─────────────────────────────────────────
// 호출 하나의 인자 객체에서 「키: 값」 목록을 뽑는다(깊이 1, 값의 공백·`data.` 접두를 지운다).
function argEntries(text, call, argIndex = 0) {
  const start = text.indexOf(`${call}(`);
  assert.ok(start >= 0, `${call} 호출이 있다`);
  let i = text.indexOf('(', start) + 1;
  let depth = 0;
  const args = [''];
  for (; i < text.length; i++) {
    const ch = text[i];
    if ('({['.includes(ch)) depth++;
    if (')}]'.includes(ch)) {
      if (depth === 0) break;
      depth--;
    }
    if (ch === ',' && depth === 0) { args.push(''); continue; }
    args[args.length - 1] += ch;
  }
  const objectText = args[argIndex].trim().replace(/^\{/, '').replace(/\}$/, '');
  const entries = [];
  let d = 0, current = '';
  for (const ch of objectText) {
    if ('({['.includes(ch)) d++;
    if (')}]'.includes(ch)) d--;
    if (ch === ',' && d === 0) { entries.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) entries.push(current.trim());
  return entries.filter(Boolean).map((entry) => {
    const match = entry.match(/^(\w+)\s*(?::\s*([\s\S]+))?$/);
    assert.ok(match, `인자 항목을 읽는다: ${entry.slice(0, 40)}`);
    // 화면 상태 이름(상세 화면)과 이 화면의 data 필드 이름만 맞춘다: `data.` 접두, `template.file` ↔ `templateFile`
    return [match[1], (match[2] ?? match[1]).replace(/\s+/g, ' ').replace(/\bdata\./g, '').replace(/\btemplate\.file\b/g, 'templateFile').trim()];
  }).sort((a, b) => a[0].localeCompare(b[0]));
}
const exportPage = file('src/app/export/page.tsx');
const actions = file('src/components/submit/submit-actions.ts');
const submitData = file('src/components/submit/submit-data.ts');
// 인자 객체 안에서 같은 이름을 다르게 부르는 곳(상세 화면 상태 이름 ↔ 이 화면의 data 필드)만 이름을 맞춘다.
const alias = (entries) => entries.map(([key, value]) => [key, value.replace(/^reportableResults$/, 'reportableResults')]);
const same = (left, right, label) => assert.deepEqual(plain(alias(left)), plain(alias(right)), `${label}: 상세 Export 화면과 같은 인자(키와 값)`);

same(argEntries(exportPage, 'createCalculationReport'), argEntries(actions, 'createCalculationReport'), '산정보고서');
// 패키지: 상세 화면의 인자 중 이 화면이 다르게 만드는 것(점검표는 사본을 만든 뒤 다시 만든다)만 값이 다르고 키는 같다
const exportPackage = argEntries(exportPage, 'createDeliveryPackage');
const submitPackage = argEntries(actions, 'createDeliveryPackage');
assert.deepEqual(plain(exportPackage.map(([key]) => key)), plain(submitPackage.map(([key]) => key)), '전달 패키지: 같은 인자 키');
for (const [key, value] of exportPackage) {
  if (['exportChecklist', 'readiness'].includes(key)) continue;
  assert.equal(plain(submitPackage.find(([k]) => k === key)[1]), value, `전달 패키지 ${key}`);
}
// EU 사본에 넘기는 자료의 키는 exportRecords()가 만든다(호출 자리에는 이송을 명시해 verify:internal-transfer의 규칙도 따른다) — 상세 화면의 키 목록과 같아야 한다
const recordsBlock = actions.slice(actions.indexOf('function exportRecords'), actions.indexOf('export async function downloadEuCopy'));
const exportRecordKeys = argEntries(exportPage, 'createEuTemplateExportCopyResult', 1).map(([key]) => key);
for (const key of exportRecordKeys) assert.ok(new RegExp(`\\b${key}: data\\.${key}\\b`).test(recordsBlock), `EU 사본 자료 ${key}`);
assert.equal((recordsBlock.match(/: data\./g) ?? []).length, exportRecordKeys.length, 'EU 사본 자료의 키 수');
assert.equal((actions.match(/internalTransfers: data\.internalTransfers \}/g) ?? []).length, 2, '사본을 만드는 두 곳 모두 이송을 명시해 넘긴다(verify:internal-transfer의 규칙)');
same(argEntries(exportPage, 'scopeRecordsToExportPeriod'), argEntries(submitData, 'scopeRecordsToExportPeriod'), '보고기간 범위 맞추기(화면 계산)');
assert.ok(exportPage.includes("window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at)") && actions.includes("window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at)"), '패키지를 만들면 마지막 백업 시각을 같은 방식으로 기록');
assert.ok(exportPage.includes('createEuExportFilename(templateFile.name)') && actions.includes('createEuExportFilename(template.file.name)'), '같은 파일 이름 규칙');
assert.ok(exportPage.includes("periods.length > 1 && !periods.some((period) => period.id === reportingPeriodId)") && actions.includes('data.periods.length > 1 && !data.periods.some((period) => period.id === data.reportingPeriodId)'), '기간을 안 고르면 보고서를 만들지 않는다 — 같은 조건');

// ── 3) 쓰기 범위 ────────────────────────────────────────────────────
const dir = 'src/components/submit';
for (const name of readdirSync(dir).filter((entry) => /\.(ts|tsx)$/.test(entry))) {
  const text = file(`${dir}/${name}`);
  // 입력 자료(레코드)는 건드리지 않는다. 쓰기는 하나만 허용한다: 「넣지 못한 줄」 알림 기록을 비우는 dismissUploadNotice(submit-actions.ts) — 사용자가 직접 넣었다고 알린 경우.
  const setting = text.match(/await setLocalSetting\(([^,)]*)/g) ?? [];
  assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem/.test(text), `${name}: 레코드를 만들거나 고치지 않는다`);
  assert.ok(name === 'submit-actions.ts' ? setting.length === 1 && /ACTIVITY_IMPORT_RESULT_SETTING_KEY/.test(setting[0]) : setting.length === 0, `${name}: 설정 쓰기는 알림 기록 비우기 하나뿐이다`);
  assert.equal(/localStorage\.setItem|exportLocalBackup/.test(text), name === 'submit-actions.ts', `${name}: 백업을 만들고 마지막 백업 시각을 쓰는 것은 submit-actions.ts에서만(읽기는 어디서든)`);
}
assert.deepEqual(plain(actions.match(/localStorage\.setItem\(([A-Z_]+)/g)), ['localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY', 'localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY'], '쓰는 것은 마지막 백업 시각 하나');

// ── 4) 화면·배선 ────────────────────────────────────────────────────
const ui = file(`${dir}/SubmitWorkspace.tsx`);
assert.ok(ui.includes('data-testid="submit-blockers"') && ui.includes('summary.verdict.blockers'), '막는 목록을 판정 아래에 그린다');
assert.ok(ui.includes('data-testid="submit-verdict"') && ui.includes('data-testid="submit-checklist"'));
assert.ok(ui.includes("disabled={Boolean(disabledReason) || busy !== ''}"), '막힌 동안은 파일 버튼이 꺼진다');
assert.ok(ui.includes("'먼저 막힌 항목을 해결하세요.'"));
assert.ok(ui.includes('aria-label={ROW_MARK[row.status].label}'), '색만이 아니라 글자·표시로도 상태를 말한다');
assert.ok(ui.includes('EU Communication 엑셀') && ui.includes('산정 보고서 (Word)') && ui.includes('전달 패키지 (zip)') && ui.includes('백업 받기'));
assert.ok(ui.includes('href="/export"'), '다른 템플릿은 상세 Export 화면으로');
assert.ok(!/\bAI\b|챗봇/.test(ui));
assert.match(file('src/app/submit/page.tsx'), /SubmitWorkspace/);
assert.ok(file('public/sw.js').includes('"/submit"'));
assert.ok(file('scripts/verify-production-routes.mjs').includes("'/submit'"));
assert.ok(file('src/components/AppShell.tsx').includes("'/submit': '제출'"));
const nav = file('src/components/todo/TodoNavLink.tsx');
assert.ok(nav.includes('href="/submit"') && nav.includes('data-testid="submit-nav"'), '지도 머리글의 「제출」');
assert.ok(file('src/components/todo/TodoWorkspace.tsx').includes('href="/submit"'), '할 일 화면에서 제출로');

console.log('Submit verified (판정=준비도 오류만 막음·「보낼 수 있습니다. 다만…」 어조 · /export와 같은 호출 인자 · 쓰기는 마지막 백업 시각뿐 · 배선).');
