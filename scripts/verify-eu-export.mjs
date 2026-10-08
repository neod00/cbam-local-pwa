import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const fflate = require('fflate');

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
  const reportingScopeSource = readFileSync('src/lib/reporting-scope.ts', 'utf8')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // 할당 규칙(정합계수·배분율 허용오차)은 export 가 import 한다 — 앞에 붙인다.
  const allocationRulesSource = readFileSync('src/lib/allocation-rules.ts', 'utf8')
    .replace(/^import .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  // export·엔진이 import 한다 — 산 열(EmH,imp)과 전구물질 검증 규칙(2025/2547). 의존이 없는 작은 모듈이다.
  // energy-split-summary도 export가 import한다(나눈 연료의 이중계상 검사) — 합쳐 붙이는 틀에서 같은 이름(fmt)이 겹치지 않게 이름을 바꾼다.
  const helperSources = ['src/lib/measurable-heat.ts', 'src/lib/precursor-verification.ts', 'src/lib/energy-split-summary.ts']
    .map((path) => {
      const text = readFileSync(path, 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
      return path.endsWith('energy-split-summary.ts') ? text.split('fmt').join('fmtEnergySplit') : text;
    })
    .join('\n');
  const source = readFileSync('src/lib/eu-template-export.ts', 'utf8')
    .replace(
      "import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';",
      'const { strFromU8, strToU8, unzipSync, zipSync } = fflate;'
    )
    // 상대경로 import는 **통째로** 걷어낸다. 의존 모듈 소스는 아래에서 앞에 붙이므로,
    // 남겨두면 require로 컴파일돼 vm에서 「exports is not defined」로 죽는다.
    // 종전엔 import 줄을 정확한 문자열로 하나씩 지웠는데, 새 의존을 추가할 때마다 이
    // 하네스가 깨졌다. 목록을 손으로 관리하지 않는다.
    .replace(/^import \{[\s\S]*?\} from '\.\/[^']*';\r?\n/gm, '')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${sourceStreamCalculationSource}
${productRulesSource}
${reportingScopeSource}
${allocationRulesSource}
${helperSources}
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
  createExportChecklist,
  createEuTemplateExportCellWrites,
  createEuTemplateExportCopy,
  createEuTemplateExportCopyResult,
  evaluateEuExportReadiness,
  internalConsumptionSlot,
  getEuExportDownloadStatusMessage,
  getEuExportIssueEditHref,
  validateEuTemplateFile
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const context = { Blob, File, DOMParser, fflate, console };
  vm.runInNewContext(compiled, context);
  return context.euExport;
}

function loadDeliveryPackageModule() {
  // delivery-package는 공용 OOXML 빌더(docx-builder)를 쓰므로 함께 인라인한다.
  const docxBuilderSource = readFileSync('src/lib/docx-builder.ts', 'utf8')
    .replace("import { strToU8, zipSync } from 'fflate';", '')
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const source = readFileSync('src/lib/delivery-package.ts', 'utf8')
    .replace(
      "import { strToU8, zipSync } from 'fflate';",
      'const { strToU8, zipSync } = fflate;'
    )
    // import 목록은 바뀔 수 있으므로 정확 문자열이 아니라 패턴으로 지운다(바뀌면 조용히 깨지는 걸 방지).
    .replace(/^import \{[^}]*\} from '\.\/docx-builder';\r?\n/gm, '')
    .replace("import { getSourceStreamEmissionFactorBasis } from './source-stream-calculation';", '')
    .replace(/import type[\s\S]*?;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${docxBuilderSource}
${source}
function getSourceStreamEmissionFactorBasis(sourceStream) {
  return sourceStream.emission_factor_basis === 'PER_ACTIVITY_UNIT' ? 'PER_ACTIVITY_UNIT' : 'PER_TJ';
}
globalThis.deliveryPackage = {
  createCbamBackupFilename,
  createDeliveryPackage,
  createDeliveryPackageFilename
};`,
    {
      compilerOptions: {
        module: ts.ModuleKind.None,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText;
  const context = { Blob, fflate, console, Intl };
  vm.runInNewContext(compiled, context);
  return context.deliveryPackage;
}

function strToU8Bytes(text) {
  return fflate.strToU8(text);
}

function inlineCell(cell, value) {
  return `<c r="${cell}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function emptySheetXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData></sheetData>',
    '</worksheet>',
  ].join('');
}

function installationSheetXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="19"><c r="I19" s="1"/></row>',
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

function summaryProductsSheetXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="10">',
    '<c r="I10"><f>D10&amp;" direct SEE"</f><v>0</v></c>',
    '<c r="J10"><f>D10&amp;" indirect SEE"</f><v>0</v></c>',
    '<c r="K10"><f>I10+J10</f><v>0</v></c>',
    '</row>',
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

function cnCodeSheetXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="4">',
    inlineCell('C4', 'Flat-rolled products of iron or non-alloy steel'),
    inlineCell('D4', '72083900'),
    inlineCell('E4', 'Iron or steel products'),
    '</row>',
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

function cCodeListsSheetXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetData>',
    '<row r="11">',
    inlineCell('F11', 'KR'),
    inlineCell('G11', 'Korea, Republic of'),
    '</row>',
    '</sheetData>',
    '</worksheet>',
  ].join('');
}

function workbookXml(sheetNames) {
  const sheets = sheetNames
    .map((name, index) => `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`)
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
    `<sheets>${sheets}</sheets>`,
    '</workbook>',
  ].join('');
}

function workbookRelsXml(sheetNames) {
  const rels = sheetNames
    .map(
      (_name, index) =>
        `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
    )
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    rels,
    '</Relationships>',
  ].join('');
}

function contentTypesXml(sheetNames) {
  const overrides = sheetNames
    .map(
      (_name, index) =>
        `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
    )
    .join('');

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    overrides,
    '</Types>',
  ].join('');
}

function rootRelsXml() {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>',
    '</Relationships>',
  ].join('');
}

