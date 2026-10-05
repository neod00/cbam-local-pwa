// 앱 내장 EU 기준값 (2026-10-05) — 첫 사용자가 EU 엑셀을 올리지 않아도 「EU 기본값 채우기」가 된다.
//
// 잠그는 것:
//  1) 내장 JSON을 펼친 결과가 공식 워크북을 앱 파서로 읽은 결과와 같다(워크북이 이 컴퓨터에 있을 때) — 숫자가 어긋나면 안 된다.
//  2) 사용자가 올린 파일은 절대 덮지 않는다. 비었거나 내장본끼리 판이 바뀔 때만 넣는다.
//  3) 내장본은 .cbam 백업에 실리지 않는다(사용자가 올린 것은 실린다).
//  4) 배선: 앱 시작 로더, 서비스 워커 사전 캐시, 복원·삭제 뒤 재주입.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

const referenceSource = readFileSync('src/lib/reference-workbooks.ts', 'utf8')
  .replace("import { strFromU8, unzipSync } from 'fflate';", 'const { strFromU8, unzipSync } = fflate;')
  .replace(/^export /gm, '');
const bundledSource = readFileSync('src/lib/bundled-references.ts', 'utf8').replace(/^import type [\s\S]*?;\r?\n/gm, '').replace(/^export /gm, '');
const dbSource = readFileSync('src/lib/local-db.ts', 'utf8');
const isBundledSettingFn = dbSource.match(/export function isBundledReferenceSetting[\s\S]*?\n}\n/)?.[0];
assert.ok(isBundledSettingFn, 'local-db에 isBundledReferenceSetting이 있어야 한다');

const compiled = ts.transpileModule(
  `${referenceSource}\n${bundledSource}\n${isBundledSettingFn.replace(/^export /, '')}\nglobalThis.app = { parseBenchmarkWorkbook, parseDefaultValueWorkbook, findDefaultValueReference, resolveDefaultSeeForYear, findBenchmarkReference, expandBundledDefaultValues, expandBundledBenchmarks, shouldSeedBundledReference, isBundledReference, isBundledReferenceSetting };`,
  { compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 } }
).outputText;
const context = vm.createContext({ fflate, console, Date, Map, Number, Set, Uint8Array, Intl, navigator: undefined });
vm.runInContext(compiled, context);
const app = context.app;

const dvFile = JSON.parse(readFileSync('public/reference/cbam-default-values.json', 'utf8'));
const benchFile = JSON.parse(readFileSync('public/reference/cbam-benchmarks.json', 'utf8'));
const at = '2026-10-05T00:00:00.000Z';
const dv = app.expandBundledDefaultValues(dvFile, at);
const bench = app.expandBundledBenchmarks(benchFile, at);

// ── 내용 점검 ────────────────────────────────────────────────────────
assert.equal(dv.summary.origin, 'bundled');
assert.equal(bench.summary.origin, 'bundled');
assert.ok(dv.rows.length > 10000 && dv.summary.country_count > 100, `기본값은 전 세계 국가를 담아야 한다 (${dv.rows.length}행, ${dv.summary.country_count}개국)`);
assert.ok(bench.rows.length > 1500, `벤치마크 행 수 (${bench.rows.length})`);
assert.ok(dv.rows.every((row) => row.country && row.cn_code), '국가·CN 없는 행이 없다');
assert.ok(dv.summary.sample_rows.length > 0 && bench.summary.sample_rows.length > 0, '요약 표본이 있다');

// 대만 CN 7223 00 — 씨밤이 run11 P0-03에서 파일 10 / N/A / 2026 11이던 행. 내장본으로도 같은 결과여야 한다.
const taiwan = app.findDefaultValueReference(dv, 'Taiwan', '72230019', '2026');
assert.ok(taiwan, '대만 CN 72230019 기본값을 찾는다 — 국가가 빠지면 조용히 비어버린다');
const resolved = app.resolveDefaultSeeForYear(taiwan, '2026');
assert.equal(resolved.direct, 11, '간접 N/A → 직접 = 연도 총액(마크업 포함)');
assert.equal(resolved.indirect, 0);
assert.ok(app.findDefaultValueReference(dv, 'South Korea', '72139110', '2026'), '한국 CN 72139110');
assert.ok(app.findBenchmarkReference(bench, '72139110') || bench.rows.some((row) => row.cn_code.startsWith('7213')), '벤치마크에 철강 선재가 있다');

