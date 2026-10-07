import { ALLOCATION_BASIS_LABEL, ALLOCATION_RULES, DIRECT_EMISSIONS_INPUT_MODE_LABEL, reconcileSourceStreams, SHARED_METER_BASIS_LABEL, type ReconciliationGroup } from './allocation-rules';
import type { LocalCalculationResult } from './calculation-engine';
import { ELECTRICITY_EF_SOURCE_OPTIONS } from './conversation-energy';
import type { ProductionProcess, PurchasedPrecursor, SourceStream } from './local-db';
import { calculateSourceStreamEmissions } from './source-stream-calculation';
import { FACTOR_SOURCE_TYPE_OPTIONS } from './source-stream-input';

/**
 * Emission Trace — 최종 SEE에서 원천 자료(배출원·계수 출처·구매 강재·전력)까지 거슬러 올라가는 **읽기 전용** 분해.
 *
 * 새 산정이 아니다. 엔진이 낸 결과(제품 라인 하나)를 받아, 엔진이 쓴 같은 자료·같은 보정(공용 계량기 정합계수)·같은 귀속 비율로
 * 구성 요소를 **다시 모아 보고**, 엔진의 SEE와 맞는지 스스로 대조한다(`check`). 맞지 않으면 숨기지 않고 차이를 그대로 낸다.
 * 방법·기준·규정 근거·증빙은 이미 저장된 필드(공용 계량기 기준, 배출원 출처, 전구물질 출처 등)에서 재구성한다 — 새 저장소가 없다.
 */

export interface TraceNode {
    id: string;
    label: string;
    /** tCO₂e(이 제품 라인 몫). 값이 없는 설명 노드는 생략 */
    value?: number;
    /** 이 숫자를 만든 식·수치(사람이 읽는 한 줄) */
    formula?: string;
    /** 적용한 귀속·산정 방법 */
    method?: string;
    /** 규정 근거(조항) */
    anchor?: string;
    /** 증빙·출처(고지서·회신·기본값 파일 등 저장된 글) */
    evidence?: string;
    /** 더 알아야 할 것(임시값·미검증 등) */
    note?: string;
    /** 고칠 화면 */
    href?: string;
    children?: TraceNode[];
}

export interface TraceCheck {
    /** 구성 요소를 모아 다시 만든 SEE */
    rebuiltSee: number;
    /** 엔진의 SEE */
    engineSee: number;
    delta: number;
    /** 직접 귀속배출: 배출원(또는 입력값) 몫 + 열 몫을 모은 값과 엔진의 직접 귀속배출의 차이 */
    directDelta: number;
    ok: boolean;
}

export interface EmissionTrace {
    resultId: string;
    productName: string;
    cnCode?: string;
    processName: string;
    outputMassT: number;
    /** 인증서 기준 SEE. 판정 불가면 null */
    see: number | null;
    /** 총 SEE(검토용) */
    totalSee: number;
    /** 인증서 기준에 들어가는 총 내재배출(tCO₂e) = 직접(자체 + 구매·사내 전구물질) [+ 간접] */
    basisTotalEmissions: number;
    root: TraceNode;
    check: TraceCheck;
}

const TOLERANCE_ABS = 1e-6;
const MODE_LABEL = { ACTUAL: '실측', DEFAULT: 'EU 기본값', SEMI_ACTUAL: '일부 실측(혼합)' } as const;
const VERIFICATION_LABEL = { VERIFIED: '제3자 검증됨', SUPPLIER_CONFIRMED: '공급사 확인(제3자 검증 아님)', UNVERIFIED: '미검증' } as const;
const FACTOR_SOURCE_LABEL = Object.fromEntries(FACTOR_SOURCE_TYPE_OPTIONS.map((option) => [option.value, option.label])) as Record<string, string>;
const ELECTRICITY_SOURCE_LABEL = Object.fromEntries(ELECTRICITY_EF_SOURCE_OPTIONS.map((option) => [option.value, option.label])) as Record<string, string>;
const pct = (value: number) => (value * 100).toFixed(2);
const num = (value: number, digits = 4) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

