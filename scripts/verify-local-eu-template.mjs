import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

const templatePath = process.argv[2];

if (!templatePath) {
  console.error('Usage: node scripts/verify-local-eu-template.mjs <path-to-eu-template.xlsx>');
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
  const productRulesSource = readFileSync('src/lib/cbam-product-rules.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
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
  REQUIRED_EU_TEMPLATE_SHEETS,
  createEuTemplateExportCopyResult,
  createEuTemplateExportCellWrites,
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

function parseWorkbookSheetTargets(zip) {
  const workbookXml = fflate.strFromU8(zip['xl/workbook.xml']);
  const relsXml = fflate.strFromU8(zip['xl/_rels/workbook.xml.rels']);
  const relTargetById = new Map();
  const sheetTargetByName = new Map();

  for (const match of relsXml.matchAll(/<Relationship\b([^>]*)\/>/g)) {
    const attributes = parseAttributes(match[1]);
    const target = attributes.Target?.startsWith('/') ? attributes.Target.slice(1) : `xl/${attributes.Target}`;
    relTargetById.set(attributes.Id, target.replaceAll('\\', '/'));
  }

  for (const match of workbookXml.matchAll(/<sheet\b([^>]*)\/>/g)) {
    const attributes = parseAttributes(match[1]);
    const target = relTargetById.get(attributes['r:id']);

    if (attributes.name && target) {
      sheetTargetByName.set(attributes.name, target);
    }
  }

  return sheetTargetByName;
}

function readCell(sheetXml, cell) {
  const pattern = new RegExp(`<c\\s+[^>]*r="${cell}"[^>]*>([\\s\\S]*?)<\\/c>`);
  const match = sheetXml.match(pattern);

  if (!match) {
    return '';
  }

  const valueMatch = match[1].match(/<v>([\s\S]*?)<\/v>/);
  if (valueMatch) {
    return valueMatch[1];
  }

  const textMatch = match[1].match(/<t>([\s\S]*?)<\/t>/);
  return textMatch ? textMatch[1] : '';
}

function makeSampleData() {
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
    activity_data: 250,
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
  const precursor = {
    id: 'precursor-1',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    process_id: process.id,
    product_id: product.id,
    name: 'Purchased hot rolled coil',
    aggregated_goods_category: 'Iron or steel products',
    production_route: 'External precursor',
    purchased_mass_t: 1100,
    consumed_mass_t: 1000,
    consumed_for_non_cbam_mass_t: 0,
    data_mode: 'ACTUAL',
    verification_status: 'SUPPLIER_CONFIRMED',
    direct_see_tco2e_per_t: 1.2,
    indirect_see_tco2e_per_t: 0.25,
    source: 'Supplier communication template',
    default_value_justification: '',
  };

  return {
    installations: [installation],
    periods: [period],
    products: [product],
    processes: [process],
    productOutputLines: [outputLine],
    sourceStreams: [sourceStream],
    precursors: [precursor],
  };
}

const euExport = loadEuExportModule();
const inputBytes = readFileSync(templatePath);
const file = new File([inputBytes], basename(templatePath), {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});
const validation = await euExport.validateEuTemplateFile(file);

assert.equal(validation.isValid, true, `missing required sheets: ${validation.missingSheets.join(', ')}`);
assert.ok(validation.cnCodeCount > 0, 'Parameters_CNCodes should contain CN code rows');

const data = makeSampleData();
const readiness = euExport.evaluateEuExportReadiness(data, validation.cnCodeMap);
assert.equal(readiness.errorCount, 0, readiness.issues.map((issue) => issue.message).join('\n'));

const cellWrites = euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap);
const exportResult = await euExport.createEuTemplateExportCopyResult(file, data);

assert.equal(exportResult.verification.isValid, true, JSON.stringify(exportResult.verification.mismatches, null, 2));
assert.equal(exportResult.writtenCellCount, cellWrites.length);

const exportedZip = fflate.unzipSync(new Uint8Array(await exportResult.blob.arrayBuffer()));
const sheetTargetByName = parseWorkbookSheetTargets(exportedZip);

function readExportedCell(sheetName, cell) {
  const sheetPath = sheetTargetByName.get(sheetName);
  assert.ok(sheetPath, `${sheetName} sheet should exist in exported copy`);
  return readCell(fflate.strFromU8(exportedZip[sheetPath]), cell);
}

const checkedCells = {
  'A_InstData!I9': readExportedCell('A_InstData', 'I9'),
  'A_InstData!L9': readExportedCell('A_InstData', 'L9'),
  'A_InstData!I20': readExportedCell('A_InstData', 'I20'),
  'A_InstData!E62': readExportedCell('A_InstData', 'E62'),
  'A_InstData!I62': readExportedCell('A_InstData', 'I62'),
  'A_InstData!E83': readExportedCell('A_InstData', 'E83'),
  'A_InstData!F83': readExportedCell('A_InstData', 'F83'),
  'A_InstData!L83': readExportedCell('A_InstData', 'L83'),
  'B_EmInst!D17': readExportedCell('B_EmInst', 'D17'),
  'B_EmInst!E17': readExportedCell('B_EmInst', 'E17'),
  'D_Processes!L16': readExportedCell('D_Processes', 'L16'),
  'D_Processes!L54': readExportedCell('D_Processes', 'L54'),
  'E_PurchPrec!L17': readExportedCell('E_PurchPrec', 'L17'),
  'E_PurchPrec!L49': readExportedCell('E_PurchPrec', 'L49'),
  'Summary_Products!D10': readExportedCell('Summary_Products', 'D10'),
  'Summary_Products!F10': readExportedCell('Summary_Products', 'F10'),
  'Summary_Products!H10': readExportedCell('Summary_Products', 'H10'),
};

assert.equal(checkedCells['A_InstData!I9'], '45292');
assert.equal(checkedCells['A_InstData!L9'], '45657');
assert.equal(checkedCells['A_InstData!I20'], 'Main Factory A');
assert.equal(checkedCells['A_InstData!E62'], 'Iron or steel products');
assert.equal(checkedCells['A_InstData!I62'], 'Flat steel processing');
assert.equal(checkedCells['A_InstData!E83'], 'Iron or steel products');
assert.equal(checkedCells['A_InstData!F83'], 'Only direct production');
assert.equal(checkedCells['A_InstData!L83'], 'Rolling and finishing');
assert.equal(checkedCells['B_EmInst!D17'], 'Combustion');
assert.equal(checkedCells['B_EmInst!E17'], 'Natural gas combustion');
assert.equal(checkedCells['D_Processes!L16'], '1000');
assert.equal(checkedCells['D_Processes!L54'], '120');
assert.equal(checkedCells['E_PurchPrec!L17'], '1100');
assert.equal(checkedCells['E_PurchPrec!L49'], '1.2');
assert.equal(checkedCells['Summary_Products!D10'], 'Rolling and finishing');
assert.equal(checkedCells['Summary_Products!F10'], '72083900');
assert.equal(checkedCells['Summary_Products!H10'], 'Hot Rolled Coil');

await mkdir('artifacts', { recursive: true });
const report = {
  template: templatePath,
  sheetCount: validation.sheetNames.length,
  cnCodeCount: validation.cnCodeCount,
  plannedCellWriteCount: cellWrites.length,
  writtenCellCount: exportResult.writtenCellCount,
  checkedCellCount: exportResult.verification.checkedCellCount,
  warningCount: readiness.warningCount,
  checkedCells,
};
writeFileSync(join('artifacts', 'local-eu-template-verification.json'), `${JSON.stringify(report, null, 2)}\n`);

console.log('Local EU template verification passed.');
console.log(JSON.stringify(report, null, 2));