// ── 1) 공식 워크북과 같은가 (워크북이 있을 때) ────────────────────────
const dvWorkbook = 'CBAM_documents/DVs as adopted_v20260204 .xlsx';
const benchWorkbook = 'CBAM_documents/CBAM Benchmarks_20260206.xlsx';
const fileLike = (path) => {
  const bytes = readFileSync(path);
  return { name: basename(path), arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
};
const plain = (value) => JSON.parse(JSON.stringify(value));
if (existsSync(dvWorkbook) && existsSync(benchWorkbook)) {
  const parsedDv = await app.parseDefaultValueWorkbook(fileLike(dvWorkbook));
  assert.deepEqual(plain(dv.rows), plain(parsedDv.rows), '내장 기본값 = 공식 워크북을 앱 파서로 읽은 결과');
  assert.equal(dv.summary.filename, parsedDv.summary.filename);
  const parsedBench = await app.parseBenchmarkWorkbook(fileLike(benchWorkbook));
  assert.deepEqual(plain(bench.rows), plain(parsedBench.rows), '내장 벤치마크 = 공식 워크북을 앱 파서로 읽은 결과');
} else {
  console.log('(공식 워크북이 이 컴퓨터에 없어 원본 대조는 건너뜀 — 내용 점검만 수행)');
}

// ── 2) 덮어쓰기 규칙 ─────────────────────────────────────────────────
const userUpload = { summary: { filename: '내가 올린 DVs.xlsx' } };
const olderBundled = { summary: { origin: 'bundled', filename: 'DVs as adopted_v2025.xlsx' } };
const sameBundled = { summary: { origin: 'bundled', filename: dvFile.filename } };
assert.equal(app.shouldSeedBundledReference(undefined, dvFile.filename), true, '비어 있으면 넣는다');
assert.equal(app.shouldSeedBundledReference(userUpload, dvFile.filename), false, '사용자가 올린 파일은 절대 덮지 않는다');
assert.equal(app.shouldSeedBundledReference(olderBundled, dvFile.filename), true, '내장본끼리 판이 바뀌면 새 판으로 바꾼다');
assert.equal(app.shouldSeedBundledReference(sameBundled, dvFile.filename), false, '같은 판이면 다시 쓰지 않는다');
assert.equal(app.shouldSeedBundledReference({}, dvFile.filename), true, 'summary 없는 빈 껍데기는 비어 있는 것으로 본다');

// ── 3) 백업 제외 ─────────────────────────────────────────────────────
assert.equal(app.isBundledReferenceSetting({ key: 'reference:default-values', value: dv }), true, '내장본은 백업에서 뺀다');
assert.equal(app.isBundledReferenceSetting({ key: 'reference:default-values', value: userUpload }), false, '사용자가 올린 기준값은 백업에 싣는다');
assert.equal(app.isBundledReferenceSetting({ key: 'scenario:assumptions', value: { summary: { origin: 'bundled' } } }), false, '다른 설정은 건드리지 않는다');
assert.match(dbSource, /settings: \(await listLocalItems\("settings"\)\)\.filter\(\(setting\) => !isBundledReferenceSetting\(setting\)\)/, 'exportLocalBackup이 거른다');

// ── 4) 배선 ──────────────────────────────────────────────────────────
const layout = readFileSync('src/app/layout.tsx', 'utf8');
assert.match(layout, /<BundledReferenceLoader \/>/, '앱 시작 때 내장 기준값을 넣는다');
const worker = readFileSync('public/sw.js', 'utf8');
assert.ok(worker.includes('"/reference/cbam-default-values.json"') && worker.includes('"/reference/cbam-benchmarks.json"'), '오프라인 첫 실행을 위해 서비스 워커가 미리 받아 둔다');
const settingsPage = readFileSync('src/app/settings/page.tsx', 'utf8');
assert.equal((settingsPage.match(/ensureBundledReferences\(true\)/g) ?? []).length, 2, '백업 복원과 전체 삭제 뒤에 다시 넣는다');
const upload = readFileSync('src/app/upload/page.tsx', 'utf8');
assert.match(upload, /앱 내장 EU 공표본/, '업로드 화면이 내장본임을 알린다');
assert.match(upload, /가져온 파일이 언제나 우선합니다/);

console.log(`Bundled EU references verified (${dv.rows.length} default-value rows · ${dv.summary.country_count} countries · ${bench.rows.length} benchmark rows).`);
