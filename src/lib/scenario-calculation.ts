import type { LocalCalculationResult } from './calculation-engine';
import {
    benchmarkPeriodForYear,
    defaultBenchmarkRouteLetters,
    findDefaultValueReference,
    inferBenchmarkRouteLetters,
    selectBenchmarkValues,
    getDefaultValueTotalForYear,
    type ImportedBenchmarkReference,
    type ImportedDefaultValueReference,
} from './reference-workbooks';

export interface ScenarioAssumptions {
    origin_country: string;
    default_value_year: '2026' | '2027' | '2028_ONWARDS';
    cbam_factor: number;
    cscf: number;
    certificate_price_eur: number;
    eu_import_share_percent: number;
    de_minimis_threshold_t: number;
    paid_carbon_price_eur_per_tco2e: number;
}

export const DEFAULT_SCENARIO_ASSUMPTIONS: ScenarioAssumptions = {
    origin_country: 'South Korea',
    default_value_year: '2026',
    cbam_factor: 0.975,
    cscf: 1,
    certificate_price_eur: 80,
    eu_import_share_percent: 100,
    de_minimis_threshold_t: 50,
    paid_carbon_price_eur_per_tco2e: 0,
};

export const SCENARIO_ASSUMPTIONS_SETTING_KEY = 'scenario:assumptions';
export const CERTIFICATE_INDICATOR_NOTICE =
    '현재 인증서 비용 지표는 입력한 인증서 가격을 곱한 사전 검토용 지표입니다. 최종 declaration 단계에서는 검증자료, Registry 입력값, 이미 납부한 탄소가격 증빙을 별도로 확인해야 합니다.';

function normalizeFiniteNumber(value: number | undefined, fallback: number, min?: number, max?: number) {
    if (!Number.isFinite(value)) {
        return fallback;
    }

    let numericValue = value as number;

    if (min !== undefined) {
        numericValue = Math.max(min, numericValue);
    }

    if (max !== undefined) {
        numericValue = Math.min(max, numericValue);
    }

    return numericValue;
}

export function normalizeScenarioAssumptions(value: Partial<ScenarioAssumptions> | undefined): ScenarioAssumptions {
    const cbamFactor = value?.cbam_factor;
    const cscf = value?.cscf;
    const certificatePriceEur = value?.certificate_price_eur;
    const euImportSharePercent = value?.eu_import_share_percent;
    const deMinimisThreshold = value?.de_minimis_threshold_t;
    const paidCarbonPrice = value?.paid_carbon_price_eur_per_tco2e;

    return {
        origin_country: value?.origin_country || DEFAULT_SCENARIO_ASSUMPTIONS.origin_country,
        default_value_year: value?.default_value_year || DEFAULT_SCENARIO_ASSUMPTIONS.default_value_year,
        cbam_factor: normalizeFiniteNumber(cbamFactor, DEFAULT_SCENARIO_ASSUMPTIONS.cbam_factor, 0, 1),
        cscf: normalizeFiniteNumber(cscf, DEFAULT_SCENARIO_ASSUMPTIONS.cscf, 0, 1),
        certificate_price_eur: normalizeFiniteNumber(certificatePriceEur, DEFAULT_SCENARIO_ASSUMPTIONS.certificate_price_eur, 0),
        eu_import_share_percent: normalizeFiniteNumber(euImportSharePercent, DEFAULT_SCENARIO_ASSUMPTIONS.eu_import_share_percent, 0, 100),
        de_minimis_threshold_t: normalizeFiniteNumber(deMinimisThreshold, DEFAULT_SCENARIO_ASSUMPTIONS.de_minimis_threshold_t, 0),
        paid_carbon_price_eur_per_tco2e: normalizeFiniteNumber(paidCarbonPrice, DEFAULT_SCENARIO_ASSUMPTIONS.paid_carbon_price_eur_per_tco2e, 0),
    };
}

/**
 * CBAM factor — Directive 2003/87/EC Article 10a(1a) (Directive (EU) 2023/959로 개정).
 * 무상할당이 해마다 줄어드는 비율이다. 2034년부터는 factor가 없다(무상할당 조정 0).
 */
