// 활동자료 서식 v2 (컨설턴트가 채워 오는 엑셀, 2026-10-10).
//
// 잠그는 것:
//  1) 서식의 모양: 시트 7장 · 머리글(필수 표시) · 설명 줄 · 예시 줄 · 선택 목록이 실제 범위를 가리킨다 · 수식으로 비추는 공정·제품 이름.
//  2) 읽기: 빈 서식은 자료 0건(설명·예시 줄을 자료로 읽지 않는다) · 작성 예시는 적은 대로 읽힌다 · 엑셀이 다시 저장한 모양(공유 문자열·날짜 일련번호)도 읽는다.
//  3) 넣기: 작성 예시를 올리면 손으로 지도에서 넣은 기준선(대일기업)과 같은 SEE가 나온다 — 연료가 계산에 들어가고(배출원 합계),
//     공용 가스·경유·전력이 화면의 「나누기」와 같은 기록으로 들어오고, 불량·스크랩이 활동수준 제외 라인이 된다.
//  4) 「확인할 것」: 빠지거나 틀린 칸을 시트·줄 번호와 함께 말하고, 조용히 0으로 넣지 않는다.
//  5) 새 매핑을 두지 않는다(화면과 같은 빌더) · 종전 서식도 계속 읽힌다 · 배선.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const nodeRequire = createRequire(import.meta.url);
const fflate = nodeRequire('fflate');

// 작은 모듈 로더 — src/lib의 TS를 그대로 불러 쓴다(이어 붙이면 모듈마다 있는 fmt·key 같은 이름이 부딪힌다).
const cache = new Map();
function load(file) {
  const full = path.resolve(file);
  if (cache.has(full)) return cache.get(full).exports;
  const loaded = { exports: {} };
  cache.set(full, loaded);
  const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const requireFrom = (request) => {
    if (request === 'fflate') return fflate;
    const base = request.startsWith('@/') ? path.resolve('src', request.slice(2)) : path.resolve(path.dirname(full), request);
    return load(`${base}.ts`);
  };
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Blob, Intl, Uint8Array, console, Date, navigator: undefined, DOMParser: undefined, fetch: undefined })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const plain = (value) => JSON.parse(JSON.stringify(value));

const W = load('src/lib/activity-workbook.ts');
const I = load('src/lib/activity-import.ts');
const engine = load('src/lib/calculation-engine.ts');
const split = load('src/lib/energy-split-summary.ts');
const bundled = load('src/lib/bundled-references.ts');
const legacy = load('src/lib/activity-data-template.ts');

const defaultValues = bundled.expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-10T00:00:00.000Z');
const countries = [...new Set(defaultValues.rows.map((row) => row.country))];
const bytesOf = async (blob) => new Uint8Array(await blob.arrayBuffer());

// ── 1) 서식의 모양 ───────────────────────────────────────────────────
const blankBytes = await bytesOf(W.createActivityWorkbook({ countries }));
const blankZip = fflate.unzipSync(blankBytes);
const names = W.readActivityWorkbookSheetNames(blankBytes);
assert.deepEqual(plain(names), ['안내', '1_사업장', '2_제품', '3_공정', '4_연료', '5_구매강재', '6_역할책임', '7_증빙목록', '선택목록']);
assert.ok(W.isActivityWorkbookV2(names) && !W.isActivityWorkbookV2(['README', 'Products', 'Processes']), '시트 이름으로 새 서식과 종전 서식을 가린다');
assert.ok(blankZip['xl/styles.xml'], '머리글 색·입력 칸을 꾸미는 styles.xml이 있다');
const sheetText = (index) => fflate.strFromU8(blankZip[`xl/worksheets/sheet${index}.xml`]).replaceAll('&apos;', "'").replaceAll('&quot;', '"');
const lists = sheetText(9);
for (const [index, columns] of [[3, W.PRODUCT_COLUMNS], [4, W.PROCESS_COLUMNS], [5, W.FUEL_COLUMNS], [6, W.PRECURSOR_COLUMNS], [7, W.RNR_COLUMNS], [8, W.EVIDENCE_COLUMNS]]) {
  const xml = sheetText(index);
  const labels = columns.map((field) => field.label);
  assert.equal(new Set(labels).size, labels.length, '머리글은 겹치지 않는다(머리글 글자로 칸을 찾는다)');
  for (const field of columns) {
    assert.ok(xml.includes(`>${field.required ? `${field.label} *` : field.label}<`.replace(/&/g, '&amp;')), `${field.label} 머리글`);
    assert.ok(field.hint.length > 8 || field.key === 'custodian', `${field.label}: 무엇을 어디서 보고 적는지 설명이 있다`);
  }
  assert.ok(columns[0].example.startsWith(W.EXAMPLE_PREFIX), '예시 줄은 표시로 시작한다(가져올 때 건너뛴다)');
  assert.ok(xml.includes('state="frozen"'), '머리글·설명 줄을 고정한다');
  const validations = [...xml.matchAll(/<dataValidation [^>]*sqref="([A-Z]+)5:[A-Z]+64"><formula1>([^<]+)<\/formula1>/g)];
  assert.equal(validations.length, columns.filter((field) => field.list).length, '선택 목록이 있는 칸마다 목록을 건다');
  for (const [, , formula] of validations) {
    const [, letter, last] = formula.match(/^'선택목록'!\$([A-Z]+)\$2:\$[A-Z]+\$(\d+)$/);
    assert.ok(lists.includes(`<c r="${letter}${last}"`), `목록 범위 ${formula}의 마지막 칸이 실제로 있다`);
  }
}
assert.ok(lists.includes(`<f>IF('3_공정'!A5="","",'3_공정'!A5)</f>`) && lists.includes(`<f>IF('2_제품'!A5="","",'2_제품'!A5)</f>`), '공정·제품 이름은 앞 시트에 적은 것을 수식으로 비춘다');
assert.ok(fflate.strFromU8(blankZip['xl/workbook.xml']).includes('fullCalcOnLoad="1"'), '엑셀이 열 때 그 수식을 계산한다');
assert.ok(lists.includes('>South Korea<') && lists.includes('>Taiwan<') && lists.includes(`>${W.SHARED_PROCESS_LABEL}<`));
assert.deepEqual(plain(W.orderCountries(['Zambia', 'Taiwan', '_Other', 'South Korea', 'Albania'])), ['South Korea', 'Taiwan', 'Albania', 'Zambia'], '자주 쓰는 나라가 앞, 나머지는 이름순');
const guide = sheetText(1);
for (const phrase of ['노란 칸에만 적습니다', '(예시)', W.SHARED_PROCESS_LABEL, '합격품만', '실제로 쓴 양', '서버로 보내지 않습니다']) {
  assert.ok(guide.includes(phrase), `안내 시트: ${phrase}`);
}
// 연료 종류·출처 값은 앱의 입력 유형·선택지와 같다.
const streamInput = load('src/lib/source-stream-input.ts');
const energy = load('src/lib/conversation-energy.ts');
for (const choice of W.FUEL_KIND_CHOICES) assert.ok(streamInput.GUIDED_STREAM_KINDS.some((kind) => kind.key === choice.key && kind.label.includes(choice.label)), `연료 종류 ${choice.label}`);
assert.deepEqual(plain(W.ELECTRICITY_SOURCE_CHOICES.map((item) => item.value)), plain(energy.ELECTRICITY_EF_SOURCE_OPTIONS.map((item) => item.value)));

