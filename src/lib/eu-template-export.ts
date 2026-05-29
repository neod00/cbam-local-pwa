import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import type { Product, ProductionProcess, PurchasedPrecursor } from './local-db';

export const REQUIRED_EU_TEMPLATE_SHEETS = [
    '0_Versions',
    'a_Contents',
    'b_Guidelines&Conditions',
    'c_CodeLists',
    'A_InstData',
    'B_EmInst',
    'C_Emissions&Energy',
    'D_Processes',
    'E_PurchPrec',
    'F_Tools',
    'G_FurtherGuidance',
    'Summary_Processes',
    'Summary_Products',
    'Summary_Communication',
    'InputOutput',
    'Parameters_Constants',
    'Parameters_CNCodes',
    'Translations',
    'VersionDocumentation',
];

export interface EuTemplateValidationResult {
    sheetNames: string[];
    missingSheets: string[];
    isValid: boolean;
}

export interface EuTemplateExportData {
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    products: Product[];
}

function parseWorkbookSheetNames(workbookXml: string): string[] {
    const document = new DOMParser().parseFromString(workbookXml, 'application/xml');
    const parseError = document.getElementsByTagName('parsererror')[0];

    if (parseError) {
        throw new Error('EU 템플릿의 workbook.xml을 읽을 수 없습니다.');
    }

    return Array.from(document.getElementsByTagName('sheet'))
        .map((sheet) => sheet.getAttribute('name'))
        .filter((name): name is string => Boolean(name));
}

export async function validateEuTemplateFile(file: File): Promise<EuTemplateValidationResult> {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('EU 원본 템플릿은 .xlsx 파일이어야 합니다.');
    }

    const workbookBytes = new Uint8Array(await file.arrayBuffer());
    const zip = unzipSync(workbookBytes);
    const workbookXml = zip['xl/workbook.xml'];

    if (!workbookXml) {
        throw new Error('유효한 XLSX 파일이 아니거나 workbook.xml이 없습니다.');
    }

    const sheetNames = parseWorkbookSheetNames(strFromU8(workbookXml));
    const missingSheets = REQUIRED_EU_TEMPLATE_SHEETS.filter((sheetName) => !sheetNames.includes(sheetName));

    return {
        sheetNames,
        missingSheets,
        isValid: missingSheets.length === 0,
    };
}