function createSyntheticWorkbook(sheetNames) {
  const zip = {
    '[Content_Types].xml': fflate.strToU8(contentTypesXml(sheetNames)),
    '_rels/.rels': fflate.strToU8(rootRelsXml()),
    'xl/workbook.xml': fflate.strToU8(workbookXml(sheetNames)),
    'xl/_rels/workbook.xml.rels': fflate.strToU8(workbookRelsXml(sheetNames)),
  };

  sheetNames.forEach((name, index) => {
    zip[`xl/worksheets/sheet${index + 1}.xml`] = fflate.strToU8(
      name === 'Parameters_CNCodes'
        ? cnCodeSheetXml()
        : name === 'A_InstData'
          ? installationSheetXml()
          : name === 'Summary_Products'
            ? summaryProductsSheetXml()
            : name === 'c_CodeLists'
              ? cCodeListsSheetXml()
              : emptySheetXml()
    );
  });

  return new File([fflate.zipSync(zip)], 'synthetic-cbam-template.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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

function readFormula(sheetXml, cell) {
  const pattern = new RegExp(`<c\\s+[^>]*r="${cell}"[^>]*>([\\s\\S]*?)<\\/c>`);
  const match = sheetXml.match(pattern);

  if (!match) {
    return '';
  }

  const formulaMatch = match[1].match(/<f\b[^>]*>([\s\S]*?)<\/f>/);
  return formulaMatch ? unescapeXml(formulaMatch[1]) : '';
}

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const euExport = loadEuExportModule();
const deliveryPackage = loadDeliveryPackageModule();
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
  // 운영자(법인) 식별은 EU 사본 셀로 나가지 않지만 준비도 점검 대상이다. UN/LOCODE는 일부러 비워 둔다.
  operator_name: 'Main Factory Co., Ltd.',
  operator_reg_number: '123-45-67890',
  operator_address: '1 Steel Road, Incheon',
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
  // No in-plant transfer in the base fixture: the engine does not chain processes yet, so any transfer blocks the export.
  market_output_mass_t: 1000,
  internal_consumption_mass_t: 0,
  direct_attributable_emissions_tco2e: 120,
  electricity_mwh: 500,
  electricity_ef_tco2e_per_mwh: 0.47,
  // 산 열(스팀·온수)을 쓰지 않는다고 답했다 — 답하지 않으면 경고가 하나 는다(2025/2547 부속서 III A.2.2).
  measurable_heat_import: 'NO',
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
  emission_factor_basis: 'PER_TJ',
  oxidation_factor: 1,
  conversion_factor: 1,
  fossil_fraction: 1,
  biomass_fraction: 0,
  factor_source_type: 'EU_OR_IPCC_DEFAULT',
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
  supplier_country: 'South Korea',
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
const data = {
  installations: [installation],
  periods: [period],
  products: [product],
  processes: [process],
  productOutputLines: [outputLine],
  sourceStreams: [sourceStream],
  precursors: [precursor],
};
const nonCbamProduct = {
  ...product,
  id: 'product-scale',
  name: 'Mill scale',
  hs_code: '2619',
  cn_code: '26190090',
  hs_group: '26',
  product_type_enum: 'UNKNOWN_PRODUCT',
  reporting_scope: 'NON_CBAM_COPRODUCT',
};
const nonCbamOutputLine = {
  ...outputLine,
  id: 'output-line-scale',
  product_id: nonCbamProduct.id,
  name: 'Mill scale output',
  output_mass_t: 100,
  reporting_scope: 'NON_CBAM_COPRODUCT',
};
const nonCbamPrecursor = {
  ...precursor,
  id: 'precursor-scale-only',
  product_id: nonCbamProduct.id,
  name: 'Scale-only additive',
  source: '',
  data_mode: 'DEFAULT',
  default_value_justification: '',
  output_allocations: [{
    product_output_line_id: nonCbamOutputLine.id,
    product_id: nonCbamProduct.id,
    allocated_mass_t: precursor.consumed_mass_t,
  }],
};
const scopedData = {
  ...data,
  products: [product, nonCbamProduct],
  productOutputLines: [{ ...outputLine, output_mass_t: 900, reporting_scope: 'CBAM_GOOD' }, nonCbamOutputLine],
  precursors: [precursor, nonCbamPrecursor],
};
const file = createSyntheticWorkbook(euExport.REQUIRED_EU_TEMPLATE_SHEETS);
const validation = await euExport.validateEuTemplateFile(file);

assertEqual(String(validation.isValid), 'true', 'synthetic workbook validity');
assertEqual(String(validation.cnCodeCount), '1', 'synthetic CN code count');
const readiness = euExport.evaluateEuExportReadiness(data, validation.cnCodeMap);
assertEqual(String(readiness.errorCount), '0', 'readiness error count');

// ── in-plant transfer guard (docs/internal-precursor-design.md §7-6) ──
// Until the engine chains processes, a transfer makes the document wrong either way: the receiving good is
// understated in the app, or doubled in the template when the transfer was also entered as a purchased precursor.
{
  const sender = { ...data.processes[0], market_output_mass_t: 950, internal_consumption_mass_t: 50 };
  const plain = euExport.evaluateEuExportReadiness({ ...data, processes: [sender] }, validation.cnCodeMap);
  const plainErrors = plain.issues.filter((issue) => issue.severity === 'error');
  assertEqual(String(plainErrors.length), '1', 'a transfer alone must block the export');
  assertEqual(String(/실제보다 낮게/.test(plainErrors[0].message)), 'true', 'transfer-only message must say the receiving good is understated');
  assertEqual(String(plainErrors[0].target?.id === sender.id), 'true', 'transfer error must link to the sending process');

  const receiver = { ...data.processes[0], id: 'process_receiver', name: 'Receiver', market_output_mass_t: 40, internal_consumption_mass_t: 0, output_mass_t: 40 };
  const workaround = { ...data.precursors[0], id: 'precursor_workaround', name: 'Slab from process 1', process_id: receiver.id, precursor_cn_code: product.cn_code };
  const doubled = euExport.evaluateEuExportReadiness({ ...data, processes: [sender, receiver], precursors: [...data.precursors, workaround] }, validation.cnCodeMap);
  const doubledErrors = doubled.issues.filter((issue) => issue.severity === 'error' && /두 배/.test(issue.message));
  assertEqual(String(doubledErrors.length), '1', 'a transfer plus a same-CN purchased precursor elsewhere must be flagged as double counting');
  assertEqual(String(doubledErrors[0].message.includes('Slab from process 1')), 'true', 'the double-counting message must name the precursor');
}
// 기준 픽스처의 전구물질은 간접 SEE 0.25에 전력 분해값이 없다 → EU 문서에 「1 MWh/t × 0.25」로 나간다는 경고 1건(run11 P1-17).
// 「공급사 확인」은 제3자 검증이 아니다 — 종전엔 조용히 통과했다(2025/2547 부속서 II A.1 4·5항).
assertEqual(String(readiness.warningCount), '3', 'readiness warning count (bridge-less precursor indirect SEE + empty UN/LOCODE + supplier-confirmed actual precursor)');
assertEqual(String(readiness.issues.some((issue) => issue.message.includes('공급사 확인 — 제3자 검증 아님') && issue.message.includes('A.1 4·5항'))), 'true', 'supplier-confirmed actual precursor must be announced as not usable without a verification report');
assertEqual(String(readiness.issues.some((issue) => issue.message.includes('1 MWh/t × 0.25'))), 'true', 'run11 P1-17: bridge-less indirect SEE is announced');
const bridgedReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  precursors: [{ ...precursor, indirect_electricity_mwh_per_t: 0.5, indirect_electricity_factor_tco2e_per_mwh: 0.5 }],
}, validation.cnCodeMap);
assertEqual(String(bridgedReadiness.issues.some((issue) => issue.message.includes('1 MWh/t'))), 'false', 'run11 P1-17: supplier electricity breakdown clears the warning');

// [2547 A.2.2] 산 열(스팀·온수): D_Processes (h) 수입 칸(L+46 열량 TJ · L+47 계수)에 적고, DirEm*(L+43)에는 넣지 않는다 —
// 템플릿 T열 수식이 L×L을 직접 내재배출에 더하므로 L+43에도 넣으면 두 번 센다.
{
  const heatProcess = { ...process, measurable_heat_import: 'YES', imported_heat_amount: 1000, imported_heat_unit: 'Gcal', imported_heat_ef_basis: 'STANDARD_FUEL_BOILER', imported_heat_standard_fuel: 'NATURAL_GAS' };
  const heatWrites = euExport.createEuTemplateExportCellWrites({ ...data, processes: [heatProcess] }, validation.cnCodeMap);
  const cell = (ref) => heatWrites.find((write) => write.sheetName === 'D_Processes' && write.cell === ref)?.value;
  assertEqual(String(Math.abs(cell('L57') - 4.1868) < 1e-12), 'true', 'D_Processes L57 imported heat TJ');
  assertEqual(String(Math.abs(cell('L58') - 56.1 / 0.9) < 1e-12), 'true', 'D_Processes L58 heat EF = natural gas / 0.9');
  assertEqual(String(cell('L54')), '120', 'DirEm* (L54) must not include the purchased heat');
  assertEqual(String(cell('M57') === undefined), 'true', 'heat export (M) is not asked, so it is not written');
  const noHeatWrites = euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap);
  assertEqual(String(noHeatWrites.some((write) => write.sheetName === 'D_Processes' && write.cell === 'L57')), 'false', 'no heat, no heat cells');

  const unanswered = euExport.evaluateEuExportReadiness({ ...data, processes: [{ ...process, measurable_heat_import: undefined }] }, validation.cnCodeMap);
  assertEqual(String(unanswered.issues.some((issue) => issue.severity === 'warning' && issue.message.includes('스팀·온수') && issue.message.includes('답하지 않았습니다'))), 'true', 'an unanswered heat question is announced');
  const brokenHeat = euExport.evaluateEuExportReadiness({ ...data, processes: [{ ...heatProcess, imported_heat_amount: 0 }] }, validation.cnCodeMap);
  assertEqual(String(brokenHeat.issues.some((issue) => issue.severity === 'error' && issue.message.includes('적게 나갑니다'))), 'true', '"uses heat" without an amount must block — the document would understate');
  assertEqual(String(euExport.evaluateEuExportReadiness({ ...data, processes: [heatProcess] }, validation.cnCodeMap).errorCount), '0', 'complete heat input adds no error');
}