// ── 2) 읽기 ──────────────────────────────────────────────────────────
const blank = W.parseActivityWorkbook(blankBytes);
assert.deepEqual(plain([blank.products.length, blank.processes.length, blank.fuels.length, blank.precursors.length, blank.rnr.length, blank.evidence.length, Object.keys(blank.installation).length, blank.notes.length]), [0, 0, 0, 0, 0, 0, 0, 0], '빈 서식은 자료 0건 — 설명 줄·예시 줄을 자료로 읽지 않는다');

const sampleBytes = await bytesOf(W.createActivityWorkbook({ countries, fill: W.ACTIVITY_WORKBOOK_SAMPLE }));
const sample = W.parseActivityWorkbook(sampleBytes);
assert.equal(sample.installation.name, 'Daeil Industrial Co., Ltd. Ansan Plant');
assert.equal(sample.installation.period_start, '2025-01-01');
assert.deepEqual(plain(sample.products.map((row) => [row.row, row.values.cn])), [[5, '73181552'], [6, '73181558']], '줄 번호는 엑셀의 줄 번호');
assert.equal(sample.fuels[2].values.kind, '경유 (L)');
assert.equal(sample.precursors[1].values.hasValue, '없음 (EU 기본값 사용)');

// ── 3) 넣기 — 작성 예시 = 지도에서 손으로 넣은 기준선 ─────────────────
function memoryStore() {
  const data = { installations: [], periods: [], products: [], processes: [], product_output_lines: [], source_streams: [], precursors: [], internal_transfers: [] };
  let counter = 0;
  return {
    data,
    report: undefined,
    list: async (store) => [...data[store]],
    create: async (store, item) => { const entity = { ...item, id: `${store}_${counter += 1}`, created_at: 't', updated_at: 't' }; data[store].push(entity); return entity; },
    update: async (store, item) => { data[store] = data[store].map((row) => (row.id === item.id ? item : row)); return item; },
  };
}
const reportOf = (store) => ({ get: async () => store.report, set: async (value) => { store.report = value; } });
const importOf = async (data, store = memoryStore()) => ({ store, result: await I.importActivityWorkbook({ rnr: [], evidence: [], ...data }, { store, defaultValues, reportInputs: reportOf(store) }) });
const resultsOf = (store) => engine.calculateLocalResults({
  internalTransfers: [], products: store.data.products, periods: store.data.periods, processes: store.data.processes,
  productOutputLines: store.data.product_output_lines, sourceStreams: store.data.source_streams, precursors: store.data.precursors,
});

const { store, result } = await importOf(sample);
assert.deepEqual(plain(result.created), { installation: 1, period: 1, products: 2, processes: 2, fuels: 3, precursors: 2 });
assert.equal(result.issues.filter((issue) => issue.level === 'error').length, 0, `작성 예시는 넣지 못한 것이 없다: ${I.describeActivityImportIssues(result.issues)}`);
assert.equal(store.data.periods[0].name, '2025년 연간', '1월 1일~12월 31일이면 이름을 「연간」으로 붙인다');
assert.ok(store.data.processes.every((process) => process.period_id === store.data.periods[0].id), '공정이 보고기간에 연결된다(종전 서식은 연결하지 않았다)');
assert.ok(store.data.source_streams.every((stream) => stream.period_id === store.data.periods[0].id) && store.data.precursors.every((item) => item.period_id === store.data.periods[0].id));
assert.equal(store.data.products.find((product) => product.cn_code === '73181558').reporting_scope, 'NON_CBAM_COPRODUCT', 'EU로 수출하지 않는 제품은 신고 대상 밖(배출 몫만 나눠 갖는다)');
assert.equal(store.data.installations[0].operator_reg_number, '000-00-00000');

const sts = store.data.processes.find((process) => process.name === 'STS 나사 공정');
const carbon = store.data.processes.find((process) => process.name === '탄소강 나사 공정');
// 연료가 계산에 들어간다 — 종전 서식은 「템플릿 업로드」 방식이라 연료 시트가 0으로 계산됐다(run33).
assert.equal(sts.direct_emissions_input_mode, 'SOURCE_STREAM_SUM');
assert.ok(Math.abs(sts.direct_attributable_emissions_tco2e - 71.729) < 0.01, `STS 직접배출 71.729 (도시가스·경유의 생산량 비율 몫): ${sts.direct_attributable_emissions_tco2e}`);
// 공용 가스·경유: 공장 전체 값 한 줄 → 공정마다 한 행 + 공용 계량기 기록(지도 4단계 「연료 나누기」와 같은 모양).
const gasRows = store.data.source_streams.filter((stream) => stream.shared_meter?.group === '세척수 온수 보일러 도시가스');
assert.equal(gasRows.length, 2);
assert.ok(gasRows.every((stream) => stream.shared_meter.installation_total_activity_data === 38500 && stream.shared_meter.basis === 'OUTPUT_MASS' && /생산량\(활동수준\) 비율로 배분/.test(stream.shared_meter.note)));
assert.ok(Math.abs(gasRows.reduce((sum, stream) => sum + stream.activity_data, 0) - 38500) < 1e-6, '나눈 값의 합 = 고지서 값');
const dieselRows = store.data.source_streams.filter((stream) => stream.shared_meter?.group === '지게차 경유');
assert.ok(Math.abs(dieselRows.reduce((sum, stream) => sum + stream.activity_data, 0) - 12400 * 0.835 / 1000) < 1e-5, '리터는 t로 바꿔 저장한다(12,400 L × 0.835 = 10.354 t)');
assert.ok(dieselRows.every((stream) => stream.activity_unit === 't' && stream.ncv_gj_per_unit === 43 && stream.emission_factor_tco2e_per_unit === 74.1 && / L$/.test(stream.name)));
const dedicated = store.data.source_streams.find((stream) => stream.name === '열처리로(QT) 도시가스');
assert.ok(dedicated.process_id === carbon.id && !dedicated.shared_meter && dedicated.activity_data === 486000);
// 전력: 공장 전체 값만 적으면 생산량 비율로 나누고 공용 계량기로 기록한다(지도 5단계 「전력 나누기」).
assert.ok(Math.abs(sts.electricity_mwh + carbon.electricity_mwh - 5412) < 1e-6 && Math.abs(sts.electricity_mwh - 5412 * 3240 / 5100) < 0.001);
assert.ok([sts, carbon].every((process) => process.electricity_shared_meter?.group === I.ELECTRICITY_METER_GROUP && process.electricity_shared_meter.basis === 'OUTPUT_MASS'
  && process.electricity_ef_tco2e_per_mwh === 0.4747 && process.electricity_ef_source === 'COUNTRY_GRID_DEFAULT' && process.electricity_allocation_note && process.measurable_heat_import === 'NO'));