export const CBAM_FACTOR_BY_YEAR: ReadonlyArray<{ year: number; factor: number }> = [
    { year: 2026, factor: 0.975 },
    { year: 2027, factor: 0.95 },
    { year: 2028, factor: 0.9 },
    { year: 2029, factor: 0.775 },
    { year: 2030, factor: 0.515 },
    { year: 2031, factor: 0.39 },
    { year: 2032, factor: 0.265 },
    { year: 2033, factor: 0.14 },
];

/**
 * 가정의 「기본값 적용 연도」에 맞는 공식 factor. 「2028년 이후」는 묶음이라 값이 하나가 아니다 —
 * 그 첫 해(2028)의 값을 돌려주고, 화면이 이후 연도의 값을 함께 보여준다.
 */
export function officialCbamFactorForYear(year: ScenarioAssumptions['default_value_year']): number {
    const calendarYear = year === '2026' ? 2026 : year === '2027' ? 2027 : 2028;
    return CBAM_FACTOR_BY_YEAR.find((row) => row.year === calendarYear)?.factor ?? 0;
}

/**
 * 연도를 바꿀 때 factor를 어떻게 할지 정한다.
 * 사용자가 factor를 **손대지 않았으면**(= 이전 연도의 공식값 그대로면) 새 연도의 공식값으로 함께 옮긴다.
 * 직접 고친 값이면 건드리지 않는다 — 화면이 공식값과 다르다고 알린다.
 */
export function withAssumptionYear(
    assumptions: ScenarioAssumptions,
    nextYear: ScenarioAssumptions['default_value_year']
): ScenarioAssumptions {
    const untouched = Math.abs(assumptions.cbam_factor - officialCbamFactorForYear(assumptions.default_value_year)) < 1e-9;
    return {
        ...assumptions,
        default_value_year: nextYear,
        cbam_factor: untouched ? officialCbamFactorForYear(nextYear) : assumptions.cbam_factor,
    };
}

export interface ProductScenarioResult {
    /** Reporting period of the underlying result. Two periods give two rows for the same product. */
    period_name?: string;
    /** 이 결과를 낸 공정 — 사내 전구물질의 SEFA를 보내는 공정에서 찾을 때 쓴다 */
    process_id?: string;
    result_id: string;
    product_name: string;
    cn_code?: string;
    production_route?: string;
    output_mass_t: number;
    import_mass_t: number;
    actual_see: number;
    informational_total_see?: number;
    default_see?: number;
    default_see_raw?: number;
    default_markup_amount?: number;
    default_gap?: number;
    benchmark_column_a?: number;
    benchmark_column_b?: number;
    /** 고른 값의 5.3 표시 문자 — 예: 「(1)」, 「(C)」, 「(F)(2)」. 값이 하나뿐인 CN은 빈 문자열 */
    benchmark_column_a_indicator?: string;
    benchmark_column_b_indicator?: string;
    /** 경로를 정할 근거가 없어 여러 값 중 가장 높은 값을 골랐다(인증서가 줄어드는 쪽) */
    benchmark_column_a_ambiguous?: boolean;
    benchmark_column_b_ambiguous?: boolean;
    sefa_indicator?: number;
    /** 식 (2)·(3): 이 제품을 만드는 공정 몫 = CBAM factor × CSCF × Column A */
    sefa_process_indicator?: number;
    /** 식 (4)의 Σ mᵢ·SEFAᵢ — 구매 전구물질이 지니고 온 무상할당 몫 (tCO2e/t 제품) */
    sefa_precursor_indicator?: number;
    /** 전구물질별 내역. benchmark가 없으면 그 전구물질 몫은 0으로 두고 missing으로 알린다. */
    sefa_precursor_breakdown?: Array<{
        name: string;
        cn_code?: string;
        specific_mass: number;
        benchmark_column_b?: number;
        sefa?: number;
        /** SUPPLIER_VERIFIED = 3.3(1) 공급사 검증값 · COLUMN_B = 3.3(2) 기본 벤치마크 */
        /** INTERNAL = 사내 다른 공정에서 받은 전구물질 — 보내는 제품의 SEFA를 그대로 쓴다 */
        sefa_basis: 'SUPPLIER_VERIFIED' | 'COLUMN_B' | 'INTERNAL';
        /** INTERNAL일 때 보내는 공정 */
        source_process_id?: string;
        /** 공급사 값이 있지만 검증완료가 아니라 쓰지 않았다 */
        supplier_sefa_unverified?: boolean;
        benchmark_indicator: string;
        benchmark_ambiguous: boolean;
    }>;
    certificate_quantity_indicator?: number;
    certificate_cost_indicator_eur?: number;
    default_sefa_indicator?: number;
    default_certificate_quantity_indicator?: number;
    default_certificate_cost_indicator_eur?: number;
    gross_certificate_quantity_indicator?: number;
    gross_default_certificate_quantity_indicator?: number;
    paid_carbon_price_adjustment_tco2e_per_t?: number;
    default_paid_carbon_price_adjustment_tco2e_per_t?: number;
    certificate_quantity_delta_indicator?: number;
    certificate_cost_delta_eur?: number;
    lower_certificate_basis: 'ACTUAL' | 'DEFAULT' | 'TIE' | 'UNKNOWN';
    data_quality: 'READY' | 'MISSING_REFERENCE' | 'MISSING_CN';
    benchmark_matched: boolean;
    default_value_matched: boolean;
    origin_country: string;
    default_value_year: ScenarioAssumptions['default_value_year'];
    review_message: string;
}

