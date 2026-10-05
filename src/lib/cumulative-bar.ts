import type { LocalCalculationResult } from './calculation-engine';
import type { PurchasedPrecursor } from './local-db';
import { findDefaultValueReference, resolveDefaultSeeForYear, type ImportedDefaultValueReference } from './reference-workbooks';
import type { SeeFlowBinding } from './see-flow';

/**
 * 누적 막대 — 「EU 기본값으로 신고하면 얼마 / 내 값으로 신고하면 얼마」를 두 기둥으로 보여주는 지도 아래 장치(UX 컨셉 v4 §6).
 *
 * 이 파일은 **그리지 않고 계산만 한다.** 막대는 자기만의 산술을 갖지 않는다는 원칙(v4 §14) 때문에:
 *  · 대형 수치(기준 SEE)는 SeeFlowBinding의 값을 그대로 쓴다. 블록 합이 그 값과 어긋나면 블록을 그리지 않고 수치만 낸다.
 *  · 간접배출 문안은 describeSeeFlowIndirect만 쓴다(호출부).
 *  · 판정이 안 된 제품(간접 관련성 UNDETERMINED)·CN이 없는 제품에는 숫자를 내놓지 않는다.
 *
 * 새로 계산하는 것은 둘뿐이다 — ① 이 제품 CN의 EU 기본값(연도별 mark-up 포함), ② 전구물질 몫을 실측/기본값으로 가르는 것.
 */

export type BarBlockKind = 'OWN' | 'PRECURSOR_ACTUAL' | 'PRECURSOR_MIXED' | 'PRECURSOR_DEFAULT';

export interface BarBlock {
    kind: BarBlockKind;
    label: string;
    /** tCO₂e / t 제품 */
    value: number;
}

export type DefaultColumn =
    | { available: true; value: number; yearLabel: string; country: string; productCount: number }
    | { available: false; reason: string };

export interface CumulativeBarModel {
    /** 입력이 하나도 없으면(예시 집계) 막대를 그리지 않는다. */
    empty: boolean;
    defaultColumn: DefaultColumn;
    /** 블록을 쌓을 수 있으면 블록, 아니면 빈 배열(대형 수치만 낸다). */
    blocks: BarBlock[];
    /** 인증서 기준 부분(SeeFlowBinding.seeCbamBasis). null = 산출 안 함 */
    headline: number | null;
    /** 인증서 기준에서 빠지는 보고용 몫(자체 전력 + 구매 원료 간접분). 간접 포함 품목이면 0 — 블록에 이미 들어 있다. */
    reportOnly: number;
    /** 인증서 기준 부분 중 실측 기반의 몫 0~1. 계산할 수 없으면 null. */
    measuredShare: number | null;
    /** 블록을 못 쌓은 이유(있을 때만) */
    blocksNote?: string;
    /** 기본값 − 내 값. 둘 다 있을 때만 */
    gap: { perTonne: number; percent: number } | null;
}

const YEAR_LABEL: Record<'2026' | '2027' | '2028_ONWARDS', string> = {
    '2026': '2026',
    '2027': '2027',
    '2028_ONWARDS': '2028~',
};

const SUM_TOLERANCE = 1e-6;
const relativelyEqual = (a: number, b: number) => Math.abs(a - b) <= Math.max(SUM_TOLERANCE, Math.abs(b) * 1e-4);