// 생산라인: 제품 라인 + 불량·스크랩(활동수준 제외).
const stsLines = store.data.product_output_lines.filter((line) => line.process_id === sts.id);
assert.deepEqual(plain(stsLines.map((line) => [line.output_mass_t, line.activity_level_role ?? 'GOOD'])), [[3240, 'GOOD'], [265, 'EXCLUDED']]);
// EU로 안 나가는 제품의 라인은 「합격품(활동수준 포함)」으로 적어 둔다 — 귀속 점검 V07이 「스크랩은 아닌지」 되묻지 않는다.
assert.equal(store.data.product_output_lines.find((line) => line.process_id === carbon.id && line.output_mass_t === 1860).activity_level_role, 'GOOD');
const attribution = load('src/lib/attribution-status.ts').buildAttributionStatus({ processes: store.data.processes, productOutputLines: store.data.product_output_lines, sourceStreams: store.data.source_streams, precursorCount: store.data.precursors.length, results: resultsOf(store), installation: store.data.installations[0], hrefOf: engine.getLocalCalculationWarningHref });
assert.deepEqual(plain([attribution.counts.fix, attribution.counts.review]), [0, 0], `귀속·할당 점검에 걸리는 것이 없다: ${JSON.stringify(attribution.rows.filter((row) => row.status !== 'ok').map((row) => row.items))}`);
// 구매 강재: 공급사 값은 그대로, 「없음」은 EU 기본값(대만 · 722300)을 찾아 넣는다.
const [korean, taiwan] = store.data.precursors;
assert.deepEqual(plain([korean.data_mode, korean.direct_see_tco2e_per_t, korean.indirect_see_tco2e_per_t, korean.verification_status, korean.supplier_country, korean.purchased_mass_t]), ['ACTUAL', 1.86, 0.94, 'SUPPLIER_CONFIRMED', 'South Korea', 2980]);
assert.deepEqual(plain([taiwan.data_mode, taiwan.supplier_country, taiwan.verification_status]), ['DEFAULT', 'Taiwan', 'UNVERIFIED']);
assert.ok(taiwan.direct_see_tco2e_per_t > 0 && /Taiwan/.test(taiwan.source) && taiwan.default_value_justification.includes('3회 요청했으나 미회신'));

// 엔진: 손으로 넣은 기준선(run14 대일기업)의 3.764 / 5.112와 같다.
const stsResult = resultsOf(store).find((item) => item.process_id === sts.id && item.is_cbam_reportable);
const handBasis = (71.729 + 2910 * 1.86 + 610 * taiwan.direct_see_tco2e_per_t) / 3240;
assert.ok(Math.abs(stsResult.see_cbam_basis - handBasis) < 1e-4, `기준 SEE 손계산 ${handBasis}: ${stsResult.see_cbam_basis}`);
assert.ok(Math.abs(stsResult.see_cbam_basis - 3.7637) < 0.001 && Math.abs(stsResult.total_see - 5.1117) < 0.001, `기준선과 같다: ${stsResult.see_cbam_basis} / ${stsResult.total_see}`);
// 화면의 에너지 나누기 현황이 이 자료를 문제 없이 읽는다(전력 1 · 연료 2).
const splits = split.summarizeEnergySplits({ processes: store.data.processes, sourceStreams: store.data.source_streams });
assert.deepEqual(plain(splits.items.map((item) => [item.kind, item.problem ?? null])), [['ELECTRICITY', null], ['FUEL', null], ['FUEL', null]]);

// 같은 파일을 한 번 더 올려도 두 번 들어가지 않는다.
const again = await I.importActivityWorkbook(sample, { store, defaultValues, reportInputs: reportOf(store) });
assert.deepEqual(plain(again.created), { installation: 0, period: 0, products: 0, processes: 0, fuels: 0, precursors: 0 });
assert.equal(store.data.source_streams.length, 5);
assert.ok(again.issues.some((issue) => issue.level === 'warning' && /이미 공정이 2개/.test(issue.message)));

// 한 공정에서 제품을 둘 만들면(같은 공정 이름 두 줄) 공정 하나 + 제품 라인 둘.
const twoLines = structuredClone(plain(sample));
twoLines.processes = [
  { row: 5, values: { name: '나사 공정', product: sample.products[0].values.name, mass: '3240', scrap: '265' } },
  { row: 6, values: { name: '나사 공정', product: sample.products[1].values.name, mass: '1860' } },
];
twoLines.fuels = [{ row: 5, values: { name: '지게차 경유', kind: '경유 (L)', amount: '12,400', where: W.SHARED_PROCESS_LABEL, evidence: '전표' } }];
twoLines.precursors = [];
const merged = await importOf(twoLines);
assert.equal(merged.store.data.processes.length, 1);
assert.equal(merged.store.data.processes[0].output_mass_t, 5100, '공정 생산량 = 제품 라인 합');
assert.equal(merged.store.data.product_output_lines.length, 3, '제품 라인 둘 + 제외 라인');
assert.ok(merged.store.data.source_streams.length === 1 && !merged.store.data.source_streams[0].shared_meter, '공정이 하나면 공용 연료도 그 공정에 그대로 넣는다');
assert.equal(merged.store.data.processes[0].electricity_mwh, 5412, '공정이 하나면 공장 전체 전력이 그 공정 값');
assert.equal(merged.store.data.processes[0].electricity_shared_meter, undefined);

