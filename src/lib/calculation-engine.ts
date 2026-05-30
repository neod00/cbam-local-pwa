import type { Product, ProductOutputLine, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';

export type ActivityData = Record<string, number>;

export interface CalcInput {
    output_mass_t: number;
    electricity_mwh: number;
    electricity_ef: number; // tCO2e/MWh
    fuel_usage: {
        amount: number;
        unit: string;
        ef: number; // tCO2e/unit
    }[];
    precursors: {
        see: number;
        share: number;
    }[];
    input_mass_t?: number;
}

export interface CalcResult {
    direct_see: number;
    indirect_see: number;
    precursor_see: number;
    total_see: number;
    yield_ratio?: number;
}

export interface LocalCalculationResult {
    id: string;
    period_id?: string;
    period_name?: string;
    process_id: string;
    process_name: string;
    product_output_line_id?: string;
    allocation_basis: ProductOutputLine['allocation_basis'] | 'PROCESS_TOTAL';
    allocation_share: number;
    product_id?: string;
    product_name: string;
    hs_code?: string;
    cn_code?: string;
    production_route: string;
    output_mass_t: number;
    direct_emissions_tco2e: number;
    indirect_emissions_applicable: boolean;
    indirect_emissions_rule: string;
    indirect_emissions_excluded_tco2e: number;
    source_stream_count: number;
    source_stream_emissions_tco2e: number;
    source_stream_energy_tj: number;
    source_stream_delta_tco2e: number;
    direct_see: number;
    indirect_see: number;
    precursor_see: number;
    total_see: number;
    warnings: string[];
    warningDetails: LocalCalculationWarning[];
}

export type LocalCalculationWarning = {
    message: string;
    target: {
        type: 'process' | 'precursor';
        id: string;
    };
};

export function calculateEmission(input: CalcInput): CalcResult {
    const { output_mass_t, electricity_mwh, electricity_ef, fuel_usage, precursors, input_mass_t } = input;

    if (output_mass_t <= 0) {
        throw new Error('Output mass must be greater than 0');
    }

    // 1. Indirect (Electricity)
    // Emission = (MWh * EF)
    // SEE = Emission / Output
    const indirect_emission = electricity_mwh * electricity_ef;
    const indirect_see = indirect_emission / output_mass_t;

    // 2. Direct (Fuel)
    let direct_emission = 0;
    for (const fuel of fuel_usage) {
        direct_emission += fuel.amount * fuel.ef;
    }
    const direct_see = direct_emission / output_mass_t;

    // 3. Precursors
    // SEE = Sum(PrecursorSEE * Share)
    // Note: Share is usually mass_of_precursor / mass_of_product ?? 
    // Wait, PRD says: "precursor SEE x 질량비" 
    // If share_by_mass is defined as (Mass Precursor / Mass Product), then simply sum them.
    let precursor_see = 0;
    for (const p of precursors) {
        precursor_see += p.see * p.share;
    }

    // 4. Yield (Optional)
    let yield_ratio = undefined;
    if (input_mass_t && input_mass_t > 0) {
        yield_ratio = output_mass_t / input_mass_t;
    }

    const total_see = direct_see + indirect_see + precursor_see;

    return {
        direct_see,
        indirect_see,
        precursor_see,
        total_see,
        yield_ratio
    };
}

export function calculateLocalResults(input: {
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    products: Product[];
    periods: ReportingPeriod[];
    sourceStreams?: SourceStream[];
    productOutputLines?: ProductOutputLine[];
}): LocalCalculationResult[] {
    const productById = new Map(input.products.map((product) => [product.id, product]));
    const periodById = new Map(input.periods.map((period) => [period.id, period]));
    const precursorsByProcess = new Map<string, PurchasedPrecursor[]>();
    const sourceStreamsByProcess = new Map<string, SourceStream[]>();
    const outputLinesByProcess = new Map<string, ProductOutputLine[]>();

    for (const precursor of input.precursors) {
        if (!precursor.process_id) {
            continue;
        }

        const group = precursorsByProcess.get(precursor.process_id) ?? [];
        group.push(precursor);
        precursorsByProcess.set(precursor.process_id, group);
    }

    for (const sourceStream of input.sourceStreams ?? []) {
        if (!sourceStream.process_id) {
            continue;
        }

        const group = sourceStreamsByProcess.get(sourceStream.process_id) ?? [];
        group.push(sourceStream);
        sourceStreamsByProcess.set(sourceStream.process_id, group);
    }

    for (const outputLine of input.productOutputLines ?? []) {
        if (!outputLine.process_id) {
            continue;
        }

        const group = outputLinesByProcess.get(outputLine.process_id) ?? [];
        group.push(outputLine);
        outputLinesByProcess.set(outputLine.process_id, group);
    }

    return input.processes.flatMap<LocalCalculationResult>((process) => {
        const warnings: string[] = [];
        const warningDetails: LocalCalculationWarning[] = [];
        const product = process.product_id ? productById.get(process.product_id) : undefined;
        const period = process.period_id ? periodById.get(process.period_id) : undefined;
        const processPrecursors = precursorsByProcess.get(process.id) ?? [];
        const processSourceStreams = sourceStreamsByProcess.get(process.id) ?? [];
        const addWarning = (message: string, target: LocalCalculationWarning['target']) => {
            warnings.push(message);
            warningDetails.push({ message, target });
        };

        if (process.output_mass_t <= 0) {
            addWarning('생산량이 0 이하입니다. SEE 산정이 제한됩니다.', { type: 'process', id: process.id });
        }

        if (!process.product_id) {
            addWarning('연결 제품이 지정되지 않았습니다.', { type: 'process', id: process.id });
        }

        if (!process.period_id) {
            addWarning('보고기간이 지정되지 않았습니다.', { type: 'process', id: process.id });
        }

        const output = process.output_mass_t > 0 ? process.output_mass_t : 0;
        const directEmissions = process.direct_attributable_emissions_tco2e;
        const sourceStreamEmissions = processSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream),
            0
        );
        const sourceStreamEnergy = processSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEnergyBreakdown(sourceStream).total,
            0
        );
        const sourceStreamDelta = sourceStreamEmissions - directEmissions;
        const grossIndirectEmissions = process.electricity_mwh * process.electricity_ef_tco2e_per_mwh;
        const processIndirectApplicability = getIndirectEmissionsApplicability(product);
        const indirectEmissions = processIndirectApplicability.applicable ? grossIndirectEmissions : 0;
        const indirectEmissionsExcluded = processIndirectApplicability.applicable ? 0 : grossIndirectEmissions;
        const precursorEmissions = processPrecursors.reduce((sum, precursor) => {
            const precursorSee =
                precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;
            return sum + precursor.consumed_mass_t * precursorSee;
        }, 0);

        for (const precursor of processPrecursors) {
            if (precursor.consumed_mass_t > process.output_mass_t && process.output_mass_t > 0) {
                addWarning(`${precursor.name} 소비량이 공정 생산량보다 큽니다.`, { type: 'precursor', id: precursor.id });
            }

            if (!precursor.source) {
                addWarning(`${precursor.name}의 SEE 출처가 비어 있습니다.`, { type: 'precursor', id: precursor.id });
            }
        }

        if (processSourceStreams.length > 0 && Math.abs(sourceStreamDelta) > Math.max(0.01, directEmissions * 0.01)) {
            addWarning(`배출원 자료 합계와 공정 직접배출량 입력값이 ${sourceStreamDelta.toFixed(4)} tCO2e 차이납니다.`, { type: 'process', id: process.id });
        }

        const direct_see = output > 0 ? directEmissions / output : 0;
        const indirect_see = output > 0 ? indirectEmissions / output : 0;
        const precursor_see = output > 0 ? precursorEmissions / output : 0;
        const total_see = direct_see + indirect_see + precursor_see;
        const outputLines = outputLinesByProcess.get(process.id) ?? [];
        const validOutputLines = outputLines.filter((line) => line.output_mass_t > 0);
        const massTotal = validOutputLines.reduce((sum, line) => sum + line.output_mass_t, 0);
        const manualTotal = validOutputLines.reduce(
            (sum, line) => sum + (line.allocation_basis === 'MANUAL' ? line.manual_allocation_percent : 0),
            0
        );

        if (validOutputLines.length === 0) {
            return [{
                id: `result_${process.id}`,
                period_id: process.period_id,
                period_name: period?.name,
                process_id: process.id,
                process_name: process.name,
                allocation_basis: 'PROCESS_TOTAL',
                allocation_share: 1,
                product_id: process.product_id,
                product_name: product?.name ?? '미지정 제품',
                hs_code: product?.hs_code,
                cn_code: product?.cn_code,
                production_route: process.production_route,
                output_mass_t: process.output_mass_t,
                direct_emissions_tco2e: directEmissions,
                indirect_emissions_applicable: processIndirectApplicability.applicable,
                indirect_emissions_rule: processIndirectApplicability.rule_code,
                indirect_emissions_excluded_tco2e: indirectEmissionsExcluded,
                source_stream_count: processSourceStreams.length,
                source_stream_emissions_tco2e: sourceStreamEmissions,
                source_stream_energy_tj: sourceStreamEnergy,
                source_stream_delta_tco2e: sourceStreamDelta,
                direct_see,
                indirect_see,
                precursor_see,
                total_see,
                warnings,
                warningDetails,
            }];
        }

        const lineResults = validOutputLines.map((line) => {
            const lineProduct = line.product_id ? productById.get(line.product_id) : product;
            const allocationShare = line.allocation_basis === 'MANUAL'
                ? (manualTotal > 0 ? line.manual_allocation_percent / manualTotal : 0)
                : (massTotal > 0 ? line.output_mass_t / massTotal : 0);
            const lineIndirectApplicability = getIndirectEmissionsApplicability(lineProduct);
            const lineGrossIndirectEmissions = grossIndirectEmissions * allocationShare;
            const allocatedIndirectEmissions = lineIndirectApplicability.applicable ? lineGrossIndirectEmissions : 0;
            const allocatedExcludedIndirectEmissions = lineIndirectApplicability.applicable ? 0 : lineGrossIndirectEmissions;
            const allocatedDirectEmissions = directEmissions * allocationShare;
            const allocatedPrecursorEmissions = precursorEmissions * allocationShare;

            return {
                id: `result_${process.id}_${line.id}`,
                period_id: process.period_id,
                period_name: period?.name,
                process_id: process.id,
                process_name: process.name,
                product_output_line_id: line.id,
                allocation_basis: line.allocation_basis,
                allocation_share: allocationShare,
                product_id: line.product_id ?? process.product_id,
                product_name: lineProduct?.name ?? line.name,
                hs_code: lineProduct?.hs_code,
                cn_code: lineProduct?.cn_code,
                production_route: process.production_route,
                output_mass_t: line.output_mass_t,
                direct_emissions_tco2e: allocatedDirectEmissions,
                indirect_emissions_applicable: lineIndirectApplicability.applicable,
                indirect_emissions_rule: lineIndirectApplicability.rule_code,
                indirect_emissions_excluded_tco2e: allocatedExcludedIndirectEmissions,
                source_stream_count: processSourceStreams.length,
                source_stream_emissions_tco2e: sourceStreamEmissions * allocationShare,
                source_stream_energy_tj: sourceStreamEnergy * allocationShare,
                source_stream_delta_tco2e: sourceStreamDelta * allocationShare,
                direct_see: line.output_mass_t > 0 ? allocatedDirectEmissions / line.output_mass_t : 0,
                indirect_see: line.output_mass_t > 0 ? allocatedIndirectEmissions / line.output_mass_t : 0,
                precursor_see: line.output_mass_t > 0 ? allocatedPrecursorEmissions / line.output_mass_t : 0,
                total_see: line.output_mass_t > 0
                    ? (allocatedDirectEmissions + allocatedIndirectEmissions + allocatedPrecursorEmissions) / line.output_mass_t
                    : 0,
                warnings,
                warningDetails,
            };
        });

        const outputLineTotal = validOutputLines.reduce((sum, line) => sum + line.output_mass_t, 0);
        if (Math.abs(outputLineTotal - process.output_mass_t) > Math.max(0.01, process.output_mass_t * 0.01)) {
            for (const result of lineResults) {
                result.warnings = [...result.warnings, `제품 생산라인 합계가 공정 총 생산량과 ${Math.abs(outputLineTotal - process.output_mass_t).toFixed(4)} t 차이납니다.`];
                result.warningDetails = [...result.warningDetails, {
                    message: `제품 생산라인 합계가 공정 총 생산량과 ${Math.abs(outputLineTotal - process.output_mass_t).toFixed(4)} t 차이납니다.`,
                    target: { type: 'process', id: process.id },
                }];
            }
        }

        return lineResults;
    });
}
