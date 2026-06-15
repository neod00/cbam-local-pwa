import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadDashboardModule() {
  const scenarioSource = readFileSync('src/lib/scenario-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/import\s+\{[\s\S]*?\}\s+from '\.\/reference-workbooks';\r?\n/, '')
    .replace(/^export /gm, '');
  const dashboardSource = readFileSync('src/lib/dashboard-summary.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace("import { getLocalCalculationWarningHref } from './calculation-engine';\r\n", '')
    .replace("import { getLocalCalculationWarningHref } from './calculation-engine';\n", '')
    .replace("import { getScenarioReviewAction } from './scenario-calculation';\r\n", '')
    .replace("import { getScenarioReviewAction } from './scenario-calculation';\n", '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `
function findBenchmarkReference(references, cnCode, productionRoute) {
  const candidates = references?.rows
    ?.filter((row) => row.cn_code === cnCode || cnCode.startsWith(row.cn_code))
    .sort((a, b) => b.cn_code.length - a.cn_code.length) ?? [];

  return candidates.find((row) => !productionRoute || row.production_route === productionRoute) ?? candidates[0];
}

function findDefaultValueReference(references, originCountry, cnCode) {
  return references?.rows?.find((row) => row.country === originCountry && row.cn_code === cnCode);
}

function getDefaultValueTotalForYear(defaultValue, year) {
  if (year === '2026') return defaultValue.total_2026;
  if (year === '2027') return defaultValue.total_2027;
  return defaultValue.total_2028_onwards;
}

function getLocalCalculationWarningHref(warning) {
  const encodedId = encodeURIComponent(warning.target.id);
  return warning.target.type === 'precursor'
    ? \`/precursors?edit=\${encodedId}\`
    : \`/processes?edit=\${encodedId}\`;
}

${scenarioSource}
${dashboardSource}
globalThis.dashboardSummary = {
  createDashboardSummary,
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({});
  vm.runInContext(compiled, context);
  return context.dashboardSummary;
}

const { createDashboardSummary } = loadDashboardModule();

const baseRiskSummary = {
  missing_cn_count: 0,
  missing_official_reference_count: 0,
  missing_reference_count: 0,
  above_default_count: 0,
  certificate_exposure_count: 0,
  default_certificate_exposure_count: 0,
  actual_lower_certificate_count: 0,
  default_lower_certificate_count: 0,
  equal_certificate_count: 0,
  total_certificate_quantity_indicator: 0,
  total_certificate_cost_indicator_eur: 0,
  total_default_certificate_quantity_indicator: 0,
  total_default_certificate_cost_indicator_eur: 0,
  is_ready_for_review: true,
};

const result = {
  id: 'result-1',
  process_name: 'Rolling',
  process_id: 'process-1',
  product_name: 'Hot Rolled Coil',
  output_mass_t: 100,
  direct_emissions_tco2e: 120,
  source_stream_count: 1,
  source_stream_delta_tco2e: 0,
  indirect_emissions_applicable: false,
  indirect_see: 0,
  warningDetails: [],
};

const readyDashboard = createDashboardSummary({
  results: [result],
  productCount: 1,
  processCount: 1,
  precursorCount: 1,
  scenarioRiskSummary: baseRiskSummary,
  exportIssueCount: 0,
  exportErrorCount: 0,
  hasBenchmarkReference: true,
  hasDefaultValueReference: true,
});

assert.equal(readyDashboard.totalOutput, 100);
assert.equal(readyDashboard.warningCount, 0);
assert.equal(readyDashboard.readinessRate, 100);
assert.equal(readyDashboard.steps.length, 8);
assert.equal(readyDashboard.steps.at(-1).name, 'EU Export');
assert.equal(readyDashboard.steps.at(-1).status, '대기');
assert.equal(readyDashboard.recentTasks[0].href, '/products');

const emptyBeginnerDashboard = createDashboardSummary({
  results: [],
  productCount: 0,
  processCount: 0,
  precursorCount: 0,
  scenarioRiskSummary: {
    ...baseRiskSummary,
    missing_official_reference_count: 1,
    missing_reference_count: 1,
    is_ready_for_review: false,
  },
  exportIssueCount: 0,
  exportErrorCount: 0,
  hasBenchmarkReference: false,
  hasDefaultValueReference: false,
});

assert.equal(emptyBeginnerDashboard.recentTasks[0].href, '/products');
assert.match(emptyBeginnerDashboard.recentTasks[0].label, /품목을 먼저 추가/);
assert.equal(emptyBeginnerDashboard.recentTasks[1].href, '/processes');
assert.equal(emptyBeginnerDashboard.recentTasks[2].href, '/upload');

const riskDashboard = createDashboardSummary({
  results: [{
    ...result,
    warningDetails: [
      {
        message: '배출량 차이를 확인하세요.',
        target: { type: 'process', id: 'process-1' },
      },
    ],
  }],
  productCount: 1,
  processCount: 1,
  precursorCount: 1,
  scenarioRiskSummary: {
    ...baseRiskSummary,
    missing_cn_count: 1,
    missing_official_reference_count: 1,
    missing_reference_count: 2,
    above_default_count: 1,
    is_ready_for_review: false,
  },
  exportIssueCount: 2,
  exportErrorCount: 1,
  hasBenchmarkReference: false,
  hasDefaultValueReference: false,
});

assert.equal(riskDashboard.warningCount, 6);
assert.ok(riskDashboard.readinessRate < 100);
assert.equal(riskDashboard.steps.find((step) => step.name === '공식 기준자료').status, '확인 필요');
assert.equal(riskDashboard.steps.find((step) => step.name === 'EU Export').status, '오류');
assert.equal(riskDashboard.recentTasks[0].href, '/products');
assert.equal(riskDashboard.recentTasks[0].tone, 'danger');
assert.equal(riskDashboard.recentTasks[1].href, '/upload');

const warningDashboard = createDashboardSummary({
  results: [{
    ...result,
    warningDetails: [
      {
        message: '전구물질 출처를 확인하세요.',
        target: { type: 'precursor', id: 'precursor 1' },
      },
    ],
  }],
  productCount: 1,
  processCount: 1,
  precursorCount: 1,
  scenarioRiskSummary: baseRiskSummary,
  exportIssueCount: 0,
  exportErrorCount: 0,
  hasBenchmarkReference: true,
  hasDefaultValueReference: true,
});

assert.equal(warningDashboard.recentTasks[0].href, '/precursors?edit=precursor%201');
assert.equal(warningDashboard.recentTasks[0].tone, 'warning');

const missingSourceStreamDashboard = createDashboardSummary({
  results: [{
    ...result,
    source_stream_count: 0,
    direct_emissions_tco2e: 120,
    warningDetails: [
      {
        message: '직접배출량은 입력되어 있지만 연결된 배출원 자료가 없습니다.',
        target: { type: 'process', id: 'process-1' },
      },
    ],
  }],
  productCount: 1,
  processCount: 1,
  precursorCount: 1,
  scenarioRiskSummary: baseRiskSummary,
  exportIssueCount: 0,
  exportErrorCount: 0,
  hasBenchmarkReference: true,
  hasDefaultValueReference: true,
});

assert.equal(missingSourceStreamDashboard.steps.find((step) => step.name === '배출원 자료').status, '확인 필요');
assert.equal(missingSourceStreamDashboard.steps.find((step) => step.name === '배출원 자료').tone, 'warning');
assert.ok(missingSourceStreamDashboard.readinessRate < 100);

const scenarioBasisDashboard = createDashboardSummary({
  results: [result],
  productCount: 1,
  processCount: 1,
  precursorCount: 1,
  scenarioRiskSummary: {
    ...baseRiskSummary,
    default_lower_certificate_count: 1,
    actual_lower_certificate_count: 1,
  },
  exportIssueCount: 0,
  exportErrorCount: 0,
  hasBenchmarkReference: true,
  hasDefaultValueReference: true,
});

assert.equal(scenarioBasisDashboard.warningCount, 1);
assert.equal(scenarioBasisDashboard.recentTasks[0].href, '/scenarios');
assert.equal(scenarioBasisDashboard.recentTasks[0].tone, 'warning');
assert.match(scenarioBasisDashboard.recentTasks[0].label, /기본값 시나리오/);
assert.equal(scenarioBasisDashboard.recentTasks[1].tone, 'success');

console.log('Dashboard summary verification passed.');