// ── 3-1) 다품종 업체(run34): 원료를 쓰는 제품 · 연료를 쓰는 공정 여럿 · 조용히 섞이지 않게 ──
// 가상 사례에서 「한 공정에 전부」로 적으면 강종이 섞여 휠너트가 −52%, STS 볼트가 +33%로 나왔는데 아무 경고가 없었다.
const multi = (processes, fuels, precursors) => ({
  installation: { name: 'Multi Plant', country: 'KR', operator_name: 'Multi Co.', operator_reg_number: '000', operator_address: 'Seoul', latitude: '37', longitude: '127', period_start: '2025-01-01', period_end: '2025-12-31', electricity_total_mwh: '1000', electricity_ef: '0.4747', electricity_ef_source: '국가 전력망 평균', imported_heat: '아니오' },
  products: [['합금강 볼트', '73181582'], ['탄소강 너트', '73181699'], ['휠너트', '73181692'], ['알루미늄 캡', '76169990']].map(([name, cn], index) => ({ row: 5 + index, values: { name, cn, alloy_mn_cr_ni: '1', reducing_agent: '모름', scrap_per_t: '0', preconsumer_scrap_pct: '0', non_al_pct: '0' } })),
  processes: processes.map((values, index) => ({ row: 5 + index, values })),
  fuels: fuels.map((values, index) => ({ row: 5 + index, values: { kind: '도시가스 (Nm³)', evidence: '고지서', ...values } })),
  precursors: precursors.map((values, index) => ({ row: 5 + index, values: { country: 'South Korea', hasValue: '있음', indirect: '0', evidence: '공급사', ...values } })),
  notes: [],
});
const alloyWire = { name: '합금강 선재', cn: '72279050', consumed: '1040', direct: '2' };
const carbonWire = { name: '탄소강 선재', cn: '72139110', consumed: '2080', direct: '1' };
const seeOf = (run, cn) => resultsOf(run.store).find((item) => item.cn_code === cn && item.output_mass_t > 0).see_direct_incl_precursor;
// (a) 한 공정에 제품 둘 + 「쓰는 제품」: 원료가 그 제품에만 귀속된다(지도 6단계의 제품별 배분과 같은 기록).
const oneProcess = [{ name: '라인', product: '합금강 볼트', mass: '1000' }, { name: '라인', product: '탄소강 너트', mass: '2000' }];
const assignedRun = await importOf(multi(oneProcess, [], [{ ...alloyWire, where: '라인', products: '합금강 볼트' }, { ...carbonWire, where: '라인', products: '탄소강 너트' }]));
const alloyRecord = assignedRun.store.data.precursors.find((item) => item.name === '합금강 선재');
const boltLine = assignedRun.store.data.product_output_lines.find((line) => line.output_mass_t === 1000);
assert.deepEqual(plain(alloyRecord.output_allocations), [{ product_output_line_id: boltLine.id, product_id: boltLine.product_id, allocated_mass_t: 1040, allocation_percent: 100 }]);
assert.ok(Math.abs(seeOf(assignedRun, '73181582') - 2.08) < 1e-9 && Math.abs(seeOf(assignedRun, '73181699') - 1.04) < 1e-9, '합금강은 볼트에만(1,040 × 2 ÷ 1,000), 탄소강은 너트에만(2,080 × 1 ÷ 2,000)');
assert.equal(assignedRun.result.issues.filter((issue) => issue.level !== 'info').length, 0);
// (b) 같은 자료를 「쓰는 제품」 없이: 값이 섞이고(둘 다 1.3867) — 이제 그 사실을 알린다.
const mixedRun = await importOf(multi(oneProcess, [], [{ ...alloyWire, where: '라인' }, { ...carbonWire, where: '라인' }]));
assert.ok(Math.abs(seeOf(mixedRun, '73181582') - (1040 * 2 + 2080 * 1) / 3000) < 1e-9, '안 적으면 생산량 비율로 섞인다');
assert.match(I.describeActivityImportIssues(mixedRun.result.issues), /\[확인 필요\] 5_구매강재 — 공정 「라인」에는 제품이 2개 있고, 종류가 다른 원료 「합금강 선재」, 「탄소강 선재」을\(를\) 「쓰는 제품」 없이 넣었습니다/);
// 종류(CN 4자리)가 같은 원료만 있으면 묻지 않는다 — 같은 원료로 만드는 제품은 한 공정이 규정이다(부속서 II A.4).
const sameSteel = await importOf(multi(oneProcess, [], [{ ...carbonWire, where: '라인' }, { ...carbonWire, name: '탄소강 선재 B', where: '라인' }]));
assert.equal(sameSteel.result.issues.filter((issue) => issue.level === 'warning').length, 0);
// 한 원료를 제품 둘이 쓰면 ; 로 잇고, 그 둘의 생산량 비율로 나뉜다. 그 공정의 제품이 아니면 넣지 않는다.
const twoUsers = await importOf(multi([...oneProcess, { name: '라인', product: '휠너트', mass: '1000' }], [], [{ ...carbonWire, where: '라인', products: '합금강 볼트; 탄소강 너트' }]));
assert.deepEqual(plain(twoUsers.store.data.precursors[0].output_allocations.map((item) => item.allocated_mass_t)), [693.333333, 1386.666667]);
assert.equal(resultsOf(twoUsers.store).find((item) => item.cn_code === '73181692').see_direct_incl_precursor, 0, '적지 않은 제품에는 귀속되지 않는다');
const wrongProduct = await importOf(multi(oneProcess, [], [{ ...alloyWire, where: '라인', products: '휠너트' }]));
assert.equal(wrongProduct.store.data.precursors.length, 0);
assert.match(I.describeActivityImportIssues(wrongProduct.result.issues), /\[넣지 못함\] 5_구매강재 5번째 줄 — 합금강 선재: 쓰는 제품 「휠너트」이\(가\) 공정 「라인」의 제품이 아닙니다/);
// 철강이 아닌 제품이 같은 공정에 있으면 강재 배출의 몫을 가져간다 — 알린다.
const withAluminium = await importOf(multi([...oneProcess, { name: '라인', product: '알루미늄 캡', mass: '100' }], [], [{ ...carbonWire, where: '라인' }]));
assert.match(I.describeActivityImportIssues(withAluminium.result.issues), /공정 「라인」에 철강이 아닌 제품 「알루미늄 캡」이\(가\) 같이 있습니다/);
// (c) 연료를 일부 공정만 쓰면 그 공정 이름들을 ; 로 잇는다 — 그 공정들끼리만 생산량 비율로 나뉘고 공용 계량기 기록이 남는다.
const three = [{ name: '볼트 공정', product: '합금강 볼트', mass: '1000' }, { name: '너트 공정', product: '탄소강 너트', mass: '2000' }, { name: '휠너트 공정', product: '휠너트', mass: '3000' }];
const partial = await importOf(multi(three, [{ name: '열처리로 가스', amount: '40000', where: '볼트 공정; 휠너트 공정' }], []));
const partialRows = partial.store.data.source_streams;
const processNamed = (run, name) => run.store.data.processes.find((process) => process.name === name);
assert.deepEqual(plain(partialRows.map((stream) => [processNamed(partial, '볼트 공정').id === stream.process_id ? '볼트' : '휠너트', stream.activity_data, stream.shared_meter.group, stream.shared_meter.installation_total_activity_data])), [['볼트', 10000, '열처리로 가스', 40000], ['휠너트', 30000, '열처리로 가스', 40000]]);
assert.equal(processNamed(partial, '너트 공정').direct_attributable_emissions_tco2e, 0, '적지 않은 공정에는 실리지 않는다');
assert.equal(partial.result.issues.filter((issue) => issue.level === 'warning' && issue.sheet === '4_연료').length, 0);
const unknownProcess = await importOf(multi(three, [{ name: '열처리로 가스', amount: '40000', where: '볼트 공정; 없는 공정' }], []));
assert.equal(unknownProcess.store.data.source_streams.length, 0);
assert.match(I.describeActivityImportIssues(unknownProcess.result.issues), /쓰는 공정 「없는 공정」을\(를\) 3_공정 시트에서 찾지 못했습니다/);
// 일부 제품만 거칠 법한 설비의 연료를 「공장 전체」로 적거나, 제품이 여럿인 한 공정에 적으면 되묻는다. 보일러처럼 모두 쓰는 연료는 묻지 않는다.
const allShared = await importOf(multi(three, [{ name: '열처리로 가스', amount: '40000', where: W.SHARED_PROCESS_LABEL }, { name: '세척 보일러 가스', amount: '100', where: W.SHARED_PROCESS_LABEL }], []));
const fuelWarnings = allShared.result.issues.filter((issue) => issue.level === 'warning' && issue.sheet === '4_연료');
assert.equal(fuelWarnings.length, 1);
assert.match(fuelWarnings[0].message, /^열처리로 가스: 「공장 전체\(공용\)」로 적혀 모든 공정에 생산량 비율로 나눴습니다\. 이름으로 보아 일부 제품만 거치는 설비의 연료일 수 있습니다/);
const inOneProcess = await importOf(multi(oneProcess, [{ name: '소둔로 가스', amount: '100', where: '라인' }], []));
assert.match(I.describeActivityImportIssues(inOneProcess.result.issues), /소둔로 가스: 공정 「라인」에는 제품이 2개 있어 이 연료가 모든 제품에 생산량 비율로 나뉩니다/);
// 시스템 경계(2025/2547 부속서 I 3.16.2): 도금·절단·용접·마무리 설비의 배출은 철강 제품의 직접배출에 넣지 않는다 — 그런 이름의 연료는 되묻는다.
// 같은 조항이 넣는다고 한 용융아연도금·코팅, 그리고 열처리·단조·보일러는 이 알림의 대상이 아니다.
const boundary = await importOf(multi(three, [
  { name: '전기도금 라인 가스', amount: '10', where: '볼트 공정' }, { name: '캡 용접기 LPG', amount: '10', where: '볼트 공정' },
  { name: '용융아연도금 가스', amount: '10', where: '볼트 공정' }, { name: '지오메트 코팅 건조로 가스', amount: '10', where: '볼트 공정' },
  { name: '열처리로 가스', amount: '10', where: '볼트 공정' }, { name: '세척 보일러 가스', amount: '10', where: '볼트 공정' },
], []));
const boundaryWarnings = boundary.result.issues.filter((issue) => issue.level === 'warning' && /직접배출에 넣지 않습니다/.test(issue.message));
assert.deepEqual(plain(boundaryWarnings.map((issue) => issue.row)), [5, 6], '전기도금·용접만 되묻는다');
assert.ok(boundaryWarnings[0].message.includes(I.STEEL_BOUNDARY_ANCHOR) && boundaryWarnings[0].message.includes('용융아연도금·코팅·열처리·단조·소둔의 연료는 넣는 것이 맞습니다'));
assert.equal(boundary.store.data.source_streams.length, 6, '되묻되 지우지는 않는다(앱은 그 설비 전용인지 모른다)');
// 「일부 제품만 거치는 설비」 알림은 더 이상 도금을 그렇게 보지 않는다.
const platingShared = await importOf(multi(three, [{ name: '도금 라인 가스', amount: '10', where: W.SHARED_PROCESS_LABEL }], []));
assert.ok(!platingShared.result.issues.some((issue) => /일부 제품만 거치는 설비/.test(issue.message)) && platingShared.result.issues.some((issue) => /직접배출에 넣지 않습니다/.test(issue.message)));
// 공정 묶기 점검(V04): EU로 수출하지 않는 철강 제품의 공정도 센다 — 같은 원료를 쓰는 철강 공정이 갈라져 있으면 확인을 요구한다(가이던스 No.3 4.3.1: 출발점은 사업장이 만드는 모든 CN).
const splitCarbon = multi(three.slice(0, 2), [], [{ ...carbonWire, where: '볼트 공정' }, { ...carbonWire, name: '탄소강 선재 2', where: '너트 공정' }]);
const attributionOf = (run) => load('src/lib/attribution-status.ts').buildAttributionStatus({ processes: run.store.data.processes, productOutputLines: run.store.data.product_output_lines, sourceStreams: run.store.data.source_streams, precursorCount: run.store.data.precursors.length, results: resultsOf(run.store), installation: run.store.data.installations[0], hrefOf: engine.getLocalCalculationWarningHref });
assert.equal(attributionOf(await importOf(splitCarbon)).rows.find((row) => row.id === 'MULTIFUNCTIONAL').status, 'review');
const splitCarbonNotExported = structuredClone(splitCarbon);
splitCarbonNotExported.products[1].values.exported = '아니오';
const notExportedRun = await importOf(splitCarbonNotExported);
assert.equal(notExportedRun.store.data.products.find((product) => product.cn_code === '73181699').reporting_scope, 'NON_CBAM_COPRODUCT');
assert.equal(attributionOf(notExportedRun).rows.find((row) => row.id === 'MULTIFUNCTIONAL').status, 'review', '수출하지 않는 철강 제품의 공정도 같은 원료면 묶기 점검에 걸린다');
// CBAM 품목이 아닌 제품(알루미늄… 이 앱은 철강만이므로 품목군이 철강 제품이 아니면 세지 않는다)은 그대로 세지 않는다.
const aluminiumPartner = multi([{ name: '볼트 공정', product: '합금강 볼트', mass: '1000' }, { name: '캡 공정', product: '알루미늄 캡', mass: '100' }], [], [{ ...carbonWire, where: '볼트 공정' }, { ...carbonWire, name: '탄소강 선재 2', where: '캡 공정' }]);
aluminiumPartner.products[3].values.exported = '아니오';
assert.notEqual(attributionOf(await importOf(aluminiumPartner)).rows.find((row) => row.id === 'MULTIFUNCTIONAL')?.status, 'review');
// 서식: 새 칸과 안내.
assert.ok(W.PRECURSOR_COLUMNS.some((field) => field.key === 'products' && field.list === 'product' && !field.required));
assert.ok(W.FUEL_COLUMNS.find((field) => field.key === 'where').hint.includes('; 로 이어'));
for (const phrase of ['CN 코드별로 묶어', '같은 원료로 만드는 제품끼리', '일부 제품만 거치는 설비의 연료', '마무리 설비 전용 연료는 적지 않습니다']) assert.ok(guide.includes(phrase), `안내 시트: ${phrase}`);

