import { cell, createDocx, paragraph, table } from './docx-builder';
import { checkDisplaySum, formatForReport, formatIntegerForReport, roundForReport } from './report-format';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';
import { isCbamReportingScope, getProductReportingScope } from './reporting-scope';
import type { LocalCalculationResult } from './calculation-engine';
import type {
    Installation,
    Product,
    ProductionProcess,
    ProductOutputLine,
    PurchasedPrecursor,
    ReportingPeriod,
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
}

export interface CalculationReportResult {
    blob: Blob;
    filename: string;
    issues: ReportGateIssue[];
    /** 발행일이 보고기간 종료 전이라 「기중 잠정」으로 표기됨 (게이트 G2) */
    isInterim: boolean;
}

const PLACEHOLDER = '기재 필요';

function reportableResults(input: CalculationReportInput) {
    return input.results.filter((result) => result.is_cbam_reportable);
}

function firstPeriod(input: CalculationReportInput) {
    return input.periods[0];
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

            if (value === '' || value === '-' || value === PLACEHOLDER) {
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

/** G1 — 구성 항목의 표시값 합이 소계 표시값과 일치하는지 (검증인은 표시된 숫자를 더해 본다). */
function checkResultDisplaySums(results: LocalCalculationResult[]): ReportGateIssue[] {
    const issues: ReportGateIssue[] = [];

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
            if (!check.isValid) {
                issues.push({
                    gate: 'G1',
                    severity: 'block',
                    message: `${check.label}: 구성 표시값 합 ${check.displayedPartsSum} ≠ 소계 표시값 ${check.displayedTotal}`,
                });
            }
        }
    }

    return issues;
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
    const product = input.products.find((item) => item.id === reportable[0]?.product_id);
    const applicability = getIndirectEmissionsApplicability(product);

    const rows: Array<[string, string]> = [
        ['보고기간 (Reporting period)', period ? `${period.start_date} ~ ${period.end_date}` : PLACEHOLDER],
        ['대상 제품 (CBAM good)', reportable.length > 0
            ? reportable.map((result) => `${result.product_name} · CN ${result.cn_code ?? '-'}`).join('\n')
            : PLACEHOLDER],
        ['대상 온실가스 (GHG scope)', 'CO2 (철강 품목의 CBAM 대상 GHG — 확인 필요(규정)). 본문 tCO2e = tCO2'],
        ['간접배출 취급', applicability.label],
        ['문서 상태 (Status)', isInterim
            ? '기중 잠정(interim) — 보고기간 종료 전 발행. 증빙 커버리지 확인 필요'
            : '내부 검토 대기 · 제3자 검증 제출 전'],
        ['작성일 (Date of issue)', formatDate(input.generatedAt)],
        ['작성 도구 (Prepared with)', 'CBAM Local — 로컬 우선 산정 도구'],
    ];

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
            paragraph('SEE 직접 = 자체 공정 직접배출 + 구매 전구물질의 직접 내재배출. SEE 간접의 인증서 기준 반영 여부는 제3장 근거를 따른다.', 'Note'),
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
    const product = input.products.find((item) => item.id === reportable[0]?.product_id);
    const applicability = getIndirectEmissionsApplicability(product);
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

    if (applicability.applicable) {
        body.push(paragraph(`본 제품은 간접배출을 포함해 산정한다. 근거: ${applicability.reason} (조항 확인 필요(규정))`));
    } else {
        body.push(paragraph(`본 제품은 직접배출만 고려하는 품목으로, 최종제품의 자체 전력 간접배출은 CBAM 인증서 산정 기준 SEE에서 제외하고 정보 목적으로 보고한다. 근거: ${applicability.reason} (Regulation (EU) 2023/956 Art. 7(1) — 조항 번호 EUR-Lex 원문 확인 필요(규정))`));

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
                `주의: 다음 전구물질은 직접배출만 고려되는 품목이 아니므로 그 간접 내재배출이 최종재로 전가될 수 있습니다 — ${nonDirectOnly.map((precursor) => `${precursor.name}(${precursor.precursor_cn_code ?? 'CN 미기재'})`).join(', ')}. 인증서 산정 기준 반영 여부를 개별 확인해야 합니다. 확인 필요(규정).`,
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
        paragraph(`본 보고서의 CBAM 대상 생산공정은 ${scope.length}개이다. 제품 배분 기준과 생산라인 합계 정합은 산정 도구의 자동 검사를 통과하였다(제6장).`),
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
        paragraph('E직접 = 활동자료 × 순발열량 NCV(GJ/단위) × 배출계수 EF(tCO2/TJ) ÷ 1,000 × 산화계수'),
        paragraph('철강 품목의 CBAM 대상 온실가스는 CO2이므로(확인 필요(규정)) tCO2 = tCO2e로 표기한다.', 'Note'),
        paragraph('5.2 간접배출 (전력)', 'Heading2'),
        paragraph('E간접 = 전력 사용량(MWh) × 전력 배출계수(tCO2e/MWh). 인증서 기준 반영 여부는 제3장 근거를 따른다.'),
        paragraph('5.3 전구물질 내재배출', 'Heading2'),
        paragraph('구매 전구물질은 공급사 실측(actual) 데이터를 우선 적용하며, 실측이 없거나 인정 요건을 충족하지 못할 때에만 EU 공표 기본값(DV)을 사용한다. 제품 1톤당 전구물질 기여 = (소비량 ÷ 제품 총생산량) × 전구물질 SEE. 실측 채택 근거의 정량 대조는 제9장에 기술한다.'),
        paragraph('고철(CN 7204)은 CBAM 전구물질 범위에서 제외되어 가산하지 않는다.'),
        paragraph('5.4 제품 SEE 및 인증서 기준', 'Heading2'),
    ];

    for (const result of reportable) {
        body.push(paragraph(
            `${result.product_name}: SEE(직접, 전구물질 포함) = ${formatForReport(result.direct_see)} + ${formatForReport(result.precursor_direct_see)} = ${formatForReport(result.see_direct_incl_precursor)} tCO2e/t`
        ));
        body.push(paragraph(
            `${result.product_name}: SEE(간접) = ${formatForReport(result.own_indirect_see)} + ${formatForReport(result.precursor_indirect_see)} = ${formatForReport(result.see_indirect_incl_precursor)} tCO2e/t`
        ));
    }

    body.push(paragraph('산식에 표기한 피연산자는 반올림하지 않는다. 결과값만 소수 4자리로 반올림한다.', 'Note'));

    return body.join('');
}

