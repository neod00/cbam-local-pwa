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
}

export const DEFAULT_SCENARIO_ASSUMPTIONS: ScenarioAssumptions = {
    origin_country: 'South Korea',
    default_value_year: '2026',
    cbam_factor: 0.975,
    cscf: 1,
    certificate_price_eur: 80,
};

export const SCENARIO_ASSUMPTIONS_SETTING_KEY = 'scenario:assumptions';
export const CERTIFICATE_INDICATOR_NOTICE =
    '현재 인증서 비용 지표는 입력한 인증서 가격을 곱한 검토용 지표이며, 이미 납부한 탄소가격 공제는 공식 산식 확인 전까지 반영하지 않습니다.';

export function normalizeScenarioAssumptions(value: Partial<ScenarioAssumptions> | undefined): ScenarioAssumptions {
    const cbamFactor = value?.cbam_factor;
    const cscf = value?.cscf;
    const certificatePriceEur = value?.certificate_price_eur;

    return {
        origin_country: value?.origin_country || DEFAULT_SCENARIO_ASSUMPTIONS.origin_country,
        default_value_year: value?.default_value_year || DEFAULT_SCENARIO_ASSUMPTIONS.default_value_year,
        cbam_factor: Number.isFinite(cbamFactor) ? cbamFactor as number : DEFAULT_SCENARIO_ASSUMPTIONS.cbam_factor,
        cscf: Number.isFinite(cscf) ? cscf as number : DEFAULT_SCENARIO_ASSUMPTIONS.cscf,
        certificate_price_eur: Number.isFinite(certificatePriceEur)
            ? certificatePriceEur as number
            : DEFAULT_SCENARIO_ASSUMPTIONS.certificate_price_eur,
    };
}

export interface ProductScenarioResult {
    result_id: string;
    product_name: string;
    cn_code?: string;
    output_mass_t: number;
    actual_see: number;
    informational_total_see?: number;
    default_see?: number;
    default_gap?: number;
    benchmark_column_a?: number;
    benchmark_column_b?: number;
    sefa_indicator?: number;
    certificate_quantity_indicator?: number;
    certificate_cost_indicator_eur?: number;
    default_sefa_indicator?: number;
    default_certificate_quantity_indicator?: number;
    default_certificate_cost_indicator_eur?: number;
    certificate_quantity_delta_indicator?: number;
    certificate_cost_delta_eur?: number;
    lower_certificate_basis: 'ACTUAL' | 'DEFAULT' | 'TIE' | 'UNKNOWN';
    data_quality: 'READY' | 'MISSING_REFERENCE' | 'MISSING_CN';
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

        if (!cnCode) {
            return {
                result_id: result.id,
                product_name: result.product_name,
                output_mass_t: result.output_mass_t,
                actual_see: actualSee,
                informational_total_see: informationalTotalSee,
                lower_certificate_basis: 'UNKNOWN',
                data_quality: 'MISSING_CN',
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
        const defaultGap = defaultSee === undefined ? undefined : actualSee - defaultSee;
        const benchmarkColumnA = benchmark?.column_a_benchmark;
        const benchmarkColumnB = benchmark?.column_b_benchmark;
        const sefaIndicator = benchmarkColumnA === undefined
            ? undefined
            : benchmarkColumnA * assumptions.cbam_factor * assumptions.cscf;
        const defaultSefaIndicator = benchmarkColumnB === undefined
            ? undefined
            : benchmarkColumnB * assumptions.cbam_factor * assumptions.cscf;
        const certificateQuantityIndicator = sefaIndicator === undefined
            ? undefined
            : Math.max(0, (actualSee - sefaIndicator) * result.output_mass_t);
        const certificateCostIndicator = certificateQuantityIndicator === undefined
            ? undefined
            : certificateQuantityIndicator * assumptions.certificate_price_eur;
        const defaultCertificateQuantityIndicator = defaultSee === undefined || defaultSefaIndicator === undefined
            ? undefined
            : Math.max(0, (defaultSee - defaultSefaIndicator) * result.output_mass_t);
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
            output_mass_t: result.output_mass_t,
            actual_see: actualSee,
            informational_total_see: informationalTotalSee,
            default_see: defaultSee,
            default_gap: defaultGap,
            benchmark_column_a: benchmarkColumnA,
            benchmark_column_b: benchmarkColumnB,
            sefa_indicator: sefaIndicator,
            certificate_quantity_indicator: certificateQuantityIndicator,
            certificate_cost_indicator_eur: certificateCostIndicator,
            default_sefa_indicator: defaultSefaIndicator,
            default_certificate_quantity_indicator: defaultCertificateQuantityIndicator,
            default_certificate_cost_indicator_eur: defaultCertificateCostIndicator,
            certificate_quantity_delta_indicator: certificateQuantityDelta,
            certificate_cost_delta_eur: certificateCostDelta,
            lower_certificate_basis: lowerCertificateBasis,
            data_quality: benchmark && defaultValue ? 'READY' : 'MISSING_REFERENCE',
            review_message: benchmark && defaultValue
                ? defaultGap !== undefined && defaultGap > 0
                    ? '실측 SEE가 기본값보다 높습니다. 실제자료와 기본값 시나리오의 인증서 지표를 비교하세요.'
                    : '공식 기준값과 연결되었습니다. 실제자료/기본값 SEFA 및 인증서 지표를 검토하세요.'
                : '벤치마크 또는 국가/CN 기본값 연결이 필요합니다.',
        };
    });
}