/** 이 보고기간의 신고 대상 결과에서, 그 CN의 EU 기본값을 생산량 가중평균한다. 하나라도 못 구하면 숫자를 내지 않는다. */
export function buildDefaultColumn(input: {
    results: LocalCalculationResult[];
    defaultValues?: ImportedDefaultValueReference;
    originCountry: string;
    year: '2026' | '2027' | '2028_ONWARDS';
}): DefaultColumn {
    const reportable = input.results.filter((result) => result.is_cbam_reportable && result.output_mass_t > 0);
    if (reportable.length === 0) {
        return { available: false, reason: '신고 대상 제품의 생산량을 넣으면 EU 기본값 기둥이 섭니다.' };
    }
    if (!input.defaultValues) {
        return { available: false, reason: 'EU 기본값 자료를 아직 불러오지 못했습니다. 앱을 다시 열거나 자료 업로드에서 가져오세요.' };
    }
    const processIds = new Set(reportable.map((result) => result.process_id));
    const hasInternalTransfer = reportable.some((result) => (result.internal_precursor_inputs ?? []).some((item) => processIds.has(item.source_process_id)));
    if (hasInternalTransfer) {
        return { available: false, reason: '사내 이송이 있는 공정이 함께 보입니다 — 공정 탭을 하나씩 골라 보세요(시장에 나간 양 기준이라 합산할 수 없습니다).' };
    }

    let weighted = 0;
    let weight = 0;
    const cnList = new Set<string>();
    for (const result of reportable) {
        const cnCode = (result.cn_code || result.hs_code || '').replace(/\D/g, '');
        if (cnCode.length < 4) {
            return { available: false, reason: `「${result.product_name}」의 CN 코드가 없어 EU 기본값을 찾을 수 없습니다 — 제품 CN을 입력해 주세요.` };
        }
        if (result.indirect_emissions_relevance === 'UNDETERMINED') {
            return { available: false, reason: `「${result.product_name}」의 간접배출 관련성을 판정하지 못해 비교할 기준 범위가 정해지지 않았습니다 — 확인 필요.` };
        }
        const row = findDefaultValueReference(input.defaultValues, input.originCountry, cnCode, input.year);
        if (!row) {
            return { available: false, reason: `${input.originCountry} · CN ${cnCode}의 EU 기본값을 찾지 못했습니다. 원산국과 CN을 확인하세요.` };
        }
        const resolved = resolveDefaultSeeForYear(row, input.year);
        // 인증서 기준에 맞춘다: 간접이 기준에 들어가는 품목은 총액, 아니면 직접분만(철강 DV는 간접 N/A라 둘이 같다).
        const comparable = result.indirect_emissions_relevance === 'INCLUDED' ? resolved.total : resolved.direct;
        weighted += comparable * result.output_mass_t;
        weight += result.output_mass_t;
        cnList.add(cnCode);
    }
    return { available: true, value: weighted / weight, yearLabel: YEAR_LABEL[input.year], country: input.originCountry, productCount: cnList.size };
}

/** 구매 전구물질의 직접·간접 배출을 신고 방식(실측·혼합·기본값)별로 가른다(tCO₂e). 결과의 합과 안 맞으면 null. */
function splitPrecursorByMode(
    results: LocalCalculationResult[],
    precursors: PurchasedPrecursor[],
    totals: { direct: number; indirect: number }
): Record<'ACTUAL' | 'SEMI_ACTUAL' | 'DEFAULT', { direct: number; indirect: number }> | null {
    const byId = new Map(precursors.map((precursor) => [precursor.id, precursor]));
    const split = {
        ACTUAL: { direct: 0, indirect: 0 },
        SEMI_ACTUAL: { direct: 0, indirect: 0 },
        DEFAULT: { direct: 0, indirect: 0 },
    };
    for (const result of results) {
        for (const input of result.precursor_inputs ?? []) {
            const precursor = byId.get(input.precursor_id);
            if (!precursor) {
                return null;
            }
            split[precursor.data_mode].direct += input.mass_t * precursor.direct_see_tco2e_per_t;
            split[precursor.data_mode].indirect += input.mass_t * precursor.indirect_see_tco2e_per_t;
        }
    }
    const direct = split.ACTUAL.direct + split.SEMI_ACTUAL.direct + split.DEFAULT.direct;
    const indirect = split.ACTUAL.indirect + split.SEMI_ACTUAL.indirect + split.DEFAULT.indirect;
    return relativelyEqual(direct, totals.direct) && relativelyEqual(indirect, totals.indirect) ? split : null;
}

