import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type {
    Product,
    PurchasedPrecursor,
    SourceStream,
} from '@/lib/local-db';

type SheetDefinition = {
    name: string;
    rows: Array<Array<string | number>>;
};

type SheetInfo = {
    name: string;
    path: string;
};

export interface ActivityTemplateProductRow {
    product_name: string;
    hs_code: string;
    cn_code: string;
    hs_group: Product['hs_group'];
    product_type_enum: string;
    unit: string;
    reporting_scope: Product['reporting_scope'];
}

export interface ActivityTemplateProcessRow {
    process_name: string;
    product_name: string;
    production_route: string;
    output_mass_t: number;
    market_output_mass_t: number;
    internal_consumption_mass_t: number;
    direct_attributable_emissions_tco2e: number;
    electricity_mwh: number;
    electricity_ef_tco2e_per_mwh: number;
    electricity_ef_source: string;
}

export interface ActivityTemplateSourceStreamRow {
    source_stream_name: string;
    process_name: string;
    stream_type: SourceStream['stream_type'];
    method: string;
    activity_data: number;
    activity_unit: string;
    ncv_gj_per_unit: number;
    emission_factor_tco2e_per_unit: number;
    emission_factor_basis: SourceStream['emission_factor_basis'];
    oxidation_factor: number;
    conversion_factor: number;
    fossil_fraction: number;
    biomass_fraction: number;
    factor_source_type: SourceStream['factor_source_type'];
    source: string;
}

export interface ActivityTemplatePrecursorRow {
    precursor_name: string;
    product_name: string;
    process_name: string;
    precursor_cn_code: string;
    aggregated_goods_category: string;
    production_route: string;
    supplier_country: string;
    supplier_installation: string;
    data_mode: PurchasedPrecursor['data_mode'];
    verification_status: PurchasedPrecursor['verification_status'];
    default_value_year: PurchasedPrecursor['default_value_year'];
    purchased_mass_t: number;
    consumed_mass_t: number;
    consumed_for_non_cbam_mass_t: number;
    direct_see_tco2e_per_t: number;
    indirect_see_tco2e_per_t: number;
    source: string;
    default_value_justification: string;
}

export interface ActivityTemplateImportPlan {
    products: ActivityTemplateProductRow[];
    processes: ActivityTemplateProcessRow[];
    sourceStreams: ActivityTemplateSourceStreamRow[];
    precursors: ActivityTemplatePrecursorRow[];
    warnings: string[];
}

export interface ActivityTemplateImportSummary {
    products: number;
    processes: number;
    sourceStreams: number;
    precursors: number;
    skipped: number;
}

export const ACTIVITY_TEMPLATE_FILENAME = 'CBAMY_internal_activity_data_template.xlsx';

