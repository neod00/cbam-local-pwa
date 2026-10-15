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

// 대만 CN 7223 00 — 종전 판(v20260204)은 직접 10 / N/A / 2026년 11이었다(씨밤이 run11 P0-03). 정정판(2026/1740)은 이 칸이 「-」다.
// 규정(2025/2621 부속서 I 서문)은 「나라가 명시되어 있어도 값이 없으면 「기타 국가·지역」 값」을 쓰게 한다 → 4.82, 2026년 마크업 10% 포함 5.302.
const taiwan = app.findDefaultValueReference(dv, 'Taiwan', '72230019', '2026');
assert.ok(taiwan, '대만 CN 72230019 기본값을 찾는다 — 값이 「-」면 기타 국가 값으로 돌아간다(조용히 비어버리지 않는다)');
assert.match(taiwan.country, /Other Countries and Territories/, '대만 7223 00은 정정판에서 「-」라 기타 국가·지역의 값');
const resolved = app.resolveDefaultSeeForYear(taiwan, '2026');
assert.ok(Math.abs(resolved.direct - 5.302) < 1e-9, `간접 N/A → 직접 = 연도 총액(마크업 포함): ${resolved.direct}`);
assert.equal(resolved.indirect, 0);
// 나라가 워크북에 아예 없으면(철자 실수일 수 있다) 기타 국가로 조용히 넘어가지 않는다
assert.equal(app.findDefaultValueReference(dv, 'Narnia', '72230019', '2026'), undefined, '없는 나라는 못 찾음으로 남긴다');
// 정정판은 마크업 열이 없다 — 마크업 포함 값은 총 배출 기본값 × (1 + 법정 비율)이다
const korean = app.findDefaultValueReference(dv, 'South Korea', '722020', '2026');
assert.ok(korean && Math.abs(korean.total_default - 3.65) < 1e-9 && Math.abs(korean.markup_2026 - 4.015) < 1e-9 && Math.abs(korean.markup_2027 - 4.38) < 1e-9 && Math.abs(korean.markup_2028_onwards - 4.745) < 1e-9, '한국 722020: 총 3.65 → 2026 4.015 · 2027 4.38 · 2028 4.745 (10/20/30%)');
assert.ok(dv.rows.some((row) => row.country === 'South Korea') && !dv.rows.some((row) => /Korea, Republic/.test(row.country)), '한국은 앱의 이름(South Korea) 하나');
assert.ok(dv.rows.some((row) => row.country === 'Myanmar_Burma') && dv.rows.some((row) => row.country === 'Russia'), '정정판의 새 이름을 앱의 이름으로 맞춘다');
assert.ok(app.findDefaultValueReference(dv, 'South Korea', '72139110', '2026'), '한국 CN 72139110');
assert.ok(app.findBenchmarkReference(bench, '72139110') || bench.rows.some((row) => row.cn_code.startsWith('7213')), '벤치마크에 철강 선재가 있다');

// ── 1) 공식 워크북과 같은가 (워크북이 있을 때) ────────────────────────
const dvWorkbook = 'CBAM_documents/DV correcting act_final update_06.08.xlsx';
const dvWorkbookBefore = 'CBAM_documents/DVs as adopted_v20260204 .xlsx';
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
// 종전 판 워크북도 같은 파서로 읽힌다(사용자가 예전 파일을 올려도 깨지지 않는다) — 국가 이름과 마크업이 정정판과 같은 모양이다.
if (existsSync(dvWorkbookBefore)) {
  const before = await app.parseDefaultValueWorkbook(fileLike(dvWorkbookBefore));
  assert.ok(before.rows.length > 10000, '종전 판도 읽는다');
  const koreaBefore = before.rows.find((row) => row.country === 'South Korea' && row.cn_code === '722020');
  assert.ok(koreaBefore && Math.abs(koreaBefore.total_default - 3.65) < 1e-9 && Math.abs(koreaBefore.markup_2026 - 4.015) < 1e-9, '종전 판의 한국 722020도 3.65 / 4.015 — 두 판이 같은 값');
  assert.ok(before.rows.some((row) => row.country === 'Myanmar_Burma'), '종전 판의 시트 이름(Myanmar_Burma)을 지킨다');
}

