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
  const source = readFileSync('src/lib/eu-template-export.ts', 'utf8')
    .replace(
      "import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';",
      'const { strFromU8, strToU8, unzipSync, zipSync } = fflate;'
    )
    .replace(/^import type .*;\r?\n/gm, '')
    .replace(/^export /gm, '');
  const compiled = ts.transpileModule(
    `${source}
globalThis.euExport = {
  REQUIRED_EU_TEMPLATE_SHEETS,
  createEuTemplateExportCellWrites,
  createEuTemplateExportCopy,
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
  direct_see_tco2e_per_t: 1.2,
  indirect_see_tco2e_per_t: 0.25,
  source: 'Supplier communication template',
  default_value_justification: '',
};
const data = {
  products: [product],
  processes: [process],
  precursors: [precursor],
};
const file = createSyntheticWorkbook(euExport.REQUIRED_EU_TEMPLATE_SHEETS);
const validation = await euExport.validateEuTemplateFile(file);

assertEqual(String(validation.isValid), 'true', 'synthetic workbook validity');
assertEqual(String(validation.cnCodeCount), '1', 'synthetic CN code count');
assertEqual(String(euExport.createEuTemplateExportCellWrites(data, validation.cnCodeMap).length), '15', 'planned cell writes');

const exportedBlob = await euExport.createEuTemplateExportCopy(file, data);
const exportedZip = fflate.unzipSync(new Uint8Array(await exportedBlob.arrayBuffer()));
const processSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet8.xml']);
const precursorSheet = fflate.strFromU8(exportedZip['xl/worksheets/sheet9.xml']);

assertEqual(readCell(processSheet, 'G11'), 'Rolling and finishing', 'D_Processes G11');
assertEqual(readCell(processSheet, 'L11'), 'Iron or steel products', 'D_Processes L11');
assertEqual(readCell(processSheet, 'L24'), '1000', 'D_Processes L24');
assertEqual(readCell(processSheet, 'L66'), '0.47', 'D_Processes L66');
assertEqual(readCell(precursorSheet, 'G14'), 'Purchased hot rolled coil', 'E_PurchPrec G14');
assertEqual(readCell(precursorSheet, 'L14'), 'Iron or steel products', 'E_PurchPrec L14');
assertEqual(readCell(precursorSheet, 'L25'), '1100', 'E_PurchPrec L25');
assertEqual(readCell(precursorSheet, 'L52'), '0.25', 'E_PurchPrec L52');

console.log('EU export synthetic workbook verification passed.');
