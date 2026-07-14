import type { Product, ProductOutputLine, ProductReportingScope, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';
import { getIndirectEmissionsApplicability } from './cbam-product-rules';
import { getProductReportingScope, isCbamReportingScope } from './reporting-scope';

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
    own_indirect_see: number;
    indirect_see_excluded: number;
    precursor_see: number;
    precursor_direct_see: number;
    precursor_indirect_see: number;
    see_direct_incl_precursor: number;
    see_indirect_incl_precursor: number;
    see_cbam_basis: number;
    see_informational_total: number;
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
    reporting_scope: ProductReportingScope;
    is_cbam_reportable: boolean;
    hs_code?: string;
    cn_code?: string;
    production_route: string;
    output_mass_t: number;
    direct_emissions_tco2e: number;
    indirect_emissions_applicable: boolean;
    indirect_emissions_rule: string;
    indirect_emissions_excluded_tco2e: number;
    indirect_emissions_gross_tco2e: number;
    source_stream_count: number;
    source_stream_emissions_tco2e: number;
    source_stream_energy_tj: number;
    source_stream_delta_tco2e: number;
    direct_see: number;
    own_indirect_see: number;
    indirect_see: number;
    indirect_see_excluded: number;
    precursor_see: number;
    precursor_direct_see: number;
    precursor_indirect_see: number;
    see_direct_incl_precursor: number;
    see_indirect_incl_precursor: number;
    see_cbam_basis: number | null;
    see_informational_total: number;
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

export function getLocalCalculationWarningHref(warning: LocalCalculationWarning) {
    const encodedId = encodeURIComponent(warning.target.id);

    return warning.target.type === 'precursor'
        ? `/precursors?edit=${encodedId}`
        : `/processes?edit=${encodedId}`;
}

export interface ProductOutputLineSummary {
    count: number;
    activeCount: number;
    totalOutput: number;
    delta: number;
    tolerance: number;
    manualPercentTotal: number;
    hasMixedAllocationBasis: boolean;
    needsOutputReview: boolean;
    needsAllocationReview: boolean;
    needsReview: boolean;
}

export function summarizeProductOutputLines(
    processOutputMassT: number,
    outputLines: Pick<ProductOutputLine, 'output_mass_t' | 'allocation_basis' | 'manual_allocation_percent'>[]
): ProductOutputLineSummary {
    const activeLines = outputLines.filter((line) => line.output_mass_t > 0);
    const totalOutput = activeLines.reduce((sum, line) => sum + line.output_mass_t, 0);
    const delta = totalOutput - processOutputMassT;
    const tolerance = Math.max(0.01, Math.abs(processOutputMassT) * 0.01);
    const allocationBases = new Set(activeLines.map((line) => line.allocation_basis));
    const hasMixedAllocationBasis = allocationBases.size > 1;
    const manualPercentTotal = activeLines.reduce(
        (sum, line) => sum + (line.allocation_basis === 'MANUAL' ? line.manual_allocation_percent : 0),
        0
    );
    const hasManualLines = activeLines.some((line) => line.allocation_basis === 'MANUAL');
    const needsOutputReview = activeLines.length > 0 && Math.abs(delta) > tolerance;
    const needsAllocationReview = hasMixedAllocationBasis || (hasManualLines && manualPercentTotal <= 0);

    return {
        count: outputLines.length,
        activeCount: activeLines.length,
        totalOutput,
        delta,
        tolerance,
        manualPercentTotal,
        hasMixedAllocationBasis,
        needsOutputReview,
        needsAllocationReview,
        needsReview: needsOutputReview || needsAllocationReview,
    };
}

function resolvePrecursorAllocationMass(
    precursor: PurchasedPrecursor,
    allocation: NonNullable<PurchasedPrecursor['output_allocations']>[number]
) {
    const allocatedMass = Number.isFinite(allocation.allocated_mass_t)
        ? Math.max(allocation.allocated_mass_t, 0)
        : 0;

    if (allocatedMass > 0) {
        return allocatedMass;
    }

    const allocationPercent = Number.isFinite(allocation.allocation_percent)
        ? Math.max(allocation.allocation_percent ?? 0, 0)
        : 0;

    return precursor.consumed_mass_t * allocationPercent / 100;
}

function getPrecursorAllocatedMassForLine(
    precursor: PurchasedPrecursor,
    line: ProductOutputLine,
    outputLines: ProductOutputLine[],
    legacyProcessShare: number
) {
    const allocations = precursor.output_allocations ?? [];

    if (allocations.length === 0) {
        return precursor.consumed_mass_t * legacyProcessShare;
    }

    const exactMass = allocations
        .filter((allocation) => allocation.product_output_line_id === line.id)
        .reduce((sum, allocation) => sum + resolvePrecursorAllocationMass(precursor, allocation), 0);
    const productAllocations = allocations.filter(
        (allocation) =>
            !allocation.product_output_line_id &&
            allocation.product_id &&
            allocation.product_id === line.product_id
    );
    const matchingProductLines = outputLines.filter(
        (candidate) => candidate.product_id === line.product_id && candidate.output_mass_t > 0
    );
    const matchingOutputMass = matchingProductLines.reduce((sum, candidate) => sum + candidate.output_mass_t, 0);
    const productLineShare = matchingOutputMass > 0 ? line.output_mass_t / matchingOutputMass : 0;
    const productMass = productAllocations.reduce(
        (sum, allocation) => sum + resolvePrecursorAllocationMass(precursor, allocation) * productLineShare,
        0
    );

    return exactMass + productMass;
}

function getPrecursorExplicitAllocationMass(precursor: PurchasedPrecursor) {
    return (precursor.output_allocations ?? []).reduce(
        (sum, allocation) => sum + resolvePrecursorAllocationMass(precursor, allocation),
        0
    );
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

    const own_indirect_see = indirect_see;
    const indirect_see_excluded = 0;
    // 주의(레거시 helper): CalcInput.precursors는 direct/indirect 분리가 없어 전구물질 기여를
    // direct/indirect로 쪼갤 수 없다. 정확한 인증서 기준(direct-only 전구물질 indirect 제외)이
    // 필요하면 calculateLocalResults를 사용한다. 여기서는 전구물질을 indirect 포함으로 본다.
    const precursor_direct_see = precursor_see;
    const precursor_indirect_see = 0;
    const see_direct_incl_precursor = direct_see + precursor_direct_see;
    const see_indirect_incl_precursor = own_indirect_see + precursor_indirect_see;
    const see_cbam_basis = direct_see + indirect_see + precursor_see;
    const see_informational_total = direct_see + own_indirect_see + precursor_see;
    const total_see = see_informational_total;

    return {
        direct_see,
        indirect_see,
        own_indirect_see,
        indirect_see_excluded,
        precursor_see,
        precursor_direct_see,
        precursor_indirect_see,
        see_direct_incl_precursor,
        see_indirect_incl_precursor,
        see_cbam_basis,
        see_informational_total,
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
        const processReportingScope = getProductReportingScope(product);
        const processIsCbamReportable = isCbamReportingScope(processReportingScope);
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
        const precursorDirectEmissions = processPrecursors.reduce(
            (sum, precursor) => sum + precursor.consumed_mass_t * precursor.direct_see_tco2e_per_t,
            0
        );
        const precursorIndirectEmissions = processPrecursors.reduce(
            (sum, precursor) => sum + precursor.consumed_mass_t * precursor.indirect_see_tco2e_per_t,
            0
        );
        const precursorEmissions = precursorDirectEmissions + precursorIndirectEmissions;

        for (const precursor of processPrecursors) {
            // 소비량이 공정 생산량을 초과하는 것은 수율 손실(슬래그·스케일·가스)·전구물질 투입 특성상 정상이므로
            // 경고하지 않는다. 대신 "소비량 > 구매량"(재고 이월분이 아니라면 데이터 오류)을 점검한다.
            const totalConsumedMass = precursor.consumed_mass_t + precursor.consumed_for_non_cbam_mass_t;
            if (precursor.purchased_mass_t > 0 && totalConsumedMass > precursor.purchased_mass_t) {
                addWarning(`${precursor.name} 소비량이 구매량을 초과합니다. 전기 이월(재고) 사용분이 아니라면 구매량/소비량을 확인하세요.`, { type: 'precursor', id: precursor.id });
            }

            if (!precursor.source) {
                addWarning(`${precursor.name}의 SEE 출처가 비어 있습니다.`, { type: 'precursor', id: precursor.id });
            }

            if ((precursor.output_allocations?.length ?? 0) > 0) {
                const allocatedMass = getPrecursorExplicitAllocationMass(precursor);
                const allocationTolerance = Math.max(0.01, precursor.consumed_mass_t * 0.01);

                if (Math.abs(allocatedMass - precursor.consumed_mass_t) > allocationTolerance) {
                    addWarning(
                        `${precursor.name}의 산출물 귀속량 ${allocatedMass.toFixed(4)} t와 총 소비량 ${precursor.consumed_mass_t.toFixed(4)} t가 일치하지 않습니다.`,
                        { type: 'precursor', id: precursor.id }
                    );
                }
            }
        }

        if (directEmissions > 0 && processSourceStreams.length === 0) {
            addWarning(`${process.name}: 직접배출량은 입력되어 있지만 연결된 배출원 자료가 없습니다.`, { type: 'process', id: process.id });
        }

        if (processSourceStreams.length > 0 && Math.abs(sourceStreamDelta) > Math.max(0.01, directEmissions * 0.01)) {
            addWarning(`배출원 자료 합계와 공정 직접배출량 입력값이 ${sourceStreamDelta.toFixed(4)} tCO2e 차이납니다.`, { type: 'process', id: process.id });
        }

        const direct_see = output > 0 ? directEmissions / output : 0;
        const own_indirect_see = output > 0 ? grossIndirectEmissions / output : 0;
        const indirect_see = output > 0 ? indirectEmissions / output : 0;
        const indirect_see_excluded = output > 0 ? indirectEmissionsExcluded / output : 0;
        const precursor_see = output > 0 ? precursorEmissions / output : 0;
        const precursor_direct_see = output > 0 ? precursorDirectEmissions / output : 0;
        const precursor_indirect_see = output > 0 ? precursorIndirectEmissions / output : 0;
        // declarant 보고용 SEE(direct/indirect) — 자체 + 전구물질 기여 포함 (EU Communication Template 컬럼)
        const see_direct_incl_precursor = direct_see + precursor_direct_see;
        const see_indirect_incl_precursor = own_indirect_see + precursor_indirect_see;
        // 인증서 산정 기준: Annex II direct-only 품목은 자체 indirect뿐 아니라 전구물질 indirect도 제외
        const calculatedProcessCbamBasis = processIndirectApplicability.applicable
            ? see_direct_incl_precursor + see_indirect_incl_precursor
            : see_direct_incl_precursor;
        const see_cbam_basis = processIsCbamReportable ? calculatedProcessCbamBasis : null;
        const see_informational_total = direct_see + own_indirect_see + precursor_see;
        const total_see = see_informational_total;
        const outputLines = outputLinesByProcess.get(process.id) ?? [];
        const outputLineSummary = summarizeProductOutputLines(process.output_mass_t, outputLines);
        const validOutputLines = outputLines.filter((line) => line.output_mass_t > 0);
        const massTotal = validOutputLines.reduce((sum, line) => sum + line.output_mass_t, 0);
        const manualTotal = validOutputLines.reduce(
            (sum, line) => sum + (line.allocation_basis === 'MANUAL' ? line.manual_allocation_percent : 0),
            0
        );

        if (outputLineSummary.hasMixedAllocationBasis) {
            addWarning('제품 생산라인의 배분기준이 섞여 있습니다. 한 공정 안에서는 같은 배분기준을 사용하는지 확인하세요.', { type: 'process', id: process.id });
        }

        if (outputLineSummary.needsAllocationReview && manualTotal <= 0) {
            addWarning('수동 비율 배분을 선택했지만 유효한 수동비율 합계가 0입니다.', { type: 'process', id: process.id });
        }

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
                reporting_scope: processReportingScope,
                is_cbam_reportable: processIsCbamReportable,
                hs_code: product?.hs_code,
                cn_code: product?.cn_code,
                production_route: process.production_route,
                output_mass_t: process.output_mass_t,
                direct_emissions_tco2e: directEmissions,
                indirect_emissions_applicable: processIndirectApplicability.applicable,
                indirect_emissions_rule: processIndirectApplicability.rule_code,
                indirect_emissions_excluded_tco2e: indirectEmissionsExcluded,
                indirect_emissions_gross_tco2e: grossIndirectEmissions,
                source_stream_count: processSourceStreams.length,
                source_stream_emissions_tco2e: sourceStreamEmissions,
                source_stream_energy_tj: sourceStreamEnergy,
                source_stream_delta_tco2e: sourceStreamDelta,
                direct_see,
                own_indirect_see,
                indirect_see,
                indirect_see_excluded,
                precursor_see,
                precursor_direct_see,
                precursor_indirect_see,
                see_direct_incl_precursor,
                see_indirect_incl_precursor,
                see_cbam_basis,
                see_informational_total,
                total_see,
                warnings,
                warningDetails,
            }];
        }

        const lineResults = validOutputLines.map((line) => {
            const lineProduct = line.product_id ? productById.get(line.product_id) : product;
            const lineReportingScope = getProductReportingScope(lineProduct, line);
            const lineIsCbamReportable = isCbamReportingScope(lineReportingScope);
            const allocationShare = line.allocation_basis === 'MANUAL'
                ? (manualTotal > 0 ? line.manual_allocation_percent / manualTotal : 0)
                : (massTotal > 0 ? line.output_mass_t / massTotal : 0);
            const lineIndirectApplicability = getIndirectEmissionsApplicability(lineProduct);
            const lineGrossIndirectEmissions = grossIndirectEmissions * allocationShare;
            const allocatedIndirectEmissions = lineIndirectApplicability.applicable ? lineGrossIndirectEmissions : 0;
            const allocatedExcludedIndirectEmissions = lineIndirectApplicability.applicable ? 0 : lineGrossIndirectEmissions;
            const allocatedDirectEmissions = directEmissions * allocationShare;
            const allocatedPrecursorDirectEmissions = processPrecursors.reduce((sum, precursor) => {
                const allocatedMass = getPrecursorAllocatedMassForLine(
                    precursor,
                    line,
                    validOutputLines,
                    allocationShare
                );
                return sum + allocatedMass * precursor.direct_see_tco2e_per_t;
            }, 0);
            const allocatedPrecursorIndirectEmissions = processPrecursors.reduce((sum, precursor) => {
                const allocatedMass = getPrecursorAllocatedMassForLine(
                    precursor,
                    line,
                    validOutputLines,
                    allocationShare
                );
                return sum + allocatedMass * precursor.indirect_see_tco2e_per_t;
            }, 0);
            const allocatedPrecursorEmissions =
                allocatedPrecursorDirectEmissions + allocatedPrecursorIndirectEmissions;
            const lineDirectSee = line.output_mass_t > 0 ? allocatedDirectEmissions / line.output_mass_t : 0;
            const lineOwnIndirectSee = line.output_mass_t > 0 ? lineGrossIndirectEmissions / line.output_mass_t : 0;
            const lineIndirectSee = line.output_mass_t > 0 ? allocatedIndirectEmissions / line.output_mass_t : 0;
            const lineIndirectSeeExcluded = line.output_mass_t > 0 ? allocatedExcludedIndirectEmissions / line.output_mass_t : 0;
            const linePrecursorSee = line.output_mass_t > 0 ? allocatedPrecursorEmissions / line.output_mass_t : 0;
            const linePrecursorDirectSee = line.output_mass_t > 0 ? allocatedPrecursorDirectEmissions / line.output_mass_t : 0;
            const linePrecursorIndirectSee = line.output_mass_t > 0 ? allocatedPrecursorIndirectEmissions / line.output_mass_t : 0;
            const lineSeeDirectInclPrecursor = lineDirectSee + linePrecursorDirectSee;
            const lineSeeIndirectInclPrecursor = lineOwnIndirectSee + linePrecursorIndirectSee;
            const calculatedLineCbamBasis = lineIndirectApplicability.applicable
                ? lineSeeDirectInclPrecursor + lineSeeIndirectInclPrecursor
                : lineSeeDirectInclPrecursor;
            const lineSeeCbamBasis = lineIsCbamReportable ? calculatedLineCbamBasis : null;
            const lineSeeInformationalTotal = lineDirectSee + lineOwnIndirectSee + linePrecursorSee;

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
                reporting_scope: lineReportingScope,
                is_cbam_reportable: lineIsCbamReportable,
                product_name: lineProduct?.name ?? line.name,
                hs_code: lineProduct?.hs_code,
                cn_code: lineProduct?.cn_code,
                production_route: process.production_route,
                output_mass_t: line.output_mass_t,
                direct_emissions_tco2e: allocatedDirectEmissions,
                indirect_emissions_applicable: lineIndirectApplicability.applicable,
                indirect_emissions_rule: lineIndirectApplicability.rule_code,
                indirect_emissions_excluded_tco2e: allocatedExcludedIndirectEmissions,
                indirect_emissions_gross_tco2e: lineGrossIndirectEmissions,
                source_stream_count: processSourceStreams.length,
                source_stream_emissions_tco2e: sourceStreamEmissions * allocationShare,
                source_stream_energy_tj: sourceStreamEnergy * allocationShare,
                source_stream_delta_tco2e: sourceStreamDelta * allocationShare,
                direct_see: lineDirectSee,
                own_indirect_see: lineOwnIndirectSee,
                indirect_see: lineIndirectSee,
                indirect_see_excluded: lineIndirectSeeExcluded,
                precursor_see: linePrecursorSee,
                precursor_direct_see: linePrecursorDirectSee,
                precursor_indirect_see: linePrecursorIndirectSee,
                see_direct_incl_precursor: lineSeeDirectInclPrecursor,
                see_indirect_incl_precursor: lineSeeIndirectInclPrecursor,
                see_cbam_basis: lineSeeCbamBasis,
                see_informational_total: lineSeeInformationalTotal,
                total_see: lineSeeInformationalTotal,
                warnings,
                warningDetails,
            };
        });

        if (outputLineSummary.needsOutputReview) {
            for (const result of lineResults) {
                result.warnings = [...result.warnings, `제품 생산라인 합계가 공정 총 생산량과 ${Math.abs(outputLineSummary.delta).toFixed(4)} t 차이납니다.`];
                result.warningDetails = [...result.warningDetails, {
                    message: `제품 생산라인 합계가 공정 총 생산량과 ${Math.abs(outputLineSummary.delta).toFixed(4)} t 차이납니다.`,
                    target: { type: 'process', id: process.id },
                }];
            }
        }

        return lineResults;
    });
}
