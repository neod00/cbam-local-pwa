import { cell, createDocx, paragraph, table } from './docx-builder';
import { checkDisplaySum, formatForReport, formatIntegerForReport, formatPercentForReport, formatRawForReport, roundForReport } from './report-format';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';
import { isCbamReportingScope, getProductReportingScope } from './reporting-scope';
import { findDefaultValueReference, hasAmbiguousDefaultValueRoutes } from './reference-workbooks';
import type { DefaultValueReferenceRow, ImportedDefaultValueReference } from './reference-workbooks';
import { getSourceStreamEmissionFactorBasis } from './source-stream-calculation';
import { calculateLocalResults } from './calculation-engine';
import type { LocalCalculationResult } from './calculation-engine';
import type {
    Installation,
    Product,
    ProductionProcess,
    ProductOutputLine,
    PurchasedPrecursor,
    ReportingPeriod,
    ReportInputs,
    SourceStream,
} from './local-db';

// CBAM 내재배출량 산정보고서(.docx) 생성. 설계: docs/calculation-report-design.md
// 승인 기준 문서: CBAM_documents/CBAM_산정보고서_샘플_v0.3_한빛스틸_2026.docx
//
// P2 범위: 앱 데이터만으로 채워지는 장 + 발행 게이트 G1/G4/G7.
// 9장(DV 대조)은 P3, 11·12·15·16장(사용자 입력·서명)은 P4에서 채운다. 장 번호는 샘플 v0.3과
// 동일하게 고정하고, 아직 못 채우는 곳은 「기재 필요」 자리표시로 남긴다(번호가 나중에 밀리지 않도록).

const INK = '1D1D1F';
const MUTE = '6E6E73';
const AMBER = '9A5B00';
const SOFT = 'F5F5F7';

/** 본문에서 참조 가능한 장 번호 — 게이트 G4(교차참조)가 이 집합으로 검사한다. */
const CHAPTERS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', 'A', 'B', 'C'] as const;

export type ReportGateId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6' | 'G7';
export type ReportGateSeverity = 'block' | 'warn' | 'label';

export interface ReportGateIssue {
    gate: ReportGateId;
    severity: ReportGateSeverity;
    message: string;
}

export interface CalculationReportInput {
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    results: LocalCalculationResult[];
    generatedAt: Date;
    /** /upload에서 연결한 EU 공식 기본값 기준자료. 없으면 제9장은 「기준자료 미연결」로 출력하고 G6 경고. */
    defaultValues?: ImportedDefaultValueReference;
    /** 기본값 적용 연도. 전구물질의 default_value_year를 우선하고, 없으면 이 값을 쓴다. */
    defaultValueYear?: DefaultValueYear;
    /** 산정 데이터로는 알 수 없는 사용자 입력(11·12·15·16장, 6.1·6.3·7 메타). 없으면 「기재 필요」 + G5 경고. */
    reportInputs?: ReportInputs;
}

export type DefaultValueYear = '2026' | '2027' | '2028_ONWARDS';

export interface CalculationReportResult {
    blob: Blob;
    filename: string;
    issues: ReportGateIssue[];
    /** 발행일이 보고기간 종료 전이라 「기중 잠정」으로 표기됨 (게이트 G2) */
    isInterim: boolean;
}

const PLACEHOLDER = '기재 필요';
/** 해당 계수가 이 배출원의 산식에 등장하지 않음. 0과 구분해야 한다. */
const NOT_APPLICABLE = '해당 없음';
/** 공식 기본값이 공표되지 않은 조합. 0(=배출 없음)과 반드시 구분한다. */
const NOT_PUBLISHED = 'N/A (미공표)';

/**
 * 검증인이 6개월 뒤 같은 입력으로 같은 결과를 재현하려면 어떤 소프트웨어였는지 특정해야 한다.
 * DV 워크북 판본은 기재하면서 그것을 해석한 엔진이 무버전이면 재현이 성립하지 않는다(씨밤이 P1).
 */
const APP_VERSION = 'v0.1.0';

function reportableResults(input: CalculationReportInput) {
    return input.results.filter((result) => result.is_cbam_reportable);
}

/**
 * 보고기간은 산정 결과가 가리키는 기간이다.
 * periods[0]을 쓰면 기간이 여러 개 등록됐을 때 데이터와 무관한 기간이 표지에 인쇄된다(씨밤이 P1).
 */
function firstPeriod(input: CalculationReportInput) {
    const periodId = reportableResults(input).find((result) => result.period_id)?.period_id;

    return input.periods.find((period) => period.id === periodId) ?? input.periods[0];
}

/** G1 — 한 보고서는 한 보고기간만 다룬다. 결과가 여러 기간에 걸쳐 있으면 표지가 거짓이 된다. */
function checkSinglePeriod(input: CalculationReportInput): ReportGateIssue[] {
    const periodIds = new Set(
        reportableResults(input)
            .map((result) => result.period_id)
            .filter((id): id is string => Boolean(id))
    );

    if (periodIds.size <= 1) {
        return [];
    }

    const names = [...periodIds]
        .map((id) => input.periods.find((period) => period.id === id)?.name ?? id)
        .join(', ');

    return [{
        gate: 'G1',
        severity: 'block',
        message: `산정 결과가 여러 보고기간(${names})에 걸쳐 있습니다. 산정보고서는 보고기간별로 발행해야 합니다.`,
    }];
}

/** 신고 대상 결과가 가리키는 제품들(중복 제거). 간접배출 취급은 제품마다 갈릴 수 있다. */
function reportableProducts(input: CalculationReportInput) {
    const seen = new Set<string>();
    const products: Product[] = [];

    for (const result of reportableResults(input)) {
        const product = input.products.find((item) => item.id === result.product_id);

        if (product && !seen.has(product.id)) {
            seen.add(product.id);
            products.push(product);
        }
    }

    return products;
}

/**
 * 산정경계 안(= CBAM 신고 대상 결과가 가리키는 공정)에 속한 것만 추린다.
 * 6·7장이 input 전체를 순회하면 경계 밖 공정·배출원이 경계 안 문서에 실린다(씨밤이 P1).
 */
function cbamProcessIds(input: CalculationReportInput) {
    return new Set(reportableResults(input).map((result) => result.process_id));
}

function cbamProcesses(input: CalculationReportInput) {
    const ids = cbamProcessIds(input);

    return input.processes.filter((process) => ids.has(process.id));
}

function cbamSourceStreams(input: CalculationReportInput) {
    const ids = cbamProcessIds(input);

    return input.sourceStreams.filter((stream) => stream.process_id !== undefined && ids.has(stream.process_id));
}

function cbamPrecursors(input: CalculationReportInput) {
    const ids = cbamProcessIds(input);

    return input.precursors.filter((precursor) => precursor.process_id !== undefined && ids.has(precursor.process_id));
}

/**
 * 이 전구물질의 직접 기여가 CBAM 기준 SEE에서 차지하는 비중.
 * 결과의 대부분이 미검증 값에서 온다는 사실은 검증인이 가장 먼저 봐야 할 지표인데,
 * 독자가 직접 나눠봐야 알 수 있으면 노출된 것이 아니다(씨밤이 P0).
 */
function precursorContributionShare(input: CalculationReportInput, precursor: PurchasedPrecursor) {
    const result = reportableResults(input).find((item) => item.process_id === precursor.process_id);

    if (!result?.see_cbam_basis || result.output_mass_t <= 0) {
        return undefined;
    }

    const contribution = (precursor.consumed_mass_t * precursor.direct_see_tco2e_per_t) / result.output_mass_t;

    return contribution / result.see_cbam_basis;
}

/** 원천자료가 에너지 단위이면 NCV 환산이 산식에서 상쇄된다(제6.1장 고지 판단용). */
const ENERGY_UNITS = new Set(['MJ', 'GJ', 'TJ', 'KWH', 'MWH', 'GWH']);

const ALLOCATION_BASIS_LABEL: Record<string, string> = {
    PROCESS_TOTAL: '공정 전체(제품 배분 없음 — 공정별 단일 제품)',
    MASS: '질량 기준(MASS)',
    MANUAL: '수동 지정(MANUAL)',
};

/**
 * 「도구가 자동 경고한다」는 방법 진술이 아니다. 어떤 배분방법을 실제로 썼는지 말해야
 * 검증인이 배분기준 혼용 여부를 판단할 수 있다(씨밤이 P1 — v0.3 회귀).
 */
function describeAllocationBasis(input: CalculationReportInput) {
    const bases = [...new Set(reportableResults(input).map((result) => result.allocation_basis).filter(Boolean))];

    if (bases.length === 0) {
        return '제품 배분 기준: 확인 필요(자료).';
    }

    const labels = bases.map((basis) => ALLOCATION_BASIS_LABEL[basis] ?? basis).join(' · ');

    return bases.length === 1
        ? `제품 배분 기준: ${labels} 단일 적용, 한 공정 내 기준 혼용 없음.`
        : `제품 배분 기준: ${labels} — 기준이 혼용되어 있어 공정별 적정성을 개별 확인해야 한다(제4장). 확인 필요(자료).`;
}

/** 비중(0~1) 표기. 부호 없이 백분율만. */
function formatPercentShare(ratio: number) {
    return `${formatForReport(ratio * 100, 1)}%`;
}

/**
 * 표지·요약에 올릴 최대 한계 한 줄.
 * 미검증 전구물질이 기준 SEE의 큰 비중을 차지하면 그것이 이 문서의 최대 한계다.
 */
function topLimitation(input: CalculationReportInput) {
    const candidates = cbamPrecursors(input)
        .filter((precursor) => precursor.verification_status !== 'VERIFIED' && precursor.data_mode !== 'DEFAULT')
        .map((precursor) => ({ precursor, share: precursorContributionShare(input, precursor) }))
        .filter((item): item is { precursor: PurchasedPrecursor; share: number } => item.share !== undefined)
        .sort((a, b) => b.share - a.share);

    const top = candidates[0];

    if (!top) {
        return undefined;
    }

    return `CBAM 기준 SEE의 약 ${formatPercentShare(top.share)}가 제3자 검증을 받지 않은 공급사 통지값(${top.precursor.name})에서 유래한다. 불인정 시 영향은 제9.2장 민감도 참조 — 상세는 제8·9·14장.`;
}

