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

// ── 벤치마크 값 고르기 (2025/2620 부속서 5.1 · 5.3) ─────────────────────────
// 공식 표는 570개 CN 중 525개에 값을 **둘 이상** 준다. 5.3의 표시 문자가 그 뜻이다:
//   (1) 2026~27년 생산분 · (2) 2028~30년 생산분
//   (C)(D)(E) 탄소강 — 고로·전로 / DRI·전기로 / 스크랩·전기로
//   (F)(G)(H) 저합금강 — 같은 세 경로 · (J) 고합금강(전기로)
//   (A)(B) 회색·백색 클링커 · (K)(L) 1차·2차 알루미늄
// 종전 조회는 앱의 경로 글자(예: 「가공(압연·신선·열처리)」)를 표시 문자와 비교해 한 번도 맞지 않았고,
// 늘 첫 행을 돌려줬다. 2028년 이후 기간에도 (1) 값이, 전기로 원료에도 고로 값이 나갔다.

export type BenchmarkPeriodIndicator = '1' | '2';

export interface BenchmarkSelection {
    cn_code: string;
    column_a?: number;
    column_a_indicator: string;
    column_b?: number;
    column_b_indicator: string;
    /**
     * 경로·등급을 정할 근거가 없어 여러 값 중 가장 높은 값을 골랐다.
     * 높은 벤치마크는 인증서를 **줄이는** 쪽이므로 화면에 반드시 드러낸다.
     */
    column_a_ambiguous: boolean;
    column_b_ambiguous: boolean;
}

interface BenchmarkEntry {
    value: number;
    indicator: string;
    letters: string[];
    period?: BenchmarkPeriodIndicator;
}

/** 「(F)(1)」 → letters ['F'], period '1'. 「(C)/(F)」 → letters ['C','F']. */
export function parseBenchmarkIndicator(indicator: string | undefined): { letters: string[]; period?: BenchmarkPeriodIndicator } {
    const tokens = Array.from((indicator ?? '').matchAll(/\(([A-Za-z]|[12])\)/g)).map((match) => match[1].toUpperCase());
    const period = tokens.find((token) => token === '1' || token === '2') as BenchmarkPeriodIndicator | undefined;
    return { letters: tokens.filter((token) => token !== '1' && token !== '2'), period };
}

/** 기본값 적용 연도 → 5.3의 생산연도 표시. 2028년 이후는 (2). */
export function benchmarkPeriodForYear(year: '2026' | '2027' | '2028_ONWARDS' | undefined): BenchmarkPeriodIndicator {
    return year === '2028_ONWARDS' ? '2' : '1';
}

/**
 * 공정·원료의 경로 글자에서 5.3 표시 문자를 짐작한다. 실제 자료를 쓸 때(5.2) 경로는 **실제** 경로다.
 * 글자에서 읽어낼 수 없으면 빈 배열 — 호출부가 다른 근거(국가 기본 경로)를 찾는다.
 */
export function inferBenchmarkRouteLetters(routeText: string | undefined): string[] {
    const text = (routeText ?? '').toLowerCase();
    if (!text.trim()) return [];
    const direct = parseBenchmarkIndicator(routeText).letters;
    if (direct.length > 0) return direct;
    if (/dri|직접환원/.test(text)) return ['D', 'G'];
    if (/bf|bof|blast|고로|전로/.test(text)) return ['C', 'F'];
    if (/eaf|electric arc|전기로|scrap|스크랩/.test(text)) return ['E', 'H', 'J'];
    return [];
}

function pickBenchmarkEntry(entries: BenchmarkEntry[], period: BenchmarkPeriodIndicator, routeLetters: string[]) {
    if (entries.length === 0) {
        return { entry: undefined, ambiguous: false };
    }
    // (1)/(2)가 붙은 값은 해당 기간 것만. 표시가 없는 값은 두 기간 공통이다.
    const inPeriod = entries.filter((entry) => !entry.period || entry.period === period);
    const pool = inPeriod.length > 0 ? inPeriod : entries;
    const byRoute = routeLetters.length > 0
        ? pool.filter((entry) => entry.letters.some((letter) => routeLetters.includes(letter)))
        : [];
    const finalPool = byRoute.length > 0 ? byRoute : pool;
    // 5.1: 같은 CN에 합금 등급이 여럿이면 그 생산연도의 **가장 높은** 값.
    const entry = finalPool.reduce((best, candidate) => (candidate.value > best.value ? candidate : best), finalPool[0]);
    const distinctValues = new Set(finalPool.map((candidate) => candidate.value)).size;
    // 경로 근거로 좁혔으면 남은 차이는 합금 등급(5.1이 최고값을 지정) — 모호하지 않다.
    return { entry, ambiguous: byRoute.length === 0 && distinctValues > 1 };
}

