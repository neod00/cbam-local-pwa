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

export interface ProductScenarioResult {
    result_id: string;
    product_name: string;
    cn_code?: string;
    output_mass_t: number;
    actual_see: number;
    default_see?: number;
    default_gap?: number;
    benchmark_column_a?: number;
    benchmark_column_b?: number;
    sefa_indicator?: number;
    certificate_quantity_indicator?: number;
    certificate_cost_indicator_eur?: number;
    data_quality: 'READY' | 'MISSING_REFERENCE' | 'MISSING_CN';
    review_message: string;
}

export interface ScenarioRiskSummary {
    missing_cn_count: number;
    missing_official_reference_count: number;
    missing_reference_count: number;
    above_default_count: number;
    certificate_exposure_count: number;
    total_certificate_quantity_indicator: number;
    total_certificate_cost_indicator_eur: number;
    is_ready_for_review: boolean;
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

    return {
        missing_cn_count: missingCnCount,
        missing_official_reference_count: missingOfficialReferenceCount,
        missing_reference_count: missingCnCount + missingOfficialReferenceCount,
        above_default_count: scenarios.filter((scenario) => (scenario.default_gap ?? 0) > 0).length,
        certificate_exposure_count: scenarios.filter((scenario) => (scenario.certificate_quantity_indicator ?? 0) > 0).length,
        total_certificate_quantity_indicator: totalCertificateQuantityIndicator,
        total_certificate_cost_indicator_eur: totalCertificateCostIndicatorEur,
        is_ready_for_review: scenarios.length > 0 && missingCnCount === 0 && missingOfficialReferenceCount === 0,
    };
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

        if (!cnCode) {
            return {
                result_id: result.id,
                product_name: result.product_name,
                output_mass_t: result.output_mass_t,
                actual_see: result.total_see,
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
        const defaultGap = defaultSee === undefined ? undefined : result.total_see - defaultSee;
        const benchmarkColumnA = benchmark?.column_a_benchmark;
        const benchmarkColumnB = benchmark?.column_b_benchmark;
        const sefaIndicator = benchmarkColumnA === undefined
            ? undefined
            : benchmarkColumnA * assumptions.cbam_factor * assumptions.cscf;
        const certificateQuantityIndicator = sefaIndicator === undefined
            ? undefined
            : Math.max(0, (result.total_see - sefaIndicator) * result.output_mass_t);
        const certificateCostIndicator = certificateQuantityIndicator === undefined
            ? undefined
            : certificateQuantityIndicator * assumptions.certificate_price_eur;

        return {
            result_id: result.id,
            product_name: result.product_name,
            cn_code: cnCode,
            output_mass_t: result.output_mass_t,
            actual_see: result.total_see,
            default_see: defaultSee,
            default_gap: defaultGap,
            benchmark_column_a: benchmarkColumnA,
            benchmark_column_b: benchmarkColumnB,
            sefa_indicator: sefaIndicator,
            certificate_quantity_indicator: certificateQuantityIndicator,
            certificate_cost_indicator_eur: certificateCostIndicator,
            data_quality: benchmark && defaultValue ? 'READY' : 'MISSING_REFERENCE',
            review_message: benchmark && defaultValue
                ? defaultGap !== undefined && defaultGap > 0
                    ? '실측 SEE가 기본값보다 높습니다. 기본값/공급망 자료 전략을 비교하세요.'
                    : '공식 기준값과 연결되었습니다. SEFA 및 인증서 지표를 검토하세요.'
                : '벤치마크 또는 국가/CN 기본값 연결이 필요합니다.',
        };
    });
}