export function buildCumulativeBar(input: {
    binding: SeeFlowBinding;
    /** 지금 보는 범위(공정 탭)의 결과 */
    results: LocalCalculationResult[];
    precursors: PurchasedPrecursor[];
    defaultValues?: ImportedDefaultValueReference;
    originCountry: string;
    year: '2026' | '2027' | '2028_ONWARDS';
}): CumulativeBarModel {
    const { binding } = input;
    const defaultColumn = buildDefaultColumn(input);

    if (binding.isExample) {
        return { empty: true, defaultColumn, blocks: [], headline: null, reportOnly: 0, measuredShare: null, gap: null };
    }

    const headline = binding.seeCbamBasis;
    const out = binding.outputMassT;
    const reportable = input.results.filter((result) => result.is_cbam_reportable);
    const gapOf = (): CumulativeBarModel['gap'] =>
        defaultColumn.available && headline !== null && defaultColumn.value > 0
            ? { perTonne: defaultColumn.value - headline, percent: ((defaultColumn.value - headline) / defaultColumn.value) * 100 }
            : null;

    const base = { empty: false, defaultColumn, headline, gap: gapOf() };
    const noBlocks = (note: string): CumulativeBarModel => ({ ...base, blocks: [], reportOnly: 0, measuredShare: null, blocksNote: note });

    if (headline === null || out <= 0) {
        return noBlocks(binding.indirectRelevance === 'UNDETERMINED' ? '간접배출 관련성 판정 전이라 기준 SEE를 산출하지 않습니다.' : '신고 대상이 아니라 기준 SEE가 없습니다.');
    }
    if (binding.indirectRelevance !== 'INCLUDED' && binding.indirectRelevance !== 'NOT_RELEVANT') {
        return noBlocks('제품마다 간접배출의 인증서 기준 반영이 달라 한 기둥으로 쌓지 않습니다 — 공정 탭을 하나씩 골라 보세요.');
    }

    const includeIndirect = binding.indirectRelevance === 'INCLUDED';
    const split = splitPrecursorByMode(reportable, input.precursors, { direct: binding.precursorDirectEmissions, indirect: binding.precursorIndirectEmissions });
    const perT = (value: number) => value / out;

    const blocks: BarBlock[] = [];
    const ownValue = perT(binding.directEmissions + (includeIndirect ? binding.ownIndirectEmissions : 0));
    blocks.push({ kind: 'OWN', label: includeIndirect ? '자체 연료·전력' : '자체 연료·공정', value: ownValue });
    let measured = ownValue;
    if (split) {
        const part = (mode: 'ACTUAL' | 'SEMI_ACTUAL' | 'DEFAULT') => perT(split[mode].direct + (includeIndirect ? split[mode].indirect : 0));
        const actual = part('ACTUAL');
        const mixed = part('SEMI_ACTUAL');
        const byDefault = part('DEFAULT');
        // 내부 이송 없는 범위에서만 구매 전구물질이 ③ 전부다. 사내 이송분(③에 더해진 몫)은 아래 합 검사가 걸러낸다.
        if (actual > 0) blocks.push({ kind: 'PRECURSOR_ACTUAL', label: '전구물질 실측', value: actual });
        if (mixed > 0) blocks.push({ kind: 'PRECURSOR_MIXED', label: '전구물질 일부 실측', value: mixed });
        if (byDefault > 0) blocks.push({ kind: 'PRECURSOR_DEFAULT', label: '전구물질 기본값', value: byDefault });
        measured += actual;
    } else {
        const precursorValue = perT(binding.precursorDirectEmissions + (includeIndirect ? binding.precursorIndirectEmissions : 0));
        if (precursorValue > 0) blocks.push({ kind: 'PRECURSOR_MIXED', label: '전구물질(실측·기본값 구분 불가)', value: precursorValue });
    }

    const stacked = blocks.reduce((sum, block) => sum + block.value, 0);
    if (!relativelyEqual(stacked, headline)) {
        // 사내 이송·열 귀속 등으로 블록 합이 엔진의 기준 SEE와 다르다 — 막대가 자기 숫자를 만들지 않는다.
        return noBlocks('이 범위는 사내 이송 등이 섞여 블록으로 나눌 수 없습니다 — 대형 수치만 엔진 결과 그대로 보여줍니다.');
    }

    return {
        ...base,
        blocks,
        reportOnly: includeIndirect ? 0 : perT(binding.ownIndirectEmissions + binding.precursorIndirectEmissions),
        measuredShare: split && headline > 0 ? Math.min(1, measured / headline) : null,
    };
}