// ── 1b) 정정판의 새 모양을 합성 워크북으로 잠근다(원본 파일이 없는 컴퓨터에서도 돈다) ──
{
  const xml = (rows) => `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows.map((cells, index) => `<row r="${index + 1}">${cells.map((text, column) => `<c r="${String.fromCharCode(65 + column)}${index + 1}" t="inlineStr"><is><t>${text}</t></is></c>`).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const header = ['Product CN Code / TARIC Code', 'Description', 'Default Value (direct emissions) (tCO2eq/tonne of good)', 'Default Value (indirect emissions) (tCO2eq/tonne of good)', 'Default Value (total emissions) (tCO2eq/tonne of good)', 'Underlying production route determining CBAM BM'];
  const country = (title, body) => xml([[title, '', '', '', '', ''], header, ...body]);
  const sheets = [
    ['Overview', xml([['Disclaimer']])],
    ['Korea, Republic of (South Korea', country('Korea, Republic of (South Korea)', [
      ['Cement', '', '', '', '', ''],
      ['2523 10 00 10', 'White clinker', '1,190', '0,040', '1,230', '(B)'],
      ['2523 10 00 90', 'Other clinker including grey clinker', '0,880', '0,030', '0,920', '(A)'],
      ['Fertilisers', '', '', '', '', ''],
      ['3102 10 12', 'Urea', '1,000', '0,100', '1,100', ''],
      ['Iron and steel', '', '', '', '', ''],
      ['7217', 'Wire of iron or non-alloy steel, in coils', 'see below', 'see below', 'see below', ''],
      ['7217 10', 'Wire, not plated or coated', '2,118', 'N/A', '2,118', '(C)'],
      ['7223 00', 'Wire of stainless steel', '-', 'N/A', '-', ''],
    ])],
    ['Taiwan', country('Taiwan', [['Iron and steel', '', '', '', '', ''], ['7223 00', 'Wire of stainless steel', '-', 'N/A', '-', '']])],
    ['_Other Countries and Territorie', country('Other Countries and Territories', [['Iron and steel', '', '', '', '', ''], ['7223 00', 'Wire of stainless steel', '4,820', 'N/A', '4,820', '']])],
    ['Annex IV', xml([['Annex IV'], ['Product CN Code / TARIC Code', 'Description', 'Highest default value', 'Underlying production route determining CBAM BM'], ['Iron and steel'], ['7217 10', 'Wire', '2,300', '(C)']])],
  ];
  const files = {
    '[Content_Types].xml': fflate.strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'xl/workbook.xml': fflate.strToU8(`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map(([name], index) => `<sheet name="${name}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`),
  };
  sheets.forEach(([, content], index) => { files[`xl/worksheets/sheet${index + 1}.xml`] = fflate.strToU8(content); });
  const bytes = fflate.zipSync(files);
  const synthetic = await app.parseDefaultValueWorkbook({ name: 'synthetic-corrected.xlsx', arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  const row = (countryName, cn) => synthetic.rows.find((item) => item.country === countryName && item.cn_code === cn);
  assert.ok(row('South Korea', '7217') === undefined, '「see below」 분류 행은 값이 아니다');
  const wire = row('South Korea', '721710');
  assert.ok(wire && wire.total_default === 2.118 && wire.indirect_default === undefined && wire.production_route === '(C)', '쉼표 소수점 · N/A는 간접 없음 · 경로');
  assert.ok(Math.abs(wire.markup_2026 - 2.3298) < 1e-9 && Math.abs(wire.markup_2027 - 2.5416) < 1e-9 && Math.abs(wire.markup_2028_onwards - 2.7534) < 1e-9, '철강 마크업 10/20/30%');
  const urea = row('South Korea', '31021012');
  assert.ok(urea && Math.abs(urea.markup_2026 - 1.111) < 1e-9 && Math.abs(urea.markup_2028_onwards - 1.111) < 1e-9, '비료 마크업은 1% 한 가지');
  assert.ok(row('South Korea', '25231000') && synthetic.rows.filter((item) => item.country === 'South Korea' && item.cn_code === '25231000').length === 2, '10자리 TARIC은 8자리로, 흰/회색 클링커 두 행');
  assert.equal(row('South Korea', '722300'), undefined, '값이 「-」인 행은 넣지 않는다');
  assert.equal(row('Taiwan', '722300'), undefined);
  assert.ok(row('_Other Countries and Territories', '722300'), '「기타 국가·지역」 시트');
  assert.ok(!synthetic.rows.some((item) => item.country === 'Annex IV' || item.country === 'Overview'), 'Annex IV·개요는 국가 시트가 아니다');
  const lookup = app.findDefaultValueReference(synthetic, 'Taiwan', '72230019', '2026');
  assert.ok(lookup && /Other Countries/.test(lookup.country) && Math.abs(lookup.markup_2026 - 5.302) < 1e-9, '값이 없는 나라는 기타 국가·지역으로');
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
