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
    const pairedPattern = new RegExp(`<${tagName}\\b([^>]*)>([\\s\\S]*?)<\\/${tagName}>`, 'g');
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
  createExportChecklist,
  createEuTemplateExportCellWrites,
  createEuTemplateExportCopy,
  evaluateEuExportReadiness,
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
      name === 'Parameters_CNCodes' ? cnCodeSheetXml() : emptySheetXml()
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

function assertEqual(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

const euExport = loadEuExportModule();
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
const data = {
  installations: [installation],
  periods: [period],
  products: [product],
  processes: [process],
  productOutputLines: [outputLine],
  sourceStreams: [sourceStream],
  precursors: [precursor],
};
const file = createSyntheticWorkbook(euExport.REQUIRED_EU_TEMPLATE_SHEETS);
const validation = await euExport.validateEuTemplateFile(file);

assertEqual(String(validation.isValid), 'true', 'synthetic workbook validity');
assertEqual(String(validation.cnCodeCount), '1', 'synthetic CN code count');
const readiness = euExport.evaluateEuExportReadiness(data, validation.cnCodeMap);
assertEqual(String(readiness.errorCount), '0', 'readiness error count');
assertEqual(String(readiness.warningCount), '1', 'readiness warning count');
const missingSourceStreamReadiness = euExport.evaluateEuExportReadiness({
  ...data,
  sourceStreams: [],
}, validation.cnCodeMap);
assertEqual(String(missingSourceStreamReadiness.warningCount), '1', 'missing source stream warning count');
assertEqual(
  String(missingSourceStreamReadiness.issues.some((issue) => issue.message.includes('연결된 배출원 자료가 없습니다'))),
  'true',
  'missing source stream basis warning'
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
assertEqual(String(precursorEvidenceReadiness.warningCount), '3', 'precursor evidence warning count');
assertEqual(
  String(precursorEvidenceReadiness.issues.some((issue) => issue.message.includes('기본값을 사용하는 사유'))),
  'true',
  'default precursor justification warning'
);
assertEqual(
  String(precursorEvidenceReadiness.issues.some((issue) => issue.message.includes('미검증 상태'))),
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
assertEqual(String(allocationReadiness.errorCount), '0', 'allocation readiness error count');
assertEqual(String(allocationReadiness.warningCount), '3', 'allocation readiness warning count');
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
assertEqual(String(euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap).length), '34', 'planned cell writes');
const checklist = euExport.createExportChecklist({
  backupStatus: {
    helper: '최근 백업 기록이 있습니다.',
    label: '백업 완료',
    tone: 'success',
  },
  lastExportResult: { checkedCellCount: 34 },
  plannedCellWriteCount: 34,
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
  lastExportResult: { checkedCellCount: 34 },
  plannedCellWriteCount: 34,
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
const scenarioChecklistItem = scenarioChecklist.items.find((item) => item.label === 'SEFA·인증서 시나리오 검토');
assertEqual(
  String(scenarioChecklistItem?.description.includes('기본값 우위 1건')),
  'true',
  'scenario checklist default basis summary'
);
const incompleteChecklist = euExport.createExportChecklist({
  backupStatus: {
    helper: '아직 백업 파일을 만든 기록이 없습니다.',
    label: '백업 필요',
    tone: 'warning',
  },
  plannedCellWriteCount: 34,
  readiness,
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
  '제출용 복사본을 생성할 수 있습니다.',
  'download status ready'
);
assertEqual(
  euExport.getEuExportDownloadStatusMessage({
    backupStatus: { helper: '', label: '백업 필요', tone: 'warning' },
    hasTemplateFile: true,
    readiness: { ...readiness, isSubmissionReady: true, warningCount: 0 },
    validation,
  }),
  '다운로드는 가능하지만 제출용 복사본 생성 전 .cbam 백업을 권장합니다.',
  'download status backup warning'
);

const exportedBlob = await euExport.createEuTemplateExportCopy(file, data);
const exportedZip = fflate.unzipSync(new Uint8Array(await exportedBlob.arrayBuffer()));
const installationSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet5.xml']);
const sourceStreamSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet6.xml']);
const emissionsEnergySheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet7.xml']);
const processSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet8.xml']);
const precursorSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet9.xml']);

assertEqual(readCell(installationSheet, 'I9'), '45292', 'A_InstData I9');
assertEqual(readCell(installationSheet, 'L9'), '45657', 'A_InstData L9');
assertEqual(readCell(installationSheet, 'I19'), 'Incheon Plant 1', 'A_InstData I19');
assertEqual(readCell(installationSheet, 'I20'), 'Main Factory A', 'A_InstData I20');
assertEqual(readCell(installationSheet, 'I21'), '1 Steel Road', 'A_InstData I21');
assertEqual(readCell(installationSheet, 'I22'), 'Steel processing', 'A_InstData I22');
assertEqual(readCell(installationSheet, 'I23'), '21990', 'A_InstData I23');
assertEqual(readCell(installationSheet, 'I25'), 'Incheon', 'A_InstData I25');
assertEqual(readCell(installationSheet, 'I26'), 'KR', 'A_InstData I26');
assertEqual(readCell(installationSheet, 'I30'), 'Local CBAM Manager', 'A_InstData I30');
assertEqual(readCell(installationSheet, 'I31'), 'cbam@example.com', 'A_InstData I31');
assertEqual(readCell(installationSheet, 'I32'), '+82-32-000-0000', 'A_InstData I32');
assertEqual(readCell(sourceStreamSheet, 'D17'), 'Combustion', 'B_EmInst D17');
assertEqual(readCell(sourceStreamSheet, 'E17'), 'Natural gas combustion', 'B_EmInst E17');
assertEqual(readCell(sourceStreamSheet, 'F17'), '250', 'B_EmInst F17');
assertEqual(readCell(sourceStreamSheet, 'G17'), 't', 'B_EmInst G17');
assertEqual(readCell(sourceStreamSheet, 'H17'), '45', 'B_EmInst H17');
assertEqual(readCell(sourceStreamSheet, 'J17'), '73', 'B_EmInst J17');
assertEqual(readCell(sourceStreamSheet, 'K17'), 'tCO2/TJ', 'B_EmInst K17');
assertEqual(readCell(sourceStreamSheet, 'N17'), '100', 'B_EmInst N17');
assertEqual(readCell(sourceStreamSheet, 'P17'), '100', 'B_EmInst P17');
assertEqual(readCell(sourceStreamSheet, 'R17'), '0', 'B_EmInst R17');
assertEqual(readCell(emissionsEnergySheet, 'M26'), '', 'C_Emissions&Energy M26');
assertEqual(readCell(processSheet, 'L16'), '1000', 'D_Processes L16');
assertEqual(readCell(processSheet, 'L27'), '950', 'D_Processes L27');
assertEqual(readCell(processSheet, 'L32'), '50', 'D_Processes L32');
assertEqual(readCell(processSheet, 'L54'), '120', 'D_Processes L54');
assertEqual(readCell(processSheet, 'L65'), '500', 'D_Processes L65');
assertEqual(readCell(processSheet, 'L66'), '0.47', 'D_Processes L66');
assertEqual(readCell(precursorSheet, 'L17'), '1100', 'E_PurchPrec L17');
assertEqual(readCell(precursorSheet, 'L28'), '1000', 'E_PurchPrec L28');
assertEqual(readCell(precursorSheet, 'L38'), '0', 'E_PurchPrec L38');
assertEqual(readCell(precursorSheet, 'L49'), '1.2', 'E_PurchPrec L49');
assertEqual(readCell(precursorSheet, 'M49'), 'Supplier communication template', 'E_PurchPrec M49');
assertEqual(readCell(precursorSheet, 'L54'), '', 'E_PurchPrec L54');

console.log('EU export synthetic workbook verification passed.');