// [2547 A.3 · CBAM-ALLOC-HEAT-02] 사내 공용 열 공급원(보일러): 연료는 공정에 매이지 않고(process_id 없음) 쓴 열량 비율로 귀속한다.
// EU 문서에는 같은 (h) 수입 칸(L+46 열량 TJ · L+47 계수)에 적는다 — 밖에서 산 열과 같은 칸이고, DirEm*(L+43)에는 넣지 않는다.
// 핵심: 열량 비율의 분모는 **전체 공정**의 열 사용량이다. EU 문서에 나가는 공정만 세면 수출하지 않는 공정이 쓴 열이 빠져
// 나가는 공정의 몫이 100%로 부풀려진다.
{
  const heatPeriod = { period_id: period.id };
  const cbamHeat = { ...process, ...heatPeriod, heat_consumption: [{ system: 'Boiler', quantity: 4, unit: 'TJ', basis: 'METERED' }] };
  const scrapProcess = { ...process, ...heatPeriod, id: 'process-scrap-line', name: 'Non-CBAM line', product_id: nonCbamProduct.id, direct_attributable_emissions_tco2e: 10, heat_consumption: [{ system: 'Boiler', quantity: 1, unit: 'TJ', basis: 'METERED' }] };
  const boiler = { ...sourceStream, ...heatPeriod, id: 'boiler-gas', process_id: undefined, name: 'Boiler gas', activity_data: 100, heat_system: { name: 'Boiler' } };
  const heatData = { ...data, products: [product, nonCbamProduct], processes: [cbamHeat, scrapProcess], sourceStreams: [{ ...sourceStream, ...heatPeriod }, boiler] };
  const boilerEmissions = 100 * 45 * 73 / 1000;
  const writes = euExport.createEuTemplateExportCellWrites(heatData, validation.cnCodeMap);
  const cell = (ref) => writes.find((write) => write.sheetName === 'D_Processes' && write.cell === ref)?.value;
  assertEqual(String(Math.abs(cell('L57') - 4) < 1e-12), 'true', 'shared heat: D_Processes L57 = this process heat (TJ)');
  assertEqual(String(Math.abs(cell('L58') - boilerEmissions / 5) < 1e-9), 'true', 'shared heat: L58 = fuel emissions / TOTAL heat of all processes (5 TJ), not only the exported ones');
  assertEqual(String(Math.abs(cell('L57') * cell('L58') - boilerEmissions * 0.8) < 1e-9), 'true', 'shared heat: the template multiplies L x L to this process share (80%)');
  assertEqual(String(cell('L54')), '120', 'DirEm* (L54) must not include the shared heat');
  assertEqual(String(writes.some((write) => write.sheetName === 'B_EmInst' && write.label === 'Source stream name' && write.value === 'Boiler gas')), 'true', 'the boiler fuel is listed in B_EmInst although it has no process');
  assertEqual(String(writes.some((write) => write.sheetName === 'D_Processes' && write.cell === 'L67')), 'false', 'a process outside the document gets no D_Processes row');

  // 밖에서 산 열이 함께 있으면 한 줄로 합친다: Q = Q밖 + Q안, EF = (E밖 + E안) / Q
  const bothHeat = { ...cbamHeat, measurable_heat_import: 'YES', imported_heat_amount: 1000, imported_heat_unit: 'Gcal', imported_heat_ef_basis: 'STANDARD_FUEL_BOILER', imported_heat_standard_fuel: 'NATURAL_GAS' };
  const bothWrites = euExport.createEuTemplateExportCellWrites({ ...heatData, processes: [bothHeat, scrapProcess] }, validation.cnCodeMap);
  const boughtTj = 1000 * 0.0041868;
  const bothCell = (ref) => bothWrites.find((write) => write.sheetName === 'D_Processes' && write.cell === ref)?.value;
  assertEqual(String(Math.abs(bothCell('L57') - (boughtTj + 4)) < 1e-9), 'true', 'bought + shared heat are one line (TJ)');
  assertEqual(String(Math.abs(bothCell('L57') * bothCell('L58') - (boughtTj * 56.1 / 0.9 + boilerEmissions * 0.8)) < 1e-6), 'true', 'bought + shared heat: Q x EF = both emissions');

  // 소비처가 없으면 연료는 문서에 싣지 않는다(CBAM 재화와 무관)
  const orphanWrites = euExport.createEuTemplateExportCellWrites({ ...heatData, processes: [{ ...cbamHeat, heat_consumption: undefined }, { ...scrapProcess, heat_consumption: undefined }] }, validation.cnCodeMap);
  assertEqual(String(orphanWrites.some((write) => write.label === 'Source stream name' && write.value === 'Boiler gas')), 'false', 'a heat system nobody in the document uses is not listed');

  // 준비도: 정상은 오류를 더하지 않고, 귀속하지 못하면 그 연료 배출이 통째로 사라지므로 막는다.
  const base = euExport.evaluateEuExportReadiness({ ...data, processes: [process], sourceStreams: [sourceStream] }, validation.cnCodeMap);
  const ok = euExport.evaluateEuExportReadiness(heatData, validation.cnCodeMap);
  assertEqual(String(ok.errorCount), String(base.errorCount), 'a complete heat system adds no error (the process-less boiler stream is not an error)');
  assertEqual(String(ok.issues.some((issue) => issue.message.includes('연결된 생산공정이 없어'))), 'false', 'a heat-system fuel stream legitimately has no process');
  const zero = euExport.evaluateEuExportReadiness({ ...heatData, processes: [{ ...cbamHeat, heat_consumption: [{ system: 'Boiler', quantity: 0, unit: 'TJ', basis: 'METERED' }] }, scrapProcess] }, validation.cnCodeMap);
  assertEqual(String(zero.issues.some((issue) => issue.severity === 'error' && issue.message.includes('열 공급원 「Boiler」') && issue.message.includes('빠집니다'))), 'true', 'zero heat blocks: the fuel would vanish');
  assertEqual(String(zero.issues.find((issue) => issue.message.includes('열 공급원 「Boiler」'))?.target?.type), 'process', 'the error links to a consuming process');
  const noConsumer = euExport.evaluateEuExportReadiness({ ...heatData, processes: [{ ...process, ...heatPeriod }], precursors: data.precursors }, validation.cnCodeMap);
  assertEqual(String(noConsumer.issues.some((issue) => issue.severity === 'error' && issue.message.includes('열을 받는 공정이 없습니다'))), 'true', 'a heat system without consumers blocks');
  assertEqual(String(noConsumer.issues.find((issue) => issue.message.includes('열을 받는 공정이 없습니다'))?.target?.type), 'sourceStream', 'the error links to the stream');
  const missing = euExport.evaluateEuExportReadiness({ ...heatData, sourceStreams: [{ ...sourceStream, ...heatPeriod }] }, validation.cnCodeMap);
  assertEqual(String(missing.issues.some((issue) => issue.severity === 'error' && issue.message.includes('연료 배출원이 없습니다'))), 'true', 'consuming a heat system that has no fuel blocks');
  // 공정에도 열 공급원에도 연결되지 않은 연료는 계산과 EU 문서 어디에도 안 들어간다 — 조용히 배출이 사라지므로 막는다(열 공급원 해제 뒤 실제로 생겼다).
  const orphanFuel = { ...boiler, id: 'orphan-fuel', name: 'Unlinked boiler gas', heat_system: undefined };
  const orphan = euExport.evaluateEuExportReadiness({ ...heatData, processes: [{ ...process, ...heatPeriod }], sourceStreams: [{ ...sourceStream, ...heatPeriod }, orphanFuel] }, validation.cnCodeMap);
  const orphanError = orphan.issues.find((issue) => issue.severity === 'error' && issue.message.includes('Unlinked boiler gas'));
  assertEqual(String(Boolean(orphanError)), 'true', 'a fuel stream linked to no process and no heat system blocks the export');
  assertEqual(String(orphanError?.message.includes('328.5000')), 'true', 'the message states how much would vanish');
  assertEqual(String(orphanError?.target?.type), 'sourceStream', 'the error links to the stream');
  const otherPeriodOrphan = euExport.evaluateEuExportReadiness({ ...heatData, sourceStreams: [...heatData.sourceStreams, { ...orphanFuel, period_id: 'another-period' }], periods: [period, { ...period, id: 'another-period', name: 'Other' }], reportingPeriodId: period.id }, validation.cnCodeMap);
  assertEqual(String(otherPeriodOrphan.issues.some((issue) => issue.message.includes('Unlinked boiler gas'))), 'false', 'an unlinked stream of another reporting period is not a problem of this document');
  const estimateNoNote = euExport.evaluateEuExportReadiness({ ...heatData, processes: [{ ...cbamHeat, heat_consumption: [{ system: 'Boiler', quantity: 4, unit: 'TJ', basis: 'INDIRECT_ESTIMATE' }] }, scrapProcess] }, validation.cnCodeMap);
  assertEqual(String(estimateNoNote.issues.some((issue) => issue.severity === 'warning' && issue.message.includes('추정(간접결정)'))), 'true', 'an estimate without a stated basis is announced');
}

// [run11 P1-12] 철강 가공품 공정에 구매 전구물질이 하나도 없으면 알린다. 사람이 「없음」을 확인하면 조용해진다.
const noPrecursorReadiness = euExport.evaluateEuExportReadiness({ ...data, precursors: [] }, validation.cnCodeMap);
assertEqual(String(noPrecursorReadiness.issues.some((issue) => issue.message.includes('구매 전구물질이 없습니다'))), 'true', 'run11 P1-12: missing precursors are announced');
const confirmedNoPrecursorReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  processes: [{ ...process, no_purchased_precursors: true }],
  precursors: [],
}, validation.cnCodeMap);
assertEqual(String(confirmedNoPrecursorReadiness.issues.some((issue) => issue.message.includes('구매 전구물질이 없습니다'))), 'false', 'run11 P1-12: confirmed "no purchased precursors" is quiet');

