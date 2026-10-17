// 모니터링 계획 초안(2025/2547 부속서 II A.5의 22개 항목).
//
// 잠그는 것:
//  1) 항상 22개 항목이 번호 순서대로 나온다 — 자료가 하나도 없어도(「작성 필요」로) 문서가 만들어진다.
//  2) 앱에 있는 값만 옮긴다: 작성 예시(대일기업)에서 사업장·CN·배출원·구매 강재·폐가스가 그대로 나오고, 없는 것은 지어내지 않는다.
//  3) 회사가 써야 하는 것(측정기 위치·검교정·위험 평가·IT 시스템)은 「작성 필요」 + 물음으로 남는다.
//  4) 문서 첫머리가 「초안 — 회사 확인·승인 필요」라고 말하고, 규정 서식의 완성본이라고 하지 않는다.
//  5) 읽기만 한다 — 제출 화면의 쓰기 범위를 넓히지 않는다. 배선: 제출 화면의 파일 카드.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const fflate = nodeRequire('fflate');
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireFrom = (request) => (request === 'fflate' ? fflate : load(`${request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(full), request)}.ts`));
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Blob, Intl, Uint8Array, console, Date, navigator: undefined, DOMParser: undefined })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

const P = load('src/lib/monitoring-plan.ts');
const W = load('src/lib/activity-workbook.ts');
const I = load('src/lib/activity-import.ts');
const bundled = load('src/lib/bundled-references.ts');
const defaultValues = bundled.expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-11T00:00:00.000Z');
const generatedAt = new Date('2026-10-11T09:00:00.000Z');

// ── 1) 자료가 하나도 없어도 22개 항목 ──────────────────────────────
const empty = P.buildMonitoringPlan({ installations: [], periods: [], products: [], processes: [], productOutputLines: [], sourceStreams: [], precursors: [], generatedAt });
assert.deepEqual(plain(empty.sections.map((section) => section.no)), Array.from({ length: 22 }, (_, index) => index + 1), '항목은 1~22 번호 순서');
assert.equal(empty.sections.length, 22);
const statusOf = (plan, no) => plan.sections.find((section) => section.no === no).status;
assert.equal(statusOf(empty, 2), 'TODO', '사업장이 없으면 작성 필요');
assert.equal(statusOf(empty, 3), 'TODO');
assert.equal(statusOf(empty, 12), 'NA', '철강만 다루므로 PFC는 해당 없음');
assert.equal(statusOf(empty, 19), 'NA', '전력 수입 증빙도 해당 없음');
assert.equal(statusOf(empty, 21), 'TODO', '앱은 CO₂ 포집을 모른다 — 작성 필요(해당 없음이라는 문장을 회사가 적는다)');
assert.equal(empty.counts.AUTO + empty.counts.PARTIAL + empty.counts.TODO + empty.counts.NA, 22);