function formatDate(date: Date) {
    return date.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- 게이트

/** G7 — 숫자 단위 열에 %·문자가 섞이지 않았는지. v0.2 샘플에서 실제로 발생한 결함. */
function checkNumericColumns(
    tableLabel: string,
    columns: Array<{ header: string; numeric?: boolean }>,
    rows: Array<Array<string>>
): ReportGateIssue[] {
    const issues: ReportGateIssue[] = [];

    columns.forEach((column, index) => {
        if (!column.numeric) {
            return;
        }

        rows.forEach((row) => {
            const value = row[index] ?? '';

            // 자리표시·비해당 표기는 숫자가 아니어도 정상이다. 「해당 없음」은 그 계수가
            // 이 배출원의 산식에 등장하지 않는다는 뜻이므로 0을 쓰면 오히려 거짓이 된다.
            if (value === '' || value === '-' || value === PLACEHOLDER || value === NOT_APPLICABLE || value === NOT_PUBLISHED || value === '대조 불가' || value === '확인 필요(자료)') {
                return;
            }

            // 숫자 열에는 천단위 구분·소수점·부호만 허용한다. '%'가 들어오면 헤더 단위와 어긋난다.
            if (!/^-?[\d,]+(\.\d+)?$/.test(value.trim())) {
                issues.push({
                    gate: 'G7',
                    severity: 'block',
                    message: `${tableLabel}: 「${column.header}」 열은 숫자 단위인데 값 「${value}」가 단위와 맞지 않습니다.`,
                });
            }
        });
    });

    return issues;
}

/**
 * G1 — 표의 구성 항목과 소계 정합.
 * 원천값이 안 맞으면 산정 오류 → 발행 차단. 표시값만 안 맞으면 반올림 표기 문제 → 경고 + 각주.
 * 반올림 누적은 정상 데이터에서도 발생하므로 차단하면 안 된다(예: 0.20655+0.01755).
 */
function checkResultDisplaySums(results: LocalCalculationResult[]): { issues: ReportGateIssue[]; needsRoundingNote: boolean } {
    const issues: ReportGateIssue[] = [];
    let needsRoundingNote = false;

    for (const result of results) {
        const checks = [
            checkDisplaySum({
                label: `${result.product_name}: SEE 직접 소계`,
                parts: [result.direct_see, result.precursor_direct_see],
                total: result.see_direct_incl_precursor,
            }),
            checkDisplaySum({
                label: `${result.product_name}: SEE 간접 소계`,
                parts: [result.own_indirect_see, result.precursor_indirect_see],
                total: result.see_indirect_incl_precursor,
            }),
            checkDisplaySum({
                label: `${result.product_name}: 참고 총 SEE`,
                parts: [result.see_direct_incl_precursor, result.see_indirect_incl_precursor],
                total: result.see_informational_total,
            }),
        ];

        for (const check of checks) {
            if (!check.isMathValid) {
                // 원천값이 안 맞는다 = 산정 데이터가 틀렸다. 이건 막아야 한다.
                issues.push({
                    gate: 'G1',
                    severity: 'block',
                    message: `${check.label}: 구성 항목의 합이 소계와 일치하지 않습니다(원천값 차이 ${check.rawDelta}). 산정 데이터를 확인하세요.`,
                });
            } else if (!check.isDisplayValid) {
                // 데이터는 맞고 표시만 어긋난다 = 반올림 누적. 각주로 알린다.
                issues.push({
                    gate: 'G1',
                    severity: 'warn',
                    message: `${check.label}: 반올림 표기로 구성 표시값 합(${check.displayedPartsSum})이 소계 표시값(${check.displayedTotal})과 다릅니다. 산정값은 정확하며, 표에 반올림 각주를 자동 삽입했습니다.`,
                });
                needsRoundingNote = true;
            }
        }
    }

    return { issues, needsRoundingNote };
}

/**
 * G1 — SEE의 분모(생산량)가 0 이하면 차단한다.
 * 엔진은 이때 SEE를 0으로 두고 경고만 남기므로, 게이트가 없으면 「CBAM 기준 SEE 0.0000」이
 * 아무 표식 없이 검증인에게 나간다. "배출이 없다"는 진술이 되어버린다(씨밤이 P0).
 */
function checkSeeDenominator(results: LocalCalculationResult[]): ReportGateIssue[] {
    return results
        .filter((result) => result.output_mass_t <= 0)
        .map((result) => ({
            gate: 'G1' as const,
            severity: 'block' as const,
            message: `${result.product_name}(${result.process_name}): 생산량이 ${formatForReport(result.output_mass_t)} t이라 제품 1톤당 SEE를 산정할 수 없습니다. 생산량을 확인하세요.`,
        }));
}

/**
 * G1 — 엔진이 남긴 산정 경고를 보고서로 끌어올린다.
 * 제13장이 건수만 인쇄하고 내용은 어디에도 없으면 검증인에게 단서가 아니라 red flag다(씨밤이 P1).
 */
function collectEngineWarnings(results: LocalCalculationResult[]): ReportGateIssue[] {
    return results.flatMap((result) =>
        result.warnings.map((message) => ({
            gate: 'G1' as const,
            severity: 'warn' as const,
            message: `${result.product_name}(${result.process_name}): ${message}`,
        }))
    );
}

/** G4 — 본문의 「제N장」 참조가 실재하는 장을 가리키는지. v0.2 샘플의 dangling 참조 재발 방지. */
function checkCrossReferences(bodyText: string): ReportGateIssue[] {
    const issues: ReportGateIssue[] = [];
    const referenced = new Set<string>();

    for (const match of bodyText.matchAll(/제\s*([0-9]{1,2})(?:\.[0-9]+)?\s*장/g)) {
        referenced.add(match[1]);
    }

    for (const chapter of referenced) {
        if (!(CHAPTERS as readonly string[]).includes(chapter)) {
            issues.push({
                gate: 'G4',
                severity: 'block',
                message: `본문이 존재하지 않는 「제${chapter}장」을 참조합니다.`,
            });
        }
    }

    return issues;
}

/** G2 — 발행일이 보고기간 종료 전이면 「기중 잠정」으로 라벨한다(차단이 아니라 표기). */
function checkIssueDate(input: CalculationReportInput): { isInterim: boolean; issues: ReportGateIssue[] } {
    const period = firstPeriod(input);

    if (!period) {
        return { isInterim: false, issues: [] };
    }

    const isInterim = formatDate(input.generatedAt) < period.end_date;

    return {
        isInterim,
        issues: isInterim
            ? [{
                gate: 'G2',
                severity: 'label',
                message: `발행일(${formatDate(input.generatedAt)})이 보고기간 종료일(${period.end_date}) 이전이므로 「기중 잠정(interim)」으로 표기합니다. 증빙 커버리지를 확인하세요.`,
            }]
            : [],
    };
}

/** G3 — 내부 소비가 있는데 CBAM 공정이 1개면 경계 서술이 필요하다(샘플 v0.2의 자기모순). */
function checkBoundaryConsistency(input: CalculationReportInput): ReportGateIssue[] {
    const scope = input.processes.filter((process) => {
        const product = input.products.find((item) => item.id === process.product_id);
        return product ? isCbamReportingScope(getProductReportingScope(product)) : false;
    });
    const hasInternal = scope.some((process) => process.internal_consumption_mass_t > 0);

    if (hasInternal && scope.length === 1) {
        return [{
            gate: 'G3',
            severity: 'warn',
            message: '내부 소비량이 있으나 CBAM 대상 생산공정이 1개입니다. 내부 소비분이 투입되는 공정(비CBAM 재화 생산공정 등)의 경계 서술이 필요합니다 — 제4장에 자동 각주를 넣었으니 내용을 확인하세요.',
        }];
    }

    return [];
}

// ---------------------------------------------------------------- 본문

function coverSection(input: CalculationReportInput, isInterim: boolean) {
    const installation = input.installations[0];
    const period = firstPeriod(input);
    const reportable = reportableResults(input);
    // 제품마다 간접배출 취급이 갈릴 수 있다. 첫 제품으로 전체를 대표하면 표지가 나머지 제품에 대해 거짓이 된다(씨밤이 P0).
    const labels = [...new Set(reportableProducts(input).map((item) => getIndirectEmissionsApplicability(item).label))];

    const rows: Array<[string, string]> = [
        ['보고기간 (Reporting period)', period ? `${period.start_date} ~ ${period.end_date}` : PLACEHOLDER],
        ['대상 제품 (CBAM good)', reportable.length > 0
            ? reportable.map((result) => `${result.product_name} · CN ${result.cn_code ?? '-'}`).join('\n')
            : PLACEHOLDER],
        ['대상 온실가스 (GHG scope)', 'CO2 (철강 품목의 CBAM 대상 GHG — 확인 필요(규정)). 본문 tCO2e = tCO2'],
        ['간접배출 취급', labels.length === 1 ? labels[0] : `제품별 상이 — 제3.1장 참조 (${labels.join(' / ')})`],
        ['문서 상태 (Status)', isInterim
            ? '기중 잠정(interim) — 보고기간 종료 전 발행. 증빙 커버리지 확인 필요'
            : '내부 검토 대기 · 제3자 검증 제출 전'],
        ['작성일 (Date of issue)', formatDate(input.generatedAt)],
        ['작성 도구 (Prepared with)', `CBAM Local ${APP_VERSION} — 로컬 우선 산정 도구${input.defaultValues ? ` · 기본값 기준자료 ${input.defaultValues.summary.filename}` : ' · 기본값 기준자료 미연결'}`],
    ];

    // 이 산정의 최대 한계는 표지를 통과해야 한다. 각주에 묻히면 요약만 읽는 검증인은
    // 자기가 무엇을 보고 있는지 모른 채 넘어간다(씨밤이 P0).
    const limitation = topLimitation(input);

    if (limitation) {
        rows.push(['주요 한계 (Key limitation)', limitation]);
    }

    return [
        paragraph('CBAM 내재배출량 산정보고서', 'Title'),
        paragraph('CBAM Embedded Emissions Calculation Report', undefined, { color: MUTE }),
        paragraph(installation?.local_name || installation?.name || PLACEHOLDER, 'Heading2'),
        paragraph(installation?.name ?? '', undefined, { color: MUTE }),
        table(['항목', '내용'], rows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }),
        paragraph(
            '표기 규칙: 배출량·SEE는 소수 4자리, 계수·원단위는 원천 자릿수 유지. 소계·합계는 미반올림 원천값에서 산출한 뒤 반올림(사사오입, 절댓값 기준)한다. 산식에 표기하는 피연산자는 반올림하지 않는다.',
            'Note'
        ),
        paragraph(
            '미확정 항목 표기: 「확인 필요(규정)」 = 규정 원문 대조 미완 · 「확인 필요(자료)」 = 외부 자료·증빙 미수령 · 「기재 필요」 = 실제 산정 시 반드시 채워야 하는 값.',
            'Note'
        ),
    ].join('');
}

function summarySection(input: CalculationReportInput) {
    const reportable = reportableResults(input);
    const limitation = topLimitation(input);
    const columns = [
        { header: '제품 (CN)' },
        { header: '생산량 (t)', numeric: true },
        { header: 'SEE 직접 (tCO2e/t)', numeric: true },
        { header: 'SEE 간접 (tCO2e/t)', numeric: true },
        { header: 'CBAM 기준 SEE (tCO2e/t)', numeric: true },
    ];
    const rows = reportable.map((result) => [
        `${result.product_name}\n${result.cn_code ?? '-'}`,
        formatIntegerForReport(result.output_mass_t),
        formatForReport(result.see_direct_incl_precursor),
        formatForReport(result.see_indirect_incl_precursor),
        result.see_cbam_basis === null ? PLACEHOLDER : formatForReport(result.see_cbam_basis),
    ]);

    return {
        xml: [
            paragraph('1. 요약   Executive Summary', 'Heading1'),
            paragraph('본 보고서는 대상 보고기간에 생산한 CBAM 대상 제품의 제품 1톤당 내재배출량(SEE)을 EU CBAM 규정에 따라 산정한 결과와 그 근거를 기술한다. 완전성·정확성·일관성·투명성·적절성의 5개 보고원칙에 따라 작성되었으며, 제3자 검증에 필요한 방법론·활동자료·계수·증빙의 추적 경로를 제공한다.'),
            table(columns.map((column) => column.header), rows, {
                widths: [2300, 1500, 1750, 1750, 1700], headerShade: SOFT, headerBold: true, repeatHeader: true,
            }),
            paragraph('SEE 직접 = 자체 공정 직접배출 + 구매 전구물질의 직접 내재배출. SEE 간접의 인증서 기준 반영 여부는 제3.1장 근거를 따른다.', 'Note'),
            paragraph(
                `참고 총 SEE(직접+간접, 정보 목적) = ${reportable.map((result) => `${result.product_name} ${formatForReport(result.see_informational_total)}`).join(' · ')} tCO2e/t.`,
                'Note'
            ),
            // 요약만 읽는 독자에게 최대 한계를 전달하지 못하면 요약이 제 역할을 못한 것이다(씨밤이 P0).
            ...(limitation ? [paragraph(`주요 잔여 리스크: ${limitation}`, 'Note', { color: AMBER })] : []),
        ].join(''),
        gateIssues: checkNumericColumns('제1장 요약표', columns, rows),
    };
}

function installationSection(input: CalculationReportInput) {
    const installation = input.installations[0];
    const rows: Array<[string, string]> = [
        ['사업장명 (국문 / 영문)', `${installation?.local_name ?? '-'} / ${installation?.name ?? PLACEHOLDER}`],
        ['경제활동', installation?.economic_activity || PLACEHOLDER],
        ['주소', [installation?.street, installation?.city, installation?.postcode, installation?.country].filter(Boolean).join(', ') || PLACEHOLDER],
        ['UN/LOCODE · 좌표', [installation?.unlocode, installation?.latitude && installation?.longitude ? `${installation.latitude}, ${installation.longitude}` : ''].filter(Boolean).join(' · ') || PLACEHOLDER],
        ['CBAM 담당자', [installation?.authorized_representative_name, installation?.email, installation?.telephone].filter(Boolean).join(' · ') || PLACEHOLDER],
    ];

    return [
        paragraph('2. 사업장 정보   Installation Identification', 'Heading1'),
        table(['항목', '내용'], rows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }),
        paragraph('2.1 조직경계 및 산정경계', 'Heading2'),
        paragraph('조직경계는 위 사업장이다. 산정경계는 EU ETS 포괄범위에 기반한 cradle-to-gate의 부분집합이며, 귀속 단위는 생산공정(production process)이다.'),
        table(['구분', '내용'], [
            ['포함', 'CBAM 대상 제품 생산에 귀속되는 연료 연소 배출, 전력 사용에 따른 간접배출, 구매 전구물질의 내재배출'],
            ['제외', '상류 원료 채굴·정련, 사업장 간 운송, 제품 사용·폐기 단계 (CBAM 산정경계 밖 — CFP의 전과정 경계보다 좁음)'],
        ], { widths: [2200, 6800], headerShade: SOFT, headerBold: true, repeatHeader: true }),
    ].join('');
}

/**
 * 3장 — 간접배출 취급 근거는 **고정 문안이 아니라 품목·전구물질 분류에 따른 조건 분기**여야 한다.
 * 「최종제품이 철강이니까」로 일반화하면 비직접전용 전구물질 케이스에서 규정과 어긋난다(씨밤이 P1 지적).
 */