// [run11 P1-15·16] 사업장을 넘겨받으면 법정 필수 누락과 UN/LOCODE 공란을 알린다. 넘기지 않으면 결과가 그대로다.
const installationReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  installations: [{ ...installation, operator_name: '', operator_reg_number: undefined, operator_address: undefined }],
}, validation.cnCodeMap);
assertEqual(String(installationReadiness.issues.filter((issue) => issue.area === '사업장').length), '2', 'run11 P1-16: operator identity and UN/LOCODE gaps are announced');
assertEqual(String(installationReadiness.warningCount), String(installationReadiness.issues.filter((issue) => issue.severity === 'warning').length), 'warning count must include every listed warning');
assertEqual(String(installationReadiness.warningCount), '4', 'installation warnings are counted (2) on top of the bridge warning (1) and the supplier-confirmed precursor (1)');
assertEqual(String(euExport.evaluateEuExportReadiness({ ...data, installations: undefined }, validation.cnCodeMap).issues.filter((issue) => issue.area === '사업장').length), '0', 'callers that do not pass installations keep their results');
const completeInstallationReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  installations: [{ ...installation, operator_name: 'Op Co', operator_reg_number: '123-45-67890', operator_address: '1 Steel Road', unlocode: 'KRINC' }],
}, validation.cnCodeMap);
assertEqual(String(completeInstallationReadiness.issues.filter((issue) => issue.area === '사업장').length), '0', 'run11 P1-16: complete installation is quiet');

// [run11 P1-14] 제품도 활동수준 역할도 없는 생산라인은 배출을 가져가지만 EU 문서에 행이 없다.
const unassignedLineReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  productOutputLines: [outputLine, { ...outputLine, id: 'output-line-unassigned', product_id: undefined, activity_level_role: undefined, name: 'Unassigned line', output_mass_t: 10 }],
}, validation.cnCodeMap);
assertEqual(String(unassignedLineReadiness.issues.some((issue) => issue.message.includes("'Unassigned line'"))), 'true', 'run11 P1-14: unassigned output line is announced');

// [run11 P1-10] 전력을 쓰는 공정이 둘 이상인데 배분 근거가 없으면 알린다.
const sharedMeterReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  processes: [process, { ...process, id: 'process-second', name: 'Second line' }],
  productOutputLines: [outputLine, { ...outputLine, id: 'output-line-second', process_id: 'process-second' }],
  sourceStreams: [sourceStream, { ...sourceStream, id: 'source-stream-second', process_id: 'process-second' }],
}, validation.cnCodeMap);
assertEqual(String(sharedMeterReadiness.issues.filter((issue) => issue.message.includes('배분 근거')).length), '2', 'run11 P1-10: shared electricity meter without a note is announced per process');
const scopedReadiness = euExport.evaluateEuExportReadiness(scopedData, validation.cnCodeMap);
assertEqual(String(scopedReadiness.errorCount), '0', 'non-CBAM coproduct readiness error count');
assertEqual(String(scopedReadiness.warningCount), '3', 'non-CBAM coproduct readiness warning count (same three warnings only — the non-CBAM precursor adds none)');
const scopedWrites = euExport.createEuTemplateExportCellWrites(scopedData, validation.cnCodeMap);
assertEqual(String(scopedWrites.filter((write) => write.sheetName === 'Summary_Products').length), '3', 'only one reportable Summary_Products row');
assertEqual(
  String(scopedWrites.some((write) => write.sourceId === nonCbamProduct.id || write.sourceId === nonCbamOutputLine.id || write.sourceId === nonCbamPrecursor.id)),
  'false',
  'non-CBAM product, output line, and precursor are excluded from export writes'
);
// ── [씨밤이 run11 P0-02] 활동수준 제외 라인 하나 때문에 비신고 공정이 EU 문서에 나가면 안 된다 ──
// 스크랩·불량 라인은 제품을 지정하지 않는 것이 보통이라 보고범위가 기본값 CBAM_GOOD로 떨어진다.
// 그 라인 때문에 EU에 팔지 않는 탄소강 공정(1,860 t · 열처리로 1,050 tCO2e)이 이름 없이
// D_Processes 공정 1 블록에 나갔고, 화면은 「공정 수 1」이라고 했다.
const run11CarbonProcess = {
  ...process,
  id: 'process-carbon',
  product_id: nonCbamProduct.id,
  name: 'Carbon steel screws (not exported to EU)',
  output_mass_t: 1860,
  market_output_mass_t: 1860,
  internal_consumption_mass_t: 0,
};
const run11CarbonGoodLine = { ...nonCbamOutputLine, id: 'output-line-carbon', process_id: run11CarbonProcess.id, output_mass_t: 1860 };
const run11CarbonScrapLine = {
  ...outputLine,
  id: 'output-line-carbon-scrap',
  process_id: run11CarbonProcess.id,
  product_id: undefined,
  reporting_scope: undefined,
  name: 'Cut-off scrap',
  output_mass_t: 90,
  activity_level_role: 'EXCLUDED',
};
const run11CarbonStream = { ...sourceStream, id: 'source-stream-carbon-furnace', process_id: run11CarbonProcess.id, name: 'Heat treatment furnace gas' };
const run11Data = {
  ...data,
  products: [product, nonCbamProduct],
  // 비신고 공정이 **앞**에 온다 — 실사용에서 슬롯이 밀린 바로 그 순서.
  processes: [run11CarbonProcess, process],
  productOutputLines: [outputLine, run11CarbonGoodLine, run11CarbonScrapLine],
  sourceStreams: [sourceStream, run11CarbonStream],
  precursors: [precursor],
};
const run11Writes = euExport.createEuTemplateExportCellWrites(run11Data, validation.cnCodeMap);
assertEqual(
  String(run11Writes.some((write) => [run11CarbonProcess.id, run11CarbonStream.id, run11CarbonScrapLine.id].includes(write.sourceId))),
  'false',
  'run11 P0-02: a process whose only CBAM-scoped line is excluded from the activity level must not be exported'
);
assertEqual(
  run11Writes.find((write) => write.sheetName === 'D_Processes' && write.label.includes('생산량'))?.sourceId ?? run11Writes.find((write) => write.sheetName === 'D_Processes')?.sourceId,
  process.id,
  'run11 P0-02: D_Processes slot 1 belongs to the reportable process'
);

// ── [씨밤이 run11 P0-01] 전구물질 소비량은 **소비 공정의 슬롯 행**에 쓴다 ──
// 종전에는 항상 첫 슬롯 행(L28)에 썼다. 소비 공정이 2번 슬롯이면 EU 수식이 전구물질 배출을 0으로
// 계산해, 고객사가 재계산한 Summary_Products 총 SEE가 5.1117이 아니라 0.5259였다.
const run11FirstProcess = { ...process, id: 'process-first', name: 'Another reportable process' };
const run11FirstLine = { ...outputLine, id: 'output-line-first', process_id: run11FirstProcess.id };
const run11FirstStream = { ...sourceStream, id: 'source-stream-first', process_id: run11FirstProcess.id };
const run11SlotWrites = euExport.createEuTemplateExportCellWrites({
  ...data,
  processes: [run11FirstProcess, process],
  productOutputLines: [run11FirstLine, outputLine],
  sourceStreams: [run11FirstStream, sourceStream],
  precursors: [precursor],
}, validation.cnCodeMap);
const run11ConsumptionWrite = run11SlotWrites.find((write) => write.sheetName === 'E_PurchPrec' && write.label === '소비량');
assertEqual(run11ConsumptionWrite?.cell, 'L29', 'run11 P0-01: precursor consumed by the process in slot 2 goes to the slot-2 row');
assertEqual(
  euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap).find((write) => write.sheetName === 'E_PurchPrec' && write.label === '소비량')?.cell,
  'L28',
  'run11 P0-01: single-process export still writes the slot-1 row'
);
const run11SecondPrecursorWrite = euExport.createEuTemplateExportCellWrites({
  ...data,
  processes: [run11FirstProcess, process],
  productOutputLines: [run11FirstLine, outputLine],
  sourceStreams: [run11FirstStream, sourceStream],
  precursors: [{ ...precursor, id: 'precursor-0', process_id: run11FirstProcess.id }, precursor],
}, validation.cnCodeMap).filter((write) => write.sheetName === 'E_PurchPrec' && write.label === '소비량').map((write) => write.cell).join(',');
assertEqual(run11SecondPrecursorWrite, 'L28,L73', 'run11 P0-01: second precursor block (start row 58) uses its own slot row');

const missingSourceStreamReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  sourceStreams: [],
}, validation.cnCodeMap);
assertEqual(String(missingSourceStreamReadiness.errorCount), '1', 'missing source stream error count');
assertEqual(
  String(missingSourceStreamReadiness.issues.some((issue) => issue.message.includes('연결된 배출원 자료가 없습니다'))),
  'true',
  'missing source stream basis error'
);
const precursorEvidenceReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  precursors: [
    {
      ...precursor,
      id: 'precursor-default',
      data_mode: 'DEFAULT',
      default_value_justification: '',
    },
    {
      ...precursor,
      id: 'precursor-unverified',
      data_mode: 'SEMI_ACTUAL',
      verification_status: 'UNVERIFIED',
      default_value_justification: 'Supplier data partially replaced with defaults',
    },
  ],
}, validation.cnCodeMap);
assertEqual(String(precursorEvidenceReadiness.warningCount), '5', 'precursor evidence warning count (2 evidence + 2 bridge-less indirect + UN/LOCODE)');
assertEqual(
  String(precursorEvidenceReadiness.issues.some((issue) => issue.message.includes('기본값을 사용하는 사유'))),
  'true',
  'default precursor justification warning'
);
assertEqual(
  String(precursorEvidenceReadiness.issues.some((issue) => issue.message.includes('(미검증)') && issue.message.includes('A.1 4·5항'))),
  'true',
  'unverified precursor warning'
);
const allocationReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  sourceStreams: [],
  productOutputLines: [
    { ...outputLine, id: 'output-line-1', output_mass_t: 600, allocation_basis: 'MASS' },
    { ...outputLine, id: 'output-line-2', output_mass_t: 300, allocation_basis: 'MANUAL', manual_allocation_percent: 40 },
  ],
}, validation.cnCodeMap);
assertEqual(String(allocationReadiness.errorCount), '1', 'allocation readiness error count');
assertEqual(String(allocationReadiness.warningCount), '5', 'allocation readiness warning count (+1 supplier-confirmed actual precursor)');
assertEqual(
  String(allocationReadiness.issues.some((issue) => issue.message.includes('제품 생산라인 합계'))),
  'true',
  'allocation output total warning'
);
assertEqual(
  String(allocationReadiness.issues.some((issue) => issue.message.includes('배분기준이 섞여 있습니다'))),
  'true',
  'mixed allocation basis warning'
);
assertEqual(String(euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap).length), '47', 'planned cell writes');

// ── run30: 나눈 연료가 두 번 계산되면 문서를 막는다(확실한 경우만) ──
{
  const meter = (group, total) => ({ group, installation_total_activity_data: total, basis: 'OUTPUT_MASS' });
  const row = (id, processId, amount, extra = {}) => ({ ...sourceStream, id, process_id: processId, activity_data: amount, ...extra });
  const second = { ...data.processes[0], id: 'process-2', name: 'Second process' };
  const split = [row('split-1', data.processes[0].id, 60, { shared_meter: meter('공용 가스', 100) }), row('split-2', second.id, 40, { shared_meter: meter('공용 가스', 100) })];
  const check = (streams) => euExport.evaluateEuExportReadiness({ ...data, processes: [data.processes[0], second], sourceStreams: streams }, validation.cnCodeMap).issues
    .filter((issue) => issue.severity === 'error' && /두 번 계산됩니다/.test(issue.message));
  assertEqual(String(check(split).length), '0', '정상으로 나눈 연료는 막지 않는다');
  const duplicated = check([...split, row('old-total', data.processes[0].id, 100, { name: 'Natural gas (plant total)' })]);
  assertEqual(String(duplicated.length), '1', '나누기 전 공장 전체 값이 남으면 문서를 막는다');
  assertEqual(String(duplicated[0].target?.id), 'old-total', '남은 행을 가리킨다');
  assertEqual(String(duplicated[0].message.includes('Natural gas (plant total)') && duplicated[0].message.includes('「공용 가스」')), 'true', '행 이름과 계량기 이름을 말한다');
  assertEqual(String(check([...split, row('other', data.processes[0].id, 12.5)]).length), '0', '양이 다른 같은 연료는 막지 않는다(다른 계량기일 수 있다 — 나누기 현황이 안내만 한다)');
  assertEqual(String(check([...split, row('other-fuel', data.processes[0].id, 100, { emission_factor_tco2e_per_unit: 56.1 })]).length), '0', '다른 연료(계수가 다르다)는 막지 않는다');
}

// ── app scope: steel only, no integrated (BF/BOF) steelmaking yet ──
{
  const errorsOf = (extra) => euExport.evaluateEuExportReadiness({ ...data, ...extra }, validation.cnCodeMap).issues;
  const bf = errorsOf({ processes: [{ ...data.processes[0], production_route: 'BF/BOF integrated' }] }).filter((issue) => issue.severity === 'error' && /일관제철/.test(issue.message));
  assertEqual(String(bf.length), '1', 'an own process on the BF/BOF route must block the export');
  const eaf = errorsOf({ processes: [{ ...data.processes[0], production_route: 'Scrap EAF' }] }).filter((issue) => /일관제철/.test(issue.message));
  assertEqual(String(eaf.length), '0', 'an EAF process is in scope');
  const aluminium = { ...data.products[0], id: 'product_aluminium', name: 'Aluminium plate', cn_code: '76061191', hs_code: '7606', hs_group: '76' };
  const mixed = errorsOf({ products: [...data.products, aluminium] });
  assertEqual(String(mixed.filter((issue) => issue.severity === 'warning' && /철강 전용/.test(issue.message) && /담기지 않습니다/.test(issue.message)).length), '1', 'an out-of-scope product must be announced as left out of the document');
  assertEqual(String(mixed.filter((issue) => issue.severity === 'error' && /Aluminium plate/.test(issue.message)).length), '0', 'an out-of-scope product is left out, it does not block the steel document');
}

