import type { DirectEmissionsInputMode, Product, ProductOutputLine, ProductReportingScope, ProductionProcess, PurchasedPrecursor, ReportingPeriod, SourceStream } from './local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from './source-stream-calculation';
import { APP_SCOPE_EXCLUSION_TEXT, getAppScopeExclusion, getIndirectEmissionsApplicability } from './cbam-product-rules';
import type { IndirectEmissionsRelevance } from './cbam-product-rules';
import { getProductReportingScope, getProductReportingScopeLabel, isCbamReportingScope } from './reporting-scope';
import { ALLOCATION_RULES, MANUAL_ALLOCATION_SUM_TOLERANCE, RECONCILIATION_REVIEW_DEVIATION, getDirectEmissionsInputMode, hasManualAllocationReason, reconcileSourceStreams, resolveActivityLevelRole } from './allocation-rules';
import type { ReconciliationGroup } from './allocation-rules';

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

export interface PrecursorInput {
    precursor_id: string;
    name: string;
    cn_code?: string;
    supplier_country: string;
    production_route?: string;
    /** 이 제품라인에 귀속된 투입량(t) — 식 (5)의 Mᵢ 중 이 라인 몫 */
    mass_t: number;
    /** 공급사가 준 SEFAᵢ와 그 검증 상태 — 2025/2620 부속서 3.3(1)은 검증된 값만 허용한다 */
    supplier_sefa_tco2e_per_t?: number;
    verification_status?: PurchasedPrecursor['verification_status'];
}

