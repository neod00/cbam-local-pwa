// run35 — 씨밤이(컨설턴트)가 채운 값을 진짜 Excel에 칠 목록으로 바꾸고(make), Excel이 저장한 파일을 앱의 코드로 넣어 본다(read).
// 저장소 루트에서:
//   node cbamy/runs/2026-10-10_run35-jinhap-workbook/workbook-tools.mjs make <fill.json> <outDir>
//   node cbamy/runs/2026-10-10_run35-jinhap-workbook/workbook-tools.mjs read <filled.xlsx>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

const fflate = createRequire(import.meta.url)('fflate');
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
const W = load('src/lib/activity-workbook.ts');
const I = load('src/lib/activity-import.ts');
const engine = load('src/lib/calculation-engine.ts');
const attributionLib = load('src/lib/attribution-status.ts');
const exportLib = load('src/lib/eu-template-export.ts');
const defaultValues = load('src/lib/bundled-references.ts').expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-10T00:00:00.000Z');
const countries = [...new Set(defaultValues.rows.map((row) => row.country))];

const TABLES = [
  [W.SHEET_PRODUCTS, W.PRODUCT_COLUMNS, 'products'], [W.SHEET_PARTS, W.PART_COLUMNS, 'parts'], [W.SHEET_PROCESSES, W.PROCESS_COLUMNS, 'processes'],
  [W.SHEET_FUELS, W.FUEL_COLUMNS, 'fuels'], [W.SHEET_PRECURSORS, W.PRECURSOR_COLUMNS, 'precursors'], [W.SHEET_RNR, W.RNR_COLUMNS, 'rnr'], [W.SHEET_EVIDENCE, W.EVIDENCE_COLUMNS, 'evidence'],
  [W.SHEET_IMPORTED_HEAT, W.IMPORTED_HEAT_COLUMNS, 'importedHeat'], [W.SHEET_BOILER_HEAT, W.BOILER_HEAT_COLUMNS, 'boilerHeat'], [W.SHEET_PROCESS_EMISSIONS, W.PROCESS_EMISSION_COLUMNS, 'processEmissions'], [W.SHEET_TRANSFERS, W.TRANSFER_COLUMNS, 'transfers'],
];
const letter = (index) => (index < 26 ? String.fromCharCode(65 + index) : `A${String.fromCharCode(65 + index - 26)}`);

const [mode, first, second] = process.argv.slice(2);
if (mode === 'make') {
  const fill = JSON.parse(readFileSync(first, 'utf8'));
  writeFileSync(path.join(second, 'blank.xlsx'), Buffer.from(await W.createActivityWorkbook({ countries }).arrayBuffer()));
  const cells = [];
  let row = 2;
  for (const item of W.INSTALLATION_FORM) {
    row += 1;
    if (!('section' in item) && fill.installation?.[item.key] !== undefined) cells.push([W.SHEET_INSTALLATION, `B${row}`, fill.installation[item.key]]);
  }
  for (const [sheet, columns, key] of TABLES) {
    (fill[key] ?? []).forEach((values, index) => columns.forEach((field, column) => { if (values[field.key] !== undefined && values[field.key] !== '') cells.push([sheet, `${letter(column)}${5 + index}`, values[field.key]]); }));
  }
  writeFileSync(path.join(second, 'cells.json'), JSON.stringify(cells));
  console.log('blank.xlsx + cells.json', cells.length, '칸');
} else {
  const data = W.parseActivityWorkbook(new Uint8Array(readFileSync(first)));
  const store = { installations: [], periods: [], products: [], processes: [], product_output_lines: [], source_streams: [], precursors: [], internal_transfers: [] };
  let report;
  let n = 0;
  const api = {
    list: async (name) => [...store[name]],
    create: async (name, item) => { const entity = { ...item, id: `${name}_${n += 1}`, created_at: 't', updated_at: 't' }; store[name].push(entity); return entity; },
    update: async (name, item) => { store[name] = store[name].map((entry) => (entry.id === item.id ? item : entry)); return item; },
  };
  const result = await I.importActivityWorkbook(data, { store: api, defaultValues, reportInputs: { get: async () => report, set: async (value) => { report = value; } } });
  console.log('읽은 줄', JSON.stringify({ 사업장: Object.keys(data.installation).length, 제품: data.products.length, 품번: data.parts.length, 공정: data.processes.length, 연료: data.fuels.length, 구매강재: data.precursors.length, 역할: data.rnr.length, 증빙: data.evidence.length, 보일러열: data.boilerHeat.length }));
  console.log('넣은 것', JSON.stringify(result.created));
  console.log('── 확인할 것', result.issues.length, '건');
  console.log(I.describeActivityImportIssues(result.issues));
  const records = { internalTransfers: store.internal_transfers, products: store.products, periods: store.periods, processes: store.processes, productOutputLines: store.product_output_lines, sourceStreams: store.source_streams, precursors: store.precursors };
  const results = engine.calculateLocalResults(records);
  console.log('── 공정');
  for (const process of store.processes) console.log(`  ${process.name}: 생산 ${process.output_mass_t} t · 직접 ${process.direct_attributable_emissions_tco2e.toFixed(1)} tCO2e · 전력 ${process.electricity_mwh.toFixed(1)} MWh · 열 ${(process.heat_consumption ?? []).map((item) => `${item.quantity} ${item.unit}`).join(', ') || '-'}`);
  console.log('── 제품별 SEE (기준 = 직접 + 구매 강재 직접)');
  for (const item of results.filter((entry) => entry.output_mass_t > 0)) console.log(`  ${item.product_name.padEnd(34)} ${String(item.output_mass_t).padStart(7)} t  기준 ${item.see_cbam_basis === null ? '(비신고)' : item.see_cbam_basis.toFixed(4)}  직접+전구 ${item.see_direct_incl_precursor.toFixed(4)}  총 ${item.total_see.toFixed(4)}  ${item.is_cbam_reportable ? '신고' : '비신고'}`);
  const attribution = attributionLib.buildAttributionStatus({ processes: store.processes, productOutputLines: store.product_output_lines, sourceStreams: store.source_streams, precursorCount: store.precursors.length, results, installation: store.installations[0], hrefOf: engine.getLocalCalculationWarningHref });
  console.log('── 귀속·할당 점검', JSON.stringify(attribution.counts));
  for (const row of attribution.rows.filter((entry) => entry.status !== 'ok')) console.log(`  ${row.status} ${row.code} ${row.title} — ${(row.items[0] ?? row.detail).slice(0, 200)}`);
  const readiness = exportLib.evaluateEuExportReadiness({ installations: store.installations, ...records, reportingPeriodId: undefined });
  console.log('── EU 문서 준비도: 오류', readiness.errorCount, '· 경고', readiness.warningCount);
  for (const issue of readiness.issues.filter((entry) => entry.severity === 'error')) console.log(`  오류 — ${issue.message.slice(0, 220)}`);
  const warnings = [...new Set(results.flatMap((item) => item.warnings))];
  console.log('── 엔진 경고', warnings.length, '건');
  for (const warning of warnings.slice(0, 12)) console.log(`  ${warning.slice(0, 200)}`);
  if (report) console.log('── 보고서 입력', JSON.stringify({ 부문파라미터: (report.sector_parameters ?? []).length, 전력근거: (report.electricity_ef_meta ?? []).length, 탄소가격: (report.carbon_price ?? []).map((item) => item.applicable), 역할: (report.rnr ?? []).length, 증빙: (report.evidence ?? []).length, 서명: report.declaration?.name ?? null }));
  if (second) writeFileSync(second, JSON.stringify({ ...store, report }, null, 1));
}
