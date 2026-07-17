import { strFromU8, unzipSync } from 'fflate';

export type ReferenceWorkbookKind = 'benchmarks' | 'default-values';

export interface BenchmarkReferenceRow {
    cn_code: string;
    description: string;
    column_a_benchmark?: number;
    column_a_route: string;
    column_b_benchmark?: number;
    column_b_route: string;
}

export interface DefaultValueReferenceRow {
    country: string;
    cn_code: string;
    description: string;
    direct_default?: number;
    indirect_default?: number;
    total_default?: number;
    markup_2026?: number;
    markup_2027?: number;
    markup_2028_onwards?: number;
    production_route: string;
}

export interface ReferenceWorkbookSummary {
    kind: ReferenceWorkbookKind;
    filename: string;
    imported_at: string;
    sheet_names: string[];
    row_count: number;
    cn_code_count: number;
    country_count?: number;
    sample_rows: Array<{
        cn_code: string;
        description: string;
        detail: string;
    }>;
}

export interface ImportedBenchmarkReference {
    summary: ReferenceWorkbookSummary;
    rows: BenchmarkReferenceRow[];
}

export interface ImportedDefaultValueReference {
    summary: ReferenceWorkbookSummary;
    rows: DefaultValueReferenceRow[];
}

type SheetInfo = {
    name: string;
    path: string;
};

function parseAttributes(rawAttributes: string) {
    const attributes = new Map<string, string>();

    for (const match of rawAttributes.matchAll(/([A-Za-z_:][\w:.-]*)="([^"]*)"/g)) {
        attributes.set(match[1], unescapeXml(match[2]));
    }

    return attributes;
}

function unescapeXml(value: string) {
    return value
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'")
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&amp;', '&');
}

function stripXmlTags(value: string) {
    return unescapeXml(value.replace(/<[^>]+>/g, ''));
}

function normalizeCode(value: string) {
    return value.replace(/\D/g, '');
}