export interface ScenarioRiskSummary {
    missing_cn_count: number;
    missing_official_reference_count: number;
    missing_reference_count: number;
    above_default_count: number;
    certificate_exposure_count: number;
    default_certificate_exposure_count: number;
    actual_lower_certificate_count: number;
    default_lower_certificate_count: number;
    equal_certificate_count: number;
    total_certificate_quantity_indicator: number;
    total_certificate_cost_indicator_eur: number;
    total_default_certificate_quantity_indicator: number;
    total_default_certificate_cost_indicator_eur: number;
    is_ready_for_review: boolean;
}

export interface ScenarioReviewAction {
    href: string;
    label: string;
}

export function summarizeScenarioRisks(scenarios: ProductScenarioResult[]): ScenarioRiskSummary {
    const missingCnCount = scenarios.filter((scenario) => scenario.data_quality === 'MISSING_CN').length;
    const missingOfficialReferenceCount = scenarios.filter((scenario) => scenario.data_quality === 'MISSING_REFERENCE').length;
    const totalCertificateQuantityIndicator = scenarios.reduce(
        (sum, scenario) => sum + (scenario.certificate_quantity_indicator ?? 0),
        0
    );
    const totalCertificateCostIndicatorEur = scenarios.reduce(
        (sum, scenario) => sum + (scenario.certificate_cost_indicator_eur ?? 0),
        0
    );
    const totalDefaultCertificateQuantityIndicator = scenarios.reduce(
        (sum, scenario) => sum + (scenario.default_certificate_quantity_indicator ?? 0),
        0
    );
    const totalDefaultCertificateCostIndicatorEur = scenarios.reduce(
        (sum, scenario) => sum + (scenario.default_certificate_cost_indicator_eur ?? 0),
        0
    );

    return {
        missing_cn_count: missingCnCount,
        missing_official_reference_count: missingOfficialReferenceCount,
        missing_reference_count: missingCnCount + missingOfficialReferenceCount,
        above_default_count: scenarios.filter((scenario) => (scenario.default_gap ?? 0) > 0).length,
        certificate_exposure_count: scenarios.filter((scenario) => (scenario.certificate_quantity_indicator ?? 0) > 0).length,
        default_certificate_exposure_count: scenarios.filter((scenario) => (scenario.default_certificate_quantity_indicator ?? 0) > 0).length,
        actual_lower_certificate_count: scenarios.filter((scenario) => scenario.lower_certificate_basis === 'ACTUAL').length,
        default_lower_certificate_count: scenarios.filter((scenario) => scenario.lower_certificate_basis === 'DEFAULT').length,
        equal_certificate_count: scenarios.filter((scenario) => scenario.lower_certificate_basis === 'TIE').length,
        total_certificate_quantity_indicator: totalCertificateQuantityIndicator,
        total_certificate_cost_indicator_eur: totalCertificateCostIndicatorEur,
        total_default_certificate_quantity_indicator: totalDefaultCertificateQuantityIndicator,
        total_default_certificate_cost_indicator_eur: totalDefaultCertificateCostIndicatorEur,
        is_ready_for_review: scenarios.length > 0 && missingCnCount === 0 && missingOfficialReferenceCount === 0,
    };
}