// ── 3-2) 손입력 0을 향해: 화면에서만 받던 것을 서식이 받는다(입력 대조표 ①②) ──
// 사업장: Registry 식별자·폐가스 서술 / 제품: 부문특정 파라미터 / 연료: 바이오매스·산화계수·측정 방식 / 구매 강재: 기준 기간·전력 분해·생산경로·비CBAM 사용량
// 보고서 입력: 전력 계수 근거·모니터링 계획·서명·탄소가격·역할책임·증빙 — 「보고서 입력」 화면과 같은 자리에 저장된다.
const sectorKeys = load('src/lib/sector-parameters.ts').getSectorParameters('Iron or steel products').map((item) => item.key);
assert.deepEqual(plain(sectorKeys.filter((item) => W.PRODUCT_COLUMNS.some((field) => field.key === item))), plain(sectorKeys), '철강 제품의 부문특정 파라미터 네 가지가 모두 제품 시트의 칸이다(같은 키)');
const savedReport = store.report;
assert.deepEqual(plain(savedReport.sector_parameters.map((item) => [item.param_key, item.value])), [['reducing_agent', '모름 — 공급사 문의 중'], ['alloy_mn_cr_ni', '28.5'], ['scrap_per_t', '0'], ['preconsumer_scrap_pct', '0']]);
assert.ok(savedReport.sector_parameters.every((item) => item.product_id === store.data.products.find((product) => product.cn_code === '73181552').id), '수출하지 않는 제품은 받지 않아도 묻지 않는다');
assert.deepEqual(plain(savedReport.electricity_ef_meta.map((item) => [item.publisher, item.vintage]).sort()), [['온실가스종합정보센터', '2023'], ['온실가스종합정보센터', '2023']], '전력 계수의 출처는 공정마다 붙는다');
assert.deepEqual(plain(savedReport.carbon_price), [{ target: 'Daeil Industrial Co., Ltd. Ansan Plant', applicable: 'NO', note: '배출권거래제 할당대상 아님(연 배출량 기준 미만)', evidence_status: 'pending' }]);
assert.deepEqual(plain([savedReport.declaration, savedReport.rnr.length, savedReport.evidence.length, savedReport.rnr[0].collector, savedReport.evidence[0].status]), [{ name: 'Kim Do-hyun', position: '품질환경팀 과장' }, 2, 2, '총무팀 박OO', '확보']);
assert.ok(savedReport.transpositions.length === 2 && savedReport.transpositions.every((item) => item.measurement_method === '주유 전표 합산' && dieselRows.some((stream) => stream.id === item.source_stream_id)), '측정 방식은 그 연료에서 나뉜 행마다 붙는다');
assert.equal(korean.supplier_reporting_period, '2025-01-01 ~ 2025-12-31');
assert.deepEqual(plain([store.report.rnr.length, store.report.evidence.length, store.report.carbon_price.length]), [2, 2, 1], '다시 올려도 보고서 항목이 겹쳐 쌓이지 않는다');
// 산정보고서에 남을 빈 칸을 알린다(막지는 않는다).
const sampleInfo = I.describeActivityImportIssues(result.issues);
assert.match(sampleInfo, /\[참고\] 1_사업장 — 모니터링 계획 문서번호가 비어 있습니다/);
assert.ok(!/서명자가 비어|역할·책임이 비어|탄소세를 냈나요\?」가 비어|공표한 기관·문서가 비어/.test(sampleInfo));
// 이미 「보고서 입력」에 적어 둔 값은 서식이 덮어쓰지 않는다.
const preset = memoryStore();
preset.report = { declaration: { name: '기존 서명자' }, carbon_price: [{ target: 'x', applicable: 'YES', note: '', evidence_status: 'confirmed' }] };
await importOf(sample, preset);
assert.deepEqual(plain([preset.report.declaration, preset.report.carbon_price.length, preset.report.carbon_price[0].target]), [{ name: '기존 서명자', position: '품질환경팀 과장' }, 1, 'x']);
// 나머지 칸들
const extra = multi(
  [{ name: '볼트 공정', product: '합금강 볼트', mass: '1000' }],
  [{ name: '혼소 가스', amount: '1000', where: '볼트 공정', biomass: '20', oxidation: '0.99', ncv: '0.038', factor: '56', factorSource: '공급사·분석 성적서', factorDoc: '가스사 성적서 2025-03', method: '정산용 계량기', quality: '±1%' }],
  [{ ...alloyWire, where: '볼트 공정', direct: '2', indirect: '', elecUse: '0.5', elecFactor: '0.4', period: '2025', route: '전기로', nonCbam: '40' }],
);
extra.installation.cbam_registry_id = 'KR-INST-0001';
extra.installation.waste_gases = '예';
extra.installation.waste_gases_note = '없음에 가까움 — 시험용';
extra.installation.carbon_price_applicable = '예';
extra.products[0].values = { name: '합금강 볼트', cn: '73181582' };
const extraRun = await importOf(extra);
const extraStream = extraRun.store.data.source_streams[0];
assert.deepEqual(plain([extraStream.biomass_fraction, extraStream.fossil_fraction, extraStream.oxidation_factor]), [0.2, 0.8, 0.99]);
assert.deepEqual(plain(extraRun.store.report.transpositions), [{ source_stream_id: extraStream.id, measurement_method: '정산용 계량기', data_quality: '±1%', ncv_source: '가스사 성적서 2025-03', ef_source: '가스사 성적서 2025-03' }]);
const extraPrecursor = extraRun.store.data.precursors[0];
assert.deepEqual(plain([extraPrecursor.indirect_see_tco2e_per_t, extraPrecursor.indirect_electricity_mwh_per_t, extraPrecursor.indirect_electricity_factor_tco2e_per_mwh, extraPrecursor.supplier_reporting_period, extraPrecursor.production_route, extraPrecursor.consumed_for_non_cbam_mass_t]), [0.2, 0.5, 0.4, '2025', '전기로', 40], '간접 SEE를 비우면 전력 사용량 × 전력 계수로 채우고, 분해값을 그대로 보존한다');
assert.deepEqual(plain([extraRun.store.data.installations[0].cbam_registry_id, extraRun.store.data.installations[0].waste_gases, extraRun.store.data.installations[0].waste_gases_note]), ['KR-INST-0001', 'YES', '없음에 가까움 — 시험용']);
const extraReport = I.describeActivityImportIssues(extraRun.result.issues);
assert.match(extraReport, /\[확인 필요\] 2_제품 5번째 줄 — 합금강 볼트: 부문특정 파라미터가 비어 있습니다 — 전구물질 생산의 주 환원제 · Mn·Cr·Ni 및 기타 합금원소 합계 질량비 · 제품 1t 생산당 사용 스크랩 · pre-consumer 스크랩 비율\. EU로 수출하는 철강 제품의 법정 기재 항목/);
assert.match(extraReport, /\[확인 필요\] 1_사업장 — 탄소가격을 냈다고 적었는데 금액이 비어 있습니다/);
const badExtra = await importOf(multi([{ name: '볼트 공정', product: '합금강 볼트', mass: '1000' }], [{ name: '가스', amount: '10', where: '볼트 공정', biomass: '120' }], [{ ...alloyWire, where: '볼트 공정', elecUse: '0.5' }, { ...alloyWire, name: '합금강 선재 B', where: '볼트 공정', indirect: '0.5', elecUse: '0.5', elecFactor: '0.4' }]));
const badReport = I.describeActivityImportIssues(badExtra.result.issues);
assert.match(badReport, /바이오매스 비율 「120」을\(를\) 0~100 사이 숫자/);
assert.match(badReport, /원료의 전력 사용량과 전력 계수는 둘 다 적어야 EU 문서에 실립니다/);
assert.match(badReport, /간접 SEE 0\.5가 전력 사용량 × 전력 계수\(0\.2\)와 다릅니다/);
// 이 시트들이 생기기 전의 서식(6·7 시트 없음)도 그대로 올라간다.
const older = fflate.unzipSync(sampleBytes);
const olderWorkbook = fflate.strFromU8(older['xl/workbook.xml']).replace(/<sheet name="6_역할책임"[^>]*\/>/, '').replace(/<sheet name="7_증빙목록"[^>]*\/>/, '');
const olderData = W.parseActivityWorkbook(fflate.zipSync({ ...older, 'xl/workbook.xml': fflate.strToU8(olderWorkbook) }));
assert.deepEqual(plain([olderData.rnr.length, olderData.evidence.length, olderData.notes.length, olderData.products.length]), [0, 0, 0, 2]);

