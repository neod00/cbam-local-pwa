// 질문으로 입력(대화형 모드) S7 — 칩으로 생산량·연료·구매 강재 고치기 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md §6-1
//
// 잠그는 것:
//  1) 고치기는 지도 화면 수정 경로와 같은 값을 만든다 — 생산량(지도 3단계: 제품 라인 → 제외 라인 → 공정), 연료(지도 4단계: `{ ...existing, ...buildDraft() }` → 직접배출 합계 다시 맞춤),
//     구매 강재(지도 6단계: buildPrecursorUpdate). 지도 패널의 문장 조각을 읽어 대조한다.
//  2) **수정이 칸 없는 값을 지우지 않는다** — 구매 강재의 전력 분해값·공급사 설비·생산경로·보고기간·제품별 배분, 제외 라인의 이름·비고, 제품 라인의 이름·배분, 공정의 생산 방식·전력·배출.
//  3) 단순한 경우만 고친다 — 제품 라인 여럿·사내 이송·리터 연료·공용 계량기·혼합 자료·배분 여럿은 칩이 지도 화면 링크로 남고 이유를 말한다.
//  4) 저장 코드는 talk-writes.ts 한 곳(S1 게이트가 잠근다). 저장 뒤 입력칸을 비워 다음 제품 질문에 앞 값이 미리 채워지지 않는다(S6에서 넘어온 결함).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const run = (parts, exported, extra = {}) => {
  const source = [...parts, `globalThis.app = { ${exported} };`].join('\n');
  const context = vm.createContext({ Intl, ...extra });
  vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return context.app;
};
const plain = (value) => JSON.parse(JSON.stringify(value));

const common = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
];
// 두 모듈이 같은 이름의 작은 함수(parseAnswerNumber)를 가지고 있어 따로 적재한다.
const proc = run([...common, strip('src/lib/conversation-process.ts')], 'describeOutputEditBlock, buildOutputUpdate, buildProcessCreation, DEFAULT_PROCESS_ROUTE, EXCLUDED_LINE_NAME, EXCLUDED_LINE_NOTE');
const energy = run([
  ...common, strip('src/lib/allocation-rules.ts'), strip('src/lib/measurable-heat.ts'), strip('src/lib/fuel-allocation.ts'), strip('src/lib/source-stream-input.ts'),
  strip('src/lib/conversation-energy.ts'),
], 'describeFuelEditBlock, buildFuelStreamEdit, buildFuelStreamDraft, TALK_FUEL_KINDS, matchGuidedStreamKind');
const prec = run([strip('src/lib/guided-edit.ts'), strip('src/lib/conversation-precursor.ts')],
  'describePrecursorEditBlock, precursorAnswerFromExisting, buildPrecursorEditDraft, buildPrecursorDraft, buildPrecursorUpdate, validatePrecursorDraft');

// ── 1) 생산량 고치기 ────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-02T00:00:00.000Z' };
const product = { id: 'a', name: 'STS 나사', reporting_scope: 'CBAM_GOOD', cn_code: '73181552', hs_code: '7318' };
const process = { id: 'pa', ...stamp, period_id: 'per', product_id: 'a', name: '나사 공정', production_route: '냉간압조·전조', output_mass_t: 3240, internal_consumption_mass_t: 0, market_output_mass_t: 3240,
  direct_attributable_emissions_tco2e: 266.5, direct_emissions_input_mode: 'SOURCE_STREAM_SUM', electricity_mwh: 3500, electricity_ef_tco2e_per_mwh: 0.47, electricity_allocation_note: '계량기 1개', no_purchased_precursors: true };
const line = { id: 'l1', ...stamp, process_id: 'pa', product_id: 'a', name: 'STS 나사 완제품 (전량 판매)', output_mass_t: 3240, allocation_basis: 'MASS', manual_allocation_percent: 100, note: '직접 적은 비고', reporting_scope: 'CBAM_GOOD' };
const excluded = { id: 'l2', ...stamp, process_id: 'pa', name: '활동수준 제외분 (불량·부산물·스크랩)', output_mass_t: 40, allocation_basis: 'MASS', manual_allocation_percent: 0, note: '메모', reporting_scope: 'WASTE_RECYCLE', activity_level_role: 'EXCLUDED' };

