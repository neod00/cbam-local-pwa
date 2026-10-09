// 질문으로 입력(대화형 모드) S4 — 연료·전력·밖에서 산 열 질문 (2026-10-05).
// 설계: docs/harness/conversation-mode-design.md
//
// 잠그는 것:
//  1) 새 순수 빌더(conversation-energy.ts)가 만드는 배출원 초안: 값(골든)과, 지도 4단계 패널의 `buildDraft`와 어긋나지 않음(필드 이름·표현식 조각을 패널에서 읽어 대조).
//  2) 저장: 검증 → 배출원 생성 → 공정 직접배출을 「배출원 합계」로 맞춤 — 지도 4단계와 같은 호출. 전력·열은 새 빌더 없이 지도 패널과 같은 함수를 쓴다.
//  3) 차례: 공정 뒤 구매 강재·연료·전력·열이 남은 것 전부 pending에 있고(건너뛴 것을 빼고 다음을 고를 수 있다), 각 답의 판정은 첫 공정의 저장값에서만 도출한다.
//  4) 끝에서 끝까지: 답 → 초안 → 레코드 → 엔진이 손계산과 같다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const strip = (path, all = true) => readFileSync(path, 'utf8')
  .replace(all ? /^import [\s\S]*?;\r?\n/gm : /^import type [\s\S]*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const source = [
  strip('src/lib/source-stream-calculation.ts', false),
  readFileSync('src/lib/cn-master.generated.ts', 'utf8').replace(/^export /gm, ''),
  strip('src/lib/cbam-product-rules.ts'),
  strip('src/lib/reporting-scope.ts', false),
  strip('src/lib/allocation-rules.ts'),
  strip('src/lib/measurable-heat.ts'),
  strip('src/lib/precursor-verification.ts'),
  strip('src/lib/calculation-engine.ts'),
  strip('src/lib/fuel-allocation.ts'),
  strip('src/lib/source-stream-input.ts'),
  strip('src/lib/guided-edit.ts'),
  strip('src/lib/conversation-energy.ts'),
  strip('src/lib/talk-flow.ts'),
  'globalThis.app = { calculateLocalResults, sumReconciledSourceStreamEmissions, GUIDED_STREAM_KINDS, TALK_FUEL_KINDS, TALK_FUEL_KIND_KEYS, buildFuelStreamDraft, noImportedHeatDraft, ELECTRICITY_PLACEHOLDER_EF, ELECTRICITY_DEFAULT_EF_SOURCE, ELECTRICITY_EF_SOURCE_OPTIONS, validateImportedHeatDraft, buildImportedHeatUpdate, validateElectricityDraft, buildElectricityUpdate, createSourceStreamValidationErrors, firstSourceStreamError, deriveTalkState };',
].join('\n');
const context = vm.createContext({ Intl });
vm.runInContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }).outputText, context);
const app = context.app;
const plain = (value) => JSON.parse(JSON.stringify(value));
const close = (a, b, message) => assert.ok(Math.abs(a - b) < 1e-6, `${message}: ${a} vs ${b}`);

const kind = (key) => app.TALK_FUEL_KINDS.find((item) => item.key === key);
assert.deepEqual(plain(app.TALK_FUEL_KINDS.map((item) => item.key)), ['fuel-gas', 'fuel-mass', 'fuel-natural-gas-t', 'fuel-diesel-l', 'fuel-kerosene-l'], '연료 연소 다섯 유형(공정배출·물질수지는 지도 4단계)');
const process = { id: 'pr', period_id: 'per' };