function productSection(input: CalculationReportInput) {
    const period = firstPeriod(input);
    const reportable = reportableResults(input);
    const rows: Array<[string, string]> = [
        ['보고기간', period ? `${period.start_date} ~ ${period.end_date}` : PLACEHOLDER],
        ['제품명 / CN 코드', reportable.map((result) => `${result.product_name} / ${result.cn_code ?? '-'}`).join('\n') || PLACEHOLDER],
        ['CN 확인 방법', 'EU 공식 Communication Template의 CN 목록과 대조 확인 (접두 추정 아님)'],
    ];

    const body = [
        paragraph('3. 보고기간 및 대상 제품   Reporting Period and CBAM Goods', 'Heading1'),
        table(['항목', '내용'], rows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }),
        paragraph('3.1 간접배출 취급 근거', 'Heading2'),
    ];

    // 제품마다 판정한다. 첫 제품으로 전체를 대표하면 분류가 갈리는 순간 문서가 자기모순에 빠진다(씨밤이 P0).
    for (const product of reportableProducts(input)) {
        const applicability = getIndirectEmissionsApplicability(product);
        const label = `${product.name}(CN ${product.cn_code ?? '미기재'})`;

        if (applicability.applicable) {
            body.push(paragraph(`${label}: 간접배출을 포함해 산정한다. 판정: ${applicability.label} (조항 확인 필요(규정))`));
        } else {
            body.push(paragraph(`${label}: 직접배출만 고려하는 품목으로, 최종제품의 자체 전력 간접배출은 CBAM 인증서 산정 기준 SEE에서 제외하고 정보 목적으로 보고한다. 판정: ${applicability.label} (Regulation (EU) 2023/956 Art. 7(1) — 조항 번호 EUR-Lex 원문 확인 필요(규정))`));
        }
    }

    // 판정이 어떻게 내려졌는지 밝힌다. 산정 도구는 CN 접두 규칙으로 판정하며 Annex II 등재 목록을
    // 조회하지 않는다. 이 사실을 감추면 보고서가 "등재를 확인했다"고 말하는 셈이 된다(씨밤이 P0).
    body.push(paragraph(
        '판정 방법: 본 판정은 산정 도구의 CN 접두 규칙에 따른 것이며, Annex II 등재 목록 원본을 조회한 결과가 아니다. 등재 목록·판본 대조는 완료되지 않았다 — 확인 필요(자료).',
        'Note',
        { color: AMBER }
    ));

    const directOnlyProducts = reportableProducts(input).filter(
        (product) => !getIndirectEmissionsApplicability(product).applicable
    );

    if (directOnlyProducts.length > 0) {
        // 전구물질별로 개별 판정 — 하나라도 직접전용이 아니면 그 간접배출은 최종재로 전가될 수 있다.
        const nonDirectOnly = input.precursors.filter((precursor) => {
            const applicabilityOfPrecursor = getIndirectEmissionsApplicability({
                cn_code: precursor.precursor_cn_code,
                hs_code: precursor.precursor_cn_code ?? '',
            });
            return applicabilityOfPrecursor.applicable;
        });

        if (input.precursors.length > 0 && nonDirectOnly.length === 0) {
            body.push(paragraph('소비 전구물질 역시 모두 동일하게 직접배출만 고려되는 품목이므로, 그 간접 내재배출도 인증서 산정 기준에서 제외하고 정보 목적으로 보고한다.'));
        }

        if (nonDirectOnly.length > 0) {
            body.push(paragraph(
                `주의: 다음 전구물질은 직접배출만 고려되는 품목이 아니므로 그 간접 내재배출이 최종재로 전가될 수 있다 — ${nonDirectOnly.map((precursor) => `${precursor.name}(${precursor.precursor_cn_code ?? 'CN 미기재'})`).join(', ')}. 인증서 산정 기준 반영 여부를 개별 확인해야 한다. 확인 필요(규정).`,
                undefined,
                { color: AMBER }
            ));
        }

        body.push(paragraph('간접배출 제외는 「최종제품이 철강이기 때문」이 아니라 「해당 품목이 직접배출만 고려하는 품목으로 등재되어 있기 때문」이다. 철강 중 CN 2601 12 00(응결 철광석·정광)은 간접 포함 예외이다.', 'Note'));
    }

    return body.join('');
}

function processSection(input: CalculationReportInput) {
    const scope = input.processes.filter((process) => {
        const product = input.products.find((item) => item.id === process.product_id);
        return product ? isCbamReportingScope(getProductReportingScope(product)) : false;
    });
    const columns = [
        { header: '생산공정' },
        { header: '생산경로 (EU 표기)' },
        { header: '총 생산량 (t)', numeric: true },
        { header: '시장 출하 (t)', numeric: true },
        { header: '내부 소비 (t)', numeric: true },
    ];
    const rows = scope.map((process) => [
        process.name,
        process.production_route || PLACEHOLDER,
        formatIntegerForReport(process.output_mass_t),
        formatIntegerForReport(process.market_output_mass_t),
        formatIntegerForReport(process.internal_consumption_mass_t),
    ]);
    const hasInternal = scope.some((process) => process.internal_consumption_mass_t > 0);

    const body = [
        paragraph('4. 생산공정 및 산정경계   Production Processes and System Boundaries', 'Heading1'),
        table(columns.map((column) => column.header), rows, {
            widths: [2700, 2100, 1400, 1400, 1400], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph(`본 보고서의 CBAM 대상 생산공정은 ${scope.length}개이다. ${describeAllocationBasis(input)} SEE 산정의 분모는 각 공정의 총생산량이다.`),
    ];

    if (hasInternal) {
        body.push(paragraph(
            `내부 소비량은 시장에 출하되지 않고 사업장 내 다른 생산공정에 투입된다. 해당 공정이 CBAM 대상이 아닌 재화를 생산하는 경우 본 산정경계 밖이며, 그 투입량만 EU 템플릿의 「사업장 내 타 생산공정에서 소비」 항목에 기재된다. 투입처와 그 CBAM 대상 여부를 확인해 기재하세요 — 기재 필요.`,
            undefined,
            { color: AMBER }
        ));
    }

    return { xml: body.join(''), gateIssues: checkNumericColumns('제4장 생산공정표', columns, rows) };
}

function methodologySection(input: CalculationReportInput) {
    const reportable = reportableResults(input);

    const body = [
        paragraph('5. 산정방법론   Calculation Methodology', 'Heading1'),
        paragraph('산정은 Regulation (EU) 2023/956 및 2026 확정기간 이행규정에 따른다. 본 보고서의 산정방법을 지배하는 이행규정의 번호·적용 조항은 EUR-Lex 원문 대조가 완료되지 않았다 — 확인 필요(규정). 참조 문서는 부속서 B를 따른다.'),
        paragraph('전환기(~2025) Guidance 및 Q&A는 개념 참조용으로만 사용하였으며, 수치·한도를 본 확정기간 산정에 적용하지 않았다.', 'Note'),
        paragraph('5.1 직접배출 (연료 연소)', 'Heading2'),
        // 산식은 엔진이 실제로 계산하는 것과 같아야 한다. 전환계수·화석분율을 빠뜨리면
        // 바이오매스가 섞인 배출원에서 인쇄된 산식으로 인쇄된 결과를 재현할 수 없다(씨밤이 P1).
        paragraph('E직접 = 활동자료 AD × 순발열량 NCV(GJ/단위) × 배출계수 EF(tCO2/TJ) × 산화계수 OxF × 전환계수 CF × 화석 분율 ÷ 1,000'),
        paragraph('배출계수가 활동자료 단위 기준(tCO2/단위)으로 주어진 경우에는 NCV와 ÷1,000을 적용하지 않는다: E직접 = AD × EF × OxF × CF × 화석 분율. 각 계수의 실제 적용값은 제6.2.1장에 있다.', 'Note'),
        paragraph('철강 품목의 CBAM 대상 온실가스는 CO2이므로(확인 필요(규정)) tCO2 = tCO2e로 표기한다. 연소에 따른 CH4·N2O는 본 산정의 대상 GHG에 포함되지 않는다 — 확인 필요(규정).', 'Note'),
        paragraph('5.2 간접배출 (전력)', 'Heading2'),
        paragraph('E간접 = 전력 사용량(MWh) × 전력 배출계수(tCO2e/MWh). 인증서 기준 반영 여부는 제3장 근거를 따른다.'),
        paragraph('5.3 전구물질 내재배출', 'Heading2'),
        paragraph('구매 전구물질은 공급사 실측(actual) 데이터를 우선 적용하며, 실측이 없거나 인정 요건을 충족하지 못할 때에만 EU 공표 기본값(DV)을 사용한다. 제품 1톤당 전구물질 기여 = (소비량 ÷ 제품 총생산량) × 전구물질 SEE. 실측 채택 근거의 정량 대조는 제9장에 기술한다.'),
        paragraph('고철(CN 7204)은 CBAM 전구물질 범위에서 제외되어 가산하지 않는다.'),
        paragraph('5.4 제품 SEE 및 인증서 기준', 'Heading2'),
    ];

    // 피연산자는 원천값으로 인쇄한다. formatForReport(반올림)를 쓰면 바로 아래 줄의
    // 「피연산자는 반올림하지 않는다」와 문서가 자기모순에 빠지고, 검증인이 인쇄된 산식으로
    // 인쇄된 결과를 재현하지 못하는 경우가 생긴다(씨밤이 P1 — v0.1 회귀).
    for (const result of reportable) {
        body.push(paragraph(
            `${result.product_name}: SEE(직접, 전구물질 포함) = ${formatRawForReport(result.direct_see)} + ${formatRawForReport(result.precursor_direct_see)} = ${formatForReport(result.see_direct_incl_precursor)} tCO2e/t`
        ));
        body.push(paragraph(
            `${result.product_name}: SEE(간접) = ${formatRawForReport(result.own_indirect_see)} + ${formatRawForReport(result.precursor_indirect_see)} = ${formatForReport(result.see_indirect_incl_precursor)} tCO2e/t`
        ));
    }

    body.push(paragraph('산식에 표기한 피연산자는 반올림하지 않는다. 결과값만 소수 4자리로 반올림한다.', 'Note'));

    return body.join('');
}

/** 6.1 — 원천 단위(청구서 MJ 등) → 산정 활동자료(t) 경로. 없으면 검증인의 첫 점검이 막힌다(씨밤이 P1). */
function transpositionTable(input: CalculationReportInput) {
    const rows = cbamSourceStreams(input).map((stream) => {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);
        return [
            stream.name,
            entry?.source_quantity && entry?.source_unit ? `${entry.source_quantity} ${entry.source_unit}` : PLACEHOLDER,
            entry?.conversion_note || PLACEHOLDER,
            `${formatForReport(stream.activity_data, 4)} ${stream.activity_unit}`,
        ];
    });

    const body = [table(['배출원', '원천자료 (청구서 등)', '환산 근거', '산정 활동자료'], rows, {
        widths: [2200, 2200, 2600, 2000], headerShade: SOFT, headerBold: true, repeatHeader: true,
    })];

    // 원천자료가 이미 에너지 단위인데 NCV로 나눠 질량으로 바꾼 뒤 산식에서 같은 NCV를 다시 곱하면
    // NCV는 상쇄된다. 이를 말하지 않으면 검증인이 NCV의 적정성을 계수 위계 이슈로 오인 추적한다
    // (실제로는 본 건 배출량에 영향이 없다). v0.3에 있던 고지의 회귀(씨밤이 P1).
    const cancelling = cbamSourceStreams(input).filter((stream) => {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);
        const unit = entry?.source_unit?.trim().toUpperCase();

        return Boolean(unit)
            && ENERGY_UNITS.has(unit as string)
            && getSourceStreamEmissionFactorBasis(stream) === 'PER_TJ'
            && stream.ncv_gj_per_unit > 0;
    });

    if (cancelling.length > 0) {
        body.push(paragraph(
            `NCV 상쇄 고지: ${cancelling.map((stream) => stream.name).join(', ')}의 원천자료는 이미 에너지 단위이며, 질량 환산에 사용한 순발열량과 제5.1장 산식의 순발열량이 동일하므로 두 값은 상쇄된다. 따라서 순발열량 값의 오차는 본 건 배출량에 영향을 주지 않는다. 다만 산정 활동자료로 표기한 질량은 계량된 값이 아니라 환산으로 얻은 파생값이므로, 환산에 사용한 순발열량의 출처를 제6.2.2장에 밝힌다.`,
            'Note'
        ));
    }

    return body.join('');
}

/** 6.3 — 측정 방식·데이터 품질. */
function measurementTable(input: CalculationReportInput) {
    const rows = cbamSourceStreams(input).map((stream) => {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);
        return [
            stream.name,
            entry?.measurement_method || PLACEHOLDER,
            stream.source || PLACEHOLDER,
            entry?.data_quality || PLACEHOLDER,
        ];
    });

    return table(['활동자료', '측정 방식', '원천 증빙', '데이터 품질'], rows, {
        widths: [1800, 2600, 2400, 2200], headerShade: SOFT, headerBold: true, repeatHeader: true,
    });
}

