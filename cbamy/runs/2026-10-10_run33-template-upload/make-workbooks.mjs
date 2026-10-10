// run33 — 새 서식(v2)의 빈 파일·작성 예시를 만들고, 엑셀이 채워 저장한 파일을 앱의 코드로 다시 읽어 본다.
// 저장소 루트에서:  node cbamy/runs/2026-10-10_run33-template-upload/make-workbooks.mjs make <outDir>
//                  node cbamy/runs/2026-10-10_run33-template-upload/make-workbooks.mjs read <file.xlsx>
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
  vm.runInNewContext(`(function (exports, require, module) {${code}\n})`, { Blob, Intl, Uint8Array, console, Date, navigator: undefined })(loaded.exports, requireFrom, loaded);
  return loaded.exports;
}
const W = load('src/lib/activity-workbook.ts');
const I = load('src/lib/activity-import.ts');
const engine = load('src/lib/calculation-engine.ts');
const defaultValues = load('src/lib/bundled-references.ts').expandBundledDefaultValues(JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8')), '2026-10-10T00:00:00.000Z');
const countries = [...new Set(defaultValues.rows.map((row) => row.country))];

const [mode, target] = process.argv.slice(2);
if (mode === 'make') {
  const write = async (name, fill) => writeFileSync(path.join(target, name), Buffer.from(await W.createActivityWorkbook({ countries, fill }).arrayBuffer()));
  await write('blank.xlsx');
  await write('sample.xlsx', W.ACTIVITY_WORKBOOK_SAMPLE);
  // 엑셀에 사람이 치듯 넣을 값: [시트, 셀, 값]. 사업장은 B열, 표는 5번째 줄부터.
  const cells = [];
  // 셋째 인자로 채울 값(JSON)을 주면 작성 예시 대신 그 값을 엑셀에 칠 값으로 쓴다(예: EU 공식 예제).
  const sample = process.argv[4] ? JSON.parse(readFileSync(process.argv[4], 'utf8')) : W.ACTIVITY_WORKBOOK_SAMPLE;
  let row = 2;
  for (const item of W.INSTALLATION_FORM) {
    row += 1;
    if (!('section' in item) && sample.installation[item.key] !== undefined) cells.push([W.SHEET_INSTALLATION, `B${row}`, sample.installation[item.key]]);
  }
  const letter = (index) => String.fromCharCode(65 + index);
  for (const [sheet, columns, rows] of [[W.SHEET_PRODUCTS, W.PRODUCT_COLUMNS, sample.products], [W.SHEET_PROCESSES, W.PROCESS_COLUMNS, sample.processes], [W.SHEET_FUELS, W.FUEL_COLUMNS, sample.fuels], [W.SHEET_PRECURSORS, W.PRECURSOR_COLUMNS, sample.precursors]]) {
    rows.forEach((values, index) => columns.forEach((field, column) => { if (values[field.key] !== undefined) cells.push([sheet, `${letter(column)}${5 + index}`, values[field.key]]); }));
  }
  writeFileSync(path.join(target, 'cells.json'), JSON.stringify(cells));
  console.log('made blank.xlsx, sample.xlsx, cells.json', cells.length);
} else {
  const data = W.parseActivityWorkbook(new Uint8Array(readFileSync(target)));
  const store = { data: { installations: [], periods: [], products: [], processes: [], product_output_lines: [], source_streams: [], precursors: [] }, n: 0 };
  const api = {
    list: async (name) => [...store.data[name]],
    create: async (name, item) => { const entity = { ...item, id: `${name}_${store.n += 1}`, created_at: 't', updated_at: 't' }; store.data[name].push(entity); return entity; },
    update: async (name, item) => { store.data[name] = store.data[name].map((entry) => (entry.id === item.id ? item : entry)); return item; },
  };
  const result = await I.importActivityWorkbook(data, { store: api, defaultValues });
  console.log('읽은 줄', JSON.stringify({ installation: Object.keys(data.installation).length, products: data.products.length, processes: data.processes.length, fuels: data.fuels.length, precursors: data.precursors.length, notes: data.notes }));
  console.log('보고기간 칸', data.installation.period_start, data.installation.period_end, '· 넣은 것', JSON.stringify(result.created));
  console.log(I.describeActivityImportIssues(result.issues));
  const results = engine.calculateLocalResults({ internalTransfers: [], products: store.data.products, periods: store.data.periods, processes: store.data.processes, productOutputLines: store.data.product_output_lines, sourceStreams: store.data.source_streams, precursors: store.data.precursors });
  for (const item of results.filter((entry) => entry.is_cbam_reportable && entry.see_cbam_basis !== null)) console.log(`SEE ${item.product_name}: 기준 ${item.see_cbam_basis.toFixed(4)} · 총 ${item.total_see.toFixed(4)}`);
}
