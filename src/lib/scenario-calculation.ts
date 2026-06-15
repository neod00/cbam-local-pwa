import type { LocalCalculationResult } from './calculation-engine';
import {
    findBenchmarkReference,
    findDefaultValueReference,
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

export interface ProductScenarioResult {
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
    sefa_indicator?: number;
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
    return results.map((result) => {
        const cnCode = result.cn_code || result.hs_code;
        const actualSee = result.see_cbam_basis ?? result.total_see;
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

        const benchmark = findBenchmarkReference(references.benchmarks, cnCode, result.production_route);
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
        const benchmarkColumnA = benchmark?.column_a_benchmark;
        const benchmarkColumnB = benchmark?.column_b_benchmark;
        const sefaIndicator = benchmarkColumnA === undefined
            ? undefined
            : benchmarkColumnA * assumptions.cbam_factor * assumptions.cscf;
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
            sefa_indicator: sefaIndicator,
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
    });
}