assert.equal(proc.describeOutputEditBlock({ process, lines: [line], transfers: [] }), null, '라인 하나');
assert.equal(proc.describeOutputEditBlock({ process, lines: [line, excluded], transfers: [] }), null, '라인 하나 + 제외 라인 하나');
assert.match(proc.describeOutputEditBlock({ process, lines: [line, { ...line, id: 'l3', product_id: 'z' }], transfers: [] }), /제품 라인이 하나가 아니거나/, '제품 라인 둘 → 지도 3단계');
assert.match(proc.describeOutputEditBlock({ process, lines: [], transfers: [] }), /제품 라인이 하나가 아니거나/, '라인이 없으면 고칠 수 없다');
assert.match(proc.describeOutputEditBlock({ process, lines: [{ ...line, product_id: 'other' }], transfers: [] }), /다른 제품이 섞여/);
assert.match(proc.describeOutputEditBlock({ process, lines: [line, excluded, { ...excluded, id: 'l4' }], transfers: [] }), /제외 라인이 여러 개/);
assert.match(proc.describeOutputEditBlock({ process: { ...process, internal_consumption_mass_t: 10 }, lines: [line], transfers: [] }), /사내 이송/);
assert.match(proc.describeOutputEditBlock({ process, lines: [line], transfers: [{ source_process_id: 'pa', target_process_id: 'x' }] }), /사내 이송/, '보내는 쪽');
assert.match(proc.describeOutputEditBlock({ process, lines: [line], transfers: [{ source_process_id: 'x', target_process_id: 'pa' }] }), /사내 이송/, '받는 쪽');
assert.equal(proc.describeOutputEditBlock({ process, lines: [line, { ...excluded, process_id: 'other-process' }], transfers: [{ source_process_id: 'x', target_process_id: 'y' }] }), null, '다른 공정의 라인·이송은 상관없다');

const edit = proc.buildOutputUpdate({ process, productLine: line, excludedLine: excluded, product, name: ' 나사 공정(개명) ', massT: 3000, excludedMassT: 55 });
assert.equal(edit.process.output_mass_t, 3000);
assert.equal(edit.process.market_output_mass_t, 3000, '사내 이송이 없으니 시장 = 총량');
assert.equal(edit.process.internal_consumption_mass_t, 0);
assert.equal(edit.process.name, '나사 공정(개명)');
assert.equal(edit.process.production_route, '냉간압조·전조', '생산 방식은 건드리지 않는다');
for (const key of ['period_id', 'product_id', 'electricity_mwh', 'electricity_ef_tco2e_per_mwh', 'electricity_allocation_note', 'direct_attributable_emissions_tco2e', 'direct_emissions_input_mode', 'no_purchased_precursors', 'created_at', 'id']) {
  assert.deepEqual(plain(edit.process[key]), plain(process[key]), `공정 ${key} 보존`);
}
assert.equal(edit.productLine.output_mass_t, 3000);
assert.equal(edit.productLine.name, line.name, '제품 라인은 자기 이름을 지킨다');
assert.equal(edit.productLine.note, '직접 적은 비고');
assert.equal(edit.productLine.allocation_basis, 'MASS');
assert.equal(edit.productLine.id, 'l1');
assert.equal(edit.excluded.action, 'update');
assert.equal(edit.excluded.line.output_mass_t, 55);
assert.equal(edit.excluded.line.name, excluded.name, '제외 라인은 질량만 고친다(이름·비고 보존)');
assert.equal(edit.excluded.line.note, '메모');
assert.equal(edit.excluded.line.id, 'l2');
// 제외 라인: 없으면 만들고, 0이면 지우고, 둘 다 없으면 아무것도 안 한다.
const created = proc.buildOutputUpdate({ process, productLine: line, product, name: '공정', massT: 3240, excludedMassT: 12 });
assert.equal(created.excluded.action, 'create');
assert.deepEqual(plain(created.excluded.line), plain(proc.buildProcessCreation({ name: '공정', route: '', periodId: 'per', product, massT: 3240, excludedMassT: 12 }).excludedLine), '새 제외 라인은 신규 생산량 답과 같은 값');
assert.deepEqual(plain(proc.buildOutputUpdate({ process, productLine: line, excludedLine: excluded, product, name: '공정', massT: 3240, excludedMassT: 0 }).excluded), { action: 'delete', id: 'l2' });
assert.deepEqual(plain(proc.buildOutputUpdate({ process, productLine: line, product, name: '공정', massT: 3240, excludedMassT: 0 }).excluded), { action: 'none' });
assert.equal(proc.buildOutputUpdate({ process: { ...process, production_route: '' }, productLine: line, product, name: '공정', massT: 1, excludedMassT: 0 }).process.production_route, proc.DEFAULT_PROCESS_ROUTE, '생산 방식이 비어 있으면 기본값(지도 패널과 같다)');