// ── D_Processes (c): in-plant transfers go to the receiving process's slot ──
// Slot layout confirmed against the official "Example Steel 2 EAF alloys" workbook (column S of the template):
// each block lists the other processes in order, skipping itself. Process 1 -> [2,3,4..], 2 -> [1,3,4..], 3 -> [1,2,4..].
assertEqual(String(euExport.internalConsumptionSlot(1, 2)), '1', 'process 1 -> process 2 is slot 1');
assertEqual(String(euExport.internalConsumptionSlot(2, 1)), '1', 'process 2 -> process 1 is slot 1');
assertEqual(String(euExport.internalConsumptionSlot(2, 3)), '2', 'process 2 -> process 3 is slot 2');
assertEqual(String(euExport.internalConsumptionSlot(3, 1)), '1', 'process 3 -> process 1 is slot 1');
assertEqual(String(euExport.internalConsumptionSlot(3, 2)), '2', 'process 3 -> process 2 is slot 2');
assertEqual(String(euExport.internalConsumptionSlot(1, 10)), '9', 'process 1 -> process 10 is the last slot');
assertEqual(String(euExport.internalConsumptionSlot(2, 2)), 'undefined', 'a process cannot transfer to itself');
{
  const mk = (id, name, internal) => ({ ...data.processes[0], id, name, output_mass_t: 1000, market_output_mass_t: 1000 - internal, internal_consumption_mass_t: internal });
  const a = mk('proc_a', 'A', 300);
  const b = mk('proc_b', 'B', 100);
  const c = mk('proc_c', 'C', 0);
  const transfers = [
    { id: 't1', source_process_id: a.id, target_process_id: b.id, mass_t: 100 },
    { id: 't2', source_process_id: a.id, target_process_id: c.id, mass_t: 150 },
    { id: 't3', source_process_id: a.id, target_process_id: 'proc_not_in_document', mass_t: 50 },
    { id: 't4', source_process_id: b.id, target_process_id: c.id, mass_t: 100 },
  ];
  const chainData = { ...data, processes: [a, b, c], precursors: [], internalTransfers: transfers };
  const cell = (writes, ref) => String(writes.find((write) => write.sheetName === 'D_Processes' && write.cell === ref)?.value);
  const writes = euExport.createEuTemplateExportCellWrites(chainData, validation.cnCodeMap);
  assertEqual(cell(writes, 'L32'), '100', 'A -> B lands in A slot 1 (L32)');
  assertEqual(cell(writes, 'L33'), '150', 'A -> C lands in A slot 2 (L33)');
  assertEqual(cell(writes, 'L41'), '50', 'a receiver outside the document goes to (d) non-CBAM consumption');
  assertEqual(cell(writes, 'L97'), '0', 'B -> A slot stays 0');
  assertEqual(cell(writes, 'L98'), '100', 'B -> C lands in B slot 2 (L98) — not slot 1, which is process A');
  assertEqual(cell(writes, 'L162'), '0', 'C sends nothing');
  assertEqual(String(writes.some((write) => write.sheetName === 'E_PurchPrec')), 'false', 'in-plant transfers must never reach E_PurchPrec');
  // With transfers that add up, the guard is a control, not a block.
  const ok = euExport.evaluateEuExportReadiness(chainData, validation.cnCodeMap).issues.filter((issue) => issue.severity === 'error' && /사내 다른 공정/.test(issue.message));
  assertEqual(String(ok.length), '0', 'transfers that add up to the in-plant consumption must not block the export');
  const short = euExport.evaluateEuExportReadiness({ ...chainData, internalTransfers: transfers.filter((t) => t.id !== 't2') }, validation.cnCodeMap)
    .issues.filter((issue) => issue.severity === 'error' && /지정한 양의 합/.test(issue.message));
  assertEqual(String(short.length), '1', 'transfers that do not add up must be an error');
  // run16: the engine refuses to chain in three cases and only warns. The readiness check must refuse the export too,
  // otherwise the receiving good goes out with SEE 0 and the map still says the document is ready.
  const structural = (extra) => euExport.evaluateEuExportReadiness({ ...chainData, ...extra }, validation.cnCodeMap)
    .issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message);
  const cyclic = structural({ processes: [a, { ...b, internal_consumption_mass_t: 110 }, c], internalTransfers: [...transfers, { id: 't5', source_process_id: b.id, target_process_id: a.id, mass_t: 10 }] });
  assertEqual(String(cyclic.some((message) => message.includes('순환'))), 'true', 'a cyclic transfer must block the export');
  const crossPeriod = structural({ processes: [a, { ...b, period_id: 'another_period' }, c] });
  assertEqual(String(crossPeriod.some((message) => message.includes('보고기간이 다른'))), 'true', 'a transfer across reporting periods must block the export');
  const lineOf = (id, productId) => ({ ...data.productOutputLines[0], id, process_id: a.id, product_id: productId, output_mass_t: 500 });
  const twoLines = [lineOf('line_x', data.products[0].id), lineOf('line_y', data.products[0].id)];
  const ambiguous = structural({ productOutputLines: twoLines });
  assertEqual(String(ambiguous.some((message) => message.includes('어느 제품을 넘기는지'))), 'true', 'a multi-product sender without a chosen line must block the export');
  const named = structural({ productOutputLines: twoLines, internalTransfers: transfers.map((t) => (t.source_process_id === a.id ? { ...t, source_output_line_id: 'line_x' } : t)) });
  assertEqual(String(named.some((message) => message.includes('어느 제품을 넘기는지'))), 'false', 'naming the sending line clears the error');
  assertEqual(String(structural({}).some((message) => /순환|보고기간이 다른|어느 제품/.test(message))), 'false', 'a sound chain raises none of the structural errors');
  // Legacy data (amount without transfer records) keeps the old single-cell write and stays blocked.
  const legacyWrites = euExport.createEuTemplateExportCellWrites({ ...chainData, internalTransfers: [] }, validation.cnCodeMap);
  assertEqual(cell(legacyWrites, 'L32'), '300', 'legacy data still writes the total to the first slot');
}
// 집계품목 라우트 정규화: 조강(Crude steel) 등 자유텍스트 경로도 허용 드롭다운 값('All production routes')으로.
const crudeProduct = { ...product, id: 'product-crude', name: 'Crude steel billet', hs_code: '7207', cn_code: '72071111', hs_group: '72', product_type_enum: 'HS72_SEMI' };
// run21: 구매 강재의 생산 경로 칸(A_InstData G102…)도 드롭다운이다 — 자유 문장을 그대로 쓰면 템플릿 X열 MATCH가 #N/A가 된다(Excel 재계산에서 발견).
{
  const routeOf = (productionRoute) => euExport
    .createEuTemplateExportCellWrites({ ...data, precursors: [{ ...precursor, production_route: productionRoute }] }, validation.cnCodeMap)
    .find((write) => write.sheetName === 'A_InstData' && write.cell === 'G102')?.value;
  assertEqual(routeOf('STS 선재 신선(CHQ 와이어) — 상위 제강 경로는 모름'), 'All production routes', 'Precursor free-text route normalized to the allowed dropdown value (G102)');
  assertEqual(routeOf('External precursor'), undefined, 'External precursor leaves the route cell empty');
  assertEqual(routeOf('   '), undefined, 'Blank precursor route leaves the cell empty (no invented route)');
}
const crudeProcess = { ...process, id: 'process-crude', product_id: crudeProduct.id, name: 'EAF steelmaking', production_route: 'Electric arc furnace' };
const crudeLine = { ...outputLine, id: 'line-crude', process_id: crudeProcess.id, product_id: crudeProduct.id };
const crudeWrites = euExport.createEuTemplateExportCellWrites(
  { ...data, products: [crudeProduct], processes: [crudeProcess], productOutputLines: [crudeLine], precursors: [], sourceStreams: [] },
  validation.cnCodeMap
);
assertEqual(
  String(crudeWrites.find((write) => write.sheetName === 'A_InstData' && write.cell === 'E62')?.value),
  'Crude steel',
  'Crude steel aggregated good (E62)'
);
assertEqual(
  String(crudeWrites.find((write) => write.sheetName === 'A_InstData' && write.cell === 'I62')?.value),
  'All production routes',
  'Crude steel free-text route normalized to allowed dropdown value (I62)'
);
const activityUnitFuelWrites = euExport.createEuTemplateExportCellWrites(
  {
    ...data,
    sourceStreams: [
      {
        ...sourceStream,
        id: 'source-stream-activity-unit-ef',
        emission_factor_basis: 'PER_ACTIVITY_UNIT',
        emission_factor_tco2e_per_unit: 2,
      },
    ],
  },
  validation.cnCodeMap
);
assertEqual(
  String(activityUnitFuelWrites.find((write) => write.sheetName === 'B_EmInst' && write.cell === 'K17')?.value),
  'tCO2/t',
  'B_EmInst K17 activity-unit fuel EF unit'
);
const checklist = euExport.createExportChecklist({
  backupStatus: {
    helper: '최근 백업 기록이 있습니다.',
    label: '백업 완료',
    tone: 'success',
  },
  lastExportResult: { checkedCellCount: 47 },
  plannedCellWriteCount: 47,
  readiness: {
    ...readiness,
    warningCount: 0,
    isSubmissionReady: true,
  },
  resultCount: 1,
  scenarioAction: { href: '/scenarios', label: '시나리오 검토' },
  scenarioRiskSummary: {
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
  },
  templateFileName: file.name,
  validation,
});
assertEqual(String(checklist.items.length), '8', 'export checklist item count');
assertEqual(String(checklist.reviewCount), '0', 'export checklist review count');
assertEqual(String(checklist.isComplete), 'true', 'export checklist complete');
const scenarioChecklist = euExport.createExportChecklist({
  backupStatus: {
    helper: '최근 백업 기록이 있습니다.',
    label: '백업 완료',
    tone: 'success',
  },
  lastExportResult: { checkedCellCount: 47 },
  plannedCellWriteCount: 47,
  readiness: {
    ...readiness,
    warningCount: 0,
    isSubmissionReady: true,
  },
  resultCount: 1,
  scenarioAction: { href: '/scenarios', label: '시나리오 검토' },
  scenarioRiskSummary: {
    missing_cn_count: 0,
    missing_official_reference_count: 0,
    missing_reference_count: 0,
    above_default_count: 2,
    certificate_exposure_count: 1,
    default_certificate_exposure_count: 1,
    actual_lower_certificate_count: 0,
    default_lower_certificate_count: 1,
    equal_certificate_count: 0,
    total_certificate_quantity_indicator: 10,
    total_certificate_cost_indicator_eur: 800,
    total_default_certificate_quantity_indicator: 5,
    total_default_certificate_cost_indicator_eur: 400,
    is_ready_for_review: true,
  },
  templateFileName: file.name,
  validation,
});
const scenarioChecklistItem = scenarioChecklist.items.find((item) => item.label === '인증서 비용 시나리오 검토');
assertEqual(
  // 0건인 항목은 문장에서 뺀다 — 「0건을 검토해야 합니다」는 할 일이 아니다(run12).
  String(scenarioChecklistItem?.description.includes('기본값이 더 유리하게 나온 품목 1건') && !scenarioChecklistItem?.description.includes(' 0건')),
  'true',
  'scenario checklist default basis summary'
);
const incompleteChecklist = euExport.createExportChecklist({
  backupStatus: {
    helper: '아직 백업 파일을 만든 기록이 없습니다.',
    label: '백업 필요',
    tone: 'warning',
  },
  plannedCellWriteCount: 47,
  readiness: allocationReadiness,
  resultCount: 0,
  scenarioAction: { href: '/upload', label: '기준자료 가져오기' },
  scenarioRiskSummary: {
    missing_cn_count: 1,
    missing_official_reference_count: 1,
    missing_reference_count: 1,
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
    is_ready_for_review: false,
  },
});
assertEqual(String(incompleteChecklist.isComplete), 'false', 'incomplete export checklist complete');
assertEqual(
  incompleteChecklist.items.find((item) => item.actionLabel === '첫 경고 검토')?.actionHref,
  '/processes?edit=process-1',
  'first warning checklist action href'
);
assertEqual(
  String(incompleteChecklist.items.find((item) => item.label === '반영 셀 검증')?.description.includes('A_InstData')),
  'true',
  'checklist should describe all current export sheets'
);
assertEqual(
  euExport.getEuExportIssueEditHref({ target: { type: 'product', id: 'product 1' } }),
  '/products?edit=product%201',
  'product issue edit href'
);
assertEqual(
  euExport.getEuExportIssueEditHref({ target: { type: 'process', id: 'process-1' } }),
  '/processes?edit=process-1',
  'process issue edit href'
);
assertEqual(
  euExport.getEuExportIssueEditHref({ target: { type: 'sourceStream', id: 'source-stream-1' } }),
  '/source-streams?edit=source-stream-1',
  'source stream issue edit href'
);
assertEqual(
  euExport.getEuExportIssueEditHref({ target: { type: 'precursor', id: 'precursor-1' } }),
  '/precursors?edit=precursor-1',
  'precursor issue edit href'
);
assertEqual(
  String(euExport.getEuExportIssueEditHref({})),
  'undefined',
  'missing target issue edit href'
);
assertEqual(
  euExport.getEuExportDownloadStatusMessage({
    backupStatus: { helper: '', label: '백업 완료', tone: 'success' },
    hasTemplateFile: false,
    readiness,
    validation,
  }),
  'EU 원본 템플릿을 먼저 선택하세요.',
  'download status without template'
);
assertEqual(
  euExport.getEuExportDownloadStatusMessage({
    backupStatus: { helper: '', label: '백업 완료', tone: 'success' },
    hasTemplateFile: true,
    readiness: { ...readiness, isSubmissionReady: true, warningCount: 0 },
    validation,
  }),
  '수입자 전달용 복사본을 생성할 수 있습니다.',
  'download status ready'
);
assertEqual(
  euExport.getEuExportDownloadStatusMessage({
    backupStatus: { helper: '', label: '백업 필요', tone: 'warning' },
    hasTemplateFile: true,
    readiness: { ...readiness, isSubmissionReady: true, warningCount: 0 },
    validation,
  }),
  '다운로드는 가능하지만 Communication Template 복사본 생성 전 .cbam 백업을 권장합니다.',
  'download status backup warning'
);