// ── 4) 「확인할 것」 ─────────────────────────────────────────────────
const broken = structuredClone(plain(sample));
delete broken.installation.operator_reg_number;
delete broken.installation.electricity_ef;
delete broken.installation.imported_heat;
broken.installation.period_start = '45658'; // 엑셀이 날짜로 바꿔 버린 경우(2025-01-01의 일련번호)
broken.products.push({ row: 7, values: { name: '코드가 짧은 제품', cn: '7318' } });
broken.processes.push({ row: 7, values: { name: '없는 제품 공정', product: '서식에 없는 제품', mass: '10' } });
broken.fuels.push(
  { row: 8, values: { name: '단위를 적은 가스', kind: '도시가스 (Nm³)', amount: '1000 Nm3', where: 'STS 나사 공정' } },
  { row: 9, values: { name: '없는 공정의 가스', kind: '도시가스 (Nm³)', amount: '1000', where: '없는 제품 공정' } },
  { row: 10, values: { name: 'LPG', kind: '유류·기타 (t)', amount: '5', where: 'STS 나사 공정' } },
  { row: 11, values: { name: '계수만 적은 가스', kind: '도시가스 (Nm³)', amount: '10', where: 'STS 나사 공정', factor: '55.9' } },
  { row: 12, values: { name: '성적서 가스', kind: '도시가스', amount: '10', where: 'STS 나사 공정', ncv: '0.0389', factor: '55.9', factorSource: '공급사·분석 성적서', evidence: '삼천리 성적서' } },
);
broken.precursors.push(
  { row: 7, values: { name: '값이 빠진 와이어', cn: '72230019', consumed: '10', country: '한국', where: 'STS 나사 공정', hasValue: '있음' } },
  { row: 8, values: { name: '기본값이 없는 나라', cn: '72230019', consumed: '10', country: 'Narnia', where: 'STS 나사 공정', hasValue: '없음' } },
  { row: 9, values: { name: '한글 나라 이름', cn: '72230019', consumed: '10', country: '대만', where: 'STS 나사 공정' } },
);
const brokenRun = await importOf(broken);
const report = I.describeActivityImportIssues(brokenRun.result.issues);
const has = (pattern) => assert.match(report, pattern);
assert.equal(brokenRun.store.data.periods[0].start_date, '2025-01-01', '엑셀 날짜 일련번호도 읽는다');
has(/\[확인 필요\] 1_사업장 — 비어 있습니다: 법인\/사업자 등록번호/);
has(/\[확인 필요\] 1_사업장 — 전력 배출계수가 비어 있어 임시값 0\.47/);
has(/\[참고\] 1_사업장 — 「밖에서 사 오는 스팀·온수가 있나요\?」가 비어 있습니다/);
has(/\[넣지 못함\] 2_제품 7번째 줄 — 코드가 짧은 제품: CN 코드는 8자리/);
has(/\[넣지 못함\] 3_공정 7번째 줄 — 없는 제품 공정: 만드는 제품 「서식에 없는 제품」/);
has(/\[넣지 못함\] 4_연료 8번째 줄 — 단위를 적은 가스: 연간 사용량 「1000 Nm3」/);
has(/\[넣지 못함\] 4_연료 9번째 줄 — 없는 공정의 가스: 쓰는 공정 「없는 제품 공정」/);
has(/\[확인 필요\] 4_연료 10번째 줄 — LPG: 순발열량·배출계수가 비어 「유류·기타」의 임시값/);
has(/\[넣지 못함\] 4_연료 11번째 줄 — 계수만 적은 가스: 순발열량·배출계수를 직접 적었으면 「계수 출처」도/);
has(/\[넣지 못함\] 5_구매강재 7번째 줄 — 값이 빠진 와이어: 공급사 값이 「있음」인데 직접 SEE가 비어/);
has(/\[넣지 못함\] 5_구매강재 8번째 줄 — 기본값이 없는 나라: EU 기본값을 넣지 못했습니다/);
has(/\[참고\] 5_구매강재 9번째 줄 — 한글 나라 이름: 「공급사 배출량 값이 있나요\?」가 비어/);
assert.ok(report.indexOf('[넣지 못함]') < report.indexOf('[확인 필요]') && report.indexOf('[확인 필요]') < report.indexOf('[참고]'), '넣지 못한 것 → 확인 필요 → 참고 순서');
const named = (name) => brokenRun.store.data.source_streams.find((stream) => stream.name === name);
assert.ok(!named('단위를 적은 가스') && !named('계수만 적은 가스'), '틀린 줄은 0으로 넣지 않고 빼 둔다');
assert.deepEqual(plain([named('성적서 가스').ncv_gj_per_unit, named('성적서 가스').emission_factor_tco2e_per_unit, named('성적서 가스').factor_source_type]), [0.0389, 55.9, 'SUPPLIER_OR_LAB'], '직접 적은 계수와 출처는 그대로');
assert.equal(brokenRun.store.data.precursors.find((item) => item.name === '한글 나라 이름').supplier_country, 'Taiwan', '한글로 적은 흔한 나라는 기본값표 이름으로 바꾼다');
assert.equal(brokenRun.store.data.processes.find((process) => process.name === 'STS 나사 공정').electricity_ef_source, undefined, '임시 계수에는 출처를 붙이지 않는다');
assert.equal(I.describeActivityImportIssues([]), '확인할 것이 없습니다.');
// 보고기간을 못 읽으면 공정을 만들지 않는다(기간 없는 자료를 조용히 만들지 않는다).
const noPeriod = structuredClone(plain(sample));
noPeriod.installation.period_end = '작년 말';
const noPeriodRun = await importOf(noPeriod);
assert.equal(noPeriodRun.store.data.processes.length, 0);
assert.match(I.describeActivityImportIssues(noPeriodRun.result.issues), /보고기간 종료일 「작년 말」을\(를\) 읽지 못했습니다/);
// 서식의 머리글을 지우면 그 시트를 못 읽었다고 말한다.
const noSheet = await importOf({ ...plain(sample), notes: ['4_연료 시트가 없습니다.'] });
assert.ok(noSheet.result.issues[0].level === 'error' && noSheet.result.issues[0].sheet === '파일');
for (const [text, expected] of [['2025-01-01', '2025-01-01'], ['2025.1.5', '2025-01-05'], ['2025/12/31', '2025-12-31'], ['45658', '2025-01-01'], ['2025-13-01', undefined], ['작년', undefined], ['', undefined]]) {
  assert.equal(I.parseWorkbookDate(text), expected, `날짜 ${text}`);
}