// ── 1) 배출원 초안 ───────────────────────────────────────────────────
const gas = app.buildFuelStreamDraft({ kind: kind('fuel-gas'), amount: '128,400', name: '', ncv: '0.037', factor: '56.1', factorSource: 'NATIONAL_INVENTORY', source: ' 도시가스 고지서 2025 ' }, process);
assert.deepEqual(plain(gas), {
  stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3', ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1, emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1, conversion_factor: 1, fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY',
  period_id: 'per', process_id: 'pr', name: '연료 연소 — 도시가스 (Nm³)', activity_data: 128400, source: '도시가스 고지서 2025',
});
const diesel = app.buildFuelStreamDraft({ kind: kind('fuel-diesel-l'), amount: '2000', name: '지게차 경유', ncv: '43', factor: '74.1', factorSource: 'EU_OR_IPCC_DEFAULT', source: '주유 전표' }, process);
assert.equal(diesel.name, '지게차 경유 · 2,000 L', '리터 유형은 이름에 원자료 리터를 남긴다');
close(diesel.activity_data, 1.67, '경유 2,000 L × 0.835 kg/L = 1.67 t로 환산해 저장');
assert.equal(diesel.activity_unit, 't');
assert.equal(diesel.source, '주유 전표 · 원자료 2,000 L × 0.835 kg/L', '원자료 리터와 밀도를 출처에 남긴다');
assert.equal(app.buildFuelStreamDraft({ kind: kind('fuel-diesel-l'), amount: '2000', name: '', ncv: '43', factor: '74.1', factorSource: 'UNCLASSIFIED', source: '' }, process).source, '', '출처가 비면 환산 문구도 붙이지 않는다(검증이 출처를 요구한다)');
assert.equal(app.buildFuelStreamDraft({ kind: kind('fuel-mass'), amount: 'abc', name: '', ncv: '48', factor: '73', factorSource: 'UNCLASSIFIED', source: 'x' }, process).activity_data, 0, '숫자가 아니면 0 — 검증이 막는다');
// 검증은 지도 패널과 같은 함수
assert.equal(app.firstSourceStreamError(app.createSourceStreamValidationErrors(app.buildFuelStreamDraft({ kind: kind('fuel-gas'), amount: '', name: '', ncv: '0.037', factor: '56.1', factorSource: 'UNCLASSIFIED', source: 'x' }, process))), null, '상세 화면의 검증은 사용량 0을 통과시킨다(음수만 막는다)');
assert.ok(app.firstSourceStreamError(app.createSourceStreamValidationErrors(app.buildFuelStreamDraft({ kind: kind('fuel-gas'), amount: '-5', name: '', ncv: '0.037', factor: '56.1', factorSource: 'UNCLASSIFIED', source: 'x' }, process))), '음수는 막는다');
assert.ok(app.firstSourceStreamError(app.createSourceStreamValidationErrors(app.buildFuelStreamDraft({ kind: kind('fuel-gas'), amount: '10', name: '', ncv: '0.037', factor: '56.1', factorSource: 'UNCLASSIFIED', source: '' }, process))), '출처가 비면 막는다');
assert.match(readFileSync('src/components/talk/talk-writes.ts', 'utf8'), /if \(!\(draft\.activity_data > 0\)\)[\s\S]*연간 사용량을 입력하세요/, '이 화면은 사용량 0을 추가로 막는다(저장 레코드의 모양은 같고 더 엄격할 뿐)');
assert.equal(app.firstSourceStreamError(app.createSourceStreamValidationErrors(gas)), null, '채운 초안은 통과');

