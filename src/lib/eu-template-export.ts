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
    cnCodeCount: number;
    cnCodeMap: Map<string, string>;
    isValid: boolean;
}

export interface EuTemplateExportData {
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    products: Product[];
}

type EuCnCodeMap = Map<string, string>;

export interface EuExportReadinessIssue {
    severity: 'error' | 'warning';
    area: '제품' | '생산공정' | '구매 전구물질' | '템플릿 한계';
    message: string;
}

export interface EuExportReadinessResult {
    issues: EuExportReadinessIssue[];
    errorCount: number;
    warningCount: number;
    canExportDraft: boolean;
    isSubmissionReady: boolean;
}

const EU_GOODS = [
    'Cement',
    'Cement clinker',
    'Calcined clays ',
    'Aluminous cement',
    'Iron or steel products',
    'Crude steel',
    'Direct reduced iron',
    'Pig iron',
    'Alloys (FeMn, FeCr, FeNi)',
    'Sintered Ore',
    'Hydrogen',
    'Ammonia',
    'Nitric acid',
    'Urea',
    'Mixed fertilisers',
    'Aluminium products',
    'Unwrought aluminium',
    'Electricity (export to EU)',
];

const EU_GOODS_SET = new Set(EU_GOODS);
const STEEL_FINISHED_GOODS_PREFIXES = ['7208', '7209', '7210', '7211', '7212', '7213', '7214', '7215', '7216', '7217', '7218', '7219', '7220', '7221', '7222', '7223', '7224', '7225', '7226', '7227', '7228', '7229', '73'];
const CRUDE_STEEL_PREFIXES = ['7206', '7207'];
const PIG_IRON_PREFIXES = ['7201'];
const DIRECT_REDUCED_IRON_PREFIXES = ['7203'];

function normalizeHsCode(hsCode: string): string {
    return hsCode.replace(/\D/g, '');
}

function getProductCnOrHsCode(product: Product): string {
    return normalizeHsCode(product.cn_code?.trim() || product.hs_code);
}

function mapProductToEuGood(product: Product | undefined, cnCodeMap?: EuCnCodeMap): string | undefined {
    if (!product) {
        return undefined;
    }

    const hsCode = getProductCnOrHsCode(product);
    const templateGood = cnCodeMap?.get(hsCode);

    if (templateGood) {
        return templateGood;
    }

    if (EU_GOODS_SET.has(product.product_type_enum)) {
        return product.product_type_enum;
    }

    if (PIG_IRON_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Pig iron';
    }

    if (DIRECT_REDUCED_IRON_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Direct reduced iron';
    }

    if (CRUDE_STEEL_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Crude steel';
    }

    if (STEEL_FINISHED_GOODS_PREFIXES.some((prefix) => hsCode.startsWith(prefix))) {
        return 'Iron or steel products';
    }

    return undefined;
}

function mapPrecursorToEuGood(
    precursor: PurchasedPrecursor,
    product: Product | undefined,
    cnCodeMap?: EuCnCodeMap
): string | undefined {
    if (EU_GOODS_SET.has(precursor.aggregated_goods_category)) {
        return precursor.aggregated_goods_category;
    }

    return mapProductToEuGood(product, cnCodeMap);
}