// 엑셀이 다시 저장한 모양(공유 문자열 · 줄 번호가 건너뜀 · 날짜가 일련번호)도 읽는다.
const resaved = fflate.zipSync({
  '[Content_Types].xml': blankZip['[Content_Types].xml'], '_rels/.rels': blankZip['_rels/.rels'],
  'xl/workbook.xml': fflate.strToU8('<workbook xmlns:r="x"><sheets><sheet name="1_사업장" sheetId="1" r:id="rId1"/><sheet name="2_제품" sheetId="2" r:id="rId2"/></sheets></workbook>'),
  'xl/_rels/workbook.xml.rels': fflate.strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'),
  'xl/sharedStrings.xml': fflate.strToU8('<sst><si><t>보고기간 시작일 *</t></si><si><t>제품 이름 *</t></si><si><t>CN 코드 (8자리) *</t></si><si><r><t>STS </t></r><r><t>나사</t></r></si></sst>'),
  'xl/worksheets/sheet1.xml': fflate.strToU8('<worksheet><sheetData><row r="22"><c r="A22" t="s"><v>0</v></c><c r="B22" s="3"><v>45658</v></c></row></sheetData></worksheet>'),
  'xl/worksheets/sheet2.xml': fflate.strToU8('<worksheet><sheetData><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>2</v></c></row><row r="9"><c r="A9" t="s"><v>3</v></c><c r="B9"><v>73181552</v></c><c r="C9" s="6"/></row></sheetData></worksheet>'),
});
const reread = W.parseActivityWorkbook(resaved);
assert.equal(I.parseWorkbookDate(reread.installation.period_start), '2025-01-01');
assert.deepEqual(plain(reread.products), [{ row: 9, values: { name: 'STS 나사', cn: '73181552' } }]);
assert.ok(reread.notes.some((note) => note.includes('3_공정 시트가 없습니다')));