// ── 2) 지도 4단계 패널과의 대조 ─────────────────────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
const start = panels.indexOf('const buildDraft = () => ({');
assert.ok(start > 0, '패널의 buildDraft');
let depth = 0; let i = panels.indexOf('{', start + 'const buildDraft = () => ('.length - 1); const from = i;
for (; i < panels.length; i++) { if (panels[i] === '{') depth++; if (panels[i] === '}') { depth--; if (depth === 0) break; } }
const literal = panels.slice(from + 1, i);
const panelKeys = []; let d2 = 0;
for (const line of literal.split('\n')) {
  const code = line.replace(/\/\/.*$/, '');
  if (d2 === 0) { const m = code.match(/^\s*([a-z0-9_]+)\s*:/); if (m) panelKeys.push(m[1]); }
  for (const ch of code) { if (ch === '{' || ch === '(' || ch === '[') d2++; if (ch === '}' || ch === ')' || ch === ']') d2--; }
}
assert.ok(literal.includes('...kind.defaults'), '패널은 유형 기본값을 펼친다');
assert.deepEqual(Object.keys(gas).sort(), [...new Set([...Object.keys(kind('fuel-gas').defaults), ...panelKeys])].sort(), '초안의 필드 = 유형 기본값 + 패널이 덮는 필드');
for (const fragment of [
  '`${streamName.trim() || kind.label} · ${fmt(num(amount), 1)} L`',
  'streamName.trim() || kind.label',
  'litresToTonnes(num(amount), kind.litres.densityKgPerL)',
  'ncv_gj_per_unit: kind.needsNcv ? num(ncv) : kind.defaults.ncv_gj_per_unit',
  'emission_factor_tco2e_per_unit: num(factor)',
  'factor_source_type: factorSource',
  '`${streamSource.trim()} · 원자료 ${fmt(num(amount), 1)} L × ${kind.litres.densityKgPerL} kg/L`',
]) assert.ok(literal.includes(fragment), `패널 buildDraft에 「${fragment}」 — 바뀌면 conversation-energy.ts도 같이 고친다`);
const energy = readFileSync('src/lib/conversation-energy.ts', 'utf8');
for (const fragment of ['litresToTonnes(amount, kind.litres.densityKgPerL)', 'kind.needsNcv ? parseAnswerNumber(answer.ncv) : kind.defaults.ncv_gj_per_unit', '원자료 ${fmtOne(amount)} L × ${kind.litres.densityKgPerL} kg/L', 'answer.name.trim() || kind.label']) assert.ok(energy.includes(fragment), `빌더에 「${fragment}」`);
assert.ok(panels.includes("useState<SourceStream['factor_source_type']>('UNCLASSIFIED')"), '지도 4단계는 계수 출처 유형을 「분류 전」으로 시작한다 — 이 화면도 같다');

