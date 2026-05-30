import type { Product, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';

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
    product_id?: string;
    product_name: string;
    hs_code?: string;
    cn_code?: string;
    production_route: string;
    output_mass_t: number;
    direct_emissions_tco2e: number;
    source_stream_count: number;
    source_stream_emissions_tco2e: number;
    source_stream_energy_tj: number;
    source_stream_delta_tco2e: number;
    direct_see: number;
    indirect_see: number;
    precursor_see: number;
    total_see: number;
    warnings: string[];
}

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
}): LocalCalculationResult[] {
    const productById = new Map(input.products.map((product) => [product.id, product]));
    const periodById = new Map(input.periods.map((period) => [period.id, period]));
    const precursorsByProcess = new Map<string, PurchasedPrecursor[]>();
    const sourceStreamsByProcess = new Map<string, SourceStream[]>();

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

    return input.processes.map((process) => {
        const warnings: string[] = [];
        const product = process.product_id ? productById.get(process.product_id) : undefined;
        const period = process.period_id ? periodById.get(process.period_id) : undefined;
        const processPrecursors = precursorsByProcess.get(process.id) ?? [];
        const processSourceStreams = sourceStreamsByProcess.get(process.id) ?? [];

        if (process.output_mass_t <= 0) {
            warnings.push('생산량이 0 이하입니다. SEE 산정이 제한됩니다.');
        }

        if (!process.product_id) {
            warnings.push('연결 제품이 지정되지 않았습니다.');
        }

        if (!process.period_id) {
            warnings.push('보고기간이 지정되지 않았습니다.');
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
        const indirectEmissions = process.electricity_mwh * process.electricity_ef_tco2e_per_mwh;
        const precursorEmissions = processPrecursors.reduce((sum, precursor) => {
            const precursorSee =
                precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;
            return sum + precursor.consumed_mass_t * precursorSee;
        }, 0);

        for (const precursor of processPrecursors) {
            if (precursor.consumed_mass_t > process.output_mass_t && process.output_mass_t > 0) {
                warnings.push(`${precursor.name} 소비량이 공정 생산량보다 큽니다.`);
            }

            if (!precursor.source) {
                warnings.push(`${precursor.name}의 SEE 출처가 비어 있습니다.`);
            }
        }

        if (processSourceStreams.length > 0 && Math.abs(sourceStreamDelta) > Math.max(0.01, directEmissions * 0.01)) {
            warnings.push(`배출원 자료 합계와 공정 직접배출량 입력값이 ${sourceStreamDelta.toFixed(4)} tCO2e 차이납니다.`);
        }

        const direct_see = output > 0 ? directEmissions / output : 0;
        const indirect_see = output > 0 ? indirectEmissions / output : 0;
        const precursor_see = output > 0 ? precursorEmissions / output : 0;
        const total_see = direct_see + indirect_see + precursor_see;

        return {
            id: `result_${process.id}`,
            period_id: process.period_id,
            period_name: period?.name,
            process_id: process.id,
            process_name: process.name,
            product_id: process.product_id,
            product_name: product?.name ?? '미지정 제품',
            hs_code: product?.hs_code,
            cn_code: product?.cn_code,
            production_route: process.production_route,
            output_mass_t: process.output_mass_t,
            direct_emissions_tco2e: directEmissions,
            source_stream_count: processSourceStreams.length,
            source_stream_emissions_tco2e: sourceStreamEmissions,
            source_stream_energy_tj: sourceStreamEnergy,
            source_stream_delta_tco2e: sourceStreamDelta,
            direct_see,
            indirect_see,
            precursor_see,
            total_see,
            warnings,
        };
    });
}