// ── 2) 작성 예시(대일기업)를 올린 프로젝트에서 ───────────────────────
const store = { installations: [], periods: [], products: [], processes: [], product_output_lines: [], source_streams: [], precursors: [], internal_transfers: [] };
let counter = 0;
let report;
const api = {
  list: async (name) => [...store[name]],
  create: async (name, item) => { const entity = { ...item, id: `${name}_${counter += 1}`, created_at: 't', updated_at: 't' }; store[name].push(entity); return entity; },
  update: async (name, item) => { store[name] = store[name].map((entry) => (entry.id === item.id ? item : entry)); return item; },
};
const parsed = W.parseActivityWorkbook(new Uint8Array(await new Blob([await W.createActivityWorkbook({ countries: ['South Korea', 'Taiwan'], fill: W.ACTIVITY_WORKBOOK_SAMPLE }).arrayBuffer()]).arrayBuffer()));
await I.importActivityWorkbook(parsed, { store: api, defaultValues, reportInputs: { get: async () => report, set: async (value) => { report = value; } } });
const input = {
  installations: store.installations, periods: store.periods, products: store.products, processes: store.processes, productOutputLines: store.product_output_lines,
  sourceStreams: store.source_streams, precursors: store.precursors, internalTransfers: store.internal_transfers, reportInputs: report, generatedAt,
};
const plan = P.buildMonitoringPlan(input);
assert.equal(plan.sections.length, 22);
const section = (no) => plan.sections.find((item) => item.no === no);
const text = (item) => JSON.stringify([item.paragraphs, item.tables]);
assert.match(text(section(2)), /Daeil Industrial Co\., Ltd\. Ansan Plant/, '사업장 이름');
assert.match(text(section(2)), /STS 나사 공정/, '공정 목록');
{
  // 고른 공정 구분 방식은 4번(생산공정)에 적힌다 — 고른 적이 없으면 한 줄도 더하지 않는다
  assert.doesNotMatch(text(section(4)), /공정 구분 방식/);
  const grouping = { choice: 'MERGE', chosen_at: '2026-10-12T00:00:00.000Z', tolerance_pp: 5, groups: [
    { cns: ['73181692'], output_t: 100, merged_see: 1.5, split_see: 2.0, delta_pct: -25 },
    { cns: ['73181660'], output_t: 50, merged_see: 1.5, split_see: 1.0, delta_pct: 50 },
  ] };
  const grouped = P.buildMonitoringPlan({ ...input, reportInputs: { ...report, process_grouping: grouping } });
  assert.match(text(grouped.sections.find((item) => item.no === 4)), /공정 구분 방식\(2026-10-12 선택\).*한 다기능 생산공정으로 합쳐/, '모니터링 계획 4번에 고른 방식');
}
assert.match(text(section(3)), /73181552/, 'CN 코드별 재화');
assert.match(text(section(4)), /탄소강 나사 공정/);
assert.match(text(section(9)), /지게차 경유/, '배출원 목록');
assert.match(text(section(14)), /대한스테인리스선재 포항공장/, '구매 전구물질의 공급사');
assert.match(text(section(14)), /Taiwan/, '공급 국가');
assert.match(text(section(20)), /폐가스가 발생하지 않는다/, '폐가스: 입력된 답');
assert.equal(statusOf(plan, 20), 'AUTO');
assert.match(text(section(2)), /작성 필요/, '입력되지 않은 값(CBAM Registry 식별자 등)은 지어내지 않고 「작성 필요」');
// 입력된 값을 바꾸지 않는다: 배출원의 활동자료 숫자가 그대로 실린다.
const fuel = store.source_streams.find((stream) => stream.name.includes('지게차 경유'));
assert.ok(text(section(9)).includes(new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 6 }).format(fuel.activity_data)), '활동자료 숫자는 입력된 그대로(소수 여섯째 자리까지)');

// ── 3) 회사가 써야 하는 것은 비워 두고 묻는다 ───────────────────────
assert.ok(section(7).questions.length > 0 && /측정기/.test(section(7).questions[0]), '측정기 위치를 묻는다');
assert.equal(section(22).questions.length, 3, '검·교정 · 위험 평가 · IT 시스템');
assert.ok(['TODO', 'PARTIAL'].includes(section(22).status), '품질 관리 체계는 앱이 모른다');
assert.match(section(13).paragraphs.join(' '), /공정 흐름도와 설비 배치도\(그림\): 작성 필요/, '그림은 만들지 않는다');
assert.equal(plan.counts.TODO + plan.counts.PARTIAL > 0, true);