const templateSheets: SheetDefinition[] = [
    {
        name: 'README',
        rows: [
            ['CBAMY Internal Activity Data Template'],
            ['Fill the Products, Processes, SourceStreams, and Precursors sheets. Upload is parsed locally in the browser only.'],
            ['Do not include confidential files as attachments in this workbook. Keep evidence files in your internal records.'],
            ['Rows with missing required names are skipped or reported as warnings. Existing names are reused to avoid duplicate core records.'],
        ],
    },
    {
        name: 'Products',
        rows: [
            ['product_name', 'hs_code', 'cn_code', 'hs_group', 'product_type_enum', 'unit', 'reporting_scope'],
            ['Hot Rolled Coil', '7208', '72083900', '72', 'HS72_PLATE_SHEET', 'tonne', 'CBAM_GOOD'],
            ['Steel Pipe', '7306', '73063080', '73', 'HS73_PIPE_TUBE', 'tonne', 'CBAM_GOOD'],
        ],
    },
    {
        name: 'Processes',
        rows: [
            [
                'process_name',
                'product_name',
                'production_route',
                'output_mass_t',
                'market_output_mass_t',
                'internal_consumption_mass_t',
                'direct_attributable_emissions_tco2e',
                'electricity_mwh',
                'electricity_ef_tco2e_per_mwh',
                'electricity_ef_source',
            ],
            ['Rolling Line A', 'Hot Rolled Coil', 'Integrated route', 1250, 1200, 50, 310, 820, 0.4594, 'COUNTRY_GRID_DEFAULT'],
        ],
    },
    {
        name: 'SourceStreams',
        rows: [
            [
                'source_stream_name',
                'process_name',
                'stream_type',
                'method',
                'activity_data',
                'activity_unit',
                'ncv_gj_per_unit',
                'emission_factor_tco2e_per_unit',
                'emission_factor_basis',
                'oxidation_factor',
                'conversion_factor',
                'fossil_fraction',
                'biomass_fraction',
                'factor_source_type',
                'source',
            ],
            ['Natural gas for reheating', 'Rolling Line A', 'FUEL', 'Combustion', 48200, 'Nm3', 0.039, 0.00217, 'PER_ACTIVITY_UNIT', 1, 1, 1, 0, 'SUPPLIER_OR_LAB', 'ERP fuel ledger / utility invoice'],
        ],
    },
    {
        name: 'Precursors',
        rows: [
            [
                'precursor_name',
                'product_name',
                'process_name',
                'precursor_cn_code',
                'aggregated_goods_category',
                'production_route',
                'supplier_country',
                'supplier_installation',
                'data_mode',
                'verification_status',
                'default_value_year',
                'purchased_mass_t',
                'consumed_mass_t',
                'consumed_for_non_cbam_mass_t',
                'direct_see_tco2e_per_t',
                'indirect_see_tco2e_per_t',
                'source',
                'default_value_justification',
            ],
            [
                'Purchased slab',
                'Hot Rolled Coil',
                'Rolling Line A',
                '72071210',
                'Iron and steel',
                'Integrated route',
                'South Korea',
                'Supplier A',
                'DEFAULT',
                'UNVERIFIED',
                '2026',
                980,
                960,
                0,
                1.85,
                0,
                'EU country/CN default value',
                'Supplier measured SEE not available; official default value used for first calculation.',
            ],
        ],
    },
];

function escapeXml(value: string) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function unescapeXml(value: string) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

function columnName(index: number) {
    let n = index + 1;
    let name = '';

    while (n > 0) {
        const rem = (n - 1) % 26;
        name = String.fromCharCode(65 + rem) + name;
        n = Math.floor((n - 1) / 26);
    }

    return name;
}