// 저장 호출
const writes = readFileSync('src/components/talk/talk-writes.ts', 'utf8').replace(/\s+/g, ' ');
const panelFlat = panels.replace(/\s+/g, ' ');
assert.ok(writes.includes("createLocalItem('source_streams', draft)") && panelFlat.includes("createLocalItem('source_streams', draft)"), '배출원 생성 호출이 패널과 같다');
assert.ok(writes.includes("updateLocalItem('processes', { ...process, direct_attributable_emissions_tco2e: total, direct_emissions_input_mode: 'SOURCE_STREAM_SUM' })") && panelFlat.includes("updateLocalItem('processes', { ...process, direct_attributable_emissions_tco2e: total, direct_emissions_input_mode: 'SOURCE_STREAM_SUM' })"), '공정 직접배출을 「배출원 합계」로 맞추는 갱신이 패널과 글자 그대로 같다');
assert.ok(writes.includes('sumReconciledSourceStreamEmissions(process.id, [...existingStreams, created])') && panelFlat.includes('sumReconciledSourceStreamEmissions(process.id, streams)'), '합계는 같은 헬퍼(공용 계량기 정합계수 보정 후)');
assert.ok(writes.includes('firstSourceStreamError(createSourceStreamValidationErrors(draft))') && panelFlat.includes('firstSourceStreamError(createSourceStreamValidationErrors(draft))'), '검증은 상세 화면과 같은 함수');
// 전력: 새 빌더 없이 같은 함수
assert.ok(writes.includes('validateElectricityDraft(full)') && writes.includes('buildElectricityUpdate(process, full)') && panelFlat.includes('validateElectricityDraft(draft)') && panelFlat.includes('buildElectricityUpdate(process, draft)'), '전력은 지도 5단계와 같은 검증·갱신 빌더');
assert.ok(panelFlat.includes('String(process.electricity_ef_tco2e_per_mwh || 0.47)') && app.ELECTRICITY_PLACEHOLDER_EF === 0.47, '임시 자리값 0.47이 패널과 같다');
const panelSources = [...panels.slice(panels.indexOf('const ELECTRICITY_EF_SOURCES = [')).matchAll(/\{ value: '([A-Z_]+)', label: '([^']+)' \}/g)].slice(0, 5).map((m) => ({ value: m[1], label: m[2] }));
assert.deepEqual(plain(app.ELECTRICITY_EF_SOURCE_OPTIONS), panelSources, '계수 출처 선택지가 패널과 같다');
assert.equal(app.ELECTRICITY_DEFAULT_EF_SOURCE, 'COUNTRY_GRID_DEFAULT');
assert.ok(panelFlat.includes("useState(process.electricity_ef_source ?? 'COUNTRY_GRID_DEFAULT')"));
// 열 「아니요」
const noHeat = app.noImportedHeatDraft({});
assert.deepEqual(plain(noHeat), { answer: 'NO', amount: 0, unit: 'Gcal', basis: '', supplierEf: 0, fuel: '', source: '' });
assert.equal(app.validateImportedHeatDraft(noHeat), undefined);
const heated = app.buildImportedHeatUpdate({ id: 'pr', imported_heat_amount: 5, imported_heat_source: '옛 값' }, noHeat);
assert.equal(heated.measurable_heat_import, 'NO');
assert.equal(heated.imported_heat_amount, undefined, '「아니요」는 옛 값을 지운다');
assert.ok(writes.includes('buildImportedHeatUpdate(process, draft)') && panelFlat.includes('buildImportedHeatUpdate(process, draft)') && panelFlat.includes("process.imported_heat_unit ?? 'Gcal'"), '열 「아니요」 저장이 패널과 같은 빌더');

// ── 3) 차례 ──────────────────────────────────────────────────────────
const inst = { id: 'i', name: 'Daeil', local_name: '대일기업', country: 'KR' };
const period = { id: 'per', name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
const product = { id: 'g', name: 'STS 와이어', cn_code: '72230019' };
const proc = (extra = {}) => ({ id: 'pr', name: '공정', period_id: 'per', output_mass_t: 3240, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47, ...extra });
const base = { installations: [inst], periods: [period], products: [product] };
const none = app.deriveTalkState({ ...base, processes: [proc()], precursors: [], sourceStreams: [] });
assert.deepEqual(plain(none.pending), ['precursor', 'fuel', 'electricity', 'heat'], '공정 뒤에는 남은 질문이 차례로 전부 pending');
assert.equal(none.current, 'precursor');
assert.deepEqual(plain(app.deriveTalkState({ installations: [], periods: [], products: [] }).pending), ['company'], '앞 질문이 비면 그것 하나뿐(제품을 저장할 곳이 없다)');
assert.deepEqual(plain(app.deriveTalkState({ ...base, processes: [] }).pending), ['output']);
const streams = [{ id: 's1', name: '도시가스', process_id: 'pr' }, { id: 's2', name: '다른 공정 연료', process_id: 'other' }];
const answered = app.deriveTalkState({ ...base, processes: [proc({ no_purchased_precursors: true, electricity_mwh: 5412, measurable_heat_import: 'NO' })], precursors: [], sourceStreams: streams });
assert.deepEqual(plain(answered.pending), [], '모두 답했으면 pending이 비어 있다');
assert.equal(answered.current, undefined);
assert.deepEqual(plain(answered.chips.slice(-4).map((chip) => chip.id)), ['precursor', 'fuel', 'electricity', 'heat']);
assert.equal(answered.chips.find((chip) => chip.id === 'fuel').answer, '1건 · 도시가스', '다른 공정의 배출원은 세지 않는다');
assert.equal(answered.chips.find((chip) => chip.id === 'electricity').answer, '5,412 MWh × 0.47');
assert.equal(answered.chips.find((chip) => chip.id === 'heat').answer, '없음');
assert.equal(app.deriveTalkState({ ...base, processes: [proc({ measurable_heat_import: 'YES' })] }).chips.find((chip) => chip.id === 'heat').answer, '있음 (지도 4단계에서 입력)');
assert.deepEqual(plain(app.deriveTalkState({ ...base, processes: [proc({ electricity_mwh: 10 })], precursors: [], sourceStreams: [] }).pending), ['precursor', 'fuel', 'heat'], '전력 사용량이 있으면 전력은 답한 것');

// ── 4) 끝에서 끝까지 ─────────────────────────────────────────────────
const stamp = { created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' };
const eperiod = { id: 'per', name: '2025', start_date: '2025-01-01', end_date: '2025-12-31', status: 'DRAFT', ...stamp };
const eproduct = { id: 'g', name: '나사', cn_code: '73181552', hs_code: '7318', hs_group: '73', product_type_enum: 'HS73_FASTENER', unit: 'tonne', reporting_scope: 'CBAM_GOOD', ...stamp };
const eprocess = { id: 'pr', product_id: 'g', period_id: 'per', name: '가공', production_route: '가공', output_mass_t: 3240, market_output_mass_t: 3240, internal_consumption_mass_t: 0, direct_attributable_emissions_tco2e: 0, electricity_mwh: 0, electricity_ef_tco2e_per_mwh: 0.47, ...stamp };
const stream = { id: 's1', ...stamp, ...gas };
const total = app.sumReconciledSourceStreamEmissions('pr', [stream]);
close(total, (128400 * 0.037 * 56.1) / 1000, '공정 직접배출 = 도시가스 128,400 Nm³ × 0.037 GJ × 56.1 tCO₂e/TJ ÷ 1,000');
const withFuel = { ...eprocess, direct_attributable_emissions_tco2e: total, direct_emissions_input_mode: 'SOURCE_STREAM_SUM' };
const elecDraft = { mwh: 5412, ef: 0.47, efSource: 'COUNTRY_GRID_DEFAULT', allocationNote: '' };
assert.equal(app.validateElectricityDraft(elecDraft), null);
const withElec = app.buildElectricityUpdate(withFuel, elecDraft);
const results = app.calculateLocalResults({ products: [eproduct], periods: [eperiod], processes: [withElec], precursors: [], productOutputLines: [], sourceStreams: [stream] });
close(results[0].direct_emissions_tco2e, total, '엔진의 직접배출이 배출원 합계와 같다');
close(results[0].see_cbam_basis, total / 3240, '기준 SEE = 직접배출 ÷ 3,240 t(전구물질 없음)');
close(results[0].indirect_emissions_gross_tco2e, 5412 * 0.47, '전력은 보고용 간접배출 5,412 × 0.47');

// ── 5) 화면 ──────────────────────────────────────────────────────────
const ui = readFileSync('src/components/talk/TalkWorkspace.tsx', 'utf8');
assert.match(ui, /임시 자리값/, '자리값은 임시값이라고 말한다');
assert.match(ui, /앱은 한국 계통 평균값을 갖고 있지 않습니다/);
assert.match(ui, /state\.pending\.find\(\(id\) => !skipped\.includes\(talkSkipKey\(focusProductId, id\)\)\)/, '건너뛴 질문을 (제품별로) 빼고 다음을 고른다');
assert.match(ui, /지금은 모릅니다 — 나중에 입력/);
assert.match(ui, /예 — 지도 화면 4단계에서 입력하기/, '산 열 「예」는 이 화면이 받지 않는다');
assert.ok(!/\bAI\b|챗봇/.test(ui));
assert.ok(!/createLocalItem|updateLocalItem|deleteLocalItem|setLocalSetting|indexedDB|localStorage/.test(ui), 'UI에는 저장소 쓰기가 없다');

console.log('Talk S4 verified (연료 초안 = 지도 4단계 buildDraft · 저장 호출 일치 · 전력·열은 같은 함수 · 차례 pending · 엔진 손계산 일치).');
