import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadDashboardModule() {
  const dashboardSource = readFileSync('src/lib/dashboard-summary.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');

  const compiled = ts.transpileModule(
    `${dashboardSource}
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
  total_certificate_quantity_indicator: 0,
  total_certificate_cost_indicator_eur: 0,
  is_ready_for_review: true,
};

const result = {
  id: 'result-1',
  process_name: 'Rolling',
  product_name: 'Hot Rolled Coil',
  output_mass_t: 100,
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
assert.equal(riskDashboard.steps.find((step) => step.name === '공식 기준자료 연결').status, '확인필요');
assert.equal(riskDashboard.steps.find((step) => step.name === 'EU Export').status, '오류');
assert.equal(riskDashboard.recentTasks[0].href, '/products');
assert.equal(riskDashboard.recentTasks[0].tone, 'danger');
assert.equal(riskDashboard.recentTasks[1].href, '/upload');

console.log('Dashboard summary verification passed.');
