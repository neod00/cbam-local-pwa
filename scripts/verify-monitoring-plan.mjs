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
  assert.match(outsourcedText, /가상 코팅 B사 — 아연 플레이크 코팅\(다크로·지오메트 등, 비전해\): 우리 몫 36,000 Nm3, 방법 「설비 소비율 × 가동시간으로 재구성 \(고지서 총량에 맞춤\)」/);
  assert.match(outsourcedText, /근거: 사례 A\. 증빙: 외주처 가스 고지서 2025\./);
  assert.match(outsourcedText, /부속서 II A\.5 22\(g\)/, '외주 공정의 통제 문장');
  const noEvidence = P.buildMonitoringPlan({ ...input, sourceStreams: [...store.source_streams, { ...row, outsourced: { ...row.outsourced, evidence: '' } }] });
  assert.match(text(noEvidence.sections.find((item) => item.no === 9)), /증빙: .*작성 필요/, '비어 있는 증빙은 지어내지 않고 작성 필요');
}

console.log('Monitoring plan verified (22개 항목 · 입력값만 옮김 · 직접 쓰는 항목은 작성 필요+물음 · 초안 문구 · 읽기 전용 · 배선).');