export async function createEuTemplateCopy(file: File): Promise<Blob> {
    return new Blob([await file.arrayBuffer()], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

function escapeXml(value: string): string {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function columnNameToIndex(columnName: string): number {
    return columnName.split('').reduce((sum, character) => sum * 26 + character.charCodeAt(0) - 64, 0);
}

function splitCellReference(cellReference: string): { column: string; row: number } {
    const match = /^([A-Z]+)(\d+)$/.exec(cellReference);

    if (!match) {
        throw new Error(`잘못된 셀 주소입니다: ${cellReference}`);
    }

    return {
        column: match[1],
        row: Number(match[2]),
    };
}

function createCellXml(cellReference: string, value: string | number): string {
    if (typeof value === 'number') {
        return `<c r="${cellReference}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
    }

    return `<c r="${cellReference}" t="inlineStr"><is><t>${escapeXml(value)}</t></is></c>`;
}

function setCellValue(sheetXml: string, cellReference: string, value: string | number): string {
    const cellXml = createCellXml(cellReference, value);
    const cellPattern = new RegExp(`<c\\s+[^>]*r="${cellReference}"[^>]*>[\\s\\S]*?<\\/c>`);

    if (cellPattern.test(sheetXml)) {
        return sheetXml.replace(cellPattern, cellXml);
    }

    const { column, row } = splitCellReference(cellReference);
    const rowPattern = new RegExp(`(<row\\s+[^>]*r="${row}"[^>]*>)([\\s\\S]*?)(<\\/row>)`);
    const rowMatch = sheetXml.match(rowPattern);

    if (rowMatch) {
        const existingCells = Array.from(rowMatch[2].matchAll(/<c\s+[^>]*r="([A-Z]+)\d+"[^>]*>[\s\S]*?<\/c>/g));
        let insertIndex = rowMatch[2].length;

        for (const match of existingCells) {
            if (columnNameToIndex(match[1]) > columnNameToIndex(column)) {
                insertIndex = match.index ?? rowMatch[2].length;
                break;
            }
        }

        const rowContents = `${rowMatch[2].slice(0, insertIndex)}${cellXml}${rowMatch[2].slice(insertIndex)}`;
        return sheetXml.replace(rowPattern, `${rowMatch[1]}${rowContents}${rowMatch[3]}`);
    }

    const sheetDataPattern = /(<sheetData>)([\s\S]*?)(<\/sheetData>)/;
    const newRowXml = `<row r="${row}">${cellXml}</row>`;
    return sheetXml.replace(sheetDataPattern, `$1$2${newRowXml}$3`);
}

function parseWorkbookSheetTargets(zip: Record<string, Uint8Array>): Map<string, string> {
    const workbookXml = zip['xl/workbook.xml'];
    const relsXml = zip['xl/_rels/workbook.xml.rels'];

    if (!workbookXml || !relsXml) {
        throw new Error('EU 템플릿의 workbook 관계 정보를 찾을 수 없습니다.');
    }

    const workbookDocument = new DOMParser().parseFromString(strFromU8(workbookXml), 'application/xml');
    const relsDocument = new DOMParser().parseFromString(strFromU8(relsXml), 'application/xml');
    const relTargetById = new Map<string, string>();

    for (const relationship of Array.from(relsDocument.getElementsByTagName('Relationship'))) {
        const id = relationship.getAttribute('Id');
        const target = relationship.getAttribute('Target');

        if (id && target) {
            relTargetById.set(id, target.startsWith('/') ? target.slice(1) : `xl/${target}`);
        }
    }

    const namespace = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const sheetTargetByName = new Map<string, string>();

    for (const sheet of Array.from(workbookDocument.getElementsByTagName('sheet'))) {
        const name = sheet.getAttribute('name');
        const relId = sheet.getAttributeNS(namespace, 'id') ?? sheet.getAttribute('r:id');
        const target = relId ? relTargetById.get(relId) : undefined;

        if (name && target) {
            sheetTargetByName.set(name, target.replaceAll('\\', '/'));
        }
    }

    return sheetTargetByName;
}

function injectProcesses(sheetXml: string, processes: ProductionProcess[], products: Product[]): string {
    const productById = new Map(products.map((product) => [product.id, product]));
    let output = sheetXml;

    processes.slice(0, 10).forEach((process, index) => {
        const startRow = 11 + index * 65;
        const product = process.product_id ? productById.get(process.product_id) : undefined;

        output = setCellValue(output, `G${startRow}`, process.name);
        output = setCellValue(output, `L${startRow}`, product?.product_type_enum ?? product?.name ?? process.production_route);
        output = setCellValue(output, `L${startRow + 13}`, process.output_mass_t);
        output = setCellValue(output, `L${startRow + 16}`, process.market_output_mass_t);
        output = setCellValue(output, `L${startRow + 31}`, process.internal_consumption_mass_t);
        output = setCellValue(output, `L${startRow + 43}`, process.direct_attributable_emissions_tco2e);
        output = setCellValue(output, `L${startRow + 54}`, process.electricity_mwh);
        output = setCellValue(output, `L${startRow + 55}`, process.electricity_ef_tco2e_per_mwh);
    });

    return output;
}

function injectPrecursors(sheetXml: string, precursors: PurchasedPrecursor[], products: Product[]): string {
    const productById = new Map(products.map((product) => [product.id, product]));
    let output = sheetXml;

    precursors.slice(0, 20).forEach((precursor, index) => {
        const startRow = 14 + index * 44;
        const product = precursor.product_id ? productById.get(precursor.product_id) : undefined;

        output = setCellValue(output, `G${startRow}`, precursor.name);
        output = setCellValue(output, `L${startRow}`, product?.product_type_enum ?? precursor.aggregated_goods_category);
        output = setCellValue(output, `L${startRow + 11}`, precursor.purchased_mass_t);
        output = setCellValue(output, `L${startRow + 14}`, precursor.consumed_mass_t);
        output = setCellValue(output, `L${startRow + 25}`, precursor.consumed_for_non_cbam_mass_t);
        output = setCellValue(output, `L${startRow + 35}`, precursor.direct_see_tco2e_per_t);
        output = setCellValue(output, `L${startRow + 38}`, precursor.indirect_see_tco2e_per_t);
    });

    return output;
}

export async function createEuTemplateExportCopy(file: File, data: EuTemplateExportData): Promise<Blob> {
    const workbookBytes = new Uint8Array(await file.arrayBuffer());
    const zip = unzipSync(workbookBytes);
    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const processSheetPath = sheetTargetByName.get('D_Processes');
    const precursorSheetPath = sheetTargetByName.get('E_PurchPrec');

    if (!processSheetPath || !precursorSheetPath || !zip[processSheetPath] || !zip[precursorSheetPath]) {
        throw new Error('EU 템플릿에서 D_Processes 또는 E_PurchPrec 시트를 찾을 수 없습니다.');
    }

    zip[processSheetPath] = strToU8(injectProcesses(strFromU8(zip[processSheetPath]), data.processes, data.products));
    zip[precursorSheetPath] = strToU8(injectPrecursors(strFromU8(zip[precursorSheetPath]), data.precursors, data.products));

    return new Blob([zipSync(zip)], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
}

export function createEuExportFilename(originalFilename: string): string {
    const baseName = originalFilename.replace(/\.xlsx$/i, '');
    const timestamp = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    return `${baseName}_cbam-local-copy_${timestamp}.xlsx`;
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}