// ── 3b) 회사가 앱 안에서 적은 답(보고서 입력 monitoring_plan.answers)이 「작성 필요」 자리를 채운다 ──────
{
  const withAnswers = (answers) => ({ ...input, reportInputs: { ...report, monitoring_plan: { ...report.monitoring_plan, answers } } });
  const answers = { '7': '도시가스: 도시가스사 정산용 계량기(본관 보일러실). 경유: 주유 전표.', '21': '해당 없음', '22': '(a) 계량기는 해마다 12월 총무팀이 검교정 성적서를 받는다.\n(b) 집계표는 대표가 확인한다.', '9': '물음 없는 항목의 답은 쓰이지 않는다', '13': '   ' };
  const answered = P.buildMonitoringPlan(withAnswers(answers));
  const byNo = (result, no) => result.sections.find((item) => item.no === no);
  // 답이 있는 항목: answer가 실리고, 본문의 「작성 필요」 문구가 안내로 바뀐다
  assert.equal(byNo(answered, 7).answer, answers['7']);
  assert.match(byNo(answered, 7).paragraphs.join(' '), /측정기 위치는 아래 「회사가 직접 적은 내용」에 적었습니다/);
  assert.ok(!/측정기 위치는 작성 필요/.test(byNo(answered, 7).paragraphs.join(' ')), '답이 있으면 그 문장에 작성 필요가 남지 않는다');
  assert.equal(byNo(answered, 21).status, 'AUTO', '앱이 전혀 모르는 항목(CO₂ 포집)은 답만으로 채워진다');
  assert.ok(!/작성 필요/.test(byNo(answered, 21).paragraphs.join(' ')));
  assert.ok(['PARTIAL', 'AUTO'].includes(byNo(answered, 22).status), '품질 관리 체계는 답이 있으면 TODO가 아니다');
  assert.ok(!/알 수 없습니다\. 작성 필요/.test(byNo(answered, 22).paragraphs.join(' ')));
  // 답이 없거나 공백뿐이거나 물음이 없는 항목은 종전과 같다
  for (const no of [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]) {
    assert.equal(byNo(answered, no).status, byNo(plan, no).status, `${no}번 상태는 그대로`);
    assert.equal(byNo(answered, no).answer, undefined, `${no}번에는 답이 실리지 않는다`);
    assert.deepEqual(plain(byNo(answered, no).paragraphs), plain(byNo(plan, no).paragraphs), `${no}번 본문은 그대로`);
  }
  assert.equal(byNo(plan, 7).answer, undefined, '답이 없으면 answer가 없다');
  // 표의 「작성 필요」가 남은 항목은 답이 있어도 AUTO가 되지 않는다(앱이 못 채운 칸이 있다)
  assert.ok(['PARTIAL', 'AUTO'].includes(byNo(answered, 7).status));
  if (/작성 필요/.test(JSON.stringify(byNo(answered, 7).tables))) assert.notEqual(byNo(answered, 7).status, 'AUTO', '표에 작성 필요가 남으면 AUTO가 아니다');
  // 자료가 없어 TODO인 항목은 답만으로 AUTO가 되지 않는다
  const noData = P.buildMonitoringPlan({ installations: [], periods: [], products: [], processes: [], productOutputLines: [], sourceStreams: [], precursors: [], generatedAt, reportInputs: { monitoring_plan: { answers: { '7': '위치', '22': '체계' } } } });
  assert.equal(byNo(noData, 7).status, 'PARTIAL', '배출원이 없어 TODO였던 7번은 답으로 PARTIAL까지');
  assert.notEqual(byNo(noData, 22).status, 'AUTO');
  // 문서: 답이 「회사가 직접 적은 내용」으로 실리고 그 항목의 빈 상자는 없다
  const docPlain = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await P.createMonitoringPlanDocument(input).blob.arrayBuffer()))['word/document.xml']);
  const docAnswered = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await P.createMonitoringPlanDocument(withAnswers(answers)).blob.arrayBuffer()))['word/document.xml']);
  const boxes = (value) => (value.match(/여기에 적으세요 \]/g) ?? []).length;
  assert.equal(boxes(docPlain) - boxes(docAnswered), 3, '답이 있는 항목(7·21·22)의 빈 상자가 사라진다');
  assert.match(docAnswered, /회사가 직접 적은 내용/);
  assert.match(docAnswered, /도시가스사 정산용 계량기\(본관 보일러실\)/);
  assert.match(docAnswered, /계량기는 해마다 12월 총무팀이 검교정 성적서를 받는다/);
  assert.match(docAnswered, /집계표는 대표가 확인한다/, '여러 줄 답은 줄마다 문단');
  assert.ok(!docAnswered.includes('물음 없는 항목의 답은 쓰이지 않는다'), '물음이 없는 항목(9번)의 답은 문서에 나오지 않는다');
  // 읽기 전용: 입력 객체를 바꾸지 않는다
  assert.deepEqual(plain(withAnswers(answers).reportInputs.monitoring_plan.answers), plain(answers));
  // 화면 배선: 보고서 입력 화면이 계획이 정한 물음 목록을 보여 주고 답을 monitoring_plan.answers에 저장한다
  const reportPage = readFileSync('src/app/report-inputs/page.tsx', 'utf8');
  assert.ok(reportPage.includes('buildMonitoringPlan(') && reportPage.includes('.filter((section) => section.questions.length > 0)'), '물음 목록은 계획 만들기가 정한 것을 그대로 쓴다');
  assert.ok(reportPage.includes('<MonitoringPlanAnswers') && reportPage.includes('answers: { ...(inputs.monitoring_plan?.answers ?? {}), [String(no)]: text }'), '답은 monitoring_plan.answers[항목 번호]에 쌓인다');
  const answersScreen = readFileSync('src/components/MonitoringPlanAnswers.tsx', 'utf8');
  assert.ok(answersScreen.includes('<textarea') && answersScreen.includes('section.questions.map'), '물음을 보여 주고 직접 쓰는 칸이 있다');
  // 새 프로젝트가 지우는 report:inputs 안에 있다 — 새 설정 키를 만들지 않았다(NEW_PROJECT 목록 변경 없음)
  assert.ok(!/monitoring_plan_answers|plan:answers/.test(readFileSync('src/lib/local-db.ts', 'utf8')), '별도 설정 키를 만들지 않았다');
}

