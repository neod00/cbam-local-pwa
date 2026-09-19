// 씨밤이 run13 회귀 게이트 — 「지웠다 다시 넣기」「추가했다 지우기」 경로.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const read = (path) => readFileSync(path, 'utf8');

// ── P1: 지워진 기간을 가리키는 선택은 선택이 아니다 ─────────────────────
const exportSource = read('src/lib/eu-template-export.ts');
const start = exportSource.indexOf('export function resolveExportPeriod');
assert.ok(start >= 0, 'resolveExportPeriod가 없다');
const fnSource = exportSource.slice(start, exportSource.indexOf('\n}\n', start) + 3).replace(/^export /, '');
const context = vm.createContext({});
vm.runInContext(
  ts.transpileModule(`${fnSource}\nglobalThis.resolve = resolveExportPeriod;`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText,
  context
);
const p2025 = { id: 'p2025', name: '2025' };
const p2026 = { id: 'p2026', name: '2026' };
assert.equal(context.resolve([p2025], 'deleted-id')?.id, 'p2025', '기간이 하나 남았는데 옛 선택 때문에 기간을 못 찾는다 (8단계 잠김)');
assert.equal(context.resolve([p2025, p2026], 'deleted-id'), undefined, '기간이 둘인데 옛 선택을 아무 기간으로 대신하면 안 된다');
assert.equal(context.resolve([p2025, p2026], 'p2026')?.id, 'p2026');
assert.equal(context.resolve([p2025, p2026])?.id, 'p2025');

assert.match(exportSource, /periodChoiceValid/, '없는 기간을 가리키는 선택을 「고름」으로 친다');
assert.match(exportSource, /에 속한 생산공정이 없습니다/, '자료 0건인 기간을 골라도 문서가 열린다');
assert.match(exportSource, /제품별 배분이 지워진 생산라인을 가리킵니다/, '끊어진 전구물질 배분이 내보내기 오류로 오르지 않는다 (P0)');

// ── P0: 배분이 가리키는 라인은 상세 화면에서도 지울 수 없다 ─────────────
const processesPage = read('src/app/processes/page.tsx');
assert.match(processesPage, /getOutputLineDeleteBlockers\(line\.id, \{ precursors \}\)\.total > 0/, '/processes가 배분이 걸린 라인 삭제를 막지 않는다 (P0)');
assert.match(read('src/lib/calculation-engine.ts'), /지워진 생산라인을 가리켜 배출에서 빠졌습니다/, '엔진이 끊어진 배분을 조용히 건너뛴다 (P0)');

// ── P1·P2: 지도 패널의 무변경 저장 ───────────────────────────────────
const panels = read('src/components/guided/panels.tsx');
assert.match(panels, /!hasMultipleProducts && editingPrecursorId/, '제품 라인이 1개일 때 6단계 저장이 배분을 지운다 (P1)');
assert.match(panels, /updateLocalItem\('product_output_lines', \{ \.\.\.existing, output_mass_t: mass \}\)/, '3단계 저장이 제외 라인의 이름·범위·비고를 덮어쓴다 (P2)');
assert.doesNotMatch(panels, /\.\.\.existing,\s*\n\s*name: product\.name,/, '3단계 저장이 기존 라인 이름을 제품명으로 덮어쓴다 (P2)');
assert.match(panels, /keepsOutsideLines/, '비CBAM 제품만 만드는 공정을 3단계에서 저장할 수 없다 (P1)');
assert.match(panels, /setLocalSetting\(EXPORT_PERIOD_SETTING_KEY, undefined\)/, '기간을 지워도 EU 문서 기간 선택이 남는다 (P1)');

// ── P1: /export가 고른 기간을 읽는다 ────────────────────────────────
const exportPage = read('src/app/export/page.tsx');
assert.match(exportPage, /getLocalSetting<string>\(EXPORT_PERIOD_SETTING_KEY\)/, '/export가 1단계에서 고른 기간을 읽지 않는다 (P1)');
assert.match(exportPage, /\{ installations, periods, reportingPeriodId, processes,/, '/export 준비도 검사에 고른 기간이 안 들어간다 (P1)');

// ── P2 ──────────────────────────────────────────────────────────────
assert.match(read('src/lib/local-db.ts'), /"reference:default-values",\s*\n[^\n]*\n\s*"reference:benchmarks",/, '새 프로젝트가 벤치마크 파일을 말없이 지운다 (P2)');
assert.match(read('src/components/guided/GuidedWorkspace.tsx'), /산정보고서 입력값\(문서번호 등\)과 EU 문서 기간 선택은 함께 지워집니다/, '새 프로젝트 확인창이 지워지는 것을 다 말하지 않는다 (P2)');
assert.match(read('src/lib/allocation-rules.ts'), /Math\.round\(total \* 1e9\) \/ 1e9/, '배출원 합계에 부동소수 꼬리가 남는다 (P2)');

console.log('run13 verification passed (라인 삭제 차단 · 기간 선택 · 무변경 저장 · 문안).');

// ── 공급사 검증 SEFA 입력칸 (2025/2620 부속서 3.3(1)) ─────────────────────
const precursorsPage = read('src/app/precursors/page.tsx');
assert.match(precursorsPage, /id="precursor-supplier-sefa"/, '공급사 SEFA 입력칸이 없다');
assert.equal((precursorsPage.match(/supplier_sefa_tco2e_per_t: (editPrecursor|precursor)\.supplier_sefa_tco2e_per_t/g) ?? []).length, 2, '수정 폼이 공급사 SEFA를 다시 읽지 않으면 저장할 때 지워진다');
assert.equal((read('src/lib/calculation-engine.ts').match(/supplier_sefa_tco2e_per_t: precursor\.supplier_sefa_tco2e_per_t/g) ?? []).length, 2, '엔진의 전구물질 투입 내역 2곳이 모두 공급사 SEFA를 실어야 한다');
console.log('supplier SEFA gate passed.');

// ── CBAM factor 연도 안내 ────────────────────────────────────────────
const scenariosPage = read('src/app/scenarios/page.tsx');
assert.match(scenariosPage, /updateAssumptions\(withAssumptionYear\(assumptions,/, '연도 선택이 factor를 함께 옮기지 않는다');
assert.match(scenariosPage, /공식값 적용/, '공식값과 다른 factor를 되돌릴 방법이 없다');
console.log('CBAM factor gate passed.');

// ── 지도는 고른 기간의 자료만 본다 (run15 두 번째 원장) ─────────────────────
const workspace = read('src/components/guided/GuidedWorkspace.tsx');
assert.match(workspace, /const viewData = useMemo<GuidedData>/, '지도가 두 기간의 자료를 합산한다');
assert.match(workspace, /data=\{viewData\}/, '패널이 다른 기간의 공정까지 받는다');
assert.match(workspace, /aria-label="보고기간 선택"/, '지도에서 기간을 바꿀 수 없다');
assert.doesNotMatch(workspace.slice(workspace.indexOf('const scopedResults')), /[^w]data\.(results|processes|sourceStreams|precursors)\b/, '지도 합계 일부가 아직 전체 기간 자료를 읽는다');
assert.equal((panels.match(/\{ \.\.\.data, \.\.\.\(data\.allRecords \?\? \{\}\) \}/g) ?? []).length, 2, '제품·기간 삭제 차단은 전체 기간 자료로 검사해야 한다');
assert.match(exportSource, /periodSettled/, '기간을 고르기 전에 「기간 밖 자료 제외」 경고가 뜬다');
console.log('map period scope gate passed.');