// ── 2) 연료 고치기 ──────────────────────────────────────────────────
const baseStream = { stream_type: 'FUEL', name: '연료 연소 — 도시가스 (Nm³)' };
assert.equal(energy.describeFuelEditBlock(baseStream), null);
assert.match(energy.describeFuelEditBlock({ ...baseStream, stream_type: 'PROCESS' }), /연료 연소가 아닌/);
assert.match(energy.describeFuelEditBlock({ ...baseStream, shared_meter: { group: 'g' } }), /공용 계량기/);
assert.match(energy.describeFuelEditBlock({ ...baseStream, heat_system: { name: '보일러' } }), /열 공급원/);
assert.match(energy.describeFuelEditBlock({ ...baseStream, name: '지게차 경유 · 2,000 L' }), /리터로 입력한 연료/);
assert.equal(energy.describeFuelEditBlock({ ...baseStream, name: '리터 아닌 이름 L 포함' }), null, '이름 끝의 「· 숫자 L」만 리터 입력으로 본다');

const gasKind = energy.TALK_FUEL_KINDS.find((item) => item.key === 'fuel-gas');
const stream = { id: 's1', ...stamp, ...gasKind.defaults, period_id: 'per', process_id: 'pa', name: '연료 연소 — 도시가스 (Nm³)', activity_data: 128400, ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1, source: '고지서 2025', factor_source_type: 'NATIONAL_INVENTORY', note: '메모(칩 칸 없음)' };
assert.equal(energy.matchGuidedStreamKind(stream).key, 'fuel-gas', '저장된 연료에서 유형을 되짚는다(지도 4단계 수정과 같은 함수)');
const fuelEdit = energy.buildFuelStreamEdit(stream, { kind: gasKind, amount: '100,000', name: stream.name, ncv: '0.037', factor: '56.1', factorSource: 'NATIONAL_INVENTORY', source: '고지서 2025' }, { id: 'pa', period_id: 'per' });
assert.equal(fuelEdit.activity_data, 100000);
assert.equal(fuelEdit.id, 's1', '같은 배출원을 고친다');
assert.equal(fuelEdit.created_at, stream.created_at);
assert.equal(fuelEdit.note, '메모(칩 칸 없음)', '이 화면에 칸이 없는 필드는 지킨다');
assert.equal(fuelEdit.process_id, 'pa');

// ── 3) 구매 강재 고치기 ─────────────────────────────────────────────
const alloc = { product_output_line_id: 'l1', allocated_mass_t: 1050, allocation_percent: 100 };
const precursor = { id: 'pr1', ...stamp, period_id: 'per', process_id: 'pa', product_id: 'a', name: '선재', precursor_cn_code: '72131000', production_route: '전기로', supplier_installation: '(주)한국선재 김포', supplier_reporting_period: '2025', supplier_country: 'South Korea',
  data_mode: 'ACTUAL', purchased_mass_t: 1100, consumed_mass_t: 1050, direct_see_tco2e_per_t: 1.86, indirect_see_tco2e_per_t: 0.3, indirect_electricity_mwh_per_t: 0.6, indirect_electricity_factor_tco2e_per_mwh: 0.5,
  source: '공급사 회신', default_value_justification: '', output_allocations: [alloc], aggregated_goods_category: 'Iron or steel products', verification_status: 'VERIFIED', default_value_year: '2026', consumed_for_non_cbam_mass_t: 0 };
assert.equal(prec.describePrecursorEditBlock(precursor), null);
assert.equal(prec.describePrecursorEditBlock({ ...precursor, data_mode: 'DEFAULT' }), null);
assert.match(prec.describePrecursorEditBlock({ ...precursor, data_mode: 'SEMI_ACTUAL' }), /혼합/);
assert.match(prec.describePrecursorEditBlock({ ...precursor, output_allocations: [alloc, { ...alloc, product_output_line_id: 'l9' }] }), /제품별 배분이 둘 이상/);
assert.equal(prec.describePrecursorEditBlock({ ...precursor, output_allocations: undefined }), null);

