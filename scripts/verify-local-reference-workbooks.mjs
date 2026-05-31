import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

function usage() {
  console.error('Usage: npm run verify:local-references -- "<CBAMBenchmarks.xlsx>" "<DVsasadopted.xlsx>"');
  process.exit(1);
}

function loadReferenceWorkbookModule() {
  const source = readFileSync('src/lib/reference-workbooks.ts', 'utf8')
    .replace(
      "import { strFromU8, unzipSync } from 'fflate';",
      'const { strFromU8, unzipSync } = fflate;'
    )
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${source}
globalThis.referenceWorkbooks = {
  parseBenchmarkWorkbook,
  parseDefaultValueWorkbook,
  findBenchmarkReference,
  findDefaultValueReference,
  getDefaultValueTotalForYear,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({ fflate, console, Date, Map, Number, Set, Uint8Array });
  vm.runInContext(compiled, context);
  return context.referenceWorkbooks;
}

function createFileLike(path) {
  const bytes = readFileSync(path);

  return {
    name: basename(path),
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
  };
}

const [benchmarkPath, defaultValuePath] = process.argv.slice(2);

if (!benchmarkPath || !defaultValuePath) {
  usage();
}

const referenceWorkbooks = loadReferenceWorkbookModule();
const benchmarkReference = await referenceWorkbooks.parseBenchmarkWorkbook(createFileLike(benchmarkPath));
const defaultValueReference = await referenceWorkbooks.parseDefaultValueWorkbook(createFileLike(defaultValuePath));

assert.ok(benchmarkReference.summary.row_count > 0, 'benchmark workbook should contain benchmark rows');
assert.ok(benchmarkReference.summary.cn_code_count > 0, 'benchmark workbook should contain CN codes');
assert.ok(defaultValueReference.summary.row_count > 0, 'default-value workbook should contain default-value rows');
assert.ok(defaultValueReference.summary.country_count > 0, 'default-value workbook should contain country sheets');

const sampleBenchmark = referenceWorkbooks.findBenchmarkReference(benchmarkReference, benchmarkReference.rows[0].cn_code);
assert.ok(sampleBenchmark, 'benchmark lookup should find the first parsed CN code');

const southKoreaRow = defaultValueReference.rows.find((row) => row.country === 'South Korea') ?? defaultValueReference.rows[0];
const sampleDefault = referenceWorkbooks.findDefaultValueReference(
  defaultValueReference,
  southKoreaRow.country,
  southKoreaRow.cn_code,
  '2026'
);
assert.ok(sampleDefault, 'default-value lookup should find a parsed country/CN row');
assert.ok(
  referenceWorkbooks.getDefaultValueTotalForYear(sampleDefault, '2026') !== undefined,
  'default-value lookup should return a 2026 total or markup value'
);

console.log('Local reference workbook verification passed.');
console.log(JSON.stringify({
  benchmark: {
    file: benchmarkReference.summary.filename,
    sheets: benchmarkReference.summary.sheet_names.length,
    rows: benchmarkReference.summary.row_count,
    cnCodes: benchmarkReference.summary.cn_code_count,
    sample: benchmarkReference.summary.sample_rows[0],
  },
  defaultValues: {
    file: defaultValueReference.summary.filename,
    sheets: defaultValueReference.summary.sheet_names.length,
    rows: defaultValueReference.summary.row_count,
    cnCodes: defaultValueReference.summary.cn_code_count,
    countries: defaultValueReference.summary.country_count,
    sample: defaultValueReference.summary.sample_rows[0],
  },
}, null, 2));

