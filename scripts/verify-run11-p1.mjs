// 씨밤이 run11 P1 회귀 게이트 — 순수 함수 3종과 화면 문안.
//   · isVintageMismatch        (P1-18) 같은 기간을 「불일치」로 오탐하지 않는다
//   · resolveElectricityEfBasis (P1-20) 5단계에서 고른 계수 출처를 제7장 산정근거로 잇는다
//   · deriveGuidedSteps         (P1-12) 전구물질이 기대되는데 없으면 「완료 · 생성」이 아니다
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function compile(source, exportsList) {
  const out = ts.transpileModule(`${source}\nglobalThis.__mod = { ${exportsList.join(', ')} };`, {
    compilerOptions: { module: ts.ModuleKind.None, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = vm.createContext({ Intl, Math, Number, JSON, Object, Array, Set, Map, Boolean, String });
  vm.runInContext(out, context);
  return context.__mod;
}

function sliceFunction(source, marker) {
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${marker} 를 찾지 못했다`);
  const end = source.indexOf('\n}\n', start);
  return source.slice(start, end + 3).replace(/^export /gm, '');
}

// ── P1-18 ─────────────────────────────────────────────────────────────
const reportSource = readFileSync('src/lib/calculation-report.ts', 'utf8');
const { isVintageMismatch } = compile(sliceFunction(reportSource, 'export function isVintageMismatch('), ['isVintageMismatch']);
const period2025 = { name: '2025년 연간', start_date: '2025-01-01', end_date: '2025-12-31' };
assert.equal(isVintageMismatch('2025-01-01 ~ 2025-12-31', period2025), false, '같은 기간을 불일치로 오탐한다 (run11 P1-18)');
assert.equal(isVintageMismatch('2025년 연간', period2025), false);
assert.equal(isVintageMismatch('2025', period2025), false);
assert.equal(isVintageMismatch('2024-01-01 ~ 2024-12-31', period2025), true, '다른 연도 자료는 불일치로 잡아야 한다');
assert.equal(isVintageMismatch('2024~2025', period2025), true, '기간 밖 연도가 섞이면 불일치다');
assert.equal(isVintageMismatch('', period2025), false);
assert.equal(isVintageMismatch(undefined, period2025), false);
assert.equal(isVintageMismatch('FY 회계연도', period2025), true, '연도를 읽을 수 없으면 이름 비교로 돌아간다');
assert.equal((reportSource.match(/isVintageMismatch\(vintage, period\)/g) ?? []).length, 2, '보고서의 두 자리(8.2·14장)가 모두 공용 판정을 써야 한다');
assert.doesNotMatch(reportSource, /vintage !== period\.name/, '기간 이름 문자열 비교가 되살아났다');
assert.match(reportSource, /본 산정 적용값 — 공식 기본값 \(채택\)/, '기본값 전구물질을 「실측값」으로 인쇄한다 (run11 P1-19)');

// ── P1-20 ─────────────────────────────────────────────────────────────
const basisSource = readFileSync('src/lib/electricity-ef-basis.ts', 'utf8');
const basisStart = basisSource.indexOf('const PROCESS_SOURCE_TO_BASIS');
const { resolveElectricityEfBasis } = compile(
  basisSource.slice(basisStart).replace(/^export /gm, '').replace(/: Record<string, ElectricityEfBasis>/, '').replace(/reportBasis: ElectricityEfBasis \| undefined/, 'reportBasis').replace(/\): ElectricityEfBasis \{/, ') {').replace(/process: \{[^}]*\}/, 'process'),
  ['resolveElectricityEfBasis']
);
assert.equal(resolveElectricityEfBasis(undefined, { electricity_mwh: 100, electricity_ef_source: 'COUNTRY_GRID_DEFAULT' }), 'GRID_AVERAGE');
assert.equal(resolveElectricityEfBasis('UNCLASSIFIED', { electricity_mwh: 100, electricity_ef_source: 'PPA' }), 'PPA');
assert.equal(resolveElectricityEfBasis('DIRECT_LINK', { electricity_mwh: 100, electricity_ef_source: 'COUNTRY_GRID_DEFAULT' }), 'DIRECT_LINK', '보고서 입력에서 고른 값이 우선한다');
assert.equal(resolveElectricityEfBasis(undefined, { electricity_mwh: 0, electricity_ef_source: 'COUNTRY_GRID_DEFAULT' }), 'UNCLASSIFIED', '전력을 입력하지 않았으면 잇지 않는다');
assert.equal(resolveElectricityEfBasis(undefined, { electricity_mwh: 100 }), 'UNCLASSIFIED');
assert.equal((reportSource.match(/resolveElectricityEfBasis\(meta\?\.basis, process\)/g) ?? []).length, 2);

// ── P1-12 ─────────────────────────────────────────────────────────────
const mapSource = readFileSync('src/lib/guided-map.ts', 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const { deriveGuidedSteps, getGuidedProgress } = compile(mapSource, ['deriveGuidedSteps', 'getGuidedProgress']);
const binding = { isExample: false, outputMassT: 3240, directEmissions: 71.7, ownIndirectEmissions: 1632.1, precursorDirectEmissions: 0, precursorIndirectEmissions: 0, seeCbamBasis: 0.022, seeIndirect: 0.5, seeTotal: 0.52 };
const baseInput = {
  loaded: true, installationCount: 1, periodCount: 1, reportingProductCount: 1, cnReadyCount: 1, processCount: 1,
  hasProcessOutput: true, sourceStreamCount: 1, hasDirectEmissions: true, hasElectricity: true, precursorCount: 0,
  results: [{ is_cbam_reportable: true, see_cbam_basis: 0.022 }], exportErrorCount: 0, exportWarningCount: 1,
};
const expectedSteps = deriveGuidedSteps({ ...baseInput, precursorsExpected: true }, binding);
const precursorStep = expectedSteps.find((step) => step.id === 'precursors');
assert.equal(precursorStep.status, 'current', '전구물질이 기대되는데 없으면 6단계가 「지금 여기」여야 한다 (run11 P1-12)');
const expectedProgress = getGuidedProgress(expectedSteps);
assert.ok(expectedProgress.done < expectedProgress.total, `전구물질 없이 「${expectedProgress.done} / ${expectedProgress.total} 완료」가 뜬다`);
const optionalSteps = deriveGuidedSteps({ ...baseInput, exportWarningCount: 0 }, binding);
assert.equal(optionalSteps.find((step) => step.id === 'precursors').status, 'optional', '기대되지 않으면 선택 단계로 남는다');
assert.equal(getGuidedProgress(optionalSteps).total, 6);
assert.doesNotMatch(mapSource, /'생성할 수 있습니다'/, '「생성할 수 있습니다」는 「보내도 된다」로 읽힌다 — 「파일을 만들 수 있습니다」로');

// ── 화면 문안 (P1-05 · 09 · 10 · 11 · 16 · 21) ───────────────────────────
const panels = readFileSync('src/components/guided/panels.tsx', 'utf8');
assert.match(panels, /CURRENT_CBAM_PERIOD\.reportingYear/, '기간 연도가 확정기간 연도와 다를 때의 안내가 없다 (P1-05)');
assert.match(panels, /앱은 한국 계통 평균값을 갖고 있지 않습니다/, '전력 계수의 출처 안내가 사라졌다 (P1-09)');
assert.doesNotMatch(panels, /국가\/지역 계통 평균 기본값 \(Commission\/IEA\)/, '사용자가 넣은 국가 공표값을 「Commission/IEA 기본값」으로 부르면 안 된다 (P1-09)');
assert.match(panels, /공용 계량기에서 나눈 값이면 — 배분 근거/, '전력 배분 근거 칸이 없다 (P1-10)');
assert.match(panels, /line\.activity_level_role !== 'EXCLUDED'/, '활동수준 제외 라인에 원료를 배분한다 (P1-11)');
assert.match(panels, /useState\(String\(GUIDED_STREAM_KINDS\[0\]\.defaults\.emission_factor_tco2e_per_unit\)\)/, '4단계 첫 화면의 자리값이 비어 있다 (P1-06)');
assert.match(readFileSync('src/app/installations/page.tsx', 'utf8'), /법정 필수 항목이 비어 있습니다/, '법정 필수 누락이 카드에 드러나지 않는다 (P1-16)');
const exportPage = readFileSync('src/app/export/page.tsx', 'utf8');
assert.doesNotMatch(exportPage, /원본 EU 템플릿 파일은 앱에 내장하지 않습니다/, '템플릿 내장 여부를 같은 화면에서 다르게 말한다 (P1-21)');
assert.match(exportPage, /evaluateEuExportReadiness\(\{ installations, periods,/, 'Export 화면 점검이 다운로드와 다른 자료를 본다 (P1-15)');

console.log('run11 P1 verification passed (기간 오탐 · 전력 산정근거 잇기 · 전구물질 기대 · 화면 문안).');