function normalizeReferenceCountry(value: string) {
    const normalized = value
        .trim()
        .toLowerCase()
        .replaceAll('&', 'and')
        .replace(/[^a-z0-9]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    if ([
        'south korea',
        'korea republic of',
        'republic of korea',
        'korea south',
        'kr',
    ].includes(normalized)) {
        return 'south korea';
    }

    return normalized;
}

function toNumber(value: string): number | undefined {
    // Number('') === 0 이므로 공란을 그대로 넘기면 "미공표"가 "공표된 0.0"으로 둔갑한다.
    // 기본값 대조에서 0은 "배출이 없다"는 강한 진술이라 반드시 undefined와 구분해야 한다(씨밤이 P1).
    if (value.trim() === '') {
        return undefined;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}

function getColumnName(cellReference: string) {
    const match = cellReference.match(/[A-Z]+/);
    return match?.[0] ?? '';
}

function parseWorkbookSheets(zip: Record<string, Uint8Array>): SheetInfo[] {
    const workbookXml = zip['xl/workbook.xml'];
    const relsXml = zip['xl/_rels/workbook.xml.rels'];

    if (!workbookXml || !relsXml) {
        throw new Error('유효한 XLSX 파일이 아니거나 workbook.xml을 찾을 수 없습니다.');
    }

    const relTargetById = new Map<string, string>();
    const relsText = strFromU8(relsXml);

    for (const match of relsText.matchAll(/<Relationship\b([^>]*)\/?>/g)) {
        const attributes = parseAttributes(match[1]);
        const id = attributes.get('Id');
        const target = attributes.get('Target');

        if (id && target?.startsWith('worksheets/')) {
            relTargetById.set(id, `xl/${target}`);
        }
    }

    const sheets: SheetInfo[] = [];
    const workbookText = strFromU8(workbookXml);

    for (const match of workbookText.matchAll(/<sheet\b([^>]*)\/?>/g)) {
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

function parseSharedStrings(zip: Record<string, Uint8Array>): string[] {
    const sharedStringsXml = zip['xl/sharedStrings.xml'];

    if (!sharedStringsXml) {
        return [];
    }

    return Array.from(strFromU8(sharedStringsXml).matchAll(/<si>([\s\S]*?)<\/si>/g)).map((match) =>
        stripXmlTags(match[1])
    );
}

function readCellValue(cellXml: string, sharedStrings: string[]) {
    const attributeMatch = cellXml.match(/^<c\b([^>]*)>/);
    const attributes = parseAttributes(attributeMatch?.[1] ?? '');
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

function parseRows(sheetXml: string, sharedStrings: string[]) {
    const rows: Array<{ rowNumber: number; valuesByColumn: Map<string, string> }> = [];

    for (const rowMatch of sheetXml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const attributes = parseAttributes(rowMatch[1]);
        const rowNumber = Number(attributes.get('r') ?? 0);
        const valuesByColumn = new Map<string, string>();

        for (const cellMatch of rowMatch[2].matchAll(/<c\b[\s\S]*?(?:<\/c>|\/>)/g)) {
            const cellXml = cellMatch[0];
            const cellAttributes = parseAttributes(cellXml.match(/^<c\b([^>]*)/)?.[1] ?? '');
            const reference = cellAttributes.get('r');

            if (!reference) {
                continue;
            }

            valuesByColumn.set(getColumnName(reference), readCellValue(cellXml, sharedStrings).trim());
        }

        rows.push({ rowNumber, valuesByColumn });
    }

    return rows;
}

function createSampleRows<T extends { cn_code: string; description: string }>(
    rows: T[],
    getDetail: (row: T) => string
): ReferenceWorkbookSummary['sample_rows'] {
    return rows.slice(0, 5).map((row) => ({
        cn_code: row.cn_code,
        description: row.description,
        detail: getDetail(row),
    }));
}

function assertXlsxFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.xlsx')) {
        throw new Error('기준자료는 .xlsx 파일이어야 합니다.');
    }
}

export async function parseBenchmarkWorkbook(file: File): Promise<ImportedBenchmarkReference> {
    assertXlsxFile(file);

    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const sheets = parseWorkbookSheets(zip);
    const benchmarkSheet = sheets.find((sheet) => sheet.name.toLowerCase() === 'benchmarks');
    const sharedStrings = parseSharedStrings(zip);

    if (!benchmarkSheet || !zip[benchmarkSheet.path]) {
        throw new Error('Benchmarks 시트를 찾을 수 없습니다.');
    }

    const rows: BenchmarkReferenceRow[] = [];
    let currentCnCode = '';
    let currentDescription = '';

    for (const row of parseRows(strFromU8(zip[benchmarkSheet.path]), sharedStrings)) {
        if (row.rowNumber < 3) {
            continue;
        }

        const cnCode = normalizeCode(row.valuesByColumn.get('A') ?? '') || currentCnCode;
        const description = row.valuesByColumn.get('B') || currentDescription;
        const columnABenchmark = toNumber(row.valuesByColumn.get('C') ?? '');
        const columnBBenchmark = toNumber(row.valuesByColumn.get('E') ?? '');

        if (!cnCode || columnABenchmark === undefined && columnBBenchmark === undefined) {
            continue;
        }

        currentCnCode = cnCode;
        currentDescription = description;
        rows.push({
            cn_code: cnCode,
            description,
            column_a_benchmark: columnABenchmark,
            column_a_route: row.valuesByColumn.get('D') ?? '',
            column_b_benchmark: columnBBenchmark,
            column_b_route: row.valuesByColumn.get('F') ?? '',
        });
    }

    if (rows.length === 0) {
        throw new Error('Benchmarks 시트에서 기준값 행을 찾을 수 없습니다.');
    }

    const cnCodeCount = new Set(rows.map((row) => row.cn_code)).size;

    return {
        summary: {
            kind: 'benchmarks',
            filename: file.name,
            imported_at: new Date().toISOString(),
            sheet_names: sheets.map((sheet) => sheet.name),
            row_count: rows.length,
            cn_code_count: cnCodeCount,
            sample_rows: createSampleRows(rows, (row) =>
                `A ${row.column_a_benchmark ?? '-'} / B ${row.column_b_benchmark ?? '-'}`
            ),
        },
        rows,
    };
}

export async function parseDefaultValueWorkbook(file: File): Promise<ImportedDefaultValueReference> {
    assertXlsxFile(file);

    const zip = unzipSync(new Uint8Array(await file.arrayBuffer()));
    const sheets = parseWorkbookSheets(zip);
    const sharedStrings = parseSharedStrings(zip);
    const countrySheets = sheets.filter((sheet) => !['overview', 'version history'].includes(sheet.name.toLowerCase()));
    const rows: DefaultValueReferenceRow[] = [];

    for (const sheet of countrySheets) {
        const sheetBytes = zip[sheet.path];

        if (!sheetBytes) {
            continue;
        }

        for (const row of parseRows(strFromU8(sheetBytes), sharedStrings)) {
            if (row.rowNumber < 5) {
                continue;
            }

            const cnCode = normalizeCode(row.valuesByColumn.get('A') ?? '');
            const totalDefault = toNumber(row.valuesByColumn.get('E') ?? '');

            if (!cnCode || totalDefault === undefined) {
                continue;
            }

            rows.push({
                country: sheet.name,
                cn_code: cnCode,
                description: row.valuesByColumn.get('B') ?? '',
                direct_default: toNumber(row.valuesByColumn.get('C') ?? ''),
                indirect_default: toNumber(row.valuesByColumn.get('D') ?? ''),
                total_default: totalDefault,
                markup_2026: toNumber(row.valuesByColumn.get('F') ?? ''),
                markup_2027: toNumber(row.valuesByColumn.get('G') ?? ''),
                markup_2028_onwards: toNumber(row.valuesByColumn.get('H') ?? ''),
                production_route: row.valuesByColumn.get('I') ?? '',
            });
        }
    }

    if (rows.length === 0) {
        throw new Error('국가별 기본값 행을 찾을 수 없습니다.');
    }

    const cnCodeCount = new Set(rows.map((row) => row.cn_code)).size;
    const countryCount = new Set(rows.map((row) => row.country)).size;
    const sampleSourceRows = rows.filter((row) => normalizeReferenceCountry(row.country) === 'south korea').slice(0, 5);

    return {
        summary: {
            kind: 'default-values',
            filename: file.name,
            imported_at: new Date().toISOString(),
            sheet_names: sheets.map((sheet) => sheet.name),
            row_count: rows.length,
            cn_code_count: cnCodeCount,
            country_count: countryCount,
            sample_rows: createSampleRows(sampleSourceRows.length > 0 ? sampleSourceRows : rows, (row) =>
                `${row.country} / 총 ${row.total_default ?? '-'}`
            ),
        },
        rows,
    };
}

/**
 * 국가 × CN에 생산경로가 갈리는 행이 둘 이상 있는지.
 * 공식 워크북에는 그런 조합이 실재하며(예: CN 2523 계열), 조회가 경로를 보지 않으면
 * 워크북 행 순서로 아무 행이나 집게 된다. 조용히 다른 경로의 DV를 쓰는 것은
 * 대조 자체를 무의미하게 만들므로, 호출부가 이 사실을 알 수 있어야 한다(씨밤이 P1).
 */
export function hasAmbiguousDefaultValueRoutes(
    reference: ImportedDefaultValueReference | undefined,
    country: string,
    cnCode: string
): boolean {
    const candidates = defaultValueCandidates(reference, country, cnCode);

    if (candidates.length === 0) {
        return false;
    }

    const bestLength = candidates[0].cn_code.length;
    const routes = new Set(
        candidates
            .filter((row) => row.cn_code.length === bestLength)
            .map((row) => (row.production_route ?? '').trim().toLowerCase())
    );

    return routes.size > 1;
}

function defaultValueCandidates(
    reference: ImportedDefaultValueReference | undefined,
    country: string,
    cnCode: string
): DefaultValueReferenceRow[] {
    if (!reference) {
        return [];
    }

    const normalizedCountry = normalizeReferenceCountry(country);
    const normalizedCnCode = normalizeCode(cnCode);

    return reference.rows
        .filter(
            (row) =>
                normalizeReferenceCountry(row.country) === normalizedCountry &&
                (row.cn_code === normalizedCnCode || normalizedCnCode.startsWith(row.cn_code))
        )
        .sort((a, b) => b.cn_code.length - a.cn_code.length);
}

export function findDefaultValueReference(
    reference: ImportedDefaultValueReference | undefined,
    country: string,
    cnCode: string,
    year: '2026' | '2027' | '2028_ONWARDS',
    productionRoute?: string
): DefaultValueReferenceRow | undefined {
    const candidates = defaultValueCandidates(reference, country, cnCode);

    if (candidates.length === 0) {
        return undefined;
    }

    const valueForYear = (row: DefaultValueReferenceRow) => {
        if (year === '2026') {
            return row.markup_2026;
        }

        if (year === '2027') {
            return row.markup_2027;
        }

        return row.markup_2028_onwards;
    };

    // 생산경로가 주어지면 같은 경로 행을 먼저 고른다. 벤치마크 조회는 이미 이렇게 한다.
    const route = productionRoute?.trim().toLowerCase();
    const routeMatched = route
        ? candidates.filter((row) => (row.production_route ?? '').trim().toLowerCase() === route)
        : [];
    const ordered = [...routeMatched, ...candidates.filter((row) => !routeMatched.includes(row))];

    return ordered.find((row) => valueForYear(row) !== undefined) ?? ordered[0];
}

export function getDefaultValueTotalForYear(
    row: DefaultValueReferenceRow,
    year: '2026' | '2027' | '2028_ONWARDS'
) {
    if (year === '2026') {
        return row.markup_2026 ?? row.total_default;
    }

    if (year === '2027') {
        return row.markup_2027 ?? row.total_default;
    }

    return row.markup_2028_onwards ?? row.total_default;
}

export function findBenchmarkReference(
    reference: ImportedBenchmarkReference | undefined,
    cnCode: string,
    productionRoute?: string
): BenchmarkReferenceRow | undefined {
    if (!reference) {
        return undefined;
    }

    const normalizedCnCode = normalizeCode(cnCode);
    const normalizedRoute = productionRoute?.trim().toLowerCase();
    const candidates = reference.rows
        .filter((row) => row.cn_code === normalizedCnCode || normalizedCnCode.startsWith(row.cn_code))
        .sort((a, b) => b.cn_code.length - a.cn_code.length);

    if (candidates.length === 0) {
        return undefined;
    }

    if (normalizedRoute) {
        return candidates.find((row) =>
            row.column_a_route.toLowerCase().includes(normalizedRoute) ||
            row.column_b_route.toLowerCase().includes(normalizedRoute)
        ) ?? candidates[0];
    }

    return candidates[0];
}