const exportResult = await euExport.createEuTemplateExportCopyResult(file, data);
const exportedBlob = exportResult.blob;
const exportedZip = fflate.unzipSync(new Uint8Array(await exportedBlob.arrayBuffer()));
const installationSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet5.xml']);
const sourceStreamSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet6.xml']);
const emissionsEnergySheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet7.xml']);
const processSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet8.xml']);
const precursorSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet9.xml']);
const summaryProductsSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet13.xml']);

assertEqual(readCell(installationSheet, 'I9'), '45292', 'A_InstData I9');
assertEqual(readCell(installationSheet, 'L9'), '45657', 'A_InstData L9');
assertEqual(readCell(installationSheet, 'I19'), 'Incheon Plant 1', 'A_InstData I19');
assertEqual(readCell(installationSheet, 'I20'), 'Main Factory A', 'A_InstData I20');
assertEqual(readCell(installationSheet, 'I21'), '1 Steel Road', 'A_InstData I21');
assertEqual(readCell(installationSheet, 'I22'), 'Steel processing', 'A_InstData I22');
assertEqual(readCell(installationSheet, 'I23'), '21990', 'A_InstData I23');
assertEqual(readCell(installationSheet, 'I25'), 'Incheon', 'A_InstData I25');
assertEqual(readCell(installationSheet, 'I26'), 'Korea, Republic of', 'A_InstData I26 (country code KR -> template country name)');
assertEqual(readCell(installationSheet, 'I30'), 'Local CBAM Manager', 'A_InstData I30');
assertEqual(readCell(installationSheet, 'I31'), 'cbam@example.com', 'A_InstData I31');
assertEqual(readCell(installationSheet, 'I32'), '+82-32-000-0000', 'A_InstData I32');
assertEqual(readCell(installationSheet, 'E62'), 'Iron or steel products', 'A_InstData E62');
assertEqual(readCell(installationSheet, 'I62'), 'All production routes', 'A_InstData I62 (iron/steel route -> only permitted dropdown value)');
assertEqual(readCell(installationSheet, 'E83'), 'Iron or steel products', 'A_InstData E83');
assertEqual(readCell(installationSheet, 'F83'), 'Only direct production', 'A_InstData F83');
assertEqual(readCell(installationSheet, 'L83'), 'Rolling and finishing', 'A_InstData L83');
assertEqual(readCell(installationSheet, 'E102'), 'Iron or steel products', 'A_InstData E102');
assertEqual(readCell(installationSheet, 'F102'), 'KR', 'A_InstData F102 (supplier country name -> ISO code)');
assertEqual(readCell(installationSheet, 'L102'), 'Purchased hot rolled coil', 'A_InstData L102');
assertEqual(readCell(sourceStreamSheet, 'D17'), 'Combustion', 'B_EmInst D17');
assertEqual(readCell(sourceStreamSheet, 'E17'), 'Natural gas combustion', 'B_EmInst E17');
assertEqual(readCell(sourceStreamSheet, 'F17'), '36.5296803652968', 'B_EmInst F17');
assertEqual(readCell(sourceStreamSheet, 'G17'), 't', 'B_EmInst G17');
assertEqual(readCell(sourceStreamSheet, 'H17'), '45', 'B_EmInst H17');
assertEqual(readCell(sourceStreamSheet, 'J17'), '73', 'B_EmInst J17');
assertEqual(readCell(sourceStreamSheet, 'K17'), 'tCO2/TJ', 'B_EmInst K17');
assertEqual(readCell(sourceStreamSheet, 'N17'), '100', 'B_EmInst N17');
assertEqual(readCell(sourceStreamSheet, 'P17'), '100', 'B_EmInst P17');
assertEqual(readCell(sourceStreamSheet, 'R17'), '0', 'B_EmInst R17');
assertEqual(readCell(emissionsEnergySheet, 'M26'), '', 'C_Emissions&Energy M26');
assertEqual(readCell(processSheet, 'L16'), '1000', 'D_Processes L16');
assertEqual(readCell(processSheet, 'L27'), '1000', 'D_Processes L27');
assertEqual(readCell(processSheet, 'L32'), '0', 'D_Processes L32');
assertEqual(readCell(processSheet, 'L54'), '120', 'D_Processes L54');
assertEqual(readCell(processSheet, 'L65'), '500', 'D_Processes L65');
assertEqual(readCell(processSheet, 'L66'), '0.47', 'D_Processes L66');
assertEqual(readCell(precursorSheet, 'L17'), '1100', 'E_PurchPrec L17');
assertEqual(readCell(precursorSheet, 'L28'), '1000', 'E_PurchPrec L28');
assertEqual(readCell(precursorSheet, 'L38'), '0', 'E_PurchPrec L38');
assertEqual(readCell(precursorSheet, 'L49'), '1.2', 'E_PurchPrec L49');
assertEqual(readCell(precursorSheet, 'M49'), 'Measured', 'E_PurchPrec M49 (data_mode ACTUAL -> Measured/Default/Unknown)');
assertEqual(readCell(precursorSheet, 'L50'), '1', 'E_PurchPrec L50');
assertEqual(readCell(precursorSheet, 'L51'), '0.25', 'E_PurchPrec L51');
assertEqual(readCell(precursorSheet, 'K54'), '', 'E_PurchPrec K54 (justification on merge anchor K, not L)');
assertEqual(readCell(summaryProductsSheet, 'D10'), 'Rolling and finishing', 'Summary_Products D10');
assertEqual(readCell(summaryProductsSheet, 'F10'), '72083900', 'Summary_Products F10');
assertEqual(readCell(summaryProductsSheet, 'H10'), 'Hot Rolled Coil', 'Summary_Products H10');
assertEqual(readFormula(summaryProductsSheet, 'I10'), 'D10&" direct SEE"', 'Summary_Products I10 formula');
assertEqual(readFormula(summaryProductsSheet, 'J10'), 'D10&" indirect SEE"', 'Summary_Products J10 formula');
assertEqual(readFormula(summaryProductsSheet, 'K10'), 'I10+J10', 'Summary_Products K10 formula');

