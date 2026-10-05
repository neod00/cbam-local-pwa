import type {
    BenchmarkReferenceRow,
    DefaultValueReferenceRow,
    ImportedBenchmarkReference,
    ImportedDefaultValueReference,
} from './reference-workbooks';

/**
 * 앱에 내장된 EU 공식 기준값(국가×CN 기본값 · 벤치마크).
 *
 * 처음 쓰는 담당자가 EU 엑셀을 찾아 올리지 않아도 「EU 기본값 채우기」가 되게 한다. 원본은 scripts/generate-bundled-references.mjs가
 * 공식 워크북을 앱의 파서(reference-workbooks.ts) 그대로 읽어 public/reference/*.json에 만든 것이라, 같은 파일을 올렸을 때와 숫자가 같다.
 *
 * 원칙: 사용자가 올린 파일이 언제나 우선이다(내장본은 설정이 비어 있을 때만, 또는 내장본끼리 판이 바뀔 때만 넣는다).
 * 내장본은 summary.origin === 'bundled'로 표시되고 .cbam 백업에는 싣지 않는다(앱이 매번 다시 넣을 수 있는 자료라 백업만 부풀린다).
 */

export const BUNDLED_DEFAULT_VALUES_URL = '/reference/cbam-default-values.json';
export const BUNDLED_BENCHMARKS_URL = '/reference/cbam-benchmarks.json';
export const DEFAULT_VALUES_SETTING_KEY = 'reference:default-values';
export const BENCHMARKS_SETTING_KEY = 'reference:benchmarks';

type NumberOrNull = number | null;

/** [국가 idx, CN, 직접, 간접, 총, 2026, 2027, 2028~, 경로 idx, (CN 공용 설명과 다르면) 설명] */
export type BundledDefaultValueTuple = [number, string, NumberOrNull, NumberOrNull, NumberOrNull, NumberOrNull, NumberOrNull, NumberOrNull, number, string?];
/** [CN, 설명, A값, A경로, B값, B경로] */
export type BundledBenchmarkTuple = [string, string, NumberOrNull, string, NumberOrNull, string];

export interface BundledDefaultValuesFile {
    format: 1;
    kind: 'default-values';
    filename: string;
    sheet_names: string[];
    countries: string[];
    routes: string[];
    descriptions: Record<string, string>;
    rows: BundledDefaultValueTuple[];
}

export interface BundledBenchmarksFile {
    format: 1;
    kind: 'benchmarks';
    filename: string;
    sheet_names: string[];
    rows: BundledBenchmarkTuple[];
}

const optional = (value: NumberOrNull) => (value === null ? undefined : value);

export function isBundledReference(reference: { summary?: { origin?: string } } | undefined): boolean {
    return reference?.summary?.origin === 'bundled';
}

export function expandBundledDefaultValues(file: BundledDefaultValuesFile, importedAt: string): ImportedDefaultValueReference {
    const rows: DefaultValueReferenceRow[] = file.rows.map((tuple) => ({
        country: file.countries[tuple[0]],
        cn_code: tuple[1],
        description: tuple[9] ?? file.descriptions[tuple[1]] ?? '',
        direct_default: optional(tuple[2]),
        indirect_default: optional(tuple[3]),
        total_default: optional(tuple[4]),
        markup_2026: optional(tuple[5]),
        markup_2027: optional(tuple[6]),
        markup_2028_onwards: optional(tuple[7]),
        production_route: file.routes[tuple[8]] ?? '',
    }));
    const korea = rows.filter((row) => row.country.trim().toLowerCase() === 'south korea');
    const sampleSource = korea.length > 0 ? korea : rows;

    return {
        summary: {
            kind: 'default-values',
            origin: 'bundled',
            filename: file.filename,
            imported_at: importedAt,
            sheet_names: file.sheet_names,
            row_count: rows.length,
            cn_code_count: new Set(rows.map((row) => row.cn_code)).size,
            country_count: new Set(rows.map((row) => row.country)).size,
            sample_rows: sampleSource.slice(0, 5).map((row) => ({ cn_code: row.cn_code, description: row.description, detail: `${row.country} / 총 ${row.total_default ?? '-'}` })),
        },
        rows,
    };
}