// ── 5) 새 매핑 없음 · 종전 서식 · 배선 ───────────────────────────────
const importSource = readFileSync('src/lib/activity-import.ts', 'utf8');
for (const builder of ['buildInstallationPayload', 'buildPeriodPayload', 'buildProductPayload', 'buildProcessCreation', 'buildElectricitySplitUpdates', 'buildElectricityUpdate', 'buildFuelSplitStreams', 'buildFuelStreamDraft', 'sumReconciledSourceStreamEmissions', 'fillEuDefault', 'buildPrecursorDraft', 'buildPrecursorCreate', 'buildImportedHeatUpdate']) {
  assert.ok(importSource.includes(`${builder}(`), `화면과 같은 빌더 ${builder}를 쓴다`);
}
assert.ok(!/createLocalItem|updateLocalItem|indexedDB/.test(importSource), '저장소는 호출부가 넘긴다(검사 스크립트가 같은 코드를 돌릴 수 있게)');
// 종전 서식 파일은 종전 경로로 계속 읽힌다.
const legacyBytes = await bytesOf(legacy.createActivityDataTemplateWorkbook());
assert.ok(!W.isActivityWorkbookV2(W.readActivityWorkbookSheetNames(legacyBytes)));
const page = readFileSync('src/app/upload/page.tsx', 'utf8');
assert.ok(page.includes('isActivityWorkbookV2(') && page.includes('parseActivityDataTemplate(file)') && page.includes('importActivityWorkbook('), '올리는 화면이 시트 이름으로 두 서식을 가려 각각의 경로로 보낸다');
assert.ok(page.includes('data-testid="activity-issues-alert"'), '넣지 못한 줄이 있으면 결과가 실제와 다를 수 있다고 말한다');
assert.ok(page.includes('createActivityWorkbook({') && page.includes('ACTIVITY_WORKBOOK_SAMPLE') && page.includes('describeActivityImportIssues('), '빈 서식·작성 예시 내려받기와 「확인할 것」 복사');
assert.ok(readFileSync('package.json', 'utf8').includes('"verify:activity-workbook"'));
// 시스템 경계 안내는 서식만의 것이 아니다 — 지도 4단계 · 질문 화면 · 연료 나누기가 같은 문장과 같은 판단(steel-boundary.ts)을 쓴다.
const boundaryLib = load('src/lib/steel-boundary.ts');
for (const [name, expected] of [['전기도금 라인 가스', true], ['태핑기 LPG', true], ['캡 용접', true], ['포장동 난방 등유', true], ['용융아연도금 가스', false], ['지오메트 코팅 건조로', false], ['열처리로 도시가스', false], ['지게차 경유', false], ['', false], [undefined, false]]) {
  assert.equal(boundaryLib.looksLikeExcludedStepFuel(name), expected, `경계 밖 설비의 연료로 보이는가: ${name}`);
}
assert.ok(boundaryLib.STEEL_BOUNDARY_NOTE.includes(boundaryLib.STEEL_BOUNDARY_ANCHOR) && /넣지 않습니다/.test(boundaryLib.STEEL_BOUNDARY_NOTE) && /용융아연도금의 연료는 넣습니다/.test(boundaryLib.STEEL_BOUNDARY_NOTE));
for (const file of ['src/components/guided/panels.tsx', 'src/components/talk/TalkWorkspace.tsx', 'src/components/guided/FuelSplit.tsx']) {
  const screen = readFileSync(file, 'utf8');
  assert.ok(screen.includes('{STEEL_BOUNDARY_NOTE}') && screen.includes('looksLikeExcludedStepFuel(') && screen.includes('{STEEL_BOUNDARY_NAME_WARNING}'), `${file}: 연료를 넣는 자리에 경계 안내와 이름 되묻기가 있다`);
}
assert.ok(importSource.includes("from './steel-boundary'") && !/EXCLUDED_STEP_FUEL/.test(importSource), '가져오기도 같은 판단을 쓴다(따로 두지 않는다)');

console.log('Activity workbook v2 verified (서식 모양·선택 목록 · 빈 서식 0건 · 작성 예시 = 기준선 3.764/5.112 · 공용 나누기·배출원 합계·생산라인 · 원료의 쓰는 제품·연료의 쓰는 공정 여럿·섞임 경고 · 「확인할 것」 · 종전 서식 유지).');