// bridge: 공급사가 간접 SEE를 전력사용량(MWh/t)×계수(tCO₂e/MWh)로 준 경우, 그 실제 분해가
// E_PurchPrec L50/L51에 그대로 기재된다(synthetic 1×값이 아님). 검증 추적성 보존.
const bridgeFile = createSyntheticWorkbook(euExport.REQUIRED_EU_TEMPLATE_SHEETS);
const bridgeExport = await euExport.createEuTemplateExportCopyResult(bridgeFile, {
  ...data,
  precursors: [{
    ...precursor,
    indirect_electricity_mwh_per_t: 0.346,
    indirect_electricity_factor_tco2e_per_mwh: 0.59,
    indirect_see_tco2e_per_t: 0.20414,
  }],
});
const bridgeZip = fflate.unzipSync(new Uint8Array(await bridgeExport.blob.arrayBuffer()));
const bridgePrecursorSheet = fflate.strFromU8(bridgeZip['xl/worksheets/sheet9.xml']);
assertEqual(readCell(bridgePrecursorSheet, 'L50'), '0.346', 'E_PurchPrec L50 (bridge usage)');
assertEqual(readCell(bridgePrecursorSheet, 'L51'), '0.59', 'E_PurchPrec L51 (bridge factor)');

const packageGeneratedAt = new Date('2026-06-14T00:00:00.000Z');
const backup = {
  manifest: {
    format: 'cbam-local-backup',
    format_version: 1,
    app_name: 'CBAM Local',
    app_version: '0.1.0',
    exported_at: packageGeneratedAt.toISOString(),
    counts: {
      installations: 1,
      products: 1,
      periods: 1,
      processes: 1,
      product_output_lines: 1,
      source_streams: 1,
      precursors: 1,
      settings: 0,
    },
  },
  data: {
    installations: [installation],
    products: [product],
    periods: [period],
    processes: [process],
    product_output_lines: [outputLine],
    source_streams: [sourceStream],
    precursors: [precursor],
    settings: [],
  },
};
const calculationResult = {
  id: 'result-process-1',
  period_id: period.id,
  period_name: period.name,
  process_id: process.id,
  process_name: process.name,
  product_output_line_id: outputLine.id,
  allocation_basis: 'MASS',
  allocation_share: 1,
  product_id: product.id,
  product_name: product.name,
  reporting_scope: 'CBAM_GOOD',
  is_cbam_reportable: true,
  hs_code: product.hs_code,
  cn_code: product.cn_code,
  production_route: process.production_route,
  output_mass_t: process.output_mass_t,
  direct_emissions_tco2e: process.direct_attributable_emissions_tco2e,
  indirect_emissions_relevance: 'NOT_RELEVANT',
  indirect_emissions_rule: 'ANNEX_II_DIRECT_ONLY',
  indirect_emissions_excluded_tco2e: 235,
  indirect_emissions_gross_tco2e: 235,
  source_stream_count: 1,
  source_stream_emissions_tco2e: 120,
  source_stream_energy_tj: 1.643835616438356,
  source_stream_delta_tco2e: 0,
  direct_see: 0.12,
  own_indirect_see: 0.235,
  indirect_see: 0,
  indirect_see_excluded: 0.235,
  precursor_see: 1.45,
  precursor_direct_see: 1.2,
  precursor_indirect_see: 0.25,
  see_direct_incl_precursor: 1.32,
  see_indirect_incl_precursor: 0.485,
  see_cbam_basis: 1.32,
  see_informational_total: 1.805,
  total_see: 1.805,
  warnings: ['Synthetic warning for package verification'],
  warningDetails: [],
};
const packageResult = await deliveryPackage.createDeliveryPackage({
  backup,
  exportChecklist: checklist,
  exportVerification: exportResult.verification,
  exportWorkbookBlob: exportResult.blob,
  exportWorkbookFilename: 'synthetic-cbam-template_cbam-local-copy_20260614.xlsx',
  generatedAt: packageGeneratedAt,
  installations: [installation],
  periods: [period],
  precursors: [precursor],
  processes: [process],
  products: [product],
  readiness,
  results: [calculationResult],
  sourceStreams: [sourceStream],
  templateFilename: file.name,
  writtenCellCount: exportResult.writtenCellCount,
});
const packageZip = fflate.unzipSync(new Uint8Array(await packageResult.blob.arrayBuffer()));
const expectedPackageFiles = [
  '01_synthetic-cbam-template_cbam-local-copy_20260614.xlsx',
  '02_Calculation_Basis_Summary_KO-EN.docx',
  '03_Evidence_Checklist_KO-EN.docx',
  'internal_archive/04_cbam-local-backup-20260614000000.cbam',
  'internal_archive/05_export-log.json',
  'README_KO-EN.txt',
];

assertEqual(String(packageResult.filename.startsWith('CBAM_delivery_package_')), 'true', 'delivery package filename');
assertEqual(String(packageResult.files.length), '6', 'delivery package file count');
for (const expectedFile of expectedPackageFiles) {
  assertEqual(String(Boolean(packageZip[expectedFile])), 'true', `delivery package includes ${expectedFile}`);
}

// 산정보고서를 넣으면 04로 들어가고 내부 보관물이 05/06으로 밀린다.
// (넣지 않으면 위 6파일 구조 그대로 — 하위호환)
const packageWithReport = await deliveryPackage.createDeliveryPackage({
  ...{
    backup,
    exportChecklist: checklist,
    exportVerification: exportResult.verification,
    exportWorkbookBlob: exportResult.blob,
    exportWorkbookFilename: 'synthetic-cbam-template_cbam-local-copy_20260614.xlsx',
    generatedAt: packageGeneratedAt,
    installations: [installation],
    periods: [period],
    precursors: [precursor],
    processes: [process],
    products: [product],
    readiness,
    results: [calculationResult],
    sourceStreams: [sourceStream],
    templateFilename: file.name,
    writtenCellCount: exportResult.writtenCellCount,
  },
  calculationReportBlob: new Blob([strToU8Bytes('fake-report-bytes')], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }),
});
const packageWithReportZip = fflate.unzipSync(new Uint8Array(await packageWithReport.blob.arrayBuffer()));

assertEqual(String(packageWithReport.files.length), '7', 'delivery package file count with calculation report');
assertEqual(
  String(Boolean(packageWithReportZip['04_Calculation_Report.docx'])),
  'true',
  'delivery package includes 04_Calculation_Report.docx'
);
assertEqual(
  String(Boolean(packageWithReportZip['internal_archive/05_cbam-local-backup-20260614000000.cbam'])),
  'true',
  'backup shifted to internal_archive/05 when report is included'
);
assertEqual(
  String(Boolean(packageWithReportZip['internal_archive/06_export-log.json'])),
  'true',
  'export log shifted to internal_archive/06 when report is included'
);
assertEqual(
  String(fflate.strFromU8(packageWithReportZip['README_KO-EN.txt']).includes('04_Calculation_Report.docx')),
  'true',
  'README lists the calculation report and its completion caution'
);

const summaryDocxZip = fflate.unzipSync(packageZip['02_Calculation_Basis_Summary_KO-EN.docx']);
const checklistDocxZip = fflate.unzipSync(packageZip['03_Evidence_Checklist_KO-EN.docx']);
assertEqual(String(Boolean(summaryDocxZip['word/document.xml'])), 'true', 'summary docx document xml');
assertEqual(String(Boolean(checklistDocxZip['word/document.xml'])), 'true', 'checklist docx document xml');
assertEqual(
  String(fflate.strFromU8(summaryDocxZip['word/document.xml']).includes('CBAM Calculation Basis Summary')),
  'true',
  'summary docx title'
);
assertEqual(
  String(fflate.strFromU8(checklistDocxZip['word/document.xml']).includes('CBAM Evidence Checklist')),
  'true',
  'checklist docx title'
);
assertEqual(
  JSON.parse(fflate.strFromU8(packageZip['internal_archive/04_cbam-local-backup-20260614000000.cbam'])).manifest.format,
  'cbam-local-backup',
  'delivery package backup format'
);
assertEqual(
  JSON.parse(fflate.strFromU8(packageZip['internal_archive/05_export-log.json'])).export_verification_valid,
  true,
  'delivery package export log validity'
);
assertEqual(
  String(fflate.strFromU8(packageZip['README_KO-EN.txt']).includes('.cbam backup can contain sensitive local project data')),
  'true',
  'delivery package readme caution'
);

console.log('EU export synthetic workbook verification passed.');