const answer = prec.precursorAnswerFromExisting(precursor);
assert.deepEqual(plain(answer), { name: '선재', cn: '72131000', consumed: '1050', purchased: '1100', country: 'South Korea', mode: 'ACTUAL', directSee: '1.86', indirectSee: '0.3', source: '공급사 회신', justification: '' });
assert.equal(prec.precursorAnswerFromExisting({ ...precursor, purchased_mass_t: 0 }).purchased, '', '구매량 0은 빈 칸(지도 6단계 수정과 같다)');
// 소비량만 고쳐도 칸 없는 값(전력 분해·공급사 정보·생산경로·배분)이 남는다.
const draft = prec.buildPrecursorEditDraft(precursor, { ...answer, consumed: '1,000' });
assert.equal(draft.consumedMass, 1000);
assert.equal(draft.bridgeUsage, 0.6);
assert.equal(draft.bridgeFactor, 0.5);
assert.equal(draft.supplierInstallation, '(주)한국선재 김포');
assert.equal(draft.supplierRoute, '전기로');
assert.equal(draft.supplierPeriod, '2025');
assert.deepEqual(plain(draft.outputAllocations), [{ product_output_line_id: 'l1', allocated_mass_t: 1000, allocation_percent: 100 }], '제품별 배분이 하나면 소비량에 맞춰 따라간다(지도 패널과 같다)');
// 신규 초안을 그대로 수정에 쓰면 지워지는 값 — 수정용 초안이 막는 것
const naive = prec.buildPrecursorUpdate(precursor, prec.buildPrecursorDraft({ ...answer, consumed: '1000' }));
assert.equal(naive.supplier_installation, '', '(대조) 신규 초안으로 고치면 공급사 설비가 지워진다');
const updated = prec.buildPrecursorUpdate(precursor, draft);
for (const key of ['supplier_installation', 'production_route', 'supplier_reporting_period', 'indirect_electricity_mwh_per_t', 'indirect_electricity_factor_tco2e_per_mwh', 'verification_status', 'aggregated_goods_category', 'default_value_year', 'consumed_for_non_cbam_mass_t', 'process_id', 'product_id', 'period_id', 'id', 'created_at']) {
  assert.deepEqual(plain(updated[key]), plain(precursor[key]), `구매 강재 ${key} 보존`);
}
assert.equal(updated.consumed_mass_t, 1000);
assert.equal(prec.validatePrecursorDraft(draft), null);
assert.match(prec.validatePrecursorDraft(prec.buildPrecursorEditDraft(precursor, { ...answer, consumed: '0' })), /소비량/, '검증은 지도 6단계와 같은 함수');
const noAlloc = prec.buildPrecursorEditDraft({ ...precursor, output_allocations: undefined }, answer);
assert.equal(noAlloc.outputAllocations, undefined, '배분이 없던(자동) 구매 강재는 그대로 자동');
const defaultMode = prec.buildPrecursorEditDraft({ ...precursor, data_mode: 'DEFAULT', default_value_justification: 'EU 기본값 사용(공급사 실측 없음)' }, { ...prec.precursorAnswerFromExisting({ ...precursor, data_mode: 'DEFAULT', default_value_justification: 'EU 기본값 사용(공급사 실측 없음)' }) });
assert.equal(defaultMode.justification, 'EU 기본값 사용(공급사 실측 없음)', '기본값 사유도 보존');

// ── 4) 지도 패널·저장 순서와 대조 ───────────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8');
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
// 생산량: 지도 3단계 수정 경로의 값들
assert.ok(panels.includes("{ ...existing, output_mass_t: mass, reporting_scope: getProductReportingScope(product) }") || /\.\.\.existing,\s*output_mass_t: mass,\s*reporting_scope: getProductReportingScope\(product\)/.test(panels), '지도 3단계: 제품 라인은 기존을 펼쳐 질량·보고범위만');
assert.ok(readFileSync('src/lib/conversation-process.ts', 'utf8').includes('productLine: { ...input.productLine, output_mass_t: mass, reporting_scope: creation.productLine.reporting_scope }'));
assert.ok(panels.includes("{ ...existing, output_mass_t: mass }"), '지도 3단계: 제외 라인은 질량만');
assert.ok(readFileSync('src/lib/conversation-process.ts', 'utf8').includes('{ ...input.excludedLine, output_mass_t: excludedMass }'));
assert.ok(panels.includes('output_mass_t: editedTotal,') && panels.includes('market_output_mass_t: editedTotal - internalTotal,'), '지도 3단계: 공정 총량·시장 출하량');
assert.ok(panels.includes("'활동수준 제외 라인을 비우면 지워지는데, ' + excludedBlockers.reasons.join(' · ') + '이 이 라인을 가리키고 있습니다. 먼저 6단계에서 전구물질 배분을 고치세요.'"));
assert.ok(writes.includes("'활동수준 제외 라인을 비우면 지워지는데, ' + blockers.reasons.join(' · ') + '이 이 라인을 가리키고 있습니다. 먼저 6단계에서 전구물질 배분을 고치세요.'"), '같은 문장');
assert.ok(writes.includes('getOutputLineDeleteBlockers(edit.excluded.id, { precursors: args.precursors })'), '지도와 같은 삭제 참조 확인');
const order = ["updateLocalItem('product_output_lines', edit.productLine)", "updateLocalItem('product_output_lines', edit.excluded.line)", "deleteLocalItem('product_output_lines', edit.excluded.id)", "updateLocalItem('processes', edit.process)"].map((fragment) => writes.indexOf(fragment));
assert.ok(order.every((index) => index > 0) && order[0] < order[1] && order[2] < order[3], '제품 라인 → 제외 라인 → 공정 순서(지도와 같다)');
// 연료: 지도 4단계 수정 경로
assert.ok(panels.includes('const draft = { ...existing, ...buildDraft() };'));
assert.ok(readFileSync('src/lib/conversation-energy.ts', 'utf8').includes('return { ...existing, ...buildFuelStreamDraft(answer, process) } as SourceStreamDraft;'));
assert.ok(panels.includes("const updated = await updateLocalItem('source_streams', draft);") && writes.includes("const updated = await updateLocalItem('source_streams', draft as SourceStream);"));
assert.ok(panels.includes("data.sourceStreams.map((stream) => (stream.id === updated.id ? updated : stream))") && writes.includes('allStreams.map((stream) => (stream.id === updated.id ? updated : stream))'), '수정한 배출원으로 합계를 다시 맞춘다');
assert.ok(writes.includes("direct_emissions_input_mode: 'SOURCE_STREAM_SUM'"));
// 구매 강재: 지도 6단계
assert.ok(panels.includes('buildPrecursorUpdate(existing, draft)') && writes.includes('buildPrecursorUpdate(existing, draft)'));
assert.ok(/validatePrecursorDraft\(draft\)/.test(writes));