// ── 4) 문서 ──────────────────────────────────────────────────────
const doc = P.createMonitoringPlanDocument(input);
assert.match(doc.filename, /^CBAM_Monitoring_Plan_Draft_20261011\.docx$/);
const xml = fflate.strFromU8(fflate.unzipSync(new Uint8Array(await doc.blob.arrayBuffer()))['word/document.xml']);
assert.match(xml, /모니터링 계획 초안/);
assert.match(xml, /규정이 요구하는 모니터링 계획의 완성본이 아니며/, '완성본이라고 하지 않는다');
assert.match(xml, /회사가 내용을 확인하고 승인해야/);
assert.equal((xml.match(/작성 필요/g) ?? []).length > 5, true, '작성 필요 자리가 문서에 남는다');
for (let no = 1; no <= 22; no += 1) assert.ok(xml.includes(`${no}. `), `${no}번 항목 제목`);

// ── 5) 읽기만 한다 · 배선 ────────────────────────────────────────
const libSource = readFileSync('src/lib/monitoring-plan.ts', 'utf8');
assert.ok(!/createLocalItem|updateLocalItem|setLocalSetting|deleteLocalItem|indexedDB|localStorage/.test(libSource), '라이브러리는 저장소에 쓰지 않는다');
const actions = readFileSync('src/components/submit/submit-actions.ts', 'utf8');
assert.ok(actions.includes('export async function downloadMonitoringPlan') && actions.includes('createMonitoringPlanDocument('));
assert.ok(readFileSync('src/components/submit/SubmitWorkspace.tsx', 'utf8').includes("fileCard('plan', '모니터링 계획 초안 (Word)'"), '제출 화면의 받을 파일에 카드가 있다');
assert.ok(readFileSync('package.json', 'utf8').includes('"verify:monitoring-plan"'));
// 전달 패키지: 제출 화면과 상세 Export 화면이 같은 함수로 계획 초안을 만들어 같은 이름의 인자로 넘긴다.
assert.ok(actions.includes('monitoringPlanBlob: monitoringPlan.blob') && actions.includes('buildMonitoringPlan(data, docScope, generatedAt)'), '제출 화면의 패키지에 계획 초안');
const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
assert.ok(exportPage.includes('createMonitoringPlanDocument({') && exportPage.includes('monitoringPlanBlob: monitoringPlan.blob'), '상세 Export 화면의 패키지에도 같은 계획 초안');
assert.ok(readFileSync('src/lib/delivery-package.ts', 'utf8').includes('monitoringPlanBlob?: Blob'), '패키지 입력은 선택 항목(없으면 예전 구조 그대로)');