function activityDataSection(input: CalculationReportInput) {
    // 헤더에 단위가 없으면 G7(단위 정합)이 검사할 대상 자체가 없어 공허하게 통과한다.
    // tCO2/TJ와 tCO2/단위 혼동은 이 도메인의 대표적 결함이라 표에 단위가 박혀 있어야 한다(씨밤이 P1).
    const columns = [
        { header: '배출원' },
        { header: '산정방법' },
        { header: '활동자료', numeric: true },
        { header: '단위' },
        { header: 'NCV (GJ/단위)', numeric: true },
        { header: 'EF', numeric: true },
        { header: 'EF 기준' },
    ];
    const streams = cbamSourceStreams(input);
    const rows = streams.map((stream) => {
        const perActivityUnit = getSourceStreamEmissionFactorBasis(stream) === 'PER_ACTIVITY_UNIT';

        return [
            stream.name,
            stream.method,
            formatRawForReport(stream.activity_data),
            stream.activity_unit,
            perActivityUnit ? NOT_APPLICABLE : formatRawForReport(stream.ncv_gj_per_unit),
            formatRawForReport(stream.emission_factor_tco2e_per_unit),
            perActivityUnit ? `tCO2/${stream.activity_unit}` : 'tCO2/TJ',
        ];
    });

    // 산식에 등장하는 계수는 전부 표에 값이 있어야 검증인이 인쇄된 산식으로 인쇄된 결과를 재현한다.
    // 종전에는 산화계수가 산식에만 있고 값이 문서 어디에도 없었다(씨밤이 P1).
    const factorColumns = [
        { header: '배출원' },
        { header: '산화계수 (OxF)', numeric: true },
        { header: '전환계수 (CF)', numeric: true },
        { header: '화석 분율', numeric: true },
        { header: '바이오매스 분율', numeric: true },
    ];
    const factorRows = streams.map((stream) => [
        stream.name,
        formatRawForReport(stream.oxidation_factor),
        formatRawForReport(stream.conversion_factor),
        formatRawForReport(stream.fossil_fraction),
        formatRawForReport(stream.biomass_fraction),
    ]);

    // 계수 출처는 활동자료 증빙과 다른 문서다. 청구서에는 배출계수가 실리지 않는다(씨밤이 P0).
    const sourceRows = streams.map((stream) => {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);

        return [
            stream.name,
            getSourceStreamEmissionFactorBasis(stream) === 'PER_ACTIVITY_UNIT' ? NOT_APPLICABLE : entry?.ncv_source || PLACEHOLDER,
            entry?.ef_source || PLACEHOLDER,
        ];
    });
    const reportable = reportableResults(input);

    const body = [
        paragraph('6. 활동자료 및 배출계수   Activity Data and Emission Factors', 'Heading1'),
        paragraph('6.1 원천자료 → 활동자료 전치(transposition)', 'Heading2'),
        paragraph('청구서 등 원천자료의 단위가 산정 활동자료의 단위와 다른 경우, 환산 단계와 적용 계수를 기재해야 검증인이 원천 증빙으로 역추적할 수 있다.'),
        transpositionTable(input),
        paragraph('6.2 배출계수', 'Heading2'),
        table(columns.map((column) => column.header), rows, {
            widths: [1700, 1300, 1200, 800, 1300, 1200, 1500], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph('6.2.1 산식 적용 계수', 'Heading2'),
        paragraph('제5.1장 산식에 대입한 계수의 실제 값이다.'),
        table(factorColumns.map((column) => column.header), factorRows, {
            widths: [2200, 1700, 1700, 1700, 1700], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph('6.2.2 계수 출처', 'Heading2'),
        paragraph('계수의 출처는 활동자료 증빙(제6.3장)과 다른 문서다. 요금청구서 등 거래 증빙에는 순발열량·배출계수가 기재되지 않으므로, 인용 계수의 발행기관·문서명·판본·표번호를 별도로 밝힌다.'),
        table(['배출원', 'NCV 출처', 'EF 출처'], sourceRows, {
            widths: [2200, 3400, 3400], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph('확인 필요(규정): 확정기간 이행규정이 표준계수 위계를 두는 경우 인용 계수의 적격성을 원문 대조로 확인해야 한다.', 'Note'),
        paragraph('6.3 측정 방식 및 데이터 품질', 'Heading2'),
        measurementTable(input),
        paragraph('6.4 정합성 점검', 'Heading2'),
    ];

    const reconRows: Array<[string, string]> = reportable.map((result) => [
        result.process_name,
        `배출원 합계 ${formatForReport(result.source_stream_emissions_tco2e)} tCO2e · 공정 직접배출 ${formatForReport(result.direct_emissions_tco2e)} tCO2e · 차이 ${formatForReport(result.source_stream_delta_tco2e)} tCO2e`,
    ]);
    body.push(table(['생산공정', '정합 결과'], reconRows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));
    body.push(paragraph('본 점검은 산정 도구의 내부 정합성 기준(±1%)에 따른 자체 QC이며, 규정상 허용오차가 아니다. 배출원이 1건인 공정에서는 이 점검이 전기(轉記) 오류 검출에 한정된다.', 'Note'));

    // 계수 출처·전치·측정 방식이 비면 조용히 「기재 필요」로 인쇄되던 것을 경고로 올린다.
    // 설계 §8이 6.1·6.3을 /report-inputs 유도 대상으로 명시했는데 게이트가 없었다(씨밤이 P1).
    const gateIssues: ReportGateIssue[] = [...checkNumericColumns('제6장 배출계수표', columns, rows)];

    for (const stream of streams) {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);
        const perActivityUnit = getSourceStreamEmissionFactorBasis(stream) === 'PER_ACTIVITY_UNIT';

        if (!entry?.ef_source?.trim() || (!perActivityUnit && !entry?.ncv_source?.trim())) {
            gateIssues.push({
                gate: 'G5',
                severity: 'warn',
                message: `제6.2.2장: ${stream.name}의 계수 출처(발행기관·문서명·판본)가 비어 있습니다. 활동자료 증빙과 계수 출처는 다른 문서입니다.`,
            });
        }

        if (!entry?.measurement_method?.trim()) {
            gateIssues.push({
                gate: 'G5',
                severity: 'warn',
                message: `제6.3장: ${stream.name}의 측정 방식이 비어 있습니다.`,
            });
        }
    }

    return { xml: body.join(''), gateIssues };
}

function electricitySection(input: CalculationReportInput) {
    const gateIssues: ReportGateIssue[] = [];
    const rows = cbamProcesses(input).map((process) => {
        const meta = input.reportInputs?.electricity_ef_meta?.find((item) => item.process_id === process.id);
        const source = [meta?.publisher, meta?.document, meta?.vintage].filter(Boolean).join(' · ');

        if (!source && process.electricity_mwh > 0) {
            gateIssues.push({
                gate: 'G5',
                severity: 'warn',
                message: `제7장: ${process.name}의 전력 배출계수 출처(공표기관·문서명·공표연도)가 비어 있습니다. 검증인이 계수를 대조할 수 없습니다.`,
            });
        }

        return [
            process.name,
            `${formatForReport(process.electricity_mwh, 2)} MWh`,
            `${formatForReport(process.electricity_ef_tco2e_per_mwh, 4)} tCO2e/MWh`,
            `${formatForReport(process.electricity_mwh * process.electricity_ef_tco2e_per_mwh, 2)} tCO2e`,
            source || PLACEHOLDER,
        ];
    });

    return {
        xml: [
            paragraph('7. 전력 사용 및 간접배출   Electricity and Indirect Emissions', 'Heading1'),
            table(['생산공정', '전력 사용량', '전력 배출계수', '간접배출량', '계수 출처 (기관·문서·공표연도)'], rows, {
                widths: [1900, 1500, 1900, 1600, 2100], headerShade: SOFT, headerBold: true, repeatHeader: true,
            }),
            paragraph('간접배출의 인증서 기준 반영 여부는 제3장 근거를 따른다.'),
            paragraph('전력 배출계수는 시장기반 수단(Guarantees of Origin·녹색인증서 등)으로 낮출 수 없다. 직접 기술적 연결 또는 PPA에 해당하는 경우에만 해당 분류의 계수 적용을 검토한다.', 'Note'),
        ].join(''),
        gateIssues,
    };
}

function precursorSection(input: CalculationReportInput) {
    const columns = [
        { header: '전구물질 (CN)' },
        { header: '생산경로' },
        { header: '구매량 (t)', numeric: true },
        { header: '소비량 (t)', numeric: true },
        { header: 'SEE 직접', numeric: true },
        { header: 'SEE 간접', numeric: true },
    ];
    const rows = cbamPrecursors(input).map((precursor) => [
        `${precursor.name}\n${precursor.precursor_cn_code ?? '-'}`,
        precursor.production_route || PLACEHOLDER,
        formatIntegerForReport(precursor.purchased_mass_t),
        formatIntegerForReport(precursor.consumed_mass_t),
        formatForReport(precursor.direct_see_tco2e_per_t, 4),
        formatForReport(precursor.indirect_see_tco2e_per_t, 5),
    ]);

    const body = [
        paragraph('8. 구매 전구물질   Purchased Precursors', 'Heading1'),
        table(columns.map((column) => column.header), rows, {
            widths: [1750, 1500, 1250, 1250, 1600, 1650], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
    ];

    const period = firstPeriod(input);

    for (const [index, precursor] of cbamPrecursors(input).entries()) {
        // 공급사 자료의 대상기간이 본 보고기간과 다르면 확정기간 적격성(빈티지 대응)이 걸린다.
        // 값만 인쇄하고 불일치를 말하지 않으면 리스크가 문서에서 사라진다(씨밤이 P1 — v0.3 회귀).
        const vintage = precursor.supplier_reporting_period?.trim();
        const vintageMismatch = Boolean(vintage && period?.name && vintage !== period.name);
        const detail: Array<[string, string]> = [
            ['공급사 / 원산지', `${precursor.supplier_installation || '-'} / ${precursor.supplier_country || PLACEHOLDER}`],
            ['데이터 구분', precursor.data_mode === 'DEFAULT' ? '기본값 (Default)' : precursor.data_mode === 'SEMI_ACTUAL' ? '혼합 (Measured + Default)' : '실측 (Measured)'],
            ['자료 대상기간 (vintage)', !vintage
                ? '확인 필요(자료)'
                : vintageMismatch
                    ? `${vintage} — 본 보고기간(${period?.name})과 불일치. 확정기간 적격성 및 대표성 확인 필요 — 확인 필요(규정) (제14장)`
                    : vintage],
            ['검증 상태', precursor.verification_status === 'VERIFIED' ? '제3자 검증 완료' : precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사 확인 — 제3자 검증 미완료' : '미검증'],
            ['비CBAM 용도 소비', `${formatIntegerForReport(precursor.consumed_for_non_cbam_mass_t)} t`],
            ['질량 수지', precursor.purchased_mass_t >= precursor.consumed_mass_t
                ? `구매 ${formatIntegerForReport(precursor.purchased_mass_t)} t ≥ 소비 ${formatIntegerForReport(precursor.consumed_mass_t)} t — 기말 재고 ${formatIntegerForReport(precursor.purchased_mass_t - precursor.consumed_mass_t)} t (차기 이월)`
                : `⚠ 소비량이 구매량을 초과합니다 — 확인 필요(자료)`],
        ];
        body.push(paragraph(`8.${index + 1} ${precursor.name}`, 'Heading2'));
        body.push(table(['항목', '내용'], detail, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));

        if (precursor.verification_status !== 'VERIFIED' && precursor.data_mode !== 'DEFAULT') {
            const share = precursorContributionShare(input, precursor);
            body.push(paragraph(
                `리스크 고지: 본 전구물질의 실측값은 제3자 검증이 완료되지 않았다.${share === undefined ? '' : ` 이 값이 CBAM 기준 SEE의 약 ${formatPercentShare(share)}를 차지한다.`}${vintageMismatch ? ` 자료 대상기간도 ${vintage}년으로 본 보고기간과 다르다.` : ''} 확정기간의 실측 인정 요건(검증 수준·기간 대응)은 확인 필요(규정)이며, 불인정 시 공식 기본값 대체가 발동된다 — 그 영향은 제9장에 정량화한다.`,
                undefined,
                { color: AMBER }
            ));
        }
    }

    return { xml: body.join(''), gateIssues: checkNumericColumns('제8장 전구물질표', columns, rows) };
}

function normalizeCnForLookup(value: string | undefined) {
    return (value ?? '').replace(/\D/g, '');
}

interface PrecursorDvComparison {
    precursor: PurchasedPrecursor;
    year: DefaultValueYear;
    row?: DefaultValueReferenceRow;
    /** heading 상속으로 찾았는지 (CN 8자리 실측 vs 4자리 heading DV) */
    isHeadingInherited: boolean;
    /** 같은 국가×CN에 생산경로가 다른 DV 행이 둘 이상 있는지 */
    isRouteAmbiguous: boolean;
    /** 해당 연도의 markup 포함 적용값 */
    appliedDirect?: number;
    /** 실측 − DV(raw) 절대차 */
    deltaRaw?: number;
    /** 실측 − DV(적용값) 절대차 */
    deltaApplied?: number;
    deltaAppliedRatio?: number;
}

function compareWithDefaultValues(input: CalculationReportInput): PrecursorDvComparison[] {
    return cbamPrecursors(input).map((precursor) => {
        const year: DefaultValueYear = (precursor.default_value_year as DefaultValueYear) ?? input.defaultValueYear ?? '2026';
        const cnCode = normalizeCnForLookup(precursor.precursor_cn_code);
        const row = findDefaultValueReference(input.defaultValues, precursor.supplier_country, cnCode, year, precursor.production_route);

        if (!row) {
            return { precursor, year, isHeadingInherited: false, isRouteAmbiguous: false };
        }

        const appliedDirect = year === '2026' ? row.markup_2026 : year === '2027' ? row.markup_2027 : row.markup_2028_onwards;
        const actual = precursor.direct_see_tco2e_per_t;

        return {
            precursor,
            year,
            row,
            isHeadingInherited: normalizeCnForLookup(row.cn_code) !== cnCode,
            isRouteAmbiguous: hasAmbiguousDefaultValueRoutes(input.defaultValues, precursor.supplier_country, cnCode),
            appliedDirect,
            // null(공표 안 함)과 undefined(값 없음)를 모두 거른다. null을 그냥 두면 actual - null = actual이 된다.
            deltaRaw: row.direct_default === undefined || row.direct_default === null ? undefined : actual - row.direct_default,
            deltaApplied: appliedDirect === undefined ? undefined : actual - appliedDirect,
            deltaAppliedRatio: appliedDirect === undefined || appliedDirect === 0 ? undefined : (actual - appliedDirect) / appliedDirect,
        };
    });
}

/**
 * 9장 — 실측 우선(actual > default)의 근거를 정량 제시. 씨밤이 P1 지적:
 * 원칙만 서술하고 실제 DV 대조가 없으면 검증인의 개연성 점검 기준선이 끊긴다.
 * 조회 메타(판본·조회 키·경로 대응)를 반드시 함께 출력해야 한다(v0.2 P1).
 */
function defaultValueSection(input: CalculationReportInput) {
    const body = [
        paragraph('9. 공식 기본값(DV) 대조 및 민감도   Cross-check against Official Default Values', 'Heading1'),
        paragraph('실측 우선(actual > default) 원칙의 적용 근거를 정량적으로 제시하기 위해, 전구물질 실측값을 해당 조합(국가 × CN)의 EU 공식 기본값과 대조한다. 검증인의 개연성(plausibility) 점검 기준선 역할을 한다.'),
    ];
    const gateIssues: ReportGateIssue[] = [];

    if (!input.defaultValues) {
        body.push(paragraph(
            'EU 공식 기본값 기준자료가 연결되지 않아 DV 대조를 수행할 수 없습니다. 자료 업로드 화면에서 공식 기본값 워크북을 연결한 뒤 보고서를 다시 생성하세요 — 기재 필요.',
            undefined,
            { color: AMBER }
        ));
        gateIssues.push({
            gate: 'G6',
            severity: 'warn',
            message: 'EU 공식 기본값 기준자료가 연결되지 않아 제9장(DV 대조)을 생성하지 못했습니다. 자료 업로드 화면에서 기준자료를 연결하세요.',
        });

        return { xml: body.join(''), gateIssues };
    }

    const comparisons = compareWithDefaultValues(input);
    const summary = input.defaultValues.summary;

    // 9.1 조회 메타데이터 — 판본·조회 키가 없으면 검증인이 값을 대조할 수 없다.
    body.push(paragraph('9.1 DV 조회 메타데이터', 'Heading2'));
    body.push(table(['항목', '내용'], [
        ['출처 워크북', `${summary.filename} (연결일 ${summary.imported_at.slice(0, 10)})`],
        ['수록 행 수', `${formatIntegerForReport(summary.row_count)}행 · CN ${formatIntegerForReport(summary.cn_code_count)}종`],
        ['법적 근거', 'EU 공식 기본값(default values) 이행규정 — 조항 확인 필요(규정)'],
        ['markup 적용', '전구물질에 대한 markup 적용 여부·방식은 확인 필요(규정)'],
    ], { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));

    const columns = [
        { header: '전구물질 (조회 키)' },
        { header: '구분' },
        { header: '직접 (tCO2e/t)', numeric: true },
        { header: '간접 (tCO2e/t)' },
        { header: '비고' },
    ];
    const rows: string[][] = [];

    for (const comparison of comparisons) {
        const { precursor, row, year } = comparison;
        const key = `${precursor.name}\n${precursor.supplier_country} × ${precursor.precursor_cn_code ?? '-'}`;

        if (!row) {
            rows.push([key, '공식 DV', PLACEHOLDER, PLACEHOLDER, '해당 조합의 기본값을 기준자료에서 찾지 못함 — 확인 필요(자료)']);
            gateIssues.push({
                gate: 'G6',
                severity: 'warn',
                message: `${precursor.name}: ${precursor.supplier_country} × CN ${precursor.precursor_cn_code ?? '-'} 조합의 공식 기본값을 기준자료에서 찾지 못했습니다. DV 대조 없이는 실측 채택 근거가 정량적으로 제시되지 않습니다.`,
            });
            continue;
        }

        rows.push([key, '본 산정 실측값 (채택)', formatForReport(precursor.direct_see_tco2e_per_t, 4), formatForReport(precursor.indirect_see_tco2e_per_t, 5), '공급사 제공']);
        rows.push([key, '공식 DV — raw', row.direct_default === undefined || row.direct_default === null ? NOT_PUBLISHED : formatForReport(row.direct_default, 8),
            row.indirect_default === undefined || row.indirect_default === null ? NOT_PUBLISHED : formatForReport(row.indirect_default, 8),
            `조회 행 CN ${row.cn_code}`]);
        rows.push([key, `공식 DV — ${year} 적용값`, comparison.appliedDirect === undefined ? PLACEHOLDER : formatForReport(comparison.appliedDirect, 9),
            NOT_PUBLISHED, 'markup 포함']);

        if (comparison.deltaRaw !== undefined) {
            // raw 행에도 상대차를 준다. 두 차이 행의 정보 수준이 다를 이유가 없다(씨밤이 P2).
            const rawRatio = row.direct_default ? comparison.deltaRaw / row.direct_default : undefined;
            rows.push([key, '차이: 실측 − DV(raw)', formatForReport(comparison.deltaRaw, 8), '대조 불가',
                `${rawRatio === undefined ? '' : `${formatPercentForReport(rawRatio)} · `}${comparison.deltaRaw < 0 ? '실측이 낮음 (유리)' : '실측이 높음 (불리)'}`]);
        }

        if (comparison.deltaApplied !== undefined) {
            rows.push([key, `차이: 실측 − DV(${year})`, formatForReport(comparison.deltaApplied, 9), '대조 불가',
                `${comparison.deltaAppliedRatio === undefined ? '' : `${formatPercentForReport(comparison.deltaAppliedRatio)} · `}${comparison.deltaApplied < 0 ? '실측이 낮음 (유리)' : '실측이 높음 (불리)'}`]);
        }
    }

    body.push(table(columns.map((column) => column.header), rows, {
        widths: [2100, 1900, 1600, 1500, 1900], headerShade: SOFT, headerBold: true, repeatHeader: true,
    }));

    // 경로 대응·heading 상속은 개연성 판단의 전제이므로 반드시 고지한다(씨밤이 P1).
    for (const comparison of comparisons) {
        if (!comparison.row) {
            continue;
        }

        const notes: string[] = [];

        if (comparison.isHeadingInherited) {
            notes.push(`CN ${comparison.precursor.precursor_cn_code} 실측값을 상위 heading(CN ${comparison.row.cn_code}) 기준 DV와 비교했습니다. heading 상속 조회의 적정성은 원본 워크북 확인 필요(자료).`);
        }

        const dvRoute = comparison.row.production_route?.trim();
        const actualRoute = comparison.precursor.production_route?.trim();

        if (dvRoute && dvRoute !== actualRoute) {
            notes.push(`DV 행의 생산경로 표기는 「${dvRoute}」이고 본 산정 전구물질의 경로는 「${actualRoute || '미기재'}」입니다. 대응 관계가 확인되기 전까지 본 대조는 개연성 참고로만 사용합니다 — 확인 필요(자료).`);
        }

        if (comparison.row.indirect_default === undefined || comparison.row.indirect_default === null) {
            notes.push('해당 조합의 간접 기본값은 공표되지 않아(N/A) 간접 실측값은 DV 대조가 불가하다.');
        }

        // 같은 국가×CN에 경로가 갈리는 행이 여럿이면, 조회가 어느 행을 골랐는지가 결과를 바꾼다.
        // 이 사실을 감추면 검증인이 다른 행으로 대조해 다른 결론에 이른다(씨밤이 P1).
        if (comparison.isRouteAmbiguous) {
            notes.push(`해당 국가·CN 조합에는 생산경로가 다른 공식 기본값 행이 둘 이상 있다. 본 대조는 그중 「${dvRoute || '경로 미표기'}」 행을 사용했으므로, 적용 경로의 적정성을 원본 워크북으로 확인해야 한다 — 확인 필요(자료).`);
            gateIssues.push({
                gate: 'G6',
                severity: 'warn',
                message: `${comparison.precursor.name}: ${comparison.precursor.supplier_country} × CN ${comparison.precursor.precursor_cn_code ?? '-'} 조합에 생산경로가 다른 DV 행이 여럿 있습니다. 적용 경로를 확인하세요.`,
            });
        }

        if (comparison.row.direct_default === undefined || comparison.row.direct_default === null) {
            notes.push('해당 조합의 직접 기본값이 공표되지 않아(N/A) raw 기준 대조가 불가하다.');
        }

        if (notes.length > 0) {
            body.push(paragraph(`${comparison.precursor.name}: ${notes.join(' ')}`, 'Note'));
        }
    }

    // 9.2 민감도 — 실측이 인정되지 않아 DV로 대체될 경우의 영향
    body.push(paragraph('9.2 민감도 — 실측 불인정 시 DV 대체 영향', 'Heading2'));

    const sensitivityRows: string[][] = [];
    const sensitivityColumns = [
        { header: '제품' },
        { header: '시나리오' },
        { header: 'CBAM 기준 SEE (tCO2e/t)', numeric: true },
        { header: '차이' },
    ];
    let hasSensitivity = false;

    // 전구물질 direct SEE만 DV로 갈아끼운 뒤 엔진을 다시 돌린다.
    // 배분(공정 귀속·output line·allocation_share)과 Annex II 간접 분기를 보고서가 재구현하면
    // 반드시 엔진과 어긋난다 — 실제로 어긋나서 리스크가 축소 표기됐다(씨밤이 P0). 엔진을 유일한 산정 주체로 둔다.
    const substitutedPrecursors = input.precursors.map((precursor) => {
        const comparison = comparisons.find((item) => item.precursor.id === precursor.id);
        return comparison?.appliedDirect === undefined
            ? precursor
            : { ...precursor, direct_see_tco2e_per_t: comparison.appliedDirect };
    });
    // 결과 id가 아니라 (공정, 산출라인)으로 짝짓는다 — id 체계가 바뀌면 조용히 민감도가 사라진다.
    const resultKey = (item: { process_id: string; product_output_line_id?: string }) =>
        `${item.process_id}::${item.product_output_line_id ?? ''}`;
    const substitutedByKey = new Map(
        calculateLocalResults({ ...input, precursors: substitutedPrecursors }).map((item) => [resultKey(item), item])
    );
    // 일부 전구물질만 DV를 찾은 경우, 그 시나리오는 "전부 대체"가 아니다. 숫자만 보여주면 과소 표기가 된다.
    const unmatched = comparisons.filter((comparison) => comparison.appliedDirect === undefined);

    for (const result of reportableResults(input)) {
        const dvResult = substitutedByKey.get(resultKey(result));

        if (result.see_cbam_basis === null || dvResult?.see_cbam_basis === null || dvResult === undefined) {
            continue;
        }

        const processHasReplacement = comparisons.some(
            (comparison) => comparison.appliedDirect !== undefined && comparison.precursor.process_id === result.process_id
        );

        if (!processHasReplacement || result.output_mass_t <= 0) {
            continue;
        }

        const dvBasis = dvResult.see_cbam_basis;
        const delta = dvBasis - result.see_cbam_basis;
        const ratio = result.see_cbam_basis === 0 ? undefined : delta / result.see_cbam_basis;

        sensitivityRows.push([result.product_name, '실측 채택 (본 산정)', formatForReport(result.see_cbam_basis), '기준']);
        sensitivityRows.push([
            result.product_name,
            '전구물질을 공식 DV로 대체',
            formatForReport(dvBasis),
            `${formatForReport(delta)}${ratio === undefined ? '' : ` (${formatPercentForReport(ratio)})`}`,
        ]);
        hasSensitivity = true;
    }

    if (hasSensitivity) {
        body.push(table(sensitivityColumns.map((column) => column.header), sensitivityRows, {
            widths: [2200, 2800, 2200, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }));
        body.push(paragraph('실측이 인정되지 않아 공식 기본값으로 대체될 경우의 영향이다. 전구물질의 제3자 검증 결과 확보가 최우선 과제인 이유를 정량적으로 보여준다(제14장).', 'Note'));
        // 9.1이 "개연성 참고로만 사용한다"고 유보한 DV로 확정적 단일값을 내면 유보가 증발한다.
        // markup 적용 여부가 미확정이면 답이 갈리므로, 어느 쪽을 택했는지 밝혀야 한다(씨밤이 P1).
        body.push(paragraph(
            `본 민감도는 markup을 포함한 ${[...new Set(comparisons.map((comparison) => comparison.year))].join(' / ')} 적용값을 대체값으로 사용했다. 전구물질에 대한 markup 적용 여부·방식은 확인 필요(규정)이며, markup 미적용(raw) 기준으로는 영향이 더 작다. 두 기준의 차이는 제9.1장 대조표에서 확인할 수 있다. 보수적 판단을 위해 본문은 markup 포함값을 채택했다.`,
            'Note'
        ));
        body.push(paragraph(
            '제9.1장에 기재한 조회 전제(heading 상속 여부·생산경로 대응 미확인)는 본 민감도에도 그대로 적용된다. 해당 전제가 확인되기 전까지 본 수치는 개연성 참고이다 — 확인 필요(자료).',
            'Note',
            { color: AMBER }
        ));

        if (unmatched.length > 0) {
            body.push(paragraph(
                `본 민감도는 공식 기본값을 찾은 전구물질만 대체한 결과이며, 다음 전구물질은 대체되지 않았다 — ${unmatched.map((comparison) => comparison.precursor.name).join(', ')}. 따라서 실제 영향은 위 수치보다 클 수 있다 — 확인 필요(자료).`,
                'Note',
                { color: AMBER }
            ));
        }
        gateIssues.push(...checkNumericColumns('제9.2장 민감도표', sensitivityColumns, sensitivityRows));
    } else {
        body.push(paragraph('대체 가능한 공식 기본값을 찾지 못해 민감도를 산출하지 못했습니다 — 확인 필요(자료).', 'Note'));
    }

    body.push(paragraph('본 장의 지표는 사전 검토용이며, SEFA·CBAM factor·인증서 수량·기지불 탄소가격 차감 등 최종 인증서 산정은 신고인(수입자) 영역으로 본 보고서의 범위 밖이다.', 'Note'));

    gateIssues.push(...checkNumericColumns('제9장 DV 대조표', columns, rows));

    return { xml: body.join(''), gateIssues };
}

function resultSection(input: CalculationReportInput) {
    const reportable = reportableResults(input);
    const columns = [
        { header: '제품' },
        { header: '구성 요소' },
        { header: 'tCO2e/t', numeric: true },
        { header: '비고' },
    ];
    const rows: string[][] = [];

    for (const result of reportable) {
        rows.push([result.product_name, '자체 공정 직접배출', formatForReport(result.direct_see), '자체 배출 ÷ 생산량']);
        rows.push([result.product_name, '전구물질 직접 내재배출', formatForReport(result.precursor_direct_see), '소비비율 × 전구물질 SEE']);
        rows.push([result.product_name, 'SEE 직접 소계', formatForReport(result.see_direct_incl_precursor), result.indirect_emissions_applicable ? '' : '= CBAM 인증서 산정 기준']);
        rows.push([result.product_name, '자체 전력 간접배출', formatForReport(result.own_indirect_see), result.indirect_emissions_applicable ? '' : '정보 목적']);
        rows.push([result.product_name, '전구물질 간접 내재배출', formatForReport(result.precursor_indirect_see), result.indirect_emissions_applicable ? '' : '정보 목적']);
        rows.push([result.product_name, 'SEE 간접 소계', formatForReport(result.see_indirect_incl_precursor), result.indirect_emissions_applicable ? '인증서 기준 포함' : '인증서 기준 제외']);
        rows.push([result.product_name, '참고 총 SEE', formatForReport(result.see_informational_total), '직접 + 간접']);
    }

    const sums = checkResultDisplaySums(reportable);
    const notes = [
        paragraph('구성 항목과 소계의 정합은 문서 생성 시 자동 자가검사한다(게이트 G1). 수치는 EU Communication Template에 기재되는 값과 동일 원천에서 산출되며, 템플릿 자동 기재 시 기재 셀 전수를 자동 대조 검증한다. 검증 셀 수와 목록은 Export 검증 로그에 기록된다.', 'Note'),
    ];

    if (sums.needsRoundingNote) {
        notes.push(paragraph(
            '반올림 각주: 각 구성 항목은 소수 4자리로 반올림해 표기하므로, 표시된 구성 항목을 더한 값이 소계 표시값과 마지막 자리에서 다를 수 있다. 모든 소계·합계는 반올림 전 원천값에서 산출하였으므로 산정값 자체는 정확하다(부속서 A.2).',
            'Note'
        ));
    }

    return {
        xml: [
            paragraph('10. 산정 결과   Calculation Results', 'Heading1'),
            table(columns.map((column) => column.header), rows, {
                widths: [2000, 3000, 1800, 2200], headerShade: SOFT, headerBold: true, repeatHeader: true,
            }),
            ...notes,
        ].join(''),
        gateIssues: [...checkNumericColumns('제10장 결과표', columns, rows), ...sums.issues],
    };
}

const CARBON_PRICE_LABEL: Record<string, string> = {
    YES: '해당',
    NO: '해당 없음',
    TO_CONFIRM: '확인 필요(자료)',
};
const EVIDENCE_STATUS_LABEL: Record<string, string> = {
    pending: '미수령(pending)',
    estimated: '추정(estimated)',
    confirmed: '확정(confirmed)',
};

/** 11장 — 기지불 탄소가격. 신고인이 인증서 차감에 반드시 요구하는 항목(씨밤이 P1: v0.1에 섹션 자체가 없었다). */
function carbonPriceSection(input: CalculationReportInput) {
    const rows = input.reportInputs?.carbon_price ?? [];
    const gateIssues: ReportGateIssue[] = [];

    const body = [
        paragraph('11. 기지불 탄소가격   Carbon Price Paid in Country of Origin', 'Heading1'),
        paragraph('원산지국에서 이미 지불한 탄소가격은 신고인(수입자)의 인증서 차감 근거가 될 수 있으므로, 해당 여부와 증빙 상태를 기재한다. 배출권거래제 할당대상 여부는 사업장이 아닌 법인 단위 배출량으로 판단되므로, 본 보고서의 사업장 경계 자료만으로 단정할 수 없다.'),
    ];

    if (rows.length === 0) {
        body.push(paragraph('기재 필요 — 기지불 탄소가격 해당 여부가 입력되지 않았습니다. 보고서 입력 화면에서 대상별 해당 여부·증빙 상태를 기재하세요.', undefined, { color: AMBER }));
        gateIssues.push({
            gate: 'G5',
            severity: 'warn',
            message: '제11장(기지불 탄소가격)이 비어 있습니다. 신고인이 인증서 차감을 위해 요구하는 항목이므로 「해당 없음」이라도 사유와 함께 기재해야 합니다.',
        });
    } else {
        // 전구물질에 내재된 기지불 탄소가격은 공급사로부터 별도로 받아야 한다.
        // 사업장 행만 두면 전구물질 몫이 문서에서 사라진다(씨밤이 P1 — v0.3 회귀).
        const covered = rows.map((row) => row.target ?? '').join(' ');
        const precursorRows = cbamPrecursors(input)
            .filter((precursor) => !covered.includes(precursor.name))
            .map((precursor) => [
                `전구물질 (${precursor.name})`,
                CARBON_PRICE_LABEL.TO_CONFIRM ?? '확인 필요(자료)',
                `공급사(${precursor.supplier_installation || '미기재'})가 원산지국 배출권거래제 할당대상일 수 있다. 전구물질에 내재된 기지불 탄소가격 정보·증빙은 공급사로부터 별도 수령 필요.\n증빙: 미수령(pending) — 자동 초안`,
            ]);

        body.push(table(['대상', '해당 여부', '내용 및 증빙 상태'], [
            ...rows.map((row) => [
                row.target,
                CARBON_PRICE_LABEL[row.applicable] ?? row.applicable,
                [row.note, row.amount ? `지불액: ${row.amount}` : '', `증빙: ${EVIDENCE_STATUS_LABEL[row.evidence_status] ?? row.evidence_status}`]
                    .filter(Boolean).join('\n'),
            ]),
            ...precursorRows,
        ], { widths: [2600, 2200, 4200], headerShade: SOFT, headerBold: true, repeatHeader: true }));

        const unconfirmed = rows.filter((row) => row.applicable === 'TO_CONFIRM' || row.evidence_status !== 'confirmed');

        if (unconfirmed.length > 0) {
            body.push(paragraph('확정(confirmed)되지 않은 항목이 있습니다. 확정 전까지 신고인은 본 항목을 근거로 인증서 차감을 적용할 수 없습니다.', undefined, { color: AMBER }));
        }
    }

    body.push(paragraph('증빙 상태 구분: 미수령(pending) / 추정(estimated) / 확정(confirmed). 무상할당·간접비용 보조 등 환급·상계 요소가 있는 경우 별도 기재가 필요하다 — 확인 필요(규정).', 'Note'));

    return { xml: body.join(''), gateIssues };
}

/** 12장 — 모니터링 관리체계. 검증인은 수치보다 이 통제 체계를 먼저 본다(씨밤이 P1). */
function monitoringSection(input: CalculationReportInput) {
    const plan = input.reportInputs?.monitoring_plan;
    const rnr = input.reportInputs?.rnr ?? [];
    const gateIssues: ReportGateIssue[] = [];

    const body = [
        paragraph('12. 모니터링 방법론 및 데이터 관리   Monitoring Methodology and Data Management', 'Heading1'),
        paragraph('제3자 검증인은 수치보다 데이터 흐름·책임·품질관리 통제 체계를 먼저 확인한다.'),
    ];

    if (plan?.doc_no) {
        body.push(paragraph(`본 산정을 지배하는 모니터링 방법론 문서: ${plan.doc_no}${plan.version ? ` ${plan.version}` : ''}${plan.approved_at ? ` (승인일 ${plan.approved_at})` : ''}. 본 보고서는 해당 계획에 정의된 데이터 흐름·책임·품질관리 절차에 따라 작성되었다.`));

        // 계획 승인일이 보고기간 시작 이후면 기간 일부가 계획 없이 운영된 셈이다.
        const period = firstPeriod(input);

        if (plan.approved_at && period && plan.approved_at > period.start_date) {
            gateIssues.push({
                gate: 'G2',
                severity: 'warn',
                message: `모니터링 계획 승인일(${plan.approved_at})이 보고기간 시작일(${period.start_date}) 이후입니다. 기간 초반의 데이터 관리 근거를 확인하세요.`,
            });
        }
    } else {
        body.push(paragraph('기재 필요 — 모니터링 계획 문서가 입력되지 않았습니다.', undefined, { color: AMBER }));
        gateIssues.push({ gate: 'G5', severity: 'warn', message: '제12장: 모니터링 계획 문서번호가 비어 있습니다.' });
    }

    body.push(paragraph('12.1 데이터 흐름 및 역할·책임 (R&R)', 'Heading2'));

    if (rnr.length === 0) {
        body.push(paragraph('기재 필요 — 데이터별 수집·전치·검토·승인 책임이 입력되지 않았습니다.', undefined, { color: AMBER }));
        gateIssues.push({ gate: 'G5', severity: 'warn', message: '제12.1장: 역할·책임(R&R)이 비어 있습니다.' });
    } else {
        body.push(table(['데이터', '수집 (1차)', '전치·집계', '검토·승인', '시스템'],
            rnr.map((row) => [row.data, row.collector, row.transposer, row.approver, row.system]),
            { widths: [1900, 1900, 1900, 1500, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true }));
    }

    body.push(paragraph('12.2 품질관리 (QA/QC) 절차', 'Heading2'));
    body.push(table(['절차', '내용'], [
        ['검토 분리', '수집 담당자와 검토·승인자를 분리하고, 입력값을 원천 증빙과 대조한 뒤 승인한다.'],
        ['자동 정합 검사', '산정 도구 내부 검사: 배출원 합계 ↔ 공정 직접배출량(±1%), 생산라인 합계 ↔ 총 생산량, 활동자료 단위 ↔ NCV 정합, 전구물질 질량수지.'],
        ['보고서 발행 게이트', '표시값 합계 정합·교차참조·단위 정합 검사를 통과해야 보고서가 발행된다. 미기재 항목은 「기재 필요」로 표기된다.'],
        ['데이터 보존', '산정 데이터는 앱 로컬 데이터베이스에 저장하고, 보고기간별 .cbam 백업과 원천 증빙을 함께 보관한다.'],
    ], { widths: [2600, 6400], headerShade: SOFT, headerBold: true, repeatHeader: true }));
    body.push(paragraph('현 도구의 한계: 산정 도구는 변경이력(audit trail) 기능을 제공하지 않는다. 변경 통제는 검토 절차와 기간별 백업 보관으로 보완하며, 백업 파일은 최종 산정 상태를 재현하되 변경 과정의 이력은 포함하지 않는다.', 'Note'));

    return { xml: body.join(''), gateIssues };
}

/**
 * 13장 — 자체평가는 **실제 게이트 실행 결과**에서 파생돼야 한다.
 * 고정 문안으로 「경고 0건」·「게이트 G1 통과」를 쓰면, 경고가 떠 있는데도 통과했다고 말하게 된다.
 * 검증인이 이 한 줄의 거짓을 발견하면 자동 생성 장 전체를 신뢰하지 않는다(씨밤이 P0).
 */
function principlesSection(input: CalculationReportInput, issues: ReportGateIssue[]) {
    const reportable = reportableResults(input);
    const maxDelta = reportable.reduce((max, result) => Math.max(max, Math.abs(result.source_stream_delta_tco2e)), 0);
    const processCount = cbamProcessIds(input).size;
    const cbamStreamCount = cbamSourceStreams(input).length;
    const cbamPrecursorCount = cbamPrecursors(input).length;

    const warnings = issues.filter((issue) => issue.severity === 'warn');
    const gateSummary = warnings.length === 0
        ? '발행 게이트 G1–G7 실행: 차단 0건·경고 0건.'
        : `발행 게이트 G1–G7 실행: 차단 0건·경고 ${warnings.length}건(${[...new Set(warnings.map((issue) => issue.gate))].sort().join('·')}). 해당 경고 내용은 본문 각 장에 표기.`;
    const displaySumWarned = issues.some((issue) => issue.gate === 'G1' && /반올림 표기/.test(issue.message));
    const accuracyGate = displaySumWarned
        ? '표시값 합계 자가검사(게이트 G1): 반올림 표기 차이가 있어 해당 표에 각주를 삽입했다. 원천값 정합은 통과.'
        : '표시값 합계 자가검사(게이트 G1) 통과.';
    // 배분기준은 "도구가 검사한다"가 아니라 "무엇을 썼는가"를 말해야 방법 진술이 된다(씨밤이 P1).
    const allocation = describeAllocationBasis(input);
    // 「기재 필요」를 남기는 게이트는 G5(사용자 입력)뿐 아니라 G3(경계 서술)도 있다.
    // 미기재가 있는데 잔여 한계에 적지 않으면 완전성 자체평가가 거짓이 된다(씨밤이 P1).
    const placeholderNote = issues.some((issue) => issue.gate === 'G5' || issue.gate === 'G3')
        ? '「기재 필요」로 남은 항목이 있다 — 제14.1장 미해소 항목 등록부 참조. 발행 전 기재해야 한다. 보고기간 중 신규 배출원 발생 시 재산정 필요.'
        : '보고기간 중 신규 배출원 발생 시 재산정 필요.';

    const rows: string[][] = [
        ['완전성\nCompleteness',
            `산정경계 내 CBAM 대상 생산공정 ${processCount}개·배출원 ${cbamStreamCount}건·구매 전구물질 ${cbamPrecursorCount}건을 포함. 경계의 포함·제외 항목을 제2장에 명시.`,
            gateSummary,
            placeholderNote],
        ['정확성\nAccuracy',
            '활동자료는 원천 증빙 기반. 원천자료→활동자료 전치 경로를 제6.1장에 기재.',
            `배출원 합계와 공정 직접배출량의 최대 차이 ${formatForReport(maxDelta)} tCO2e — 도구 내부 정합 기준(±1%) 기준이며 규정상 허용오차가 아니다. 배출원이 1건인 공정에서는 이 점검이 전기(轉記) 오류 검출에 한정된다(제6.4장). ${accuracyGate}`,
            '계수 위계 적격성(6.2)·불확도 요구 수준(6.3)은 확인 필요(규정).'],
        ['일관성\nConsistency',
            `동일 보고기간 내 동일 방법론·동일 계수를 일관 적용. ${allocation}`,
            '산정 방법·계수는 입력 시점 기준으로 앱 데이터베이스와 .cbam 백업에 보존.',
            '도구에 변경이력 기능이 없어 검토 절차·백업으로 보완(제12장).'],
        ['투명성\nTransparency',
            '모든 수치에 출처를 병기(제6·7·8장). 계산식과 표기·반올림 정책을 부속서 A에 공개. 규범적 근거와 전환기 참조 문서를 부속서 B에서 분리.',
            '증빙 목록(제15장)과 .cbam 백업으로 최종 산정 상태 재현 가능. 자동 생성·사용자 입력 구분을 부속서 C에 공개.',
            '백업은 최종 상태 스냅샷이며 변경 과정 이력은 미포함.'],
        ['적절성\nRelevance',
            'CBAM 목적에 필요한 데이터를 EU Communication Template 구조에 맞게 수집·산정. 간접배출 취급은 품목별로 판단(제3.1장).',
            'CN 코드를 EU 공식 템플릿 CN 목록과 대조 확인.',
            '간접배출 취급 판정은 CN 접두 규칙 기반이며 Annex II 등재 목록 대조 미완 — 확인 필요(자료). 조항 단위 인용은 확인 필요(규정). EU 규정·템플릿 개정 시 최신판 기준 재검토.'],
    ];

    return [
        paragraph('13. 보고원칙 자체평가   Self-Assessment against Reporting Principles', 'Heading1'),
        paragraph('아래 표는 본 산정이 5개 보고원칙을 어떻게 충족하는지, 그 근거와 잔여 한계를 기술한다. 잔여 한계는 제14장 개선계획과 연결된다.'),
        table(['원칙', '적용 내용', '근거·검증', '잔여 한계'], rows, {
            widths: [1500, 3300, 2400, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
    ].join('');
}

/**
 * 본문에 흩어진 미해소 표기를 장별로 수집한다.
 * 「확인 필요」·「기재 필요」가 16개 장에 흩어져 있는데 통합 목록이 없으면,
 * 제16장이 "「확인 필요」 항목을 유보한다"고 말해도 그 항목이 무엇인지 가리키지 못한다.
 * 열거하지 않은 것은 유보할 수 없다(씨밤이 P1).
 */
function scanOutstandingItems(bodyXml: string) {
    const chapters = bodyXml.split('<w:pStyle w:val="Heading1"/>');
    const items: Array<{ chapter: string; regulation: number; data: number; placeholder: number }> = [];

    // 첫 조각은 표지(장 제목 앞)이므로 건너뛴다.
    for (const chunk of chapters.slice(1)) {
        const text = chunk.replace(/<[^>]+>/g, ' ');
        const title = text.trim().split(/\s{2,}|\s(?=[A-Z])/)[0]?.trim() ?? '';
        const count = (pattern: RegExp) => (text.match(pattern) ?? []).length;
        const regulation = count(/확인 필요\(규정\)/g);
        const data = count(/확인 필요\(자료\)/g);
        // 등록부 자신의 헤더 문구가 잡히지 않도록 「기재 필요」는 자리표시자 용법만 센다.
        const placeholder = count(/기재 필요/g);

        if (regulation + data + placeholder > 0) {
            items.push({ chapter: title, regulation, data, placeholder });
        }
    }

    return items;
}

function outstandingRegistrySection(bodyXml: string) {
    const items = scanOutstandingItems(bodyXml);

    if (items.length === 0) {
        return [
            paragraph('14.1 미해소 항목 등록부   Outstanding Items Register', 'Heading2'),
            paragraph('본문에 미해소 표기(「확인 필요」·「기재 필요」)가 없다.'),
        ].join('');
    }

    const total = items.reduce((sum, item) => sum + item.regulation + item.data + item.placeholder, 0);
    const rows = items.map((item) => [
        item.chapter,
        item.regulation === 0 ? '-' : `${item.regulation}건`,
        item.data === 0 ? '-' : `${item.data}건`,
        item.placeholder === 0 ? '-' : `${item.placeholder}건`,
    ]);

    return [
        paragraph('14.1 미해소 항목 등록부   Outstanding Items Register', 'Heading2'),
        paragraph(`본문에 남은 미해소 표기는 총 ${total}건이다. 제16장 선언은 이 등록부를 유보 대상으로 참조한다. 해당 장의 본문에서 각 항목의 내용을 확인해야 한다.`),
        table(['장', '확인 필요(규정)', '확인 필요(자료)', '기재 필요'], rows, {
            widths: [3600, 1800, 1800, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph('「확인 필요(규정)」 = 규정 원문 대조 미완 · 「확인 필요(자료)」 = 외부 자료·증빙 미수령 · 「기재 필요」 = 발행 전 반드시 채워야 하는 값.', 'Note'),
    ].join('');
}

function improvementSection(input: CalculationReportInput) {
    const rows: string[][] = [];

    const period = firstPeriod(input);

    // 기여 집중도가 큰 순으로 올린다 — 결과를 지배하는 미검증 값이 표의 맨 위에 와야 한다.
    const precursorsByImpact = [...cbamPrecursors(input)].sort(
        (a, b) => (precursorContributionShare(input, b) ?? 0) - (precursorContributionShare(input, a) ?? 0)
    );

    for (const precursor of precursorsByImpact) {
        if (precursor.verification_status !== 'VERIFIED') {
            const share = precursorContributionShare(input, precursor);
            rows.push([
                `전구물질 검증 — ${precursor.name}`,
                `${precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사 확인 단계 — 제3자 검증 미완료' : '미검증'}${share === undefined ? '' : `. CBAM 기준 SEE의 약 ${formatPercentShare(share)}를 차지`}`,
                '공급사 제3자 검증보고서 수령. 미수령·불인정 시 공식 기본값 대체 가능성과 SEE 영향은 제9.2장 참조.',
            ]);
        }

        if (precursor.data_mode === 'DEFAULT' && !precursor.default_value_justification?.trim()) {
            rows.push([`기본값 사용 근거 — ${precursor.name}`, '기본값을 사용하나 사유 미기재', '기본값 사용 사유를 기재하세요 — 기재 필요.']);
        }

        const vintage = precursor.supplier_reporting_period?.trim();

        if (vintage && period?.name && vintage !== period.name) {
            rows.push([
                `전구물질 자료 기간 — ${precursor.name}`,
                `${vintage}년 대상 공급사 데이터를 ${period.name} 보고기간에 적용`,
                '확정기간 적격성(빈티지·기간 대응) 규정 확인 및 대표성 근거 확보 — 확인 필요(규정).',
            ]);
        }
    }

    rows.push([
        '간접배출 취급 판정 근거',
        '산정 도구의 CN 접두 규칙으로 판정. Annex II 등재 목록 원본 대조 미완',
        '등재 목록·판본을 확보해 품목별 등재 사실을 대조하고 부속서 B에 등재 — 확인 필요(자료).',
    ]);
    rows.push([
        '이행규정 특정',
        '본 산정을 지배하는 이행규정의 번호·적용 조항 미확정',
        'EUR-Lex 원문으로 번호·조항을 확정해 제5장·부속서 B에 기재 — 확인 필요(규정). 확정 전까지 제16장 선언의 준거 범위는 Regulation (EU) 2023/956과 본문 기술 방법론으로 한정된다.',
    ]);

    // 제7장에 출처를 채웠는데도 14장이 「미기재」를 주장하면 문서가 자기와 싸운다(씨밤이 P1).
    // 공정별 전력 EF 메타가 하나라도 비어 있을 때만 개선 항목으로 올린다.
    const electricityMetaMissing = [...cbamProcessIds(input)].some((processId) => {
        const meta = input.reportInputs?.electricity_ef_meta?.find((item) => item.process_id === processId);
        return !meta?.publisher?.trim() || !meta?.document?.trim() || !meta?.vintage?.trim();
    });

    if (electricityMetaMissing) {
        rows.push(['전력 배출계수 출처', '공표 메타데이터 미기재', '공표기관·문서명·공표연도를 기재하고 증빙에 첨부.']);
    }
    rows.push(['활동자료 불확도', '별도 불확도 산정 미실시', '규정상 요구 수준 확인 후 필요 시 도입 — 확인 필요(규정).']);
    rows.push(['변경이력(audit trail)', '산정 도구 미지원', '검토 절차·기간별 백업으로 보완.']);

    return [
        paragraph('14. 데이터 한계 및 개선계획   Data Gaps and Improvement Plan', 'Heading1'),
        table(['항목', '현황', '개선 계획'], rows, {
            widths: [2400, 3300, 3300], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
    ].join('');
}

/**
 * 15장 자동 초안 — 본 보고서가 본문에서 인용한 문서를 증빙 행으로 만든다.
 * 검증인의 1순위 요청 대상(모니터링 계획·계수 출처·DV 워크북)이 목록에 없으면
 * 15장이 스스로 정의한 용도("검증인은 이 목록으로 원천자료를 요청한다")를 못 한다.
 */
function seedEvidenceRows(input: CalculationReportInput): string[][] {
    const rows: string[][] = [];
    const plan = input.reportInputs?.monitoring_plan;

    if (plan?.doc_no?.trim()) {
        rows.push([
            `모니터링 계획서 ${plan.doc_no}${plan.version ? ` ${plan.version}` : ''}`,
            '본 산정을 지배하는 모니터링 방법론(제12장)',
            PLACEHOLDER,
            '자동 초안 — 확인 필요(자료)',
        ]);
    }

    if (input.defaultValues) {
        rows.push([
            input.defaultValues.summary.filename,
            '제9장 공식 기본값 대조의 기준자료',
            PLACEHOLDER,
            `자동 초안 — 연결일 ${input.defaultValues.summary.imported_at.slice(0, 10)}`,
        ]);
    }

    for (const stream of cbamSourceStreams(input)) {
        const entry = input.reportInputs?.transpositions?.find((item) => item.source_stream_id === stream.id);

        for (const [label, value] of [['NCV', entry?.ncv_source], ['EF', entry?.ef_source]] as const) {
            if (value?.trim()) {
                rows.push([value.trim(), `${stream.name} ${label} 계수 출처(제6.2.2장)`, PLACEHOLDER, '자동 초안 — 확인 필요(자료)']);
            }
        }
    }

    for (const meta of input.reportInputs?.electricity_ef_meta ?? []) {
        if (meta.document?.trim()) {
            rows.push([
                [meta.publisher, meta.document, meta.vintage].filter(Boolean).join(' · '),
                '제7장 전력 배출계수 출처',
                PLACEHOLDER,
                '자동 초안 — 확인 필요(자료)',
            ]);
        }
    }

    // 같은 문서가 여러 배출원에 쓰이면 한 행으로 합친다.
    const byItem = new Map<string, string[]>();

    for (const row of rows) {
        const existing = byItem.get(row[0]);

        if (existing) {
            existing[1] = `${existing[1]} · ${row[1]}`;
        } else {
            byItem.set(row[0], row);
        }
    }

    return [...byItem.values()];
}

/** 14장은 등록부(14.1)가 본문 스캔 결과를 담으므로 본문 조립 뒤에 완성된다. */
function improvementSectionWithRegistry(input: CalculationReportInput, scannedXml: string) {
    return improvementSection(input) + outstandingRegistrySection(scannedXml);
}

function evidenceAndDeclarationSection(input: CalculationReportInput) {
    const evidence = input.reportInputs?.evidence ?? [];
    const declaration = input.reportInputs?.declaration;
    const gateIssues: ReportGateIssue[] = [];

    const body = [
        paragraph('15. 증빙 목록   Evidence Register', 'Heading1'),
        paragraph('각 데이터의 원천 증빙과 그 입증 대상·보관처·상태를 기재한다. 검증인은 이 목록으로 원천자료를 요청한다. 아래 표는 사용자가 입력한 증빙과, 본 보고서가 본문에서 인용한 문서의 자동 초안을 합친 것이다.'),
    ];

    // 본문이 인용한 문서가 증빙 목록에 없으면, 검증인은 그 문서를 요청 대상으로 인지하지 못한다.
    // 설계 §3이 15장을 「자동 초안 + 보관처·상태 입력」으로 명시했는데 자동 초안이 없었다(씨밤이 P1).
    const seeded = seedEvidenceRows(input);
    const userItems = new Set(evidence.map((row) => row.item?.trim()).filter(Boolean));
    const merged = [
        ...evidence.map((row) => [row.item, row.proves, row.custodian, row.status ?? PLACEHOLDER]),
        ...seeded.filter((row) => !userItems.has(row[0])),
    ];

    if (evidence.length === 0) {
        gateIssues.push({ gate: 'G5', severity: 'warn', message: '제15장(증빙 목록)에 사용자 입력이 없습니다. 자동 초안만으로는 보관처·상태가 채워지지 않습니다.' });
    }

    body.push(table(['증빙', '입증 대상', '보관', '상태'], merged,
        { widths: [2700, 3000, 1650, 1650], headerShade: SOFT, headerBold: true, repeatHeader: true }));

    if (seeded.length > 0) {
        body.push(paragraph('「자동 초안」으로 표시된 행은 본 보고서가 인용한 문서를 산정 도구가 자동으로 등재한 것이다. 보관처와 상태를 확인해 기재해야 한다.', 'Note'));
    }

    // 16장 — 국·영문의 보증 수준이 같아야 한다. EU 기관·검증인이 읽는 것은 영문이므로,
    // 국문에만 유보를 두고 영문을 무유보로 두면 서명자의 책임이 언어별로 갈린다(씨밤이 P0).
    //
    // 제5장이 "본 산정을 지배하는 이행규정의 번호·조항을 대조하지 못했다"고 적고 있으므로,
    // 선언이 "그 이행규정에 따라 작성했다"고 말하면 문서가 자기와 모순된다. 준거 범위를
    // 실제로 확보한 근거(2023/956 + 본문 기술 방법론)까지로 좁힌다(씨밤이 P0).
    body.push(paragraph('16. 운영자 선언   Operator Declaration', 'Heading1'));
    body.push(paragraph('본인은 본인이 아는 범위에서(to the best of my knowledge) 본 보고서에 기재된 정보가 완전하고 정확하며, Regulation (EU) 2023/956 및 본 보고서에 기술된 방법론 및 5개 보고원칙에 따라 성실하게 작성되었음을 선언합니다. 본 산정을 지배하는 이행규정의 번호·적용 조항은 원문 대조가 완료되지 않았으며(제5장), 「확인 필요」로 표기된 항목은 규정 원문 대조 또는 자료 수령이 완료되지 않았음을 명시합니다. 미해소 항목은 제14장에 열거되어 있습니다.'));
    body.push(paragraph('I declare that, to the best of my knowledge, the information in this report is complete and accurate, and has been prepared in accordance with Regulation (EU) 2023/956 and with the methodology and reporting principles described herein. The number and applicable articles of the implementing regulation governing this calculation have not yet been reconciled against the source legislation (Chapter 5). Items marked "확인 필요 / to be confirmed" indicate that reconciliation against the regulatory text or receipt of supporting evidence has not been completed; outstanding items are listed in Chapter 14.', 'Note'));
    body.push(paragraph('본 선언의 준거 문안은 국문을 우선한다. (In case of discrepancy, the Korean text prevails.)', 'Note'));
    body.push(table(['항목', '기재'], [
        ['성명 (Name)', declaration?.name || ''],
        ['직책 (Position)', declaration?.position || ''],
        ['서명 (Signature)', ''],
        ['일자 (Date)', declaration?.date || ''],
    ], { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));

    if (!declaration?.name) {
        gateIssues.push({ gate: 'G5', severity: 'warn', message: '제16장: 운영자 선언의 성명이 비어 있습니다. 서명 전 기재하세요.' });
    }

    return { xml: body.join(''), gateIssues };
}

function annexes() {
    return [
        paragraph('A. 부속서 A — 계산식 및 표기 규칙   Annex A', 'Heading1'),
        paragraph('연소 배출: E = AD × NCV × EF ÷ 1,000 × OxF'),
        paragraph('전력 간접: E = 전력(MWh) × EF(tCO2e/MWh)'),
        paragraph('전구물질 기여: SEE_prec = (소비량 ÷ 제품 총생산량) × 전구물질 SEE'),
        paragraph('제품 SEE(직접) = 자체 직접배출 ÷ 총생산량 + Σ SEE_prec(직접)'),
        paragraph('A.2 표기·반올림 규칙', 'Heading2'),
        paragraph('· 배출량·SEE: 소수 4자리 / 계수·원단위: 원천 자릿수 유지'),
        paragraph('· 산식에 표기하는 피연산자는 반올림하지 않는다. 결과값만 반올림한다.'),
        paragraph('· 소계·합계는 미반올림 원천값에서 산출한 뒤 반올림한다(사사오입, 절댓값 기준).'),
        paragraph('· 문서 생성 시 구성 항목과 소계의 정합을 자가검사한다. 원천값이 일치하지 않으면(산정 오류) 발행이 차단된다. 원천값은 일치하나 반올림 표기로 표시값이 어긋나는 경우에는 해당 표에 반올림 각주를 자동 삽입한다 — 이 경우 산정값 자체는 정확하다.'),
        paragraph('B. 부속서 B — 참조 문서   Annex B', 'Heading1'),
        paragraph('B.1 규범적 근거 (확정기간)', 'Heading2'),
        paragraph('· Regulation (EU) 2023/956 — CBAM 기본규정'),
        paragraph('· 2026 확정기간 이행규정(내재배출 산정방법·기본값 등) — 번호·적용 조항은 EUR-Lex 원문 확인 필요(규정)'),
        paragraph('B.2 개념 참조 (전환기 문서 — 수치·한도 비적용)', 'Heading2'),
        paragraph('· EU Commission CBAM Guidance for installation operators outside the EU (전환기 문서)'),
        paragraph('개념 정의의 참조로만 사용하였으며, 그 수치·한도를 본 확정기간 산정에 적용하지 않았다.', 'Note'),
        paragraph('C. 부속서 C — 본 보고서의 작성 방식   Annex C', 'Heading1'),
        table(['섹션', '작성 방식', '원천'], [
            ['표지·2–4 사업장·기간·제품·공정', '자동', '앱 데이터'],
            ['3.1 간접배출 취급 근거', '자동 (조건 분기)', '제품·전구물질의 품목 분류 — 고정 문안 아님'],
            ['5 방법론', '자동', '고정 문안 + 산정 파라미터'],
            ['6.1 전치 / 6.3 측정 방식', '사용자 입력', '원천 단위·환산 근거·계량 방식'],
            ['6.2·7–8 계수·전력·전구물질', '자동', '앱 데이터 + 산정엔진'],
            ['9 DV 대조 및 민감도', '자동', '업로드한 EU 공식 기준자료'],
            ['10 산정 결과', '자동 (+자가검사)', '산정엔진 결과'],
            ['11 기지불 탄소가격 / 12 모니터링 / 15 증빙', '사용자 입력', '해당 여부·증빙·관리체계'],
            ['13 5원칙 / 14 개선계획', '자동 초안 + 사용자 확인', '앱 검사 결과 기반'],
            ['16 운영자 선언', '사용자 서명', '—'],
        ], { widths: [3400, 2200, 3400], headerShade: SOFT, headerBold: true, repeatHeader: true }),
    ].join('');
}

// ---------------------------------------------------------------- 조립

export function createCalculationReportFilename(generatedAt: Date) {
    return `CBAM_Calculation_Report_${formatDate(generatedAt).replaceAll('-', '')}.docx`;
}

export function createCalculationReport(input: CalculationReportInput): CalculationReportResult {
    const reportable = reportableResults(input);

    if (reportable.length === 0) {
        throw new Error('CBAM 신고 대상 산정 결과가 없어 산정보고서를 생성할 수 없습니다. 품목·생산공정 입력을 먼저 확인하세요.');
    }

    const { isInterim, issues: dateIssues } = checkIssueDate(input);
    const summary = summarySection(input);
    const processes = processSection(input);
    const activity = activityDataSection(input);
    const electricity = electricitySection(input);
    const precursors = precursorSection(input);
    const defaultValues = defaultValueSection(input);
    const results = resultSection(input);
    const carbonPrice = carbonPriceSection(input);
    const monitoring = monitoringSection(input);
    const evidence = evidenceAndDeclarationSection(input);

    // 제13장은 게이트 실행 결과를 서술하므로 게이트를 먼저 모은다.
    // (G4는 완성된 본문을 대상으로 하지만 차단 게이트라, 발동하면 발행 자체가 막혀 13장이 나갈 일이 없다.)
    const preIssues: ReportGateIssue[] = [
        ...dateIssues,
        ...checkSeeDenominator(reportable),
        ...checkSinglePeriod(input),
        ...collectEngineWarnings(reportable),
        ...checkBoundaryConsistency(input),
        ...summary.gateIssues,
        ...processes.gateIssues,
        ...activity.gateIssues,
        ...electricity.gateIssues,
        ...precursors.gateIssues,
        ...defaultValues.gateIssues,
        ...results.gateIssues,
        ...carbonPrice.gateIssues,
        ...monitoring.gateIssues,
        ...evidence.gateIssues,
    ];

    // 14.1 등록부는 나머지 본문을 훑어 미해소 표기를 모으므로, 본문을 먼저 조립하고 14장을 나중에 채운다.
    const beforeImprovement = [
        coverSection(input, isInterim),
        summary.xml,
        installationSection(input),
        productSection(input),
        processes.xml,
        methodologySection(input),
        activity.xml,
        electricity.xml,
        precursors.xml,
        defaultValues.xml,
        results.xml,
        carbonPrice.xml,
        monitoring.xml,
        principlesSection(input, preIssues),
    ].join('');
    const afterImprovement = [evidence.xml, annexes()].join('');
    const bodyXml = [
        beforeImprovement,
        improvementSectionWithRegistry(input, beforeImprovement + afterImprovement),
        afterImprovement,
    ].join('');

    // 게이트 G4는 완성된 본문 텍스트를 대상으로 검사한다.
    const bodyText = bodyXml.replace(/<[^>]+>/g, ' ');
    const issues: ReportGateIssue[] = [
        ...preIssues,
        ...checkCrossReferences(bodyText),
    ];

    const blocking = issues.filter((issue) => issue.severity === 'block');

    if (blocking.length > 0) {
        throw new Error(
            `산정보고서 발행이 차단되었습니다(${blocking.length}건). ${blocking[0].gate}: ${blocking[0].message}`
        );
    }

    const bytes = createDocx('CBAM 내재배출량 산정보고서', bodyXml, input.generatedAt, {
        header: {
            text: isInterim ? '기중 잠정(interim) — 보고기간 종료 전 발행' : 'CBAM 내재배출량 산정보고서',
            align: 'right',
            color: MUTE,
            size: 14,
        },
        footer: { text: 'CBAM Local', pageNumber: true, align: 'center', color: MUTE, size: 14 },
    });

    return {
        blob: new Blob([bytes], {
            type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
        filename: createCalculationReportFilename(input.generatedAt),
        issues,
        isInterim,
    };
}

// 미사용 경고 방지용 — 향후 장(P4)에서 사용할 상수/헬퍼
void INK;
void roundForReport;
void cell;
