import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

const templatePath = process.argv[2] ?? process.env.CBAM_EU_TEMPLATE_PATH;

if (!templatePath) {
  console.error('Usage: node scripts/verify-excel-recalculation-cases.mjs <path-to-eu-template.xlsx>');
  process.exit(1);
}

class SimpleElement {
  constructor(xml, attributes = {}) {
    this.xml = xml;
    this.attributes = attributes;
  }

  get textContent() {
    return this.xml.replace(/<[^>]+>/g, '');
  }

  getAttribute(name) {
    return this.attributes[name] ?? null;
  }

  getAttributeNS(_namespace, name) {
    return this.getAttribute(`r:${name}`) ?? this.getAttribute(name);
  }

  getElementsByTagName(tagName) {
    const elements = [];
    const pairedPattern = new RegExp(`<${tagName}\\b((?:(?!\\/>)[^>])*)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
    const selfClosingPattern = new RegExp(`<${tagName}\\b([^>]*)\\/>`, 'g');

    for (const match of this.xml.matchAll(pairedPattern)) {
      elements.push(new SimpleElement(match[2], parseAttributes(match[1])));
    }

    for (const match of this.xml.matchAll(selfClosingPattern)) {
      elements.push(new SimpleElement('', parseAttributes(match[1])));
    }

    return elements;
  }
}

class DOMParser {
  parseFromString(xml) {
    return new SimpleElement(xml);
  }
}

function parseAttributes(rawAttributes) {
  const attributes = {};

  for (const match of rawAttributes.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
    attributes[match[1]] = unescapeXml(match[2]);
  }

  return attributes;
}

function unescapeXml(value) {
  return value
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

function loadEuExportModule() {
  const sourceStreamCalculationSource = readFileSync('src/lib/source-stream-calculation.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // cn-master.generated.ts 를 cbam-product-rules 가 import 한다. 이 로더는 import를 지우므로
  // 생성 파일 소스를 앞에 붙여 심볼을 제공한다. 안 붙이면 CN 마스터가 undefined가 된다.
  const cnMasterSource = readFileSync('src/lib/cn-master.generated.ts', 'utf8')
    .replace(/^export /gm, '');
  const productRulesSource = [
    cnMasterSource,
    readFileSync('src/lib/cbam-product-rules.ts', 'utf8')
      .replace(/^import .*;\r?\n/gm, '')
      .replace(/^export /gm, ''),
  ].join('\n');
  const source = readFileSync('src/lib/eu-template-export.ts', 'utf8')
    .replace(
      "import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';",
      'const { strFromU8, strToU8, unzipSync, zipSync } = fflate;'
    )
    .replace("import { summarizeProductOutputLines } from './calculation-engine';", '')
    .replace("import { calculateSourceStreamEmissions } from './source-stream-calculation';", '')
    .replace("import { getIndirectEmissionsApplicability } from './cbam-product-rules';", '')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${sourceStreamCalculationSource}
${productRulesSource}
function summarizeProductOutputLines(processOutputMassT, outputLines) {
  const activeLines = outputLines.filter((line) => line.output_mass_t > 0);
  const totalOutput = activeLines.reduce((sum, line) => sum + line.output_mass_t, 0);
  const delta = totalOutput - processOutputMassT;
  const tolerance = Math.max(0.01, Math.abs(processOutputMassT) * 0.01);
  const allocationBases = new Set(activeLines.map((line) => line.allocation_basis));
  const hasMixedAllocationBasis = allocationBases.size > 1;
  const manualPercentTotal = activeLines.reduce(
    (sum, line) => sum + (line.allocation_basis === 'MANUAL' ? line.manual_allocation_percent : 0),
    0
  );
  const hasManualLines = activeLines.some((line) => line.allocation_basis === 'MANUAL');
  const needsOutputReview = activeLines.length > 0 && Math.abs(delta) > tolerance;
  const needsAllocationReview = hasMixedAllocationBasis || (hasManualLines && manualPercentTotal <= 0);

  return {
    count: outputLines.length,
    activeCount: activeLines.length,
    totalOutput,
    delta,
    tolerance,
    manualPercentTotal,
    hasMixedAllocationBasis,
    needsOutputReview,
    needsAllocationReview,
    needsReview: needsOutputReview || needsAllocationReview,
  };
}
${source}
globalThis.euExport = {
  createEuTemplateExportCopyResult,
  evaluateEuExportReadiness,
  validateEuTemplateFile
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;

  const context = vm.createContext({
    Blob,
    DOMParser,
    File,
    console,
    fflate,
    Map,
    Math,
    Number,
    RegExp,
    Set,
    Uint8Array,
  });
  vm.runInContext(compiled, context);
  return context.euExport;
}

function round(value, decimals = 6) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function makeBaseData() {
  const product = {
    id: 'product-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Hot Rolled Coil',
    hs_code: '7208',
    cn_code: '72083900',
    hs_group: '72',
    product_type_enum: 'HS72_PLATE_SHEET',
    unit: 'tonne',
  };
  const installation = {
    id: 'installation-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    name: 'Main Factory A',
    local_name: 'Incheon Plant 1',
    country: 'KR',
    street: '1 Steel Road',
    economic_activity: 'Steel processing',
    postcode: '21990',
    city: 'Incheon',
    authorized_representative_name: 'Local CBAM Manager',
    email: 'cbam@example.com',
    telephone: '+82-32-000-0000',
  };
  const period = {
    id: 'period-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    installation_id: installation.id,
    name: '2024 Annual',
    start_date: '2024-01-01',
    end_date: '2024-12-31',
    status: 'DRAFT',
  };
  const process = {
    id: 'process-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    period_id: period.id,
    product_id: product.id,
    name: 'Rolling and finishing',
    production_route: 'Flat steel processing',
    output_mass_t: 1000,
    market_output_mass_t: 950,
    internal_consumption_mass_t: 50,
    direct_attributable_emissions_tco2e: 120,
    electricity_mwh: 500,
    electricity_ef_tco2e_per_mwh: 0.47,
  };
  const sourceStream = {
    id: 'source-stream-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    period_id: period.id,
    process_id: process.id,
    name: 'Natural gas combustion',
    stream_type: 'FUEL',
    method: 'Combustion',
    activity_data: 36.5296803652968,
    activity_unit: 't',
    ncv_gj_per_unit: 45,
    emission_factor_tco2e_per_unit: 73,
    oxidation_factor: 1,
    conversion_factor: 1,
    fossil_fraction: 1,
    biomass_fraction: 0,
    source: 'Monthly fuel invoice',
  };
  const outputLine = {
    id: 'output-line-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    process_id: process.id,
    product_id: product.id,
    name: 'Hot Rolled Coil output',
    output_mass_t: 1000,
    allocation_basis: 'MASS',
    manual_allocation_percent: 100,
    note: '',
  };

  return {
    installations: [installation],
    periods: [period],
    products: [product],
    processes: [process],
    productOutputLines: [outputLine],
    sourceStreams: [sourceStream],
    precursors: [],
  };
}

function makePrecursor(overrides = {}) {
  return {
    id: 'precursor-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    period_id: 'period-1',
    process_id: 'process-1',
    product_id: 'product-1',
    name: 'Purchased hot rolled coil',
    precursor_cn_code: '72083900',
    supplier_country: 'South Korea',
    supplier_installation: 'Supplier steel mill',
    aggregated_goods_category: 'Iron or steel products',
    production_route: 'External precursor',
    purchased_mass_t: 1100,
    consumed_mass_t: 1000,
    consumed_for_non_cbam_mass_t: 0,
    data_mode: 'ACTUAL',
    verification_status: 'SUPPLIER_CONFIRMED',
    default_value_year: '2026',
    direct_see_tco2e_per_t: 1.2,
    indirect_see_tco2e_per_t: 0,
    source: 'Supplier communication template',
    default_value_justification: '',
    ...overrides,
  };
}

function withLocalReview(data) {
  const process = data.processes[0];
  const output = data.productOutputLines[0].output_mass_t;
  const ownDirect = process.direct_attributable_emissions_tco2e / output;
  const ownIndirect = (process.electricity_mwh * process.electricity_ef_tco2e_per_mwh) / output;
  const precursorTotal = data.precursors.reduce(
    (sum, precursor) =>
      sum +
      (precursor.consumed_mass_t *
        (precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t)) /
        output,
    0
  );
  const precursorDirect = data.precursors.reduce(
    (sum, precursor) => sum + (precursor.consumed_mass_t * precursor.direct_see_tco2e_per_t) / output,
    0
  );
  const precursorIndirect = data.precursors.reduce(
    (sum, precursor) => sum + (precursor.consumed_mass_t * precursor.indirect_see_tco2e_per_t) / output,
    0
  );

  return {
    appDirectSee: round(ownDirect),
    appOwnIndirectSee: round(ownIndirect),
    appPrecursorDirectSee: round(precursorDirect),
    appPrecursorIndirectSee: round(precursorIndirect),
    appPrecursorSee: round(precursorTotal),
    appCbamBasisSee: round(ownDirect + precursorTotal),
    appInformationalTotalSee: round(ownDirect + ownIndirect + precursorTotal),
  };
}

function makeCases() {
  const noPrecursor = makeBaseData();
  const directPrecursor = makeBaseData();
  directPrecursor.precursors = [makePrecursor()];
  const directAndIndirectPrecursor = makeBaseData();
  directAndIndirectPrecursor.precursors = [makePrecursor({ indirect_see_tco2e_per_t: 0.25 })];

  return [
    {
      id: 'no-precursor',
      description: 'Final good direct and own indirect emissions only; no purchased precursor contribution.',
      data: noPrecursor,
      expectedExcel: { I10: 0.12, J10: 0.235, K10: 0.355 },
    },
    {
      id: 'precursor-direct-only',
      description: 'Purchased precursor direct SEE is included; precursor indirect SEE is zero.',
      data: directPrecursor,
      expectedExcel: { I10: 1.32, J10: 0.235, K10: 1.555 },
    },
    {
      id: 'precursor-direct-indirect',
      description: 'Purchased precursor direct and indirect SEE are included through the E_PurchPrec bridge.',
      data: directAndIndirectPrecursor,
      expectedExcel: { I10: 1.32, J10: 0.485, K10: 1.805 },
    },
  ].map((item) => ({
    ...item,
    localReview: withLocalReview(item.data),
  }));
}

function runExcelRecalculation(workbooks) {
  const payloadPath = resolve('artifacts', 'excel-recalculation-cases', 'workbooks.json');
  writeFileSync(payloadPath, `${JSON.stringify(workbooks)}\n`);
  const command = `
$workbooks = Get-Content -LiteralPath '${payloadPath.replaceAll("'", "''")}' -Raw | ConvertFrom-Json
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$results = @()
try {
  foreach ($item in $workbooks) {
    $wb = $excel.Workbooks.Open($item.workbookPath)
    $excel.CalculateFullRebuild()
    $ws = $wb.Worksheets.Item('Summary_Products')
    $results += [ordered]@{
      id = $item.id
      workbookPath = $item.workbookPath
      I10 = [double]$ws.Range('I10').Value2
      J10 = [double]$ws.Range('J10').Value2
      K10 = [double]$ws.Range('K10').Value2
    }
    $wb.Close($false)
  }
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}
$results | ConvertTo-Json -Depth 5
`;
  const output = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return JSON.parse(output);
}

function assertClose(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 0.000001, `${label}: expected ${expected}, got ${actual}`);
}

const euExport = loadEuExportModule();
const inputBytes = readFileSync(templatePath);
const file = new File([inputBytes], basename(templatePath), {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const validation = await euExport.validateEuTemplateFile(file);
assert.equal(validation.isValid, true, `missing required sheets: ${validation.missingSheets.join(', ')}`);

const outputDir = resolve('artifacts', 'excel-recalculation-cases');
await mkdir(outputDir, { recursive: true });

const caseReports = [];
const workbooks = [];

for (const testCase of makeCases()) {
  const readiness = euExport.evaluateEuExportReadiness(testCase.data, validation.cnCodeMap);
  assert.equal(readiness.errorCount, 0, `${testCase.id}: ${readiness.issues.map((issue) => issue.message).join('\n')}`);
  const exportResult = await euExport.createEuTemplateExportCopyResult(file, testCase.data);
  assert.equal(exportResult.verification.isValid, true, `${testCase.id}: ${JSON.stringify(exportResult.verification.mismatches, null, 2)}`);
  const workbookPath = join(outputDir, `${testCase.id}.xlsx`);
  writeFileSync(workbookPath, Buffer.from(await exportResult.blob.arrayBuffer()));
  workbooks.push({ id: testCase.id, workbookPath });
  caseReports.push({
    id: testCase.id,
    description: testCase.description,
    workbookPath,
    writtenCellCount: exportResult.writtenCellCount,
    checkedCellCount: exportResult.verification.checkedCellCount,
    localReview: testCase.localReview,
    expectedExcel: testCase.expectedExcel,
  });
}

const excelResults = runExcelRecalculation(workbooks);
const excelById = new Map(excelResults.map((result) => [result.id, result]));

for (const report of caseReports) {
  const excel = excelById.get(report.id);
  assert.ok(excel, `${report.id}: missing Excel recalculation result`);
  report.excel = {
    I10: round(excel.I10),
    J10: round(excel.J10),
    K10: round(excel.K10),
  };
  assertClose(report.excel.I10, report.expectedExcel.I10, `${report.id} Summary_Products!I10`);
  assertClose(report.excel.J10, report.expectedExcel.J10, `${report.id} Summary_Products!J10`);
  assertClose(report.excel.K10, report.expectedExcel.K10, `${report.id} Summary_Products!K10`);
  assertClose(report.excel.K10, report.localReview.appInformationalTotalSee, `${report.id} Excel K10 vs app informational total`);
}

const finalReport = {
  template: templatePath,
  generatedAt: new Date().toISOString(),
  caseCount: caseReports.length,
  cases: caseReports,
};

writeFileSync(join(outputDir, 'report.json'), `${JSON.stringify(finalReport, null, 2)}\n`);
console.log(JSON.stringify(finalReport, null, 2));
