// EU 공식 기준값(기본값 DV · 벤치마크) 워크북을 앱에 내장할 JSON으로 변환한다.
//
// 사용: npm run generate:bundled-references -- "<DVs as adopted_*.xlsx>" "<CBAM Benchmarks_*.xlsx>"
// 결과: public/reference/cbam-default-values.json, public/reference/cbam-benchmarks.json
//
// 파서는 앱이 쓰는 src/lib/reference-workbooks.ts 그대로 쓴다 — 사용자가 같은 파일을 올렸을 때와 숫자가 다를 수 없다.
// 저장 형식만 작게 줄인다(설명 문구는 CN당 한 번, 행은 배열). 읽는 쪽은 src/lib/bundled-references.ts.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

const [dvPath, benchmarkPath] = process.argv.slice(2);
if (!dvPath || !benchmarkPath) {
  console.error('Usage: npm run generate:bundled-references -- "<DVs as adopted_*.xlsx>" "<CBAM Benchmarks_*.xlsx>"');
  process.exit(1);
}

const source = readFileSync('src/lib/reference-workbooks.ts', 'utf8')
  .replace("import { strFromU8, unzipSync } from 'fflate';", 'const { strFromU8, unzipSync } = fflate;')
  .replace(/^export /gm, '');
const compiled = ts.transpileModule(`${source}\nglobalThis.ref = { parseBenchmarkWorkbook, parseDefaultValueWorkbook };`, {
  compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
}).outputText;
const context = vm.createContext({ fflate, console, Date, Map, Number, Set, Uint8Array });
vm.runInContext(compiled, context);
const { parseBenchmarkWorkbook, parseDefaultValueWorkbook } = context.ref;

const fileLike = (path) => {
  const bytes = readFileSync(path);
  return { name: basename(path), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};

const index = (list) => new Map(list.map((value, i) => [value, i]));

const dv = await parseDefaultValueWorkbook(fileLike(dvPath));
const countries = [...new Set(dv.rows.map((row) => row.country))];
const countryIndex = index(countries);
const routes = [...new Set(dv.rows.map((row) => row.production_route))];
const routeIndex = index(routes);
const dvDescriptions = {};
for (const row of dv.rows) {
  dvDescriptions[row.cn_code] ??= row.description;
}
const dvFile = {
  format: 1,
  kind: 'default-values',
  filename: dv.summary.filename,
  sheet_names: dv.summary.sheet_names,
  countries,
  routes,
  descriptions: dvDescriptions,
  // [국가 idx, CN, 직접, 간접, 총, 2026, 2027, 2028~, 경로 idx, 설명이 CN 공용 설명과 다르면 그 설명]
  rows: dv.rows.map((row) => {
    const tuple = [countryIndex.get(row.country), row.cn_code, row.direct_default ?? null, row.indirect_default ?? null, row.total_default ?? null, row.markup_2026 ?? null, row.markup_2027 ?? null, row.markup_2028_onwards ?? null, routeIndex.get(row.production_route)];
    if (row.description !== dvDescriptions[row.cn_code]) {
      tuple.push(row.description);
    }
    return tuple;
  }),
};

const bench = await parseBenchmarkWorkbook(fileLike(benchmarkPath));
const benchFile = {
  format: 1,
  kind: 'benchmarks',
  filename: bench.summary.filename,
  sheet_names: bench.summary.sheet_names,
  // [CN, 설명, A값, A경로, B값, B경로]
  rows: bench.rows.map((row) => [row.cn_code, row.description, row.column_a_benchmark ?? null, row.column_a_route, row.column_b_benchmark ?? null, row.column_b_route]),
};

mkdirSync('public/reference', { recursive: true });
writeFileSync('public/reference/cbam-default-values.json', `${JSON.stringify(dvFile)}\n`);
writeFileSync('public/reference/cbam-benchmarks.json', `${JSON.stringify(benchFile)}\n`);
console.log(`default values: ${dv.rows.length} rows, ${countries.length} countries / benchmarks: ${bench.rows.length} rows`);