export function buildEmissionTrace(input: {
    result: LocalCalculationResult;
    process: ProductionProcess;
    /** 엔진이 본 모든 배출원(공용 계량기 보정은 엔진과 같은 함수로 여기서 다시 한다) */
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
}): EmissionTrace | undefined {
    const { result, process } = input;
    if (!(result.output_mass_t > 0)) return undefined;
    const share = result.allocation_share;

    // ── 귀속 방법(공정 → 상품) ───────────────────────────────────────
    const allocationMethod = `${ALLOCATION_BASIS_LABEL[result.allocation_basis]} — 이 상품 몫 ${pct(share)}%`;
    const allocationAnchor = result.allocation_basis === 'MANUAL' ? ALLOCATION_RULES.MANUAL_SCOPE.anchor : ALLOCATION_RULES.KEY_SPLIT.anchor;

    // ── ① 직접 귀속배출 ──────────────────────────────────────────────
    const processStreams = reconcileSourceStreams(input.sourceStreams).streams.filter((stream) => stream.process_id === process.id);
    const groupByStream = new Map<string, ReconciliationGroup>();
    for (const group of result.reconciliation) {
        for (const id of group.stream_ids) groupByStream.set(id, group);
    }
    const originalById = new Map(input.sourceStreams.map((stream) => [stream.id, stream]));
    const directChildren: TraceNode[] = [];
    let streamPart = 0;
    if (result.direct_emissions_input_mode === 'SOURCE_STREAM_SUM') {
        for (const stream of processStreams) {
            const emissions = calculateSourceStreamEmissions(stream) * share;
            streamPart += emissions;
            const original = originalById.get(stream.id) ?? stream;
            const group = groupByStream.get(stream.id);
            const basisBits = [
                `${num(original.activity_data)} ${original.activity_unit}`,
                stream.emission_factor_basis === 'PER_ACTIVITY_UNIT' ? `계수 ${num(stream.emission_factor_tco2e_per_unit, 6)} tCO₂e/${stream.activity_unit}` : `NCV ${num(stream.ncv_gj_per_unit, 6)} GJ/단위 × 계수 ${num(stream.emission_factor_tco2e_per_unit, 6)} tCO₂e/TJ`,
            ];
            directChildren.push({
                id: `stream:${stream.id}`,
                label: stream.name,
                value: emissions,
                formula: `${basisBits.join(' · ')}${group?.applied ? ` × 정합계수 ${num(group.factor, 6)}` : ''} × 이 상품 몫 ${pct(share)}%`,
                method: group ? `공용 계량기 「${group.group}」 — ${group.mode === 'SUB_METER' ? '보조계량기 정합(식 41·42)' : group.mode === 'KEY_SPLIT' ? '공정별 측정값 없이 나눔(합계 검사)' : '혼합'}${original.shared_meter ? ` · 기준 ${SHARED_METER_BASIS_LABEL[original.shared_meter.basis]}` : ''}` : '단독 계량',
                anchor: group ? (group.mode === 'SUB_METER' ? ALLOCATION_RULES.RECONCILIATION.anchor : ALLOCATION_RULES.KEY_SPLIT.anchor) : undefined,
                evidence: stream.source || undefined,
                note: [
                    `계수 근거 유형: ${FACTOR_SOURCE_LABEL[stream.factor_source_type ?? 'UNCLASSIFIED'] ?? '분류 전'}`,
                    original.shared_meter?.note ? `나눈 근거: ${original.shared_meter.note}` : '',
                    group?.reason ? `확인 필요: ${group.reason}` : '',
                ].filter(Boolean).join(' · '),
                href: `/source-streams?edit=${encodeURIComponent(stream.id)}`,
            });
        }
    } else {
        // 수기 입력·템플릿 값: 배출원 자료에서 온 값이 아니다 — 그 사실을 그대로 말한다.
        streamPart = process.direct_attributable_emissions_tco2e * share;
        directChildren.push({
            id: `direct-input:${process.id}`,
            label: `공정 직접배출 입력값 ${num(process.direct_attributable_emissions_tco2e)} tCO₂e`,
            value: streamPart,
            formula: `${num(process.direct_attributable_emissions_tco2e)} tCO₂e × 이 상품 몫 ${pct(share)}%`,
            method: DIRECT_EMISSIONS_INPUT_MODE_LABEL[result.direct_emissions_input_mode],
            anchor: ALLOCATION_RULES.DIRECT_INPUT.anchor,
            note: '배출원 자료로 거슬러 올라갈 수 없는 값입니다 — 근거 문서를 증빙으로 따로 보관하세요.',
            href: `/processes?edit=${encodeURIComponent(process.id)}`,
        });
    }
    const importedHeat = result.imported_heat_emissions_tco2e ?? 0;
    const sharedHeat = result.shared_heat_emissions_tco2e ?? 0;
    const purchasedHeat = importedHeat - sharedHeat;
    if (purchasedHeat > 0) {
        directChildren.push({
            id: `heat-bought:${process.id}`,
            label: '밖에서 산 스팀·온수(측정가능열) 배출 EmH,imp',
            value: purchasedHeat,
            method: '사업장 밖에서 산 열 — 직접배출에 더함',
            anchor: ALLOCATION_RULES.HEAT_IMPORT.anchor,
            href: `/processes?edit=${encodeURIComponent(process.id)}`,
        });
    }
    if (sharedHeat > 0) {
        directChildren.push({
            id: `heat-shared:${process.id}`,
            label: '사내 공용 열 공급원에서 받은 열의 배출',
            value: sharedHeat,
            formula: (result.shared_heat_formulas ?? []).join(' / ') || undefined,
            method: '쓴 열량 기준 귀속',
            anchor: ALLOCATION_RULES.HEAT_IMPORT.anchor,
            href: `/processes?edit=${encodeURIComponent(process.id)}`,
        });
    }
    const directSelf = result.direct_emissions_tco2e;
    const directNode: TraceNode = {
        id: 'direct',
        label: '① 직접 귀속배출 (자체 연료·공정 + 열)',
        value: directSelf,
        formula: `공정 몫 → 이 상품 ${pct(share)}%`,
        method: allocationMethod,
        anchor: allocationAnchor,
        note: result.allocation_reason ? `사용자 지정 배분 사유: ${result.allocation_reason}` : undefined,
        children: directChildren,
    };

    // ── ② 자체 전력 간접 ─────────────────────────────────────────────
    const indirectIncluded = result.indirect_emissions_relevance === 'INCLUDED';
    const ownIndirect = result.indirect_emissions_gross_tco2e;
    const electricityMeter = process.electricity_shared_meter;
    const indirectNode: TraceNode = {
        id: 'own-indirect',
        label: '② 자체 전력 간접배출',
        value: ownIndirect,
        formula: `${num(process.electricity_mwh)} MWh × ${num(process.electricity_ef_tco2e_per_mwh, 6)} tCO₂e/MWh × 이 상품 몫 ${pct(share)}%`,
        method: electricityMeter ? `공용 계량기 「${electricityMeter.group}」 — ${electricityMeter.basis === 'SUB_METER' ? '보조계량 정합' : electricityMeter.basis === 'OUTPUT_MASS' ? '생산량(기능단위)으로 나눔' : '설비용량×가동시간 추정(간접결정)'}` : '공정 직접 계량',
        anchor: electricityMeter ? ALLOCATION_RULES.ELECTRICITY_SHARED_METER.anchor : undefined,
        evidence: [process.electricity_allocation_note, electricityMeter?.note].filter(Boolean).join(' · ') || undefined,
        note: [
            `계수 출처: ${process.electricity_ef_source ? (ELECTRICITY_SOURCE_LABEL[process.electricity_ef_source] ?? process.electricity_ef_source) : '분류 전(임시 자리값일 수 있음)'}`,
            indirectIncluded ? '' : '이 품목은 인증서 기준 SEE에서 빠지지만 보고에는 포함됩니다.',
        ].filter(Boolean).join(' · '),
        href: `/processes?edit=${encodeURIComponent(process.id)}`,
    };

    // ── ③ 구매 전구물질 ──────────────────────────────────────────────
    const precursorById = new Map(input.precursors.map((precursor) => [precursor.id, precursor]));
    const precursorChildren: TraceNode[] = [];
    let precursorDirect = 0;
    let precursorIndirect = 0;
    for (const used of result.precursor_inputs ?? []) {
        const precursor = precursorById.get(used.precursor_id);
        if (!precursor) continue;
        const direct = used.mass_t * precursor.direct_see_tco2e_per_t;
        const indirect = used.mass_t * precursor.indirect_see_tco2e_per_t;
        precursorDirect += direct;
        precursorIndirect += indirect;
        precursorChildren.push({
            id: `precursor:${precursor.id}`,
            label: `${precursor.name}${precursor.supplier_country ? ` (${precursor.supplier_country})` : ''}`,
            value: direct + indirect,
            formula: `${num(used.mass_t)} t × (직접 ${num(precursor.direct_see_tco2e_per_t, 6)} + 간접 ${num(precursor.indirect_see_tco2e_per_t, 6)}) tCO₂e/t`,
            method: `${MODE_LABEL[precursor.data_mode]} — ${VERIFICATION_LABEL[precursor.verification_status]}`,
            anchor: precursor.data_mode === 'ACTUAL' ? 'ANNEX II, point A.1(4)–(5) · E(3)' : undefined,
            evidence: [precursor.source, precursor.data_mode === 'DEFAULT' ? precursor.default_value_justification : ''].filter(Boolean).join(' · ') || undefined,
            note: precursor.data_mode === 'ACTUAL' && precursor.verification_status !== 'VERIFIED' ? '제3자 검증보고서가 없으면 규정상 EU 기본값을 써야 합니다 — 지금 값은 잠정입니다.' : undefined,
            href: `/precursors?edit=${encodeURIComponent(precursor.id)}`,
        });
    }
    const precursorNode: TraceNode = {
        id: 'precursors',
        label: '③ 구매 전구물질(구매 강재)',
        value: precursorDirect + precursorIndirect,
        formula: `직접 ${num(precursorDirect)} + 간접 ${num(precursorIndirect)} tCO₂e`,
        children: precursorChildren,
    };

    // ── ④ 사내 이송 전구물질 ─────────────────────────────────────────
    const internalChildren: TraceNode[] = [];
    let internalDirect = 0;
    let internalIndirect = 0;
    for (const used of result.internal_precursor_inputs ?? []) {
        const direct = used.mass_t * used.direct_see;
        const indirect = used.mass_t * used.indirect_see;
        internalDirect += direct;
        internalIndirect += indirect;
        internalChildren.push({
            id: `internal:${used.transfer_id}`,
            label: `${used.source_process_name}에서 받음 (${used.source_product_name})`,
            value: direct + indirect,
            formula: `${num(used.mass_t)} t × (직접 ${num(used.direct_see, 6)} + 간접 ${num(used.indirect_see, 6)}) tCO₂e/t`,
            method: '사내 이송 — 보내는 공정의 최종 SEE(기간 평균)',
            anchor: 'ANNEX III (사업장 안 다른 생산공정의 전구물질)',
            href: `/processes?edit=${encodeURIComponent(used.source_process_id)}`,
        });
    }
    const internalNode: TraceNode | undefined = internalChildren.length > 0
        ? { id: 'internal', label: '④ 사내 이송으로 받은 전구물질', value: internalDirect + internalIndirect, children: internalChildren }
        : undefined;

    // ── 합계와 자체 대조 ─────────────────────────────────────────────
    const directSide = directSelf + precursorDirect + internalDirect;
    const indirectSide = ownIndirect + precursorIndirect + internalIndirect;
    const reportsIndirect = result.indirect_emissions_relevance === 'INCLUDED';
    const basisTotal = reportsIndirect ? directSide + indirectSide : directSide;
    const rebuiltSee = basisTotal / result.output_mass_t;
    const engineSee = result.see_cbam_basis ?? rebuiltSee;
    const delta = rebuiltSee - engineSee;
    const directDelta = streamPart + importedHeat - directSelf;
    const check: TraceCheck = {
        rebuiltSee,
        engineSee,
        delta,
        directDelta,
        ok: Math.abs(directDelta) <= TOLERANCE_ABS && (result.see_cbam_basis === null || Math.abs(delta) <= TOLERANCE_ABS),
    };

    const root: TraceNode = {
        id: 'see',
        label: result.see_cbam_basis === null ? 'CBAM 산정 기준 SEE — 판정 불가' : 'CBAM 산정 기준 SEE',
        value: result.see_cbam_basis ?? undefined,
        formula: `총 내재배출 ${num(basisTotal)} tCO₂e ÷ 생산량 ${num(result.output_mass_t)} t`,
        method: reportsIndirect ? '직접 + 간접(이 품목은 간접이 인증서 기준에 포함)' : '직접만(이 품목은 간접이 인증서 기준에서 제외 — 보고용으로는 따로 적습니다)',
        note: result.see_cbam_basis === null ? '간접배출 관련성을 판정하지 못해 기준 SEE를 산출하지 않았습니다.' : undefined,
        children: [directNode, indirectNode, precursorNode, ...(internalNode ? [internalNode] : [])],
    };

    return {
        resultId: result.id,
        productName: result.product_name,
        cnCode: result.cn_code,
        processName: result.process_name,
        outputMassT: result.output_mass_t,
        see: result.see_cbam_basis,
        totalSee: result.total_see,
        basisTotalEmissions: basisTotal,
        root,
        check,
    };
}
