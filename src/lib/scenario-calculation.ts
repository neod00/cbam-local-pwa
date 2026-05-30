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

export interface ProductScenarioResult {
    result_id: string;
    product_name: string;
    cn_code?: string;
    output_mass_t: number;
    actual_see: number;
    default_see?: number;
    benchmark_column_a?: number;
    benchmark_column_b?: number;
    sefa_indicator?: number;
    certificate_quantity_indicator?: number;
    certificate_cost_indicator_eur?: number;
    data_quality: 'READY' | 'MISSING_REFERENCE' | 'MISSING_CN';
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
            benchmark_column_a: benchmarkColumnA,
            benchmark_column_b: benchmarkColumnB,
            sefa_indicator: sefaIndicator,
            certificate_quantity_indicator: certificateQuantityIndicator,
            certificate_cost_indicator_eur: certificateCostIndicator,
            data_quality: benchmark && defaultValue ? 'READY' : 'MISSING_REFERENCE',
        };
    });
}