function activityDataSection(input: CalculationReportInput) {
    const columns = [
        { header: '배출원' },
        { header: '산정방법' },
        { header: '활동자료', numeric: true },
        { header: '단위' },
        { header: 'NCV', numeric: true },
        { header: 'EF', numeric: true },
        { header: '계수 출처' },
    ];
    const rows = input.sourceStreams.map((stream) => [
        stream.name,
        stream.method,
        formatForReport(stream.activity_data, 4),
        stream.activity_unit,
        formatForReport(stream.ncv_gj_per_unit, 4),
        formatForReport(stream.emission_factor_tco2e_per_unit, 4),
        stream.source || PLACEHOLDER,
    ]);
    const reportable = reportableResults(input);

    const body = [
        paragraph('6. 활동자료 및 배출계수   Activity Data and Emission Factors', 'Heading1'),
        paragraph('6.1 원천자료 → 활동자료 전치(transposition)', 'Heading2'),
        paragraph('청구서 등 원천자료의 단위가 산정 활동자료의 단위와 다른 경우, 환산 단계와 적용 계수를 기재해야 검증인이 원천 증빙으로 역추적할 수 있다. 원천 단위·수치·환산 근거는 기재 필요 — 본 항목은 사용자 입력이 필요합니다.', 'Note'),
        paragraph('6.2 배출계수', 'Heading2'),
        table(columns.map((column) => column.header), rows, {
            widths: [1800, 1300, 1200, 800, 900, 1200, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
        paragraph('확인 필요(규정): 확정기간 이행규정이 표준계수 위계를 두는 경우 인용 계수의 적격성을 원문 대조로 확인해야 한다.', 'Note'),
        paragraph('6.3 측정 방식 및 데이터 품질', 'Heading2'),
        paragraph('활동자료별 측정 방식(정산용 계량기 등)·원천 증빙·데이터 품질은 기재 필요 — 본 항목은 사용자 입력이 필요합니다.', 'Note'),
        paragraph('6.4 정합성 점검', 'Heading2'),
    ];

    const reconRows: Array<[string, string]> = reportable.map((result) => [
        result.process_name,
        `배출원 합계 ${formatForReport(result.source_stream_emissions_tco2e)} tCO2e · 공정 직접배출 ${formatForReport(result.direct_emissions_tco2e)} tCO2e · 차이 ${formatForReport(result.source_stream_delta_tco2e)} tCO2e`,
    ]);
    body.push(table(['생산공정', '정합 결과'], reconRows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));
    body.push(paragraph('본 점검은 산정 도구의 내부 정합성 기준(±1%)에 따른 자체 QC이며, 규정상 허용오차가 아니다. 배출원이 1건인 공정에서는 이 점검이 전기(轉記) 오류 검출에 한정된다.', 'Note'));

    return { xml: body.join(''), gateIssues: checkNumericColumns('제6장 배출계수표', columns, rows) };
}

function electricitySection(input: CalculationReportInput) {
    const rows: Array<[string, string]> = input.processes.map((process) => [
        process.name,
        `전력 ${formatForReport(process.electricity_mwh, 2)} MWh · EF ${formatForReport(process.electricity_ef_tco2e_per_mwh, 4)} tCO2e/MWh · 간접 ${formatForReport(process.electricity_mwh * process.electricity_ef_tco2e_per_mwh, 2)} tCO2e`,
    ]);

    return [
        paragraph('7. 전력 사용 및 간접배출   Electricity and Indirect Emissions', 'Heading1'),
        table(['생산공정', '전력 사용 및 간접배출'], rows, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }),
        paragraph('전력 배출계수의 공표기관·문서명·공표연도(vintage)는 기재 필요 — 본 항목은 사용자 입력이 필요합니다. 검증인이 값을 대조하려면 출처 메타데이터가 있어야 합니다.', 'Note'),
        paragraph('전력 배출계수는 시장기반 수단(Guarantees of Origin·녹색인증서 등)으로 낮출 수 없다. 직접 기술적 연결 또는 PPA에 해당하는 경우에만 해당 분류의 계수 적용을 검토한다.', 'Note'),
    ].join('');
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
    const rows = input.precursors.map((precursor) => [
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

    for (const precursor of input.precursors) {
        const detail: Array<[string, string]> = [
            ['공급사 / 원산지', `${precursor.supplier_installation || '-'} / ${precursor.supplier_country || PLACEHOLDER}`],
            ['데이터 구분', precursor.data_mode === 'DEFAULT' ? '기본값 (Default)' : precursor.data_mode === 'SEMI_ACTUAL' ? '혼합 (Measured + Default)' : '실측 (Measured)'],
            ['자료 대상기간 (vintage)', precursor.supplier_reporting_period || '확인 필요(자료)'],
            ['검증 상태', precursor.verification_status === 'VERIFIED' ? '제3자 검증 완료' : precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사 확인 — 제3자 검증 미완료' : '미검증'],
            ['비CBAM 용도 소비', `${formatIntegerForReport(precursor.consumed_for_non_cbam_mass_t)} t`],
            ['질량 수지', precursor.purchased_mass_t >= precursor.consumed_mass_t
                ? `구매 ${formatIntegerForReport(precursor.purchased_mass_t)} t ≥ 소비 ${formatIntegerForReport(precursor.consumed_mass_t)} t — 기말 재고 ${formatIntegerForReport(precursor.purchased_mass_t - precursor.consumed_mass_t)} t (차기 이월)`
                : `⚠ 소비량이 구매량을 초과합니다 — 확인 필요(자료)`],
        ];
        body.push(paragraph(`8.x ${precursor.name}`, 'Heading2'));
        body.push(table(['항목', '내용'], detail, { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }));

        if (precursor.verification_status !== 'VERIFIED' && precursor.data_mode !== 'DEFAULT') {
            body.push(paragraph(
                `리스크 고지: 본 전구물질의 실측값은 제3자 검증이 완료되지 않았습니다. 확정기간의 실측 인정 요건(검증 수준·기간 대응)은 확인 필요(규정)이며, 불인정 시 공식 기본값 대체가 발동됩니다 — 그 영향은 제9장에 정량화합니다.`,
                undefined,
                { color: AMBER }
            ));
        }
    }

    return { xml: body.join(''), gateIssues: checkNumericColumns('제8장 전구물질표', columns, rows) };
}

function defaultValueSectionPlaceholder() {
    return [
        paragraph('9. 공식 기본값(DV) 대조 및 민감도   Cross-check against Official Default Values', 'Heading1'),
        paragraph('실측 우선(actual > default) 원칙의 적용 근거를 정량적으로 제시하기 위해, 전구물질 실측값을 해당 조합(국가 × CN)의 EU 공식 기본값과 대조한다. 검증인의 개연성(plausibility) 점검 기준선 역할을 한다.'),
        paragraph('본 항목은 업로드한 EU 공식 기준자료에서 자동 생성됩니다. 현재 버전에서는 아직 제공되지 않습니다 — 기재 필요.', 'Note'),
    ].join('');
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

    return {
        xml: [
            paragraph('10. 산정 결과   Calculation Results', 'Heading1'),
            table(columns.map((column) => column.header), rows, {
                widths: [2000, 3000, 1800, 2200], headerShade: SOFT, headerBold: true, repeatHeader: true,
            }),
            paragraph('본 표의 구성 항목 표시값 합은 소계 표시값과 일치한다(문서 생성 시 자동 자가검사 — 게이트 G1). 수치는 EU Communication Template에 기재되는 값과 동일 원천에서 산출되며, 템플릿 자동 기재 시 기재 셀 전수를 자동 대조 검증한다. 검증 셀 수와 목록은 Export 검증 로그에 기록된다.', 'Note'),
        ].join(''),
        gateIssues: [...checkNumericColumns('제10장 결과표', columns, rows), ...checkResultDisplaySums(reportable)],
    };
}

function userInputPlaceholders() {
    return [
        paragraph('11. 기지불 탄소가격   Carbon Price Paid in Country of Origin', 'Heading1'),
        paragraph('원산지국에서 이미 지불한 탄소가격은 신고인의 인증서 차감 근거가 될 수 있으므로, 해당 여부와 증빙 상태를 기재한다. 배출권거래제 할당대상 여부는 사업장이 아닌 법인 단위로 판단되므로 본 산정 데이터만으로 단정할 수 없다.'),
        paragraph('본 항목은 사용자 입력이 필요합니다 — 기재 필요. 확정 전까지 신고인은 본 항목을 근거로 인증서 차감을 적용할 수 없습니다.', 'Note'),
        paragraph('12. 모니터링 방법론 및 데이터 관리   Monitoring Methodology and Data Management', 'Heading1'),
        paragraph('제3자 검증인은 수치보다 데이터 흐름·책임·품질관리 통제 체계를 먼저 확인한다. 모니터링 계획 문서, 데이터 흐름(수집→전치→집계→입력), 역할·책임(R&R), 검토·승인 절차를 기재한다.'),
        paragraph('본 항목은 사용자 입력이 필요합니다 — 기재 필요.', 'Note'),
        paragraph('현 도구의 한계: 산정 도구는 변경이력(audit trail) 기능을 제공하지 않는다. 변경 통제는 검토 절차와 기간별 백업 보관으로 보완하며, 백업 파일은 최종 산정 상태를 재현하되 변경 과정의 이력은 포함하지 않는다.', 'Note'),
    ].join('');
}

function principlesSection(input: CalculationReportInput) {
    const reportable = reportableResults(input);
    const totalWarnings = reportable.reduce((sum, result) => sum + result.warnings.length, 0);
    const maxDelta = reportable.reduce((max, result) => Math.max(max, Math.abs(result.source_stream_delta_tco2e)), 0);

    const rows: string[][] = [
        ['완전성\nCompleteness',
            `산정경계 내 CBAM 대상 생산공정 ${input.processes.length}개·배출원 ${input.sourceStreams.length}건·구매 전구물질 ${input.precursors.length}건을 포함. 경계의 포함·제외 항목을 제2장에 명시.`,
            `산정 도구 자동 검사: 경고 ${totalWarnings}건. 공정–배출원 연결 검사 수행.`,
            '보고기간 중 신규 배출원 발생 시 재산정 필요.'],
        ['정확성\nAccuracy',
            '활동자료는 원천 증빙 기반. 원천자료→활동자료 전치 경로를 제6.1장에 기재.',
            `배출원 합계와 공정 직접배출량의 최대 차이 ${formatForReport(maxDelta)} tCO2e — 도구 내부 정합 기준(±1%) 기준. 표시값 합계 자가검사(게이트 G1) 통과.`,
            '계수 위계 적격성(6.2)·불확도 요구 수준(6.3)은 확인 필요(규정).'],
        ['일관성\nConsistency',
            '동일 보고기간 내 동일 방법론·동일 계수를 일관 적용. 배분기준 혼용 여부는 도구가 자동 경고.',
            '산정 방법·계수는 입력 시점 기준으로 앱 데이터베이스와 .cbam 백업에 보존.',
            '도구에 변경이력 기능이 없어 검토 절차·백업으로 보완(제12장).'],
        ['투명성\nTransparency',
            '모든 수치에 출처를 병기(제6·7·8장). 계산식과 표기·반올림 정책을 부속서 A에 공개. 규범적 근거와 전환기 참조 문서를 부속서 B에서 분리.',
            '증빙 목록(제15장)과 .cbam 백업으로 최종 산정 상태 재현 가능. 자동 생성·사용자 입력 구분을 부속서 C에 공개.',
            '백업은 최종 상태 스냅샷이며 변경 과정 이력은 미포함.'],
        ['적절성\nRelevance',
            'CBAM 목적에 필요한 데이터를 EU Communication Template 구조에 맞게 수집·산정. 간접배출 취급은 품목별 등재 기준으로 판단(제3장).',
            'CN 코드를 EU 공식 템플릿 CN 목록과 대조 확인. 템플릿 기재 셀 전수 자동 대조 검증.',
            '조항 단위 인용은 확인 필요(규정). EU 규정·템플릿 개정 시 최신판 기준 재검토.'],
    ];

    return [
        paragraph('13. 보고원칙 자체평가   Self-Assessment against Reporting Principles', 'Heading1'),
        paragraph('아래 표는 본 산정이 5개 보고원칙을 어떻게 충족하는지, 그 근거와 잔여 한계를 기술한다. 잔여 한계는 제14장 개선계획과 연결된다.'),
        table(['원칙', '적용 내용', '근거·검증', '잔여 한계'], rows, {
            widths: [1500, 3300, 2400, 1800], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
    ].join('');
}

function improvementSection(input: CalculationReportInput) {
    const rows: string[][] = [];

    for (const precursor of input.precursors) {
        if (precursor.verification_status !== 'VERIFIED') {
            rows.push([
                `전구물질 검증 — ${precursor.name}`,
                precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사 확인 단계 — 제3자 검증 미완료' : '미검증',
                '공급사 제3자 검증보고서 수령. 미수령·불인정 시 공식 기본값 대체 가능성과 SEE 영향은 제9장 참조.',
            ]);
        }

        if (precursor.data_mode === 'DEFAULT' && !precursor.default_value_justification?.trim()) {
            rows.push([`기본값 사용 근거 — ${precursor.name}`, '기본값을 사용하나 사유 미기재', '기본값 사용 사유를 기재하세요.']);
        }
    }

    rows.push(['전력 배출계수 출처', '공표 메타데이터 미기재', '공표기관·문서명·공표연도를 기재하고 증빙에 첨부.']);
    rows.push(['활동자료 불확도', '별도 불확도 산정 미실시', '규정상 요구 수준 확인 후 필요 시 도입 — 확인 필요(규정).']);
    rows.push(['변경이력(audit trail)', '산정 도구 미지원', '검토 절차·기간별 백업으로 보완.']);

    return [
        paragraph('14. 데이터 한계 및 개선계획   Data Gaps and Improvement Plan', 'Heading1'),
        table(['항목', '현황', '개선 계획'], rows, {
            widths: [2400, 3300, 3300], headerShade: SOFT, headerBold: true, repeatHeader: true,
        }),
    ].join('');
}

function evidenceAndDeclarationPlaceholders() {
    return [
        paragraph('15. 증빙 목록   Evidence Register', 'Heading1'),
        paragraph('각 데이터의 원천 증빙과 보관처·상태를 기재한다. 본 항목은 사용자 입력이 필요합니다 — 기재 필요.', 'Note'),
        paragraph('16. 운영자 선언   Operator Declaration', 'Heading1'),
        paragraph('본인은 본인이 아는 범위에서(to the best of my knowledge) 본 보고서에 기재된 정보가 완전하고 정확하며, Regulation (EU) 2023/956 및 관련 이행규정과 본 보고서에 기술된 방법론 및 5개 보고원칙에 따라 성실하게 작성되었음을 선언합니다. 「확인 필요」로 표기된 항목은 규정 원문 대조 또는 자료 수령이 완료되지 않았음을 명시합니다.'),
        paragraph('본 선언의 준거 문안은 국문을 우선한다. (In case of discrepancy, the Korean text prevails.)', 'Note'),
        table(['항목', '기재'], [
            ['성명 (Name)', ''],
            ['직책 (Position)', ''],
            ['서명 (Signature)', ''],
            ['일자 (Date)', ''],
        ], { widths: [2700, 6300], headerShade: SOFT, headerBold: true, repeatHeader: true }),
    ].join('');
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
        paragraph('· 문서 생성 시 「구성 항목 표시값 합 = 소계 표시값」 자가검사를 수행하며, 불일치 시 발행이 차단된다.'),
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
    const precursors = precursorSection(input);
    const results = resultSection(input);

    const bodyXml = [
        coverSection(input, isInterim),
        summary.xml,
        installationSection(input),
        productSection(input),
        processes.xml,
        methodologySection(input),
        activity.xml,
        electricitySection(input),
        precursors.xml,
        defaultValueSectionPlaceholder(),
        results.xml,
        userInputPlaceholders(),
        principlesSection(input),
        improvementSection(input),
        evidenceAndDeclarationPlaceholders(),
        annexes(),
    ].join('');

    // 게이트 G4는 완성된 본문 텍스트를 대상으로 검사한다.
    const bodyText = bodyXml.replace(/<[^>]+>/g, ' ');
    const issues: ReportGateIssue[] = [
        ...dateIssues,
        ...checkBoundaryConsistency(input),
        ...summary.gateIssues,
        ...processes.gateIssues,
        ...activity.gateIssues,
        ...precursors.gateIssues,
        ...results.gateIssues,
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

// 미사용 경고 방지용 — 향후 장에서 사용할 상수/헬퍼
void INK;
void roundForReport;
void cell;