function sheetXml(rows: SheetDefinition['rows']) {
    const rowXml = rows.map((row, rowIndex) => {
        const cells = row.map((value, columnIndex) => {
            const ref = `${columnName(columnIndex)}${rowIndex + 1}`;

            if (typeof value === 'number') {
                return `<c r="${ref}"><v>${value}</v></c>`;
            }

            return `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
        }).join('');

        return `<row r="${rowIndex + 1}">${cells}</row>`;
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowXml}</sheetData></worksheet>`;
}

function workbookXml(sheets: SheetDefinition[]) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRelsXml(sheets: SheetDefinition[]) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}</Relationships>`;
}

function contentTypesXml(sheets: SheetDefinition[]) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
}

function rootRelsXml() {
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
}

export function createActivityDataTemplateWorkbook() {
    const files: Record<string, Uint8Array> = {
        '[Content_Types].xml': strToU8(contentTypesXml(templateSheets)),
        '_rels/.rels': strToU8(rootRelsXml()),
        'xl/workbook.xml': strToU8(workbookXml(templateSheets)),
        'xl/_rels/workbook.xml.rels': strToU8(workbookRelsXml(templateSheets)),
    };

    templateSheets.forEach((sheet, index) => {
        files[`xl/worksheets/sheet${index + 1}.xml`] = strToU8(sheetXml(sheet.rows));
    });

    return new Blob([zipSync(files)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function parseAttributes(rawAttributes: string) {
    const attributes = new Map<string, string>();

    for (const match of rawAttributes.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
        attributes.set(match[1], unescapeXml(match[2]));
    }

    return attributes;
}

function stripXmlTags(value: string) {
    return unescapeXml(value.replace(/<[^>]+>/g, ''));
}

function getColumnName(cellReference: string) {
    const match = cellReference.match(/[A-Z]+/);
    return match?.[0] ?? '';
}

function parseWorkbookSheets(zip: Record<string, Uint8Array>): SheetInfo[] {
    const workbookBytes = zip['xl/workbook.xml'];
    const relsBytes = zip['xl/_rels/workbook.xml.rels'];

    if (!workbookBytes || !relsBytes) {
        throw new Error('유효한 .xlsx 파일이 아니거나 workbook.xml을 찾을 수 없습니다.');
    }

    const relTargetById = new Map<string, string>();

    for (const match of strFromU8(relsBytes).matchAll(/<Relationship\b([^>]*)\/?>/g)) {
        const attributes = parseAttributes(match[1]);
        const id = attributes.get('Id');
        const target = attributes.get('Target');

        if (id && target?.startsWith('worksheets/')) {
            relTargetById.set(id, `xl/${target}`);
        }
    }

    const sheets: SheetInfo[] = [];

    for (const match of strFromU8(workbookBytes).matchAll(/<sheet\b([^>]*)\/?>/g)) {
        const attributes = parseAttributes(match[1]);
        const name = attributes.get('name');
        const relationshipId = attributes.get('r:id') ?? attributes.get('id');
        const path = relationshipId ? relTargetById.get(relationshipId) : undefined;

        if (name && path) {
            sheets.push({ name, path });
        }
    }

    return sheets;
}

function parseSharedStrings(zip: Record<string, Uint8Array>) {
    const sharedStringsXml = zip['xl/sharedStrings.xml'];

    if (!sharedStringsXml) {
        return [];
    }

    return Array.from(strFromU8(sharedStringsXml).matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) =>
        stripXmlTags(match[1])
    );
}

function readCellValue(cellXml: string, sharedStrings: string[]) {
    const attributes = parseAttributes(cellXml.match(/^<c\b([^>]*)/)?.[1] ?? '');
    const type = attributes.get('t');

    if (type === 's') {
        const index = Number(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? -1);
        return sharedStrings[index] ?? '';
    }

    if (type === 'inlineStr') {
        return stripXmlTags(cellXml.match(/<is>([\s\S]*?)<\/is>/)?.[1] ?? '');
    }

    return unescapeXml(cellXml.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '');
}

function parseRows(sheetXmlText: string, sharedStrings: string[]) {
    const rows: Array<Map<string, string>> = [];

    for (const rowMatch of sheetXmlText.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const valuesByColumn = new Map<string, string>();

        for (const cellMatch of rowMatch[1].matchAll(/<c\b[\s\S]*?(?:<\/c>|\/>)/g)) {
            const cellXml = cellMatch[0];
            const attributes = parseAttributes(cellXml.match(/^<c\b([^>]*)/)?.[1] ?? '');
            const reference = attributes.get('r');

            if (reference) {
                valuesByColumn.set(getColumnName(reference), readCellValue(cellXml, sharedStrings).trim());
            }
        }

        rows.push(valuesByColumn);
    }

    return rows;
}

function normalizeHeader(value: string) {
    return value.trim().toLowerCase();
}

function tableRows(zip: Record<string, Uint8Array>, sheets: SheetInfo[], sheetName: string, sharedStrings: string[]) {
    const sheet = sheets.find((item) => item.name.toLowerCase() === sheetName.toLowerCase());
    const bytes = sheet ? zip[sheet.path] : undefined;

    if (!sheet || !bytes) {
        return [];
    }

    const parsedRows = parseRows(strFromU8(bytes), sharedStrings);
    const headerRow = parsedRows[0];

    if (!headerRow) {
        return [];
    }

    const headers = Array.from(headerRow.entries()).map(([column, value]) => [column, normalizeHeader(value)] as const);
    const result: Array<Record<string, string>> = [];

    for (const row of parsedRows.slice(1)) {
        const record: Record<string, string> = {};

        for (const [column, header] of headers) {
            if (header) {
                record[header] = row.get(column) ?? '';
            }
        }

        if (Object.values(record).some((value) => value.trim())) {
            result.push(record);
        }
    }

    return result;
}

function text(row: Record<string, string>, key: string) {
    return row[key]?.trim() ?? '';
}

function numberValue(row: Record<string, string>, key: string, fallback = 0) {
    const value = text(row, key);
    const parsed = Number(value.replaceAll(',', ''));
    return Number.isFinite(parsed) ? parsed : fallback;
}

function choice<T extends string>(value: string, allowed: readonly T[], fallback: T) {
    return allowed.includes(value as T) ? value as T : fallback;
}

export async function parseActivityDataTemplate(file: File): Promise<ActivityTemplateImportPlan> {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('내부 활동자료 템플릿은 .xlsx 파일이어야 합니다.');
    }

    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const sheets = parseWorkbookSheets(zip);
    const sharedStrings = parseSharedStrings(zip);
    const warnings: string[] = [];

    const products = tableRows(zip, sheets, 'Products', sharedStrings)
        .map((row, index): ActivityTemplateProductRow | undefined => {
            const productName = text(row, 'product_name');

            if (!productName) {
                warnings.push(`Products ${index + 2}행: product_name이 비어 있어 건너뜁니다.`);
                return undefined;
            }

            return {
                product_name: productName,
                hs_code: text(row, 'hs_code') || text(row, 'cn_code').slice(0, 4),
                cn_code: text(row, 'cn_code'),
                hs_group: text(row, 'hs_group') || text(row, 'cn_code').slice(0, 2) || text(row, 'hs_code').slice(0, 2) || '72',
                product_type_enum: text(row, 'product_type_enum') || 'HS72_OTHER',
                unit: text(row, 'unit') || 'tonne',
                reporting_scope: choice(text(row, 'reporting_scope'), ['CBAM_GOOD', 'NON_CBAM_COPRODUCT', 'WASTE_RECYCLE', 'INTERNAL_ONLY'] as const, 'CBAM_GOOD'),
            };
        })
        .filter((row): row is ActivityTemplateProductRow => Boolean(row));

    const processes = tableRows(zip, sheets, 'Processes', sharedStrings)
        .map((row, index): ActivityTemplateProcessRow | undefined => {
            const processName = text(row, 'process_name');

            if (!processName) {
                warnings.push(`Processes ${index + 2}행: process_name이 비어 있어 건너뜁니다.`);
                return undefined;
            }

            return {
                process_name: processName,
                product_name: text(row, 'product_name'),
                production_route: text(row, 'production_route') || 'Not specified',
                output_mass_t: numberValue(row, 'output_mass_t'),
                market_output_mass_t: numberValue(row, 'market_output_mass_t'),
                internal_consumption_mass_t: numberValue(row, 'internal_consumption_mass_t'),
                direct_attributable_emissions_tco2e: numberValue(row, 'direct_attributable_emissions_tco2e'),
                electricity_mwh: numberValue(row, 'electricity_mwh'),
                electricity_ef_tco2e_per_mwh: numberValue(row, 'electricity_ef_tco2e_per_mwh'),
                electricity_ef_source: text(row, 'electricity_ef_source'),
            };
        })
        .filter((row): row is ActivityTemplateProcessRow => Boolean(row));

    const sourceStreams = tableRows(zip, sheets, 'SourceStreams', sharedStrings)
        .map((row, index): ActivityTemplateSourceStreamRow | undefined => {
            const sourceStreamName = text(row, 'source_stream_name');

            if (!sourceStreamName) {
                warnings.push(`SourceStreams ${index + 2}행: source_stream_name이 비어 있어 건너뜁니다.`);
                return undefined;
            }

            return {
                source_stream_name: sourceStreamName,
                process_name: text(row, 'process_name'),
                stream_type: choice(text(row, 'stream_type'), ['FUEL', 'PROCESS_MATERIAL', 'OTHER'] as const, 'FUEL'),
                method: text(row, 'method') || 'Combustion',
                activity_data: numberValue(row, 'activity_data'),
                activity_unit: text(row, 'activity_unit') || 't',
                ncv_gj_per_unit: numberValue(row, 'ncv_gj_per_unit'),
                emission_factor_tco2e_per_unit: numberValue(row, 'emission_factor_tco2e_per_unit'),
                emission_factor_basis: choice(text(row, 'emission_factor_basis'), ['PER_TJ', 'PER_ACTIVITY_UNIT'] as const, 'PER_TJ'),
                oxidation_factor: numberValue(row, 'oxidation_factor', 1),
                conversion_factor: numberValue(row, 'conversion_factor', 1),
                fossil_fraction: numberValue(row, 'fossil_fraction', 1),
                biomass_fraction: numberValue(row, 'biomass_fraction'),
                factor_source_type: choice(
                    text(row, 'factor_source_type'),
                    ['EU_OR_IPCC_DEFAULT', 'NATIONAL_INVENTORY', 'SUPPLIER_OR_LAB', 'UNCLASSIFIED'] as const,
                    'UNCLASSIFIED'
                ),
                source: text(row, 'source'),
            };
        })
        .filter((row): row is ActivityTemplateSourceStreamRow => Boolean(row));

    const precursors = tableRows(zip, sheets, 'Precursors', sharedStrings)
        .map((row, index): ActivityTemplatePrecursorRow | undefined => {
            const precursorName = text(row, 'precursor_name');

            if (!precursorName) {
                warnings.push(`Precursors ${index + 2}행: precursor_name이 비어 있어 건너뜁니다.`);
                return undefined;
            }

            return {
                precursor_name: precursorName,
                product_name: text(row, 'product_name'),
                process_name: text(row, 'process_name'),
                precursor_cn_code: text(row, 'precursor_cn_code'),
                aggregated_goods_category: text(row, 'aggregated_goods_category') || 'Iron and steel',
                production_route: text(row, 'production_route') || 'Not specified',
                supplier_country: text(row, 'supplier_country') || 'South Korea',
                supplier_installation: text(row, 'supplier_installation'),
                data_mode: choice(text(row, 'data_mode'), ['ACTUAL', 'SEMI_ACTUAL', 'DEFAULT'] as const, 'DEFAULT'),
                verification_status: choice(text(row, 'verification_status'), ['UNVERIFIED', 'SUPPLIER_CONFIRMED', 'VERIFIED'] as const, 'UNVERIFIED'),
                default_value_year: choice(text(row, 'default_value_year'), ['2026', '2027', '2028_ONWARDS'] as const, '2026'),
                purchased_mass_t: numberValue(row, 'purchased_mass_t'),
                consumed_mass_t: numberValue(row, 'consumed_mass_t'),
                consumed_for_non_cbam_mass_t: numberValue(row, 'consumed_for_non_cbam_mass_t'),
                direct_see_tco2e_per_t: numberValue(row, 'direct_see_tco2e_per_t'),
                indirect_see_tco2e_per_t: numberValue(row, 'indirect_see_tco2e_per_t'),
                source: text(row, 'source'),
                default_value_justification: text(row, 'default_value_justification'),
            };
        })
        .filter((row): row is ActivityTemplatePrecursorRow => Boolean(row));

    if (products.length + processes.length + sourceStreams.length + precursors.length === 0) {
        throw new Error('가져올 활동자료 행을 찾지 못했습니다. 템플릿의 Products, Processes, SourceStreams, Precursors 시트를 확인하세요.');
    }

    return {
        products,
        processes,
        sourceStreams,
        precursors,
        warnings,
    };
}