export function getScenarioReviewAction(
    scenarioRiskSummary: ScenarioRiskSummary,
    hasBenchmarkReference: boolean,
    hasDefaultValueReference: boolean
): ScenarioReviewAction {
    if (scenarioRiskSummary.missing_cn_count > 0) {
        return { href: '/products', label: '품목 관리' };
    }

    if (
        scenarioRiskSummary.missing_official_reference_count > 0 ||
        !hasBenchmarkReference ||
        !hasDefaultValueReference
    ) {
        return { href: '/upload', label: '기준자료 가져오기' };
    }

    return { href: '/scenarios', label: '시나리오 검토' };
}

export function calculateProductScenarios(
    results: LocalCalculationResult[],
    assumptions: ScenarioAssumptions,
    references: {
        benchmarks?: ImportedBenchmarkReference;
        defaultValues?: ImportedDefaultValueReference;
    }
): ProductScenarioResult[] {
    const reportable = results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
    // 사내 전구물질의 SEFA는 보내는 제품의 SEFA다. 그래서 상류 공정부터 계산한다: 보내는 공정의 값이 정해진
    // 결과만 계산하고, 나머지는 다음 바퀴로 넘긴다. 끝까지 정해지지 않는 것(순환, 보내는 공정이 신고 대상 아님)은
    // 그 몫을 0으로 두고 계산한다 — 값을 지어내지 않는다.
    const sefaByProcess = new Map<string, number>();
    const computeScenario = (result: LocalCalculationResult): ProductScenarioResult => {
        const cnCode = result.cn_code || result.hs_code;
        const actualSee = result.see_cbam_basis ?? 0;
        const informationalTotalSee = result.see_informational_total ?? result.total_see;
        const importMass = result.output_mass_t * assumptions.eu_import_share_percent / 100;

        if (!cnCode) {
            return {
                result_id: result.id,
                product_name: result.product_name,
                output_mass_t: result.output_mass_t,
                import_mass_t: importMass,
                actual_see: actualSee,
                informational_total_see: informationalTotalSee,
                lower_certificate_basis: 'UNKNOWN',
                data_quality: 'MISSING_CN',
                benchmark_matched: false,
                default_value_matched: false,
                origin_country: assumptions.origin_country,
                default_value_year: assumptions.default_value_year,
                review_message: 'CN 코드가 없어 공식 기준값과 비교할 수 없습니다.',
            };
        }

        // 5.3: 값이 여럿인 CN은 생산연도 (1)/(2)와 경로·등급 문자로 고른다.
        //   A열(실제 자료, 5.2) — 이 공정의 **실제** 경로. 글자에서 못 읽으면 원산국 기본 경로로 본다.
        //   B열(기본값, 5.1)    — 2025/2621이 **원산국에** 지정한 경로(기본값 워크북의 경로 열).
        const benchmarkPeriod = benchmarkPeriodForYear(assumptions.default_value_year);
        const originRouteLetters = defaultBenchmarkRouteLetters(references.defaultValues, assumptions.origin_country, cnCode);
        const actualRouteLetters = inferBenchmarkRouteLetters(result.production_route);
        const benchmark = selectBenchmarkValues(references.benchmarks, cnCode, {
            period: benchmarkPeriod,
            columnARouteLetters: actualRouteLetters.length > 0 ? actualRouteLetters : originRouteLetters,
            columnBRouteLetters: originRouteLetters,
        });
        const defaultValue = findDefaultValueReference(
            references.defaultValues,
            assumptions.origin_country,
            cnCode,
            assumptions.default_value_year
        );
        const defaultSee = defaultValue ? getDefaultValueTotalForYear(defaultValue, assumptions.default_value_year) : undefined;
        // 기본값(default)은 연도별 mark-up이 포함된 값이다. 원본(가산 전) total_default와 가산액을 분리해 노출한다.
        const defaultSeeRaw = defaultValue?.total_default;
        const defaultMarkupAmount =
            defaultSee !== undefined && defaultSeeRaw !== undefined ? defaultSee - defaultSeeRaw : undefined;
        const defaultGap = defaultSee === undefined ? undefined : actualSee - defaultSee;
        const benchmarkColumnA = benchmark?.column_a;
        const benchmarkColumnB = benchmark?.column_b;
        // ── 실측 SEFA = 공정 몫 + 전구물질 몫 ─────────────────────────────────────
        // Implementing Regulation (EU) 2025/2620 부속서:
        //   식 (2)·(3)  SFAProc = CBAM_y · CSCF_y · BM*_g   (BM* = 제5항 **A열**, 「공정 관련」 벤치마크)
        //   식 (4)      SEFA_g  = SFAProc_g + Σ mᵢ · SEFAᵢ   (복합제품 — 전구물질 몫을 **더한다**)
        //   식 (5)      mᵢ = Mᵢ / AL                          (제품 1 t당 전구물질 투입량)
        //   3.3(2)      생산자가 SEFAᵢ를 주지 않으면 전구물질의 **B열** 벤치마크로 정한다.
        // 종전에는 A열(공정 몫 — 나사 0.038)만 빼고 전구물질 몫을 빠뜨렸다. 기본값 쪽은 B열(상류 누적 —
        // 1.154)을 빼므로, 실측 SEE가 더 낮아도 「기본값이 유리」라는 결론이 나왔다(씨밤이 run11 P0 후보).
        //   3.3(1)      생산자가 준 SEFAᵢ가 **검증됐으면** 그 값을 쓴다. SEFAᵢ는 CBAM_y·CSCF_y가 이미 반영된
        //               최종값(tCO₂e / 전구물질 t)이므로 계수를 다시 곱하지 않는다. 미검증 값은 쓰지 않는다.
        const sefaProcessIndicator = benchmarkColumnA === undefined
            ? undefined
            : benchmarkColumnA * assumptions.cbam_factor * assumptions.cscf;
        const precursorBreakdown = (result.precursor_inputs ?? []).map((input) => {
            const specificMass = result.output_mass_t > 0 ? input.mass_t / result.output_mass_t : 0;
            // 3.3(2)(a)·(d): 전구물질의 B열은 **그 전구물질의 원산국**에 지정된 경로로 고른다.
            const precursorSelection = input.cn_code
                ? selectBenchmarkValues(references.benchmarks, input.cn_code, {
                    period: benchmarkPeriod,
                    columnBRouteLetters: defaultBenchmarkRouteLetters(references.defaultValues, input.supplier_country, input.cn_code),
                })
                : undefined;
            const precursorBenchmark = precursorSelection?.column_b;
            const precursorBenchmarkMeta = {
                benchmark_indicator: precursorSelection?.column_b_indicator ?? '',
                benchmark_ambiguous: precursorSelection?.column_b_ambiguous ?? false,
            };
            const supplierSefa = Number.isFinite(input.supplier_sefa_tco2e_per_t) && (input.supplier_sefa_tco2e_per_t ?? -1) >= 0
                ? input.supplier_sefa_tco2e_per_t
                : undefined;
            if (supplierSefa !== undefined && input.verification_status === 'VERIFIED') {
                return {
                    name: input.name,
                    cn_code: input.cn_code,
                    specific_mass: specificMass,
                    benchmark_column_b: precursorBenchmark,
                    sefa: specificMass * supplierSefa,
                    sefa_basis: 'SUPPLIER_VERIFIED' as const,
                    benchmark_indicator: '',
                    benchmark_ambiguous: false,
                };
            }
            return {
                name: input.name,
                cn_code: input.cn_code,
                specific_mass: specificMass,
                benchmark_column_b: precursorBenchmark,
                sefa: precursorBenchmark === undefined
                    ? undefined
                    : specificMass * precursorBenchmark * assumptions.cbam_factor * assumptions.cscf,
                sefa_basis: 'COLUMN_B' as const,
                supplier_sefa_unverified: supplierSefa !== undefined,
                ...precursorBenchmarkMeta,
            };
        });
        // 사내 전구물질(2025/2547 부속서 III)의 SEFAᵢ는 B열 기본값이 아니라 **보내는 제품의 SEFA**다 — 같은 사업장, 같은 검증 범위의
        // 실제 자료이므로 2025/2620 부속서 3.3(1)에 해당한다. 보내는 쪽 값은 아래 2차 패스에서 채운다(상류부터 정해져야 한다).
        const internalBreakdown = (result.internal_precursor_inputs ?? []).map((input) => ({
            name: `사내: ${input.source_process_name}`,
            cn_code: input.source_cn_code,
            specific_mass: result.output_mass_t > 0 ? input.mass_t / result.output_mass_t : 0,
            benchmark_column_b: undefined,
            sefa: sefaByProcess.has(input.source_process_id)
                ? (result.output_mass_t > 0 ? input.mass_t / result.output_mass_t : 0) * (sefaByProcess.get(input.source_process_id) ?? 0)
                : undefined,
            sefa_basis: 'INTERNAL' as const,
            benchmark_indicator: '',
            benchmark_ambiguous: false,
            source_process_id: input.source_process_id,
        }));
        const sefaPrecursorIndicator = [...precursorBreakdown, ...internalBreakdown].reduce((sum, item) => sum + (item.sefa ?? 0), 0);
        const sefaIndicator = sefaProcessIndicator === undefined
            ? undefined
            : sefaProcessIndicator + sefaPrecursorIndicator;
        const defaultSefaIndicator = benchmarkColumnB === undefined
            ? undefined
            : benchmarkColumnB * assumptions.cbam_factor * assumptions.cscf;
        const paidCarbonPriceAdjustment = assumptions.certificate_price_eur > 0
            ? assumptions.paid_carbon_price_eur_per_tco2e * actualSee / assumptions.certificate_price_eur
            : 0;
        const defaultPaidCarbonPriceAdjustment = defaultSee !== undefined && assumptions.certificate_price_eur > 0
            ? assumptions.paid_carbon_price_eur_per_tco2e * defaultSee / assumptions.certificate_price_eur
            : undefined;
        const grossCertificateQuantityIndicator = sefaIndicator === undefined
            ? undefined
            : Math.max(0, (actualSee - sefaIndicator) * importMass);
        const certificateQuantityIndicator = sefaIndicator === undefined
            ? undefined
            : Math.max(0, (actualSee - sefaIndicator - paidCarbonPriceAdjustment) * importMass);
        const certificateCostIndicator = certificateQuantityIndicator === undefined
            ? undefined
            : certificateQuantityIndicator * assumptions.certificate_price_eur;
        const grossDefaultCertificateQuantityIndicator = defaultSee === undefined || defaultSefaIndicator === undefined
            ? undefined
            : Math.max(0, (defaultSee - defaultSefaIndicator) * importMass);
        const defaultCertificateQuantityIndicator = defaultSee === undefined || defaultSefaIndicator === undefined
            ? undefined
            : Math.max(0, (defaultSee - defaultSefaIndicator - (defaultPaidCarbonPriceAdjustment ?? 0)) * importMass);
        const defaultCertificateCostIndicator = defaultCertificateQuantityIndicator === undefined
            ? undefined
            : defaultCertificateQuantityIndicator * assumptions.certificate_price_eur;
        const certificateQuantityDelta = certificateQuantityIndicator === undefined || defaultCertificateQuantityIndicator === undefined
            ? undefined
            : certificateQuantityIndicator - defaultCertificateQuantityIndicator;
        const certificateCostDelta = certificateCostIndicator === undefined || defaultCertificateCostIndicator === undefined
            ? undefined
            : certificateCostIndicator - defaultCertificateCostIndicator;
        const lowerCertificateBasis =
            certificateCostDelta === undefined
                ? 'UNKNOWN'
                : Math.abs(certificateCostDelta) < 0.0000001
                    ? 'TIE'
                    : certificateCostDelta < 0
                        ? 'ACTUAL'
                        : 'DEFAULT';

        return {
            result_id: result.id,
            product_name: result.product_name,
            period_name: result.period_name,
            cn_code: cnCode,
            production_route: result.production_route,
            output_mass_t: result.output_mass_t,
            import_mass_t: importMass,
            actual_see: actualSee,
            informational_total_see: informationalTotalSee,
            default_see: defaultSee,
            default_see_raw: defaultSeeRaw,
            default_markup_amount: defaultMarkupAmount,
            default_gap: defaultGap,
            benchmark_column_a: benchmarkColumnA,
            benchmark_column_b: benchmarkColumnB,
            benchmark_column_a_indicator: benchmark?.column_a_indicator,
            benchmark_column_b_indicator: benchmark?.column_b_indicator,
            benchmark_column_a_ambiguous: benchmark?.column_a_ambiguous,
            benchmark_column_b_ambiguous: benchmark?.column_b_ambiguous,
            sefa_indicator: sefaIndicator,
            sefa_process_indicator: sefaProcessIndicator,
            sefa_precursor_indicator: sefaPrecursorIndicator,
            sefa_precursor_breakdown: [...precursorBreakdown, ...internalBreakdown],
            process_id: result.process_id,
            certificate_quantity_indicator: certificateQuantityIndicator,
            certificate_cost_indicator_eur: certificateCostIndicator,
            default_sefa_indicator: defaultSefaIndicator,
            default_certificate_quantity_indicator: defaultCertificateQuantityIndicator,
            default_certificate_cost_indicator_eur: defaultCertificateCostIndicator,
            gross_certificate_quantity_indicator: grossCertificateQuantityIndicator,
            gross_default_certificate_quantity_indicator: grossDefaultCertificateQuantityIndicator,
            paid_carbon_price_adjustment_tco2e_per_t: paidCarbonPriceAdjustment,
            default_paid_carbon_price_adjustment_tco2e_per_t: defaultPaidCarbonPriceAdjustment,
            certificate_quantity_delta_indicator: certificateQuantityDelta,
            certificate_cost_delta_eur: certificateCostDelta,
            lower_certificate_basis: lowerCertificateBasis,
            data_quality: benchmark && defaultValue ? 'READY' : 'MISSING_REFERENCE',
            benchmark_matched: Boolean(benchmark),
            default_value_matched: Boolean(defaultValue),
            origin_country: assumptions.origin_country,
            default_value_year: assumptions.default_value_year,
            review_message: benchmark && defaultValue
                ? defaultGap !== undefined && defaultGap > 0
                    ? '실측 SEE가 기본값보다 높습니다. 실제자료와 기본값 시나리오의 인증서 지표를 비교하세요.'
                    : '공식 기준값과 연결되었습니다. 실제자료/기본값 SEFA 및 인증서 지표를 검토하세요.'
                : '벤치마크 또는 국가/CN 기본값 연결이 필요합니다.',
        };
    };

    const done = new Map<string, ProductScenarioResult>();
    const reportableProcessIds = new Set(reportable.map((result) => result.process_id));
    let pending = reportable;
    while (pending.length > 0) {
        const waiting: LocalCalculationResult[] = [];
        for (const result of pending) {
            const senders = (result.internal_precursor_inputs ?? []).map((input) => input.source_process_id);
            const ready = senders.every((id) => sefaByProcess.has(id) || !reportableProcessIds.has(id));
            if (!ready) {
                waiting.push(result);
                continue;
            }
            const scenario = computeScenario(result);
            done.set(result.id, scenario);
            if (scenario.sefa_indicator !== undefined && !sefaByProcess.has(result.process_id)) {
                sefaByProcess.set(result.process_id, scenario.sefa_indicator);
            }
        }
        if (waiting.length === pending.length) {
            // 더 풀리지 않는다(순환). 남은 것은 사내 몫 없이 계산한다.
            for (const result of waiting) done.set(result.id, computeScenario(result));
            break;
        }
        pending = waiting;
    }
    return reportable.map((result) => done.get(result.id) as ProductScenarioResult);
}
