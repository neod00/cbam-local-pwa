// 파일 이름의 날짜 — 한 번에 내려받는 문서들이 같은 날짜(현지 시간)를 단다(씨밤이 run40 P2-01).
// 종전: 산정보고서·패키지·EU 엑셀·백업은 UTC, 모니터링 계획은 현지 — 한국 시간 새벽에 같은 시점의 문서가 하루 어긋났다.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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

const stamp = load('src/lib/file-stamp.ts');
// 현지 시각 2026-10-17 01:46:02 — 한국(UTC+9)이면 UTC로는 전날 16:46이다. 어느 시간대에서 돌려도 현지 값이 나와야 한다.
const early = new Date(2026, 9, 17, 1, 46, 2);
assert.equal(stamp.localDateStamp(early), '20261017');
assert.equal(stamp.localDateTimeStamp(early), '20261017014602');
assert.equal(stamp.localIsoDate(early), '2026-10-17');
assert.equal(stamp.localDateStamp(new Date(2027, 0, 5, 23, 59, 59)), '20270105', '자정 직전도 그날');

// 같은 시점에 만든 문서들의 파일 이름이 같은 날짜를 단다
const report = load('src/lib/calculation-report.ts').createCalculationReportFilename(early);
const plan = load('src/lib/monitoring-plan.ts').createMonitoringPlanFilename(early);
const request = load('src/lib/supplier-request.ts').supplierRequestFilename({ supplierName: '가상 선재사', country: 'Japan', items: [] }, early);
assert.equal(report, 'CBAM_Calculation_Report_20261017.docx');
assert.equal(plan, 'CBAM_Monitoring_Plan_Draft_20261017.docx');
assert.equal(request, 'CBAM_data_request_가상_선재사_2026-10-17.docx');
const exportName = load('src/lib/eu-template-export.ts').createEuExportFilename('CBAM template.xlsx');
assert.match(exportName, /^CBAM template_cbam-local-copy_\d{8}\.xlsx$/);
assert.equal(exportName.match(/_(\d{8})\.xlsx$/)[1], stamp.localDateStamp(new Date()), 'EU 엑셀도 현지 오늘');

// 파일 이름을 만드는 곳에 UTC 날짜가 남아 있지 않다
for (const [file, label] of [
  ['src/lib/calculation-report.ts', '산정보고서 파일명'], ['src/lib/delivery-package.ts', '패키지 스탬프'], ['src/lib/eu-template-export.ts', 'EU 엑셀 파일명'],
  ['src/components/submit/submit-actions.ts', '제출 화면 백업 파일명'], ['src/app/settings/page.tsx', '설정 백업 파일명'], ['src/lib/supplier-request.ts', '요청서 파일명'], ['src/lib/monitoring-plan.ts', '모니터링 계획'],
]) {
  const source = readFileSync(file, 'utf8');
  assert.ok(!/stamp = new Date\(\)\.toISOString\(\)/.test(source), `${label}: UTC 스탬프`);
  assert.ok(!/timestamp = new Date\(\)\.toISOString\(\)/.test(source), `${label}: UTC 날짜`);
  assert.ok(!/Filename[^\n]*\n[^\n]*toISOString\(\)\.slice\(0, 10\)/.test(source), `${label}: UTC 날짜`);
  assert.ok(!/function formatStamp\(date: Date\) \{\s*return date\.toISOString/.test(source), `${label}: UTC 스탬프`);
}
assert.match(readFileSync('src/lib/delivery-package.ts', 'utf8'), /return localDateTimeStamp\(date\)/);
assert.match(readFileSync('src/components/submit/submit-actions.ts', 'utf8'), /localDateTimeStamp\(new Date\(\)\)/);

console.log('File stamp verified (현지 시간 · 보고서·모니터링 계획·요청서·EU 엑셀이 같은 날짜 · UTC 스탬프 없음).');