export interface LocalCalculationResult {
    id: string;
    period_id?: string;
    period_name?: string;
    process_id: string;
    process_name: string;
    product_output_line_id?: string;
    /**
     * ACTIVITY_LEVEL_EXCLUDED = 점 F에 따라 활동수준에서 뺀 라인(불량·부산물·폐기물·스크랩).
     * 배분율 0, 모든 SEE 0 — 「배출 0을 배정」한다는 규정 문구를 결과에 그대로 남긴다.
     */
    allocation_basis: ProductOutputLine['allocation_basis'] | 'PROCESS_TOTAL' | 'ACTIVITY_LEVEL_EXCLUDED';
    allocation_share: number;
    /** MANUAL(사용자 지정 배분)일 때 라인에 적힌 사유. 검증인이 배분 근거를 결과에서 바로 본다. */
    allocation_reason?: string;
    /** 이 공정의 활동수준(SEE 분모, t) — 라인이 있으면 포함 라인 합계, 없으면 공정 생산량. */
    activity_level_t: number;
    /** 직접귀속배출량을 어떻게 정했는가(CBAM-ALLOC-DIRECT-01). UNSPECIFIED = 기존 자료. */
    direct_emissions_input_mode: DirectEmissionsInputMode | 'UNSPECIFIED';
    /** 이 공정의 배출원이 속한 공용 계량기 그룹과 정합계수(식 41·42). 없으면 빈 배열. */
    reconciliation: ReconciliationGroup[];
    product_id?: string;
    product_name: string;
    reporting_scope: ProductReportingScope;
    is_cbam_reportable: boolean;
    /**
     * 이 결과(제품라인)에 귀속된 구매 전구물질별 투입량. 무상할당 조정(SEFA) 산정에 쓴다 —
     * 2025/2620 부속서 식 (4)는 복합제품의 SEFA에 전구물질 몫 Σ mᵢ·SEFAᵢ 를 더하라고 하는데,
     * 그러려면 어떤 전구물질이 몇 톤 들어갔는지를 결과가 알고 있어야 한다.
     */
    precursor_inputs?: PrecursorInput[];
    /** 사내 다른 공정에서 받은 전구물질의 몫 — 구매 전구물질(precursor_*)과 따로 둔다. see_*_incl_precursor에는 이미 더해져 있다. */
    internal_precursor_direct_see?: number;
    internal_precursor_indirect_see?: number;
    internal_precursor_inputs?: InternalPrecursorInput[];
    hs_code?: string;
    cn_code?: string;
    production_route: string;
    output_mass_t: number;
    direct_emissions_tco2e: number;
    /**
     * 간접배출 관련성 — 3상태. 판정 불가면 see_cbam_basis가 null이다.
     *
     * boolean(indirect_emissions_applicable)을 두지 않는다. 남겨두면 「판정 불가」가
     * 「제외」로 붕괴하고, 그 붕괴를 읽는 소비자를 **사람이 기억으로** 찾아야 한다.
     * 실제로 여섯 번 연속 일부만 고쳤다 — 마지막엔 8곳 중 2곳(대시보드·SEE 흐름도)을 놓쳐
     * 첫 화면이 판정 못 한 제품을 「해당 없음·완료」·「신고 대상 아님」으로 인쇄했다.
     * 타입에서 지우면 컴파일러가 남은 소비자를 전부 지목한다(씨밤이 P1).
     */
    indirect_emissions_relevance: IndirectEmissionsRelevance;
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
    /** 점 F 제외 라인(생산량>0) 수. 이 라인들은 totalOutput·배분에 들어가지 않는다. */
    excludedCount: number;
    excludedOutput: number;
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
    outputLines: Pick<ProductOutputLine, 'output_mass_t' | 'allocation_basis' | 'manual_allocation_percent' | 'activity_level_role'>[]
): ProductOutputLineSummary {
    const validLines = outputLines.filter((line) => line.output_mass_t > 0);
    // 활동수준 제외 라인은 공정 생산량(=활동수준)에도, 배분에도 들어가지 않는다(점 F).
    const excludedLines = validLines.filter((line) => line.activity_level_role === 'EXCLUDED');
    const activeLines = validLines.filter((line) => line.activity_level_role !== 'EXCLUDED');
    const totalOutput = activeLines.reduce((sum, line) => sum + line.output_mass_t, 0);
    const excludedOutput = excludedLines.reduce((sum, line) => sum + line.output_mass_t, 0);
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
        excludedCount: excludedLines.length,
        excludedOutput,
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

/**
 * Art 4(6) 판정용 기능단위 키 — 같은 사업장 + 같은 보고기간 + 같은 CN(없으면 제품 id).
 * 기능단위는 CN별 톤(Art 4(2))이므로 제품 레코드가 아니라 CN으로 묶는다. 사업장이 다르면
 * Art 4(7) 분할이라 같은 CN이어도 한 공정으로 합칠 대상이 아니다.
 */
function functionalUnitKey(periodId: string | undefined, product: Product | undefined) {
    if (!product) return undefined;
    const cn = (product.cn_code ?? '').replace(/\s+/g, '');
    const unit = cn || product.id;
    return `${product.installation_id ?? ''}|${periodId ?? ''}|${unit}`;
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

// ── 사내 이송(공정 간 전가) ───────────────────────────────────────────────
// 2025/2547 부속서 III: 사업장 안의 **다른 생산공정**에서 만든 전구물질은 그 전구물질의 기간 평균
// 직접·간접 SEE × 받는 공정이 쓴 양으로 받는 공정에 얹는다. EU 템플릿의 D_Processes (c)칸이 하는 계산이다.
// 공식 예제 「Example Steel 2 EAF alloys」가 정답지다(조강 1.0015 / 1.3784 → 압연재 1.4396 / 1.7315).
//
// 1단계(공정별 자체 몫 + 구매 전구물질)는 건드리지 않는다. 그 결과 위에 상류→하류 순으로 얹는다.
// 이송이 없으면 결과는 종전과 완전히 같다.

export interface InternalTransferInput {
    id: string;
    period_id?: string;
    source_process_id: string;
    source_output_line_id?: string;
    target_process_id: string;
    mass_t: number;
}

export interface InternalPrecursorInput {
    transfer_id: string;
    source_process_id: string;
    source_process_name: string;
    source_product_name: string;
    source_cn_code?: string;
    /** 이 결과(제품라인)에 귀속된 양 (t) */
    mass_t: number;
    /** 적용한 보내는 쪽 SEE — 구매·사내 전구물질까지 포함한 최종값, 기간 평균 */
    direct_see: number;
    indirect_see: number;
}

/** 이송 그래프를 상류→하류로 정렬한다. 순환에 걸린 공정은 cyclic으로 돌려준다(전가하지 않는다). */
function orderProcessesForTransfers(processIds: string[], transfers: InternalTransferInput[]) {
    const incoming = new Map<string, number>(processIds.map((id) => [id, 0]));
    const outgoing = new Map<string, string[]>();
    for (const transfer of transfers) {
        if (!incoming.has(transfer.source_process_id) || !incoming.has(transfer.target_process_id)) continue;
        incoming.set(transfer.target_process_id, (incoming.get(transfer.target_process_id) ?? 0) + 1);
        outgoing.set(transfer.source_process_id, [...(outgoing.get(transfer.source_process_id) ?? []), transfer.target_process_id]);
    }
    const ready = processIds.filter((id) => (incoming.get(id) ?? 0) === 0);
    const ordered: string[] = [];
    while (ready.length > 0) {
        const id = ready.shift() as string;
        ordered.push(id);
        for (const next of outgoing.get(id) ?? []) {
            incoming.set(next, (incoming.get(next) ?? 0) - 1);
            if (incoming.get(next) === 0) ready.push(next);
        }
    }
    return { ordered, cyclic: processIds.filter((id) => !ordered.includes(id)) };
}

export function applyInternalTransfers(
    ownResults: LocalCalculationResult[],
    transfers: InternalTransferInput[]
): LocalCalculationResult[] {
    const valid = transfers.filter((transfer) => Number.isFinite(transfer.mass_t) && transfer.mass_t > 0);
    if (valid.length === 0) {
        return ownResults;
    }
    const results = ownResults.map((result) => ({ ...result, warnings: [...result.warnings], warningDetails: [...result.warningDetails] }));
    const byProcess = new Map<string, LocalCalculationResult[]>();
    for (const result of results) {
        byProcess.set(result.process_id, [...(byProcess.get(result.process_id) ?? []), result]);
    }
    const warn = (processId: string, message: string) => {
        for (const result of byProcess.get(processId) ?? []) {
            result.warnings.push(message);
            result.warningDetails.push({ message, target: { type: 'process', id: processId } });
        }
    };

    const { ordered, cyclic } = orderProcessesForTransfers([...byProcess.keys()], valid);
    for (const processId of cyclic) {
        warn(processId, '차단: 사내 이송이 순환합니다(A→B→A). 순환 이송은 지원하지 않아 이 공정에는 사내 전구물질 배출을 얹지 않았습니다. 이송 방향을 확인하세요.');
    }

    for (const targetId of ordered) {
        const targetResults = byProcess.get(targetId) ?? [];
        for (const transfer of valid.filter((item) => item.target_process_id === targetId)) {
            const senderResults = byProcess.get(transfer.source_process_id) ?? [];
            if (senderResults.length === 0) {
                warn(targetId, '차단: 사내 이송의 보내는 공정을 찾지 못했습니다. 3단계에서 이송을 다시 지정하세요.');
                continue;
            }
            if (cyclic.includes(transfer.source_process_id)) {
                continue;
            }
            const sender = transfer.source_output_line_id
                ? senderResults.find((result) => result.product_output_line_id === transfer.source_output_line_id)
                : senderResults.filter((result) => result.output_mass_t > 0).length === 1
                    ? senderResults.find((result) => result.output_mass_t > 0)
                    : undefined;
            if (!sender) {
                warn(targetId, `차단: ${senderResults[0].process_name}에서 받은 사내 이송이 어느 제품 라인의 산출물인지 정해지지 않았습니다. 보내는 공정에 제품이 둘 이상이면 라인을 지정해야 합니다.`);
                continue;
            }
            if ((sender.period_id ?? '') !== (targetResults[0]?.period_id ?? '')) {
                warn(targetId, `차단: ${sender.process_name}에서 받은 사내 이송이 다른 보고기간의 공정을 가리킵니다. 같은 기간의 공정끼리만 이송할 수 있습니다.`);
                continue;
            }
            for (const target of targetResults) {
                if (target.output_mass_t <= 0) continue;
                const mass = transfer.mass_t * target.allocation_share;
                const addedDirectSee = mass * sender.see_direct_incl_precursor / target.output_mass_t;
                const addedIndirectSee = mass * sender.see_indirect_incl_precursor / target.output_mass_t;
                target.internal_precursor_direct_see = (target.internal_precursor_direct_see ?? 0) + addedDirectSee;
                target.internal_precursor_indirect_see = (target.internal_precursor_indirect_see ?? 0) + addedIndirectSee;
                target.internal_precursor_inputs = [...(target.internal_precursor_inputs ?? []), {
                    transfer_id: transfer.id,
                    source_process_id: sender.process_id,
                    source_process_name: sender.process_name,
                    source_product_name: sender.product_name,
                    source_cn_code: sender.cn_code,
                    mass_t: mass,
                    direct_see: sender.see_direct_incl_precursor,
                    indirect_see: sender.see_indirect_incl_precursor,
                }];
                target.see_direct_incl_precursor += addedDirectSee;
                target.see_indirect_incl_precursor += addedIndirectSee;
                if (target.see_cbam_basis !== null) {
                    target.see_cbam_basis += target.indirect_emissions_relevance === 'INCLUDED' ? addedDirectSee + addedIndirectSee : addedDirectSee;
                }
                target.see_informational_total = (target.see_informational_total ?? 0) + addedDirectSee + addedIndirectSee;
                target.total_see = target.see_informational_total;
            }
        }
    }

    // 검산: 받은 양이 그 공정의 산출량보다 적으면 수율이 100%를 넘는다 — 물리적으로 이상하다.
    for (const [processId, processResults] of byProcess) {
        const received = valid.filter((item) => item.target_process_id === processId).reduce((sum, item) => sum + item.mass_t, 0);
        const produced = processResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        if (received > 0 && produced > received * 1.001 && processResults.every((result) => (result.precursor_inputs ?? []).length === 0)) {
            warn(processId, `확인 필요(자료): 사내에서 받은 양(${received.toFixed(1)} t)보다 산출량(${produced.toFixed(1)} t)이 많습니다. 다른 원료가 없다면 받은 양을 확인하세요.`);
        }
    }
    return results;
}

export function calculateLocalResults(input: {
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
    products: Product[];
    periods: ReportingPeriod[];
    sourceStreams?: SourceStream[];
    productOutputLines?: ProductOutputLine[];
    internalTransfers?: InternalTransferInput[];
}): LocalCalculationResult[] {
    return applyInternalTransfers(calculateOwnResults(input), input.internalTransfers ?? []);
}

/** 1단계 — 공정별 자체 몫(직접·전력)과 구매 전구물질. 공정끼리는 서로 모른다. */
function calculateOwnResults(input: {
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
    // 공용 계량기 정합(식 41·42)을 먼저 적용한다. 공정별 합계·직접배출은 보정된 활동량으로 센다 —
    // 원본으로 세면 그룹 합계가 사업장 계량값과 어긋난 채 SEE가 나온다.
    const reconciliation = reconcileSourceStreams(input.sourceStreams ?? []);
    const reconciliationGroupByStreamId = new Map<string, ReconciliationGroup>();
    for (const group of reconciliation.groups) {
        for (const streamId of group.stream_ids) {
            reconciliationGroupByStreamId.set(streamId, group);
        }
    }

    for (const precursor of input.precursors) {
        if (!precursor.process_id) {
            continue;
        }

        const group = precursorsByProcess.get(precursor.process_id) ?? [];
        group.push(precursor);
        precursorsByProcess.set(precursor.process_id, group);
    }

    for (const sourceStream of reconciliation.streams) {
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

    // Art 4(6): 같은 기능단위(같은 CN) 재화를 같은 보고기간에 공정 여럿으로 나누면 안 된다 —
    // 생산경로가 달라도 단일 공정(전 경로 가중평균)이어야 한다. 공정의 대표 제품과 생산라인 제품을
    // 모두 센다. CBAM 신고 대상 재화만 본다(공동산출물은 기능단위 논의 대상이 아니다).
    const processKeysById = new Map<string, Set<string>>();
    const processCountByFunctionalUnit = new Map<string, number>();
    for (const process of input.processes) {
        const keys = new Set<string>();
        const candidates = [process.product_id, ...(outputLinesByProcess.get(process.id) ?? []).map((line) => line.product_id)];
        for (const productId of candidates) {
            const candidate = productId ? productById.get(productId) : undefined;
            if (!candidate || !isCbamReportingScope(getProductReportingScope(candidate))) continue;
            const key = functionalUnitKey(process.period_id, candidate);
            if (key) keys.add(key);
        }
        processKeysById.set(process.id, keys);
        for (const key of keys) {
            processCountByFunctionalUnit.set(key, (processCountByFunctionalUnit.get(key) ?? 0) + 1);
        }
    }

    return input.processes.flatMap<LocalCalculationResult>((process) => {
        const warnings: string[] = [];
        const warningDetails: LocalCalculationWarning[] = [];
        const product = process.product_id ? productById.get(process.product_id) : undefined;
        const processReportingScope = getProductReportingScope(product);
        // 앱 지원 범위 밖(다른 분야, 고로 일관제철)의 제품은 「CBAM 신고 대상」으로 저장돼 있어도 결과에 넣지 않는다.
        // 범위 안내문은 「처리하지 않는다」고 말하는데 종전에는 계산에 그대로 들어갔다 — 말과 동작이 달랐다.
        const processScopeExclusion = getAppScopeExclusion(product);
        const processIsCbamReportable = isCbamReportingScope(processReportingScope) && !processScopeExclusion;
        const period = process.period_id ? periodById.get(process.period_id) : undefined;
        const processPrecursors = precursorsByProcess.get(process.id) ?? [];
        const processSourceStreams = sourceStreamsByProcess.get(process.id) ?? [];
        const addWarning = (message: string, target: LocalCalculationWarning['target']) => {
            warnings.push(message);
            warningDetails.push({ message, target });
        };

        if (processScopeExclusion && product) {
            addWarning(`범위 밖: ${product.name} — ${APP_SCOPE_EXCLUSION_TEXT[processScopeExclusion]}`, { type: 'process', id: process.id });
        }

        if (process.output_mass_t <= 0) {
            addWarning('생산량이 0 이하입니다. SEE 산정이 제한됩니다.', { type: 'process', id: process.id });
        }

        if (!process.product_id) {
            addWarning('연결 제품이 지정되지 않았습니다.', { type: 'process', id: process.id });
        }

        if (!process.period_id) {
            addWarning('보고기간이 지정되지 않았습니다.', { type: 'process', id: process.id });
        }

        for (const key of processKeysById.get(process.id) ?? []) {
            const count = processCountByFunctionalUnit.get(key) ?? 0;
            if (count < 2) continue;
            const unit = key.split('|')[2];
            addWarning(
                `확인 필요(규정): 같은 재화(CN ${unit})를 같은 보고기간에 생산공정 ${count}개로 나누어 산정하고 있습니다. `
                + `${ALLOCATION_RULES.SINGLE_PROCESS.anchor}: 생산경로가 달라도 단일 생산공정으로 산정합니다(전 경로 가중평균). 하나로 합치거나 사유를 확인하세요.`,
                { type: 'process', id: process.id }
            );
            break;
        }

        const output = process.output_mass_t > 0 ? process.output_mass_t : 0;
        const inputMode = getDirectEmissionsInputMode(process);
        const sourceStreamEmissions = processSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEmissions(sourceStream),
            0
        );
        const sourceStreamEnergy = processSourceStreams.reduce(
            (sum, sourceStream) => sum + calculateSourceStreamEnergyBreakdown(sourceStream).total,
            0
        );
        // 배출원 합계 방식이면 저장된 수기 값이 아니라 합계를 쓴다(CBAM-ALLOC-DIRECT-01).
        // 그 외(수기·미지정)는 종전대로 저장값을 쓰고 배출원 합계는 대조용이다.
        const directEmissions = inputMode === 'SOURCE_STREAM_SUM'
            ? sourceStreamEmissions
            : process.direct_attributable_emissions_tco2e;
        const sourceStreamDelta = sourceStreamEmissions - process.direct_attributable_emissions_tco2e;
        const grossIndirectEmissions = process.electricity_mwh * process.electricity_ef_tco2e_per_mwh;
        const processIndirectApplicability = getIndirectEmissionsApplicability(product);
        // 판정 불가(UNDETERMINED)일 때 간접배출을 「포함」으로도 「제외」로도 확정하지 않는다.
        // 정보 목적 총계에는 남기되, 인증서 기준 SEE는 아래에서 null로 둔다.
        const processIndirectIncluded = processIndirectApplicability.relevance === 'INCLUDED';

        // 판정 불가를 조용히 넘기면 기준 SEE가 null인 이유를 아무도 모른다.
        if (processIndirectApplicability.relevance === 'UNDETERMINED' && processIsCbamReportable) {
            addWarning(
                `간접배출 관련성을 판정하지 못해 CBAM 인증서 기준 SEE를 산출하지 않았습니다. ${processIndirectApplicability.lookup}`,
                { type: 'process', id: process.id }
            );
        }
        const indirectEmissions = processIndirectIncluded ? grossIndirectEmissions : 0;
        const indirectEmissionsExcluded = processIndirectIncluded ? 0 : grossIndirectEmissions;
        const precursorDirectEmissions = processPrecursors.reduce(
            (sum, precursor) => sum + precursor.consumed_mass_t * precursor.direct_see_tco2e_per_t,
            0
        );
        const precursorIndirectEmissions = processPrecursors.reduce(
            (sum, precursor) => sum + precursor.consumed_mass_t * precursor.indirect_see_tco2e_per_t,
            0
        );
        const precursorEmissions = precursorDirectEmissions + precursorIndirectEmissions;

        // 공용 계량기 그룹 — 보정하지 못한 그룹은 확인을 요구하고, 크게 벗어난 정합계수는 권고로 알린다.
        const processReconciliation = [...new Set(
            processSourceStreams
                .map((stream) => reconciliationGroupByStreamId.get(stream.id))
                .filter((group): group is ReconciliationGroup => Boolean(group))
        )];
        for (const group of processReconciliation) {
            if (group.reason) {
                addWarning(
                    `확인 필요(자료): 공용 계량기 그룹 '${group.group}' — ${group.reason} (${group.mode === 'KEY_SPLIT' ? ALLOCATION_RULES.KEY_SPLIT.anchor : ALLOCATION_RULES.RECONCILIATION.anchor})`,
                    { type: 'process', id: process.id }
                );
            } else if (group.applied && Math.abs(group.factor - 1) > RECONCILIATION_REVIEW_DEVIATION) {
                addWarning(
                    `권고: 공용 계량기 그룹 '${group.group}'의 정합계수 RecF = ${group.factor.toFixed(4)} (사업장 ${group.installation_total} / 공정 합계 ${group.sub_total} ${group.unit}). 1에서 ${(RECONCILIATION_REVIEW_DEVIATION * 100).toFixed(0)}% 이상 벗어나 단위·계량 오류일 수 있습니다.`,
                    { type: 'process', id: process.id }
                );
            }
        }

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

        if (inputMode === 'SOURCE_STREAM_SUM' && processSourceStreams.length === 0) {
            addWarning(`${process.name}: 직접배출을 「배출원 자료 합계」로 정했는데 연결된 배출원이 없어 직접배출이 0으로 산정됩니다.`, { type: 'process', id: process.id });
        }

        if (inputMode !== 'SOURCE_STREAM_SUM' && directEmissions > 0 && processSourceStreams.length === 0) {
            addWarning(`${process.name}: 직접배출량은 입력되어 있지만 연결된 배출원 자료가 없습니다.`, { type: 'process', id: process.id });
        }

        if (processSourceStreams.length > 0 && Math.abs(sourceStreamDelta) > Math.max(0.01, process.direct_attributable_emissions_tco2e * 0.01)) {
            if (inputMode === 'SOURCE_STREAM_SUM') {
                // 산정은 합계를 썼지만 저장값(EU 문서 D_Processes에 나가는 값)이 낡았다.
                addWarning(`저장된 직접귀속배출량 ${process.direct_attributable_emissions_tco2e.toFixed(4)} tCO2e가 배출원 합계 ${sourceStreamEmissions.toFixed(4)} tCO2e와 다릅니다. 산정은 합계를 썼습니다 — 공정을 다시 저장하면 EU 문서 값도 맞춰집니다.`, { type: 'process', id: process.id });
            } else {
                addWarning(`배출원 자료 합계와 공정 직접배출량 입력값이 ${sourceStreamDelta.toFixed(4)} tCO2e 차이납니다.`, { type: 'process', id: process.id });
            }
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
        // 인증서 산정 기준: 간접배출 비관련 품목은 자체 indirect뿐 아니라 전구물질 indirect도 제외.
        // 판정 불가면 기준 SEE를 산출하지 않는다(null) — 판정하지 못한 제품에 숫자를 만들어 주면
        // 그 숫자가 대시보드·시나리오·export로 퍼진다. 정당화할 수 없는 숫자는 존재하면 안 된다.
        const calculatedProcessCbamBasis = processIndirectApplicability.relevance === 'UNDETERMINED'
            ? null
            : processIndirectIncluded
                ? see_direct_incl_precursor + see_indirect_incl_precursor
                : see_direct_incl_precursor;
        const see_cbam_basis = processIsCbamReportable ? calculatedProcessCbamBasis : null;
        const see_informational_total = direct_see + own_indirect_see + precursor_see;
        const total_see = see_informational_total;
        const outputLines = outputLinesByProcess.get(process.id) ?? [];
        // 라인마다 활동수준 역할(점 F)을 정한다. 기존 자료(미지정)는 포함으로 두어 숫자를 바꾸지 않되,
        // 폐기물·공동산출물 범위면 「부산물인지 정규 제품인지」 확인을 요구한다.
        const lineContexts = outputLines
            .filter((line) => line.output_mass_t > 0)
            .map((line) => {
                const lineProduct = line.product_id ? productById.get(line.product_id) : product;
                const lineScope = getProductReportingScope(lineProduct, line);
                return { line, lineProduct, lineScope, role: resolveActivityLevelRole(line, lineScope) };
            });
        const outputLineSummary = summarizeProductOutputLines(process.output_mass_t, outputLines);
        const validOutputLines = lineContexts.map((context) => context.line);
        const eligibleContexts = lineContexts.filter((context) => context.role.role === 'GOOD');
        const eligibleOutputLines = eligibleContexts.map((context) => context.line);
        const excludedLineIds = new Set(lineContexts.filter((context) => context.role.role === 'EXCLUDED').map((context) => context.line.id));
        const massTotal = eligibleOutputLines.reduce((sum, line) => sum + line.output_mass_t, 0);
        const manualLines = eligibleOutputLines.filter((line) => line.allocation_basis === 'MANUAL');
        const manualTotal = manualLines.reduce((sum, line) => sum + line.manual_allocation_percent, 0);
        const activityLevel = validOutputLines.length > 0 ? massTotal : output;

        for (const context of lineContexts) {
            if (!context.role.needsConfirmation) continue;
            addWarning(
                `확인 필요(규정): '${context.line.name}' 라인(${getProductReportingScopeLabel(context.lineScope)})이 활동수준에 포함되어 있습니다. `
                + `불량·부산물·폐기물·스크랩이면 「활동수준 제외」로 표시하세요 — ${ALLOCATION_RULES.ACTIVITY_LEVEL.anchor}.`,
                { type: 'process', id: process.id }
            );
        }

        if (outputLineSummary.hasMixedAllocationBasis) {
            addWarning('제품 생산라인의 배분기준이 섞여 있습니다. 한 공정 안에서는 같은 배분기준을 사용하는지 확인하세요.', { type: 'process', id: process.id });
        }

        if (outputLineSummary.needsAllocationReview && manualTotal <= 0) {
            addWarning('사용자 지정 배분을 선택했지만 유효한 배분율 합계가 0입니다.', { type: 'process', id: process.id });
        }

        // 배분율 합계≠100%를 조용히 정규화하면 누락·이중계상이 숨는다. 산정은 종전대로 정규화하되
        // 차단 수준으로 알린다 — 내보내기 준비도는 이 문구를 오류로 올린다(CBAM-ALLOC-MANUAL-01).
        if (manualLines.length > 0 && manualTotal > 0 && Math.abs(manualTotal - 100) > MANUAL_ALLOCATION_SUM_TOLERANCE) {
            addWarning(
                `차단: 사용자 지정 배분율 합계가 ${manualTotal.toFixed(2)}%입니다 — 100%여야 합니다(미만은 배출 누락, 초과는 이중계상). 산정은 합계 기준으로 정규화했습니다.`,
                { type: 'process', id: process.id }
            );
        }

        // 한 공정 안 재화 간 귀속은 규정상 기능단위(질량)가 원칙이다(A.2 둘째 단락). 사용자 지정 비율은
        // 열·폐가스·몰비 예외 외에는 규정 근거가 없으므로, 사유가 있어도 「규정 예외」임을 매번 알린다.
        if (manualLines.length > 0) {
            addWarning(
                `확인 필요(규정): 이 공정은 사용자 지정 배분을 씁니다. ${ALLOCATION_RULES.MANUAL_SCOPE.anchor}: 한 공정 안 재화 간 귀속은 기능단위(CN별 톤 = 질량)가 원칙이며, 열(A.2.2)·폐가스(A.2.3)·화학물질 몰비(A.2.1) 외의 임의 비율은 규정에 근거가 없습니다. 예외에 해당하는지 검증인과 확인하세요.`,
                { type: 'process', id: process.id }
            );
        }

        for (const line of manualLines) {
            if (hasManualAllocationReason(line)) continue;
            addWarning(
                `확인 필요(자료): '${line.name}' 사용자 지정 배분의 사유·증빙이 비어 있습니다 — ${ALLOCATION_RULES.MANUAL_REASON.anchor}: 어떤 물리적 관계(예외 사유)와 증빙에 근거했는지 남겨야 합니다.`,
                { type: 'process', id: process.id }
            );
        }

        // 전구물질을 활동수준 제외 라인에 귀속하면 그 배출이 사라진다. Mi는 부산물·스크랩으로 나간 양까지
        // 포함해 정규 제품에 귀속돼야 한다(ANNEX III B). 자동으로 옮기지 않고 알린다.
        for (const precursor of processPrecursors) {
            const misdirected = (precursor.output_allocations ?? []).filter((allocation) =>
                allocation.product_output_line_id
                    ? excludedLineIds.has(allocation.product_output_line_id)
                    : Boolean(allocation.product_id)
                        && lineContexts.some((context) => context.line.product_id === allocation.product_id)
                        && lineContexts.filter((context) => context.line.product_id === allocation.product_id).every((context) => context.role.role === 'EXCLUDED')
            );
            // run13 P0: an allocation whose line was deleted is skipped by the mass lookup, so its emissions vanish without a trace.
            const knownLineIds = new Set(lineContexts.map((context) => context.line.id));
            const orphaned = (precursor.output_allocations ?? []).filter(
                (allocation) => allocation.product_output_line_id && !knownLineIds.has(allocation.product_output_line_id)
            );
            if (orphaned.length > 0) {
                const orphanMass = orphaned.reduce((sum, allocation) => sum + resolvePrecursorAllocationMass(precursor, allocation), 0);
                addWarning(
                    `확인 필요(자료): ${precursor.name}의 제품별 배분 ${orphanMass.toFixed(4)} t가 지워진 생산라인을 가리켜 배출에서 빠졌습니다. 전구물질 화면에서 이 전구물질을 열어 배분을 다시 지정하세요.`,
                    { type: 'precursor', id: precursor.id }
                );
            }
            if (misdirected.length === 0) continue;
            const lostMass = misdirected.reduce((sum, allocation) => sum + resolvePrecursorAllocationMass(precursor, allocation), 0);
            addWarning(
                `확인 필요(자료): ${precursor.name}의 귀속 ${lostMass.toFixed(4)} t가 활동수준 제외 라인을 가리켜 배출에서 빠집니다. 전구물질 소비량(Mi)은 부산물·스크랩으로 나간 몫까지 정규 제품에 귀속해야 합니다(2025/2547 ANNEX III, point B).`,
                { type: 'precursor', id: precursor.id }
            );
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
                activity_level_t: activityLevel,
                direct_emissions_input_mode: inputMode,
                reconciliation: processReconciliation,
                product_id: process.product_id,
                product_name: product?.name ?? '미지정 제품',
                reporting_scope: processReportingScope,
                is_cbam_reportable: processIsCbamReportable,
                precursor_inputs: processPrecursors
                    .map((precursor) => ({
                        precursor_id: precursor.id,
                        name: precursor.name,
                        cn_code: precursor.precursor_cn_code,
                        supplier_country: precursor.supplier_country,
                        production_route: precursor.production_route,
                        supplier_sefa_tco2e_per_t: precursor.supplier_sefa_tco2e_per_t,
                        verification_status: precursor.verification_status,
                        mass_t: precursor.consumed_mass_t,
                    }))
                    .filter((input) => input.mass_t > 0),
                hs_code: product?.hs_code,
                cn_code: product?.cn_code,
                production_route: process.production_route,
                output_mass_t: process.output_mass_t,
                direct_emissions_tco2e: directEmissions,
                indirect_emissions_relevance: processIndirectApplicability.relevance,
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

        const lineResults = lineContexts.map(({ line, lineProduct, lineScope, role }) => {
            const lineScopeExclusion = getAppScopeExclusion(lineProduct);
            const lineIsCbamReportable = isCbamReportingScope(lineScope) && !lineScopeExclusion;
            const lineIndirectApplicability = getIndirectEmissionsApplicability(lineProduct);
            const lineIndirectIncluded = lineIndirectApplicability.relevance === 'INCLUDED';
            const base = {
                id: `result_${process.id}_${line.id}`,
                period_id: process.period_id,
                period_name: period?.name,
                process_id: process.id,
                process_name: process.name,
                product_output_line_id: line.id,
                activity_level_t: activityLevel,
                direct_emissions_input_mode: inputMode,
                reconciliation: processReconciliation,
                product_id: line.product_id ?? process.product_id,
                reporting_scope: lineScope,
                product_name: lineProduct?.name ?? line.name,
                hs_code: lineProduct?.hs_code,
                cn_code: lineProduct?.cn_code,
                production_route: process.production_route,
                output_mass_t: line.output_mass_t,
                indirect_emissions_relevance: lineIndirectApplicability.relevance,
                indirect_emissions_rule: lineIndirectApplicability.rule_code,
                source_stream_count: processSourceStreams.length,
                warnings,
                warningDetails,
            };

            // 점 F: 활동수준 제외 라인은 배분율 0, 배출 0. 신고 대상도 아니다(재화가 아니라 부산물·스크랩).
            if (role.role === 'EXCLUDED') {
                return {
                    ...base,
                    allocation_basis: 'ACTIVITY_LEVEL_EXCLUDED' as const,
                    allocation_share: 0,
                    is_cbam_reportable: false,
                    direct_emissions_tco2e: 0,
                    indirect_emissions_excluded_tco2e: 0,
                    indirect_emissions_gross_tco2e: 0,
                    source_stream_emissions_tco2e: 0,
                    source_stream_energy_tj: 0,
                    source_stream_delta_tco2e: 0,
                    direct_see: 0,
                    own_indirect_see: 0,
                    indirect_see: 0,
                    indirect_see_excluded: 0,
                    precursor_see: 0,
                    precursor_direct_see: 0,
                    precursor_indirect_see: 0,
                    see_direct_incl_precursor: 0,
                    see_indirect_incl_precursor: 0,
                    see_cbam_basis: null,
                    see_informational_total: 0,
                    total_see: 0,
                };
            }

            const allocationShare = line.allocation_basis === 'MANUAL'
                ? (manualTotal > 0 ? line.manual_allocation_percent / manualTotal : 0)
                : (massTotal > 0 ? line.output_mass_t / massTotal : 0);
            const lineGrossIndirectEmissions = grossIndirectEmissions * allocationShare;
            const allocatedIndirectEmissions = lineIndirectIncluded ? lineGrossIndirectEmissions : 0;
            const allocatedExcludedIndirectEmissions = lineIndirectIncluded ? 0 : lineGrossIndirectEmissions;
            const allocatedDirectEmissions = directEmissions * allocationShare;
            const allocatedPrecursorDirectEmissions = processPrecursors.reduce((sum, precursor) => {
                const allocatedMass = getPrecursorAllocatedMassForLine(
                    precursor,
                    line,
                    eligibleOutputLines,
                    allocationShare
                );
                return sum + allocatedMass * precursor.direct_see_tco2e_per_t;
            }, 0);
            const allocatedPrecursorIndirectEmissions = processPrecursors.reduce((sum, precursor) => {
                const allocatedMass = getPrecursorAllocatedMassForLine(
                    precursor,
                    line,
                    eligibleOutputLines,
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
            const calculatedLineCbamBasis = lineIndirectApplicability.relevance === 'UNDETERMINED'
                ? null
                : lineIndirectIncluded
                    ? lineSeeDirectInclPrecursor + lineSeeIndirectInclPrecursor
                    : lineSeeDirectInclPrecursor;
            const lineSeeCbamBasis = lineIsCbamReportable ? calculatedLineCbamBasis : null;
            const lineSeeInformationalTotal = lineDirectSee + lineOwnIndirectSee + linePrecursorSee;

            return {
                ...base,
                allocation_basis: line.allocation_basis,
                allocation_share: allocationShare,
                allocation_reason: line.allocation_basis === 'MANUAL' ? line.manual_allocation_reason?.trim() || undefined : undefined,
                is_cbam_reportable: lineIsCbamReportable,
                direct_emissions_tco2e: allocatedDirectEmissions,
                indirect_emissions_excluded_tco2e: allocatedExcludedIndirectEmissions,
                indirect_emissions_gross_tco2e: lineGrossIndirectEmissions,
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
                precursor_inputs: processPrecursors
                    .map((precursor) => ({
                        precursor_id: precursor.id,
                        name: precursor.name,
                        cn_code: precursor.precursor_cn_code,
                        supplier_country: precursor.supplier_country,
                        production_route: precursor.production_route,
                        supplier_sefa_tco2e_per_t: precursor.supplier_sefa_tco2e_per_t,
                        verification_status: precursor.verification_status,
                        mass_t: getPrecursorAllocatedMassForLine(precursor, line, eligibleOutputLines, allocationShare),
                    }))
                    .filter((input) => input.mass_t > 0),
                see_direct_incl_precursor: lineSeeDirectInclPrecursor,
                see_indirect_incl_precursor: lineSeeIndirectInclPrecursor,
                see_cbam_basis: lineSeeCbamBasis,
                see_informational_total: lineSeeInformationalTotal,
                total_see: lineSeeInformationalTotal,
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