export function expandBundledBenchmarks(file: BundledBenchmarksFile, importedAt: string): ImportedBenchmarkReference {
    const rows: BenchmarkReferenceRow[] = file.rows.map((tuple) => ({
        cn_code: tuple[0],
        description: tuple[1],
        column_a_benchmark: optional(tuple[2]),
        column_a_route: tuple[3],
        column_b_benchmark: optional(tuple[4]),
        column_b_route: tuple[5],
    }));

    return {
        summary: {
            kind: 'benchmarks',
            origin: 'bundled',
            filename: file.filename,
            imported_at: importedAt,
            sheet_names: file.sheet_names,
            row_count: rows.length,
            cn_code_count: new Set(rows.map((row) => row.cn_code)).size,
            sample_rows: rows.slice(0, 5).map((row) => ({ cn_code: row.cn_code, description: row.description, detail: `A ${row.column_a_benchmark ?? '-'} / B ${row.column_b_benchmark ?? '-'}` })),
        },
        rows,
    };
}

/**
 * 이 설정에 내장본을 넣어야 하는가. 비어 있으면 넣는다. 사용자가 올린 것(origin 없음)은 절대 덮지 않는다.
 * 내장본이 있으면 파일(=EU 공표판)이 다를 때만 바꾼다.
 */
export function shouldSeedBundledReference(existing: { summary?: { origin?: string; filename?: string } } | undefined, bundledFilename: string): boolean {
    if (!existing?.summary) {
        return true;
    }
    return existing.summary.origin === 'bundled' && existing.summary.filename !== bundledFilename;
}

export type BundledSeedResult = { default_values: 'seeded' | 'kept' | 'failed'; benchmarks: 'seeded' | 'kept' | 'failed' };

let pending: Promise<BundledSeedResult> | undefined;

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`${url} ${response.status}`);
    }
    return (await response.json()) as T;
}

async function seedOne<TFile extends { filename: string }, TRef extends { summary: { origin?: string; filename?: string } }>(
    key: string,
    url: string,
    expand: (file: TFile, importedAt: string) => TRef
): Promise<'seeded' | 'kept' | 'failed'> {
    try {
        // getLocalSetting은 이 주입이 끝나길 기다리므로(local-db.ts) 여기서는 목록을 직접 읽는다 — 아니면 서로를 기다린다.
        const { listLocalItems, setLocalSetting } = await import('./local-db');
        const existing = (await listLocalItems('settings')).find((setting) => setting.key === key)?.value as TRef | undefined;
        // 파일을 받기 전에 먼저 본다 — 이미 있으면 네트워크를 쓰지 않는다.
        if (existing?.summary && !(existing.summary.origin === 'bundled')) {
            return 'kept';
        }
        const file = await fetchJson<TFile>(url);
        if (!shouldSeedBundledReference(existing, file.filename)) {
            return 'kept';
        }
        await setLocalSetting(key, expand(file, new Date().toISOString()));
        return 'seeded';
    } catch (error) {
        console.warn('내장 EU 기준값을 넣지 못했습니다:', error);
        return 'failed';
    }
}

async function seedAll(): Promise<BundledSeedResult> {
    return {
        default_values: await seedOne<BundledDefaultValuesFile, ImportedDefaultValueReference>(DEFAULT_VALUES_SETTING_KEY, BUNDLED_DEFAULT_VALUES_URL, expandBundledDefaultValues),
        benchmarks: await seedOne<BundledBenchmarksFile, ImportedBenchmarkReference>(BENCHMARKS_SETTING_KEY, BUNDLED_BENCHMARKS_URL, expandBundledBenchmarks),
    };
}

/**
 * 앱을 열 때 한 번 부른다. 여러 탭이 동시에 열어도 한 번만 넣도록 같은 탭 안에서는 약속을 공유하고,
 * 지원하는 브라우저에서는 탭 사이에도 잠금을 건다(같은 key로 설정이 두 건 생기지 않게).
 */
export function ensureBundledReferences(force = false): Promise<BundledSeedResult> {
    if (!pending || force) {
        const run = () => seedAll();
        pending = typeof navigator !== 'undefined' && navigator.locks ? (navigator.locks.request('cbam-bundled-references', run) as unknown as Promise<BundledSeedResult>) : run();
    }
    return pending;
}