export function evaluateEuExportReadiness(
    data: EuTemplateExportData,
    cnCodeMap?: EuCnCodeMap
): EuExportReadinessResult {
    const issues: EuExportReadinessIssue[] = [];
    const productById = new Map(data.products.map((product) => [product.id, product]));

    if (data.processes.length > 10) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 생산공정 10개까지 지원합니다. 현재 ${data.processes.length}개입니다.`,
        });
    }

    if (data.precursors.length > 20) {
        issues.push({
            severity: 'error',
            area: '템플릿 한계',
            message: `현재 Export MVP는 구매 전구물질 20개까지 지원합니다. 현재 ${data.precursors.length}개입니다.`,
        });
    }

    for (const product of data.products) {
        const hsCode = getProductCnOrHsCode(product);

        if (hsCode.length < 8) {
            issues.push({
                severity: 'warning',
                area: '제품',
                message: `${product.name}: EU 템플릿 제출에는 CN 8자리 코드가 필요합니다. 현재 값은 ${product.cn_code || product.hs_code}입니다.`,
            });
        }

        if (cnCodeMap && hsCode.length >= 8 && !cnCodeMap.has(hsCode)) {
            issues.push({
                severity: 'error',
                area: '제품',
                message: `${product.name}: 업로드한 EU 템플릿의 Parameters_CNCodes에서 CN ${hsCode}를 찾을 수 없습니다.`,
            });
        }

        if (!mapProductToEuGood(product, cnCodeMap)) {
            issues.push({
                severity: 'error',
                area: '제품',
                message: `${product.name}: EU CBAM goods category로 매핑할 수 없습니다.`,
            });
        }
    }

    for (const process of data.processes) {
        const product = process.product_id ? productById.get(process.product_id) : undefined;

        if (!product) {
            issues.push({
                severity: 'error',
                area: '생산공정',
                message: `${process.name}: 연결된 제품이 없어 EU goods category를 확정할 수 없습니다.`,
            });
            continue;
        }

        const euGood = mapProductToEuGood(product, cnCodeMap);

        if (!euGood) {
            issues.push({
                severity: 'error',
                area: '생산공정',
                message: `${process.name}: 제품 ${product.name}의 EU goods category 매핑이 필요합니다.`,
            });
        }

        if (!process.production_route || process.production_route.trim().length === 0) {
            issues.push({
                severity: 'warning',
                area: '생산공정',
                message: `${process.name}: 생산경로가 비어 있습니다. EU 템플릿 드롭다운 값과 대조가 필요합니다.`,
            });
        }
    }

    for (const precursor of data.precursors) {
        const product = precursor.product_id ? productById.get(precursor.product_id) : undefined;

        if (!mapPrecursorToEuGood(precursor, product, cnCodeMap)) {
            issues.push({
                severity: 'error',
                area: '구매 전구물질',
                message: `${precursor.name}: EU goods category로 매핑할 수 없습니다.`,
            });
        }

        if (!precursor.source) {
            issues.push({
                severity: 'warning',
                area: '구매 전구물질',
                message: `${precursor.name}: SEE 출처가 비어 있습니다.`,
            });
        }
    }

    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    const warningCount = issues.filter((issue) => issue.severity === 'warning').length;

    return {
        issues,
        errorCount,
        warningCount,
        canExportDraft: errorCount === 0,
        isSubmissionReady: issues.length === 0,
    };
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

function parseSharedStrings(zip: Record<string, Uint8Array>): string[] {
    const sharedStringsXml = zip['xl/sharedStrings.xml'];

    if (!sharedStringsXml) {
        return [];
    }

    const document = new DOMParser().parseFromString(strFromU8(sharedStringsXml), 'application/xml');
    return Array.from(document.getElementsByTagName('si')).map((item) =>
        Array.from(item.getElementsByTagName('t'))
            .map((text) => text.textContent ?? '')
            .join('')
    );
}

function getColumnName(cellReference: string): string {
    return splitCellReference(cellReference).column;
}

function readCellText(cell: Element, sharedStrings: string[]): string {
    const type = cell.getAttribute('t');

    if (type === 's') {
        const sharedStringIndex = Number(cell.getElementsByTagName('v')[0]?.textContent ?? -1);
        return sharedStrings[sharedStringIndex] ?? '';
    }

    if (type === 'inlineStr') {
        return Array.from(cell.getElementsByTagName('t'))
            .map((text) => text.textContent ?? '')
            .join('');
    }

    return cell.getElementsByTagName('v')[0]?.textContent ?? '';
}

function parseCnCodeMap(zip: Record<string, Uint8Array>): EuCnCodeMap {
    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const cnCodeSheetPath = sheetTargetByName.get('Parameters_CNCodes');
    const cnCodeSheetXml = cnCodeSheetPath ? zip[cnCodeSheetPath] : undefined;

    if (!cnCodeSheetXml) {
        return new Map();
    }

    const sharedStrings = parseSharedStrings(zip);
    const document = new DOMParser().parseFromString(strFromU8(cnCodeSheetXml), 'application/xml');
    const cnCodeMap: EuCnCodeMap = new Map();

    for (const row of Array.from(document.getElementsByTagName('row'))) {
        const rowNumber = Number(row.getAttribute('r') ?? 0);

        if (rowNumber < 4) {
            continue;
        }

        const valuesByColumn = new Map<string, string>();

        for (const cell of Array.from(row.getElementsByTagName('c'))) {
            const reference = cell.getAttribute('r');

            if (!reference) {
                continue;
            }

            valuesByColumn.set(getColumnName(reference), readCellText(cell, sharedStrings));
        }

        const cnCode = normalizeHsCode(valuesByColumn.get('D') ?? '');
        const cbamGood = valuesByColumn.get('E') ?? '';

        if (cnCode.length === 8 && EU_GOODS_SET.has(cbamGood)) {
            cnCodeMap.set(cnCode, cbamGood);
        }
    }

    return cnCodeMap;
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
    const cnCodeMap = parseCnCodeMap(zip);

    return {
        sheetNames,
        missingSheets,
        cnCodeCount: cnCodeMap.size,
        cnCodeMap,
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

function injectProcesses(
    sheetXml: string,
    processes: ProductionProcess[],
    products: Product[],
    cnCodeMap?: EuCnCodeMap
): string {
    const productById = new Map(products.map((product) => [product.id, product]));
    let output = sheetXml;

    processes.slice(0, 10).forEach((process, index) => {
        const startRow = 11 + index * 65;
        const product = process.product_id ? productById.get(process.product_id) : undefined;

        output = setCellValue(output, `G${startRow}`, process.name);
        output = setCellValue(output, `L${startRow}`, mapProductToEuGood(product, cnCodeMap) ?? product?.name ?? process.production_route);
        output = setCellValue(output, `L${startRow + 13}`, process.output_mass_t);
        output = setCellValue(output, `L${startRow + 16}`, process.market_output_mass_t);
        output = setCellValue(output, `L${startRow + 31}`, process.internal_consumption_mass_t);
        output = setCellValue(output, `L${startRow + 43}`, process.direct_attributable_emissions_tco2e);
        output = setCellValue(output, `L${startRow + 54}`, process.electricity_mwh);
        output = setCellValue(output, `L${startRow + 55}`, process.electricity_ef_tco2e_per_mwh);
    });

    return output;
}

function injectPrecursors(
    sheetXml: string,
    precursors: PurchasedPrecursor[],
    products: Product[],
    cnCodeMap?: EuCnCodeMap
): string {
    const productById = new Map(products.map((product) => [product.id, product]));
    let output = sheetXml;

    precursors.slice(0, 20).forEach((precursor, index) => {
        const startRow = 14 + index * 44;
        const product = precursor.product_id ? productById.get(precursor.product_id) : undefined;

        output = setCellValue(output, `G${startRow}`, precursor.name);
        output = setCellValue(output, `L${startRow}`, mapPrecursorToEuGood(precursor, product, cnCodeMap) ?? precursor.aggregated_goods_category);
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
    const cnCodeMap = parseCnCodeMap(zip);
    const readiness = evaluateEuExportReadiness(data, cnCodeMap);

    if (!readiness.canExportDraft) {
        throw new Error('EU 템플릿 Export 전에 오류 항목을 먼저 해결해야 합니다.');
    }

    const sheetTargetByName = parseWorkbookSheetTargets(zip);
    const processSheetPath = sheetTargetByName.get('D_Processes');
    const precursorSheetPath = sheetTargetByName.get('E_PurchPrec');

    if (!processSheetPath || !precursorSheetPath || !zip[processSheetPath] || !zip[precursorSheetPath]) {
        throw new Error('EU 템플릿에서 D_Processes 또는 E_PurchPrec 시트를 찾을 수 없습니다.');
    }

    zip[processSheetPath] = strToU8(
        injectProcesses(strFromU8(zip[processSheetPath]), data.processes, data.products, cnCodeMap)
    );
    zip[precursorSheetPath] = strToU8(
        injectPrecursors(strFromU8(zip[precursorSheetPath]), data.precursors, data.products, cnCodeMap)
    );

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