export function selectBenchmarkValues(
    reference: ImportedBenchmarkReference | undefined,
    cnCode: string,
    options: { period: BenchmarkPeriodIndicator; columnARouteLetters?: string[]; columnBRouteLetters?: string[] }
): BenchmarkSelection | undefined {
    if (!reference) {
        return undefined;
    }
    const normalizedCnCode = normalizeCode(cnCode);
    const matchedCnCode = reference.rows
        .map((row) => row.cn_code)
        .filter((rowCn) => rowCn === normalizedCnCode || normalizedCnCode.startsWith(rowCn))
        .sort((a, b) => b.length - a.length)[0];
    if (!matchedCnCode) {
        return undefined;
    }
    const rows = reference.rows.filter((row) => row.cn_code === matchedCnCode);
    const entriesOf = (column: 'a' | 'b'): BenchmarkEntry[] => rows.flatMap((row) => {
        const value = column === 'a' ? row.column_a_benchmark : row.column_b_benchmark;
        const indicator = column === 'a' ? row.column_a_route : row.column_b_route;
        return value === undefined ? [] : [{ value, indicator, ...parseBenchmarkIndicator(indicator) }];
    });
    const a = pickBenchmarkEntry(entriesOf('a'), options.period, options.columnARouteLetters ?? []);
    const b = pickBenchmarkEntry(entriesOf('b'), options.period, options.columnBRouteLetters ?? []);
    return {
        cn_code: matchedCnCode,
        column_a: a.entry?.value,
        column_a_indicator: a.entry?.indicator ?? '',
        column_a_ambiguous: a.ambiguous,
        column_b: b.entry?.value,
        column_b_indicator: b.entry?.indicator ?? '',
        column_b_ambiguous: b.ambiguous,
    };
}

/**
 * 5.1: 기본값으로 SEFA를 정할 때는 2025/2621 부속서 I이 **그 원산국에** 지정한 생산경로를 쓴다.
 * 공식 기본값 워크북의 「Underlying production route determining CBAM BM」 열이 그 경로다(예: (C), (C)/(F)).
 */
export function defaultBenchmarkRouteLetters(
    reference: ImportedDefaultValueReference | undefined,
    country: string | undefined,
    cnCode: string
): string[] {
    if (!country) return [];
    const row = defaultValueCandidates(reference, country, cnCode)[0];
    return parseBenchmarkIndicator(row?.production_route).letters;
}


/**
 * 공식 워크북은 국가를 **시트 이름**으로 구분하는데 Excel 시트명은 31자에서 잘린다.
 * 조회 키는 시트명 그대로 두고(바꾸면 매칭이 깨진다), 화면에 보일 이름만 온전히 돌려준다.
 */
const TRUNCATED_REFERENCE_COUNTRY_NAMES: Record<string, string> = {
    'Democratic Republic of the Cong': 'Democratic Republic of the Congo',
};

export function displayReferenceCountry(sheetName: string): string {
    return TRUNCATED_REFERENCE_COUNTRY_NAMES[sheetName] ?? sheetName;
}

export interface ResolvedDefaultSee {
    /** 전구물질 직접 SEE 칸에 넣을 값 — 연도별 mark-up 포함 */
    direct: number;
    /** 간접 SEE 칸에 넣을 값 — 공식 DV가 간접값을 줄 때만 0이 아니다 */
    indirect: number;
    /** 공식 DV가 간접값을 제공하는가 (철강 DV는 대개 N/A) */
    hasIndirect: boolean;
    /** 그 연도에 적용되는 총 기본값(mark-up 포함) = direct + indirect */
    total: number;
}

const roundDefaultSee = (value: number) => Math.round(value * 1e6) / 1e6;

/**
 * 공식 기본값 한 행을 「직접 / 간접」 두 칸으로 옮긴다. **모든 화면이 이 함수 하나를 쓴다.**
 *
 * 왜 한 곳이어야 하는가 (씨밤이 run11 P0-03):
 *   상세 화면은 `간접 = 연도 총액 − raw 직접`으로 계산했다. 철강 DV는 간접이 N/A라서 그 차액은
 *   간접배출이 아니라 **mark-up 가산분**이다. 철강은 간접이 인증서 기준에서 빠지므로 가산분이
 *   통째로 사라졌다(대만 7223 00: 파일 10 / N/A / 2026 11 → 앱 직접 10 · 간접 1 → 기준 SEE −5%).
 *   같은 시각 지도 패널은 가산분을 직접에 넣어 두 화면이 서로 다른 값을 냈다.
 *
 * 규칙:
 *   · 간접이 N/A → 직접 = 연도 총액(mark-up 포함), 간접 = 0. 없는 간접을 만들어내지 않는다.
 *   · 간접이 있음 → mark-up 비율(연도 총액 ÷ raw 총액)을 직접·간접에 같은 비율로 얹는다.
 *     mark-up을 직접·간접에 어떻게 나누는지는 확인 필요(규정) — 다만 합계는 항상 연도 총액과 같다.
 */
export function resolveDefaultSeeForYear(
    row: DefaultValueReferenceRow,
    year: '2026' | '2027' | '2028_ONWARDS'
): ResolvedDefaultSee {
    const rawDirect = row.direct_default ?? 0;
    const hasIndirect = row.indirect_default != null;
    const rawIndirect = row.indirect_default ?? 0;
    const rawTotal = row.total_default ?? rawDirect + rawIndirect;
    const yearTotal = getDefaultValueTotalForYear(row, year) ?? rawTotal;

    if (!hasIndirect) {
        const direct = roundDefaultSee(yearTotal > 0 ? yearTotal : rawDirect);
        return { direct, indirect: 0, hasIndirect, total: direct };
    }

    const rawSum = rawDirect + rawIndirect;
    const ratio = rawSum > 0 && yearTotal > 0 ? yearTotal / rawSum : 1;
    const direct = roundDefaultSee(rawDirect * ratio);
    const indirect = roundDefaultSee(rawIndirect * ratio);
    return { direct, indirect, hasIndirect, total: roundDefaultSee(direct + indirect) };
}