// ── 외주 공정 몫(EC CBAM Q&A 4.31): 제9항에 방법·근거와 통제 문단 — 외주 행이 없으면 문서가 종전과 같다 ──
{
  const plainText = text(section(9));
  assert.ok(!/외주 공정:/.test(plainText), '외주 행이 없으면 외주 문단이 없다');
  const firstProcess = store.processes[0];
  const row = {
    id: 'out-1', process_id: firstProcess.id, period_id: firstProcess.period_id, name: '(외주) 가상 코팅 B사 — 아연 플레이크 코팅 · 도시가스', stream_type: 'FUEL', method: 'Combustion',
    activity_data: 36000, activity_unit: 'Nm3', ncv_gj_per_unit: 0.0385, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1,
    fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'EU_OR_IPCC_DEFAULT', source: '외주처 가스 고지서 · 외주 공정 몫', created_at: 't', updated_at: 't',
    outsourced: { subcontractor: '가상 코팅 B사', technique: 'ZINC_FLAKE_COATING', technique_evidence: '정류기 없음', basis: 'RECONSTRUCTED', company_total: 120000, note: '사례 A', evidence: '외주처 가스 고지서 2025', total_share: 36000 },
  };
  const withOutsourced = P.buildMonitoringPlan({ ...input, sourceStreams: [...store.source_streams, row] });
  const outsourcedText = text(withOutsourced.sections.find((item) => item.no === 9));
  assert.match(outsourcedText, /외주 공정: 철강제품 경계 안의 공정을 외주사에서 하고 물건이 돌아오면 우리 사업장에서 일어난 것으로 다루며\(EC CBAM Q&A 2026-05-27, 4\.31\)/);
  assert.match(outsourcedText, /가상 코팅 B사 — 아연 플레이크 코팅\(다크로·지오메트 등, 비전해\) 연료: 우리 몫 36,000 Nm3, 방법 「설비 소비율 × 가동시간으로 재구성 \(고지서 총량에 맞춤\)」/);
  assert.match(outsourcedText, /근거: 사례 A\. 증빙: 외주처 가스 고지서 2025\./);
  assert.match(outsourcedText, /부속서 II A\.5 22\(g\)/, '외주 공정의 통제 문장');
  assert.match(outsourcedText, /외주처 「가상 코팅 B사」의 전기\(간접배출\)는 입력되지 않았습니다/, '연료만 입력한 외주처는 전기 미입력 안내');
  const elecShare = { subcontractor: '가상 코팅 B사', technique: 'ZINC_FLAKE_COATING', basis: 'RECONSTRUCTED', company_total: 400, note: '설비 정격×가동시간', evidence: '외주처 전력 고지서 2025', total_share: 120, mwh: 120, same_grid: true };
  const withElectric = P.buildMonitoringPlan({ ...input, sourceStreams: [...store.source_streams, row], processes: input.processes.map((item, index) => (index === 0 ? { ...item, electricity_mwh: item.electricity_mwh + 120, outsourced_electricity: [elecShare] } : item)) });
  const electricText = text(withElectric.sections.find((item) => item.no === 9));
  assert.match(electricText, /연료와 전기의 몫을 해당 생산공정의 연료 배출원·전력 사용량으로 넣습니다/);
  assert.match(electricText, /가상 코팅 B사 — 아연 플레이크 코팅\(다크로·지오메트 등, 비전해\) 전기: 우리 몫 120 MWh\(같은 나라 계통 전력, 공정의 전력 배출계수 사용\)/);
  assert.match(electricText, /근거: 설비 정격×가동시간\. 증빙: 외주처 전력 고지서 2025\./);
  assert.ok(!/전기\(간접배출\)는 입력되지 않았습니다/.test(electricText), '전기가 입력된 외주처에는 미입력 안내가 없다');
  const onlyElectric = P.buildMonitoringPlan({ ...input, processes: input.processes.map((item, index) => (index === 0 ? { ...item, electricity_mwh: item.electricity_mwh + 120, outsourced_electricity: [elecShare] } : item)) });
  assert.match(text(onlyElectric.sections.find((item) => item.no === 9)), /외주 공정:/, '전기 몫만 있어도 외주 문단이 나온다');
  const noEvidence = P.buildMonitoringPlan({ ...input, sourceStreams: [...store.source_streams, { ...row, outsourced: { ...row.outsourced, evidence: '' } }] });
  assert.match(text(noEvidence.sections.find((item) => item.no === 9)), /증빙: .*작성 필요/, '비어 있는 증빙은 지어내지 않고 작성 필요');
}

console.log('Monitoring plan verified (22개 항목 · 입력값만 옮김 · 직접 쓰는 항목은 작성 필요+물음 · 초안 문구 · 읽기 전용 · 배선).');