// ── 5) 화면 배선 ────────────────────────────────────────────────────
assert.match(ui, /\(chip\.id === 'output' && Boolean\(outputBlock\)\) \|\| \(chip\.id === 'precursor' && precursorEditables\.length === 0\) \|\| \(chip\.id === 'fuel' && fuelEditables\.length === 0\)/, '고칠 수 없는 칩만 지도 링크로 남는다');
assert.match(ui, /describeOutputEditBlock\(\{ process: focusProcess, lines: data\.productOutputLines, transfers: data\.internalTransfers \}\)/);
assert.match(ui, /saveOutputEdit\(\{ process: focusProcess, productLine, excludedLine,/);
assert.match(ui, /saveFuelEdit\(focusProcess, editingStream, data\.sourceStreams, fuelAnswer\)/);
assert.match(ui, /savePrecursorEdit\(editingPrecursor, answer\)/);
assert.match(ui, /aria-label="질문 연료 고르기"/, '연료가 여럿이면 고를 것을 먼저 묻는다');
assert.match(ui, /!\(editing === 'fuel' && !editingStream\)/, '고르기 전에는 입력 폼을 보이지 않는다(새 항목이 만들어지지 않게)');
assert.match(ui, /aria-label="고칠 구매 강재 고르기"/);
assert.match(ui, /\(editing !== 'precursor' \|\| Boolean\(editingPrecursor\)\)/);
assert.match(ui, /defaultKeyChanged/, '기본값 그대로면 저장된 SEE를 쓰고 CN·국가를 바꾸면 다시 채우게 한다');
// 저장 뒤 입력칸 비우기(S6에서 넘어온 결함)
assert.match(ui, /function resetOutputForm\(\) \{\s*setMass\(''\);\s*setScrap\(''\);\s*setProcessName\(''\);/);
assert.match(ui, /function resetElectricityForm\(\) \{\s*setElecMwh\(''\);/);
assert.match(ui, /resetOutputForm\(\)/);
// 고친 뒤·취소한 뒤에도 비운다 — 브라우저에서 「생산량을 고친 다음 둘째 제품 질문에 3000이 미리 채워져 보이는」 결함이 나왔다.
assert.match(ui, /saveOutputEdit\([^]*?\)\.then\(\(error\) => \{\s*if \(!error\) resetOutputForm\(\);/, '생산량 고치기 저장 뒤 입력칸을 비운다');
assert.match(ui, /onCancel=\{editing === 'output' \? \(\) => \{ resetOutputForm\(\); setEditing\(null\); \} : undefined\}/, '생산량 고치기 취소 뒤에도');
assert.match(ui, /onClick=\{\(\) => \{ resetElectricityForm\(\); setEditing\(null\); \}\}/, '전력 고치기 취소 뒤에도');
assert.match(ui, /resetElectricityForm\(\)/);
assert.ok(!/\bAI\b|챗봇/.test(ui));

console.log('Talk S7 verified (고치기 = 지도 수정 경로와 같은 값·순서 · 칸 없는 값 보존 · 단순한 경우만 · 고르기 전에 폼 숨김 · 저장 뒤 입력칸 비움).');
