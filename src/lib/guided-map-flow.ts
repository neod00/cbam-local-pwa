import type { LocalCalculationResult } from './calculation-engine';
import type { GuidedStepId, GuidedStepState } from './guided-map';
import type { PurchasedPrecursor } from './local-db';
import { describeSeeFlowIndirect, type SeeFlowBinding } from './see-flow';

/**
 * 지도 강화(UX 컨셉 v4 §5) — 입력 상자에서 「÷ 생산량」으로 가는 선의 굵기·흐름과, 상자에 붙는 값 출처 표시.
 *
 * 그리지 않고 정한다. 지도(GuidedMap)는 이 결과를 받아 그리기만 한다. 새 산술은 없다 —
 * 굵기는 SeeFlowBinding이 이미 집계한 ①②③의 비중이고, 전력 선은 배출량만큼 굵게 그리지 않는다(보고용 흐름, v4 §8).
 * 간접배출이 인증서 기준에 드는지에 관한 말은 describeSeeFlowIndirect만 쓴다.
 */

export type MapEdgeKey = 'fuel' | 'electricity' | 'precursors';

export interface MapEdge {
    /** SVG stroke-width */
    width: number;
    /** 점선 = 보고용 흐름(전력). 인증서 기준에 드는 선은 실선이다. */
    reportOnly: boolean;
    /** 점이 흘러가는 애니메이션을 건다 — 값이 들어와 있는 입력 상자의 선만. 보고용 선은 흐르지 않는다. */
    flowing: boolean;
    /** 호버 설명(`<title>`) */
    description: string;
}

export type NodeProvenanceKind = 'OWN' | 'ACTUAL' | 'MIXED' | 'DEFAULT';

export interface NodeProvenance {
    kind: NodeProvenanceKind;
    /** 상자에 붙는 작은 표시 */
    label: string;
}

export interface GuidedMapFlow {
    edges: Record<MapEdgeKey, MapEdge>;
    provenance: Partial<Record<GuidedStepId, NodeProvenance>>;
}

export const EDGE_MIN_WIDTH = 1.5;
export const EDGE_MAX_WIDTH = 7;

const PROVENANCE_LABEL: Record<NodeProvenanceKind, string> = {
    OWN: '자사 입력',
    ACTUAL: '실측',
    MIXED: '일부 실측',
    DEFAULT: 'EU 기본값',
};

const STEP_BY_EDGE: Record<MapEdgeKey, GuidedStepId> = { fuel: 'fuel', electricity: 'electricity', precursors: 'precursors' };

const fmt = (value: number, digits = 1) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

/** 지금 보는 범위의 결과가 쓴 구매 전구물질만 골라, 신고 방식으로 한 표시를 만든다. 기록이 없으면 undefined. */
export function provenanceOfPrecursors(results: LocalCalculationResult[], precursors: PurchasedPrecursor[]): NodeProvenance | undefined {
    const ids = new Set(results.flatMap((result) => (result.precursor_inputs ?? []).map((input) => input.precursor_id)));
    const used = precursors.filter((precursor) => ids.has(precursor.id));
    if (used.length === 0) {
        return undefined;
    }
    const modes = new Set(used.map((precursor) => precursor.data_mode));
    const kind: NodeProvenanceKind = modes.size === 1 && modes.has('ACTUAL')
        ? 'ACTUAL'
        : modes.size === 1 && modes.has('DEFAULT')
            ? 'DEFAULT'
            : 'MIXED';
    return { kind, label: PROVENANCE_LABEL[kind] };
}

export function buildMapFlow(input: {
    binding: SeeFlowBinding;
    steps: GuidedStepState[];
    results: LocalCalculationResult[];
    precursors: PurchasedPrecursor[];
}): GuidedMapFlow {
    const { binding, steps } = input;
    const done = (id: GuidedStepId) => steps.find((step) => step.id === id)?.status === 'done';
    const labels = describeSeeFlowIndirect(binding.indirectRelevance, binding.basisExcludesUndetermined);
    const includesIndirect = binding.indirectRelevance === 'INCLUDED';

    // 인증서 기준 부분의 비중. 간접이 기준에 드는 품목만 전력·전구물질 간접분이 분모에 든다.
    const parts: Record<MapEdgeKey, number> = {
        fuel: Math.max(0, binding.directEmissions),
        electricity: includesIndirect ? Math.max(0, binding.ownIndirectEmissions) : 0,
        precursors: Math.max(0, binding.precursorDirectEmissions + (includesIndirect ? binding.precursorIndirectEmissions : 0)),
    };
    const total = parts.fuel + parts.electricity + parts.precursors;
    const shareOf = (key: MapEdgeKey) => (total > 0 ? parts[key] / total : 0);
    const widthOf = (key: MapEdgeKey) => (binding.isExample ? EDGE_MIN_WIDTH : EDGE_MIN_WIDTH + (EDGE_MAX_WIDTH - EDGE_MIN_WIDTH) * shareOf(key));

    const solidEdge = (key: MapEdgeKey, name: string, tonnes: number): MapEdge => {
        const active = !binding.isExample && done(STEP_BY_EDGE[key]);
        return {
            width: widthOf(key),
            reportOnly: false,
            flowing: active,
            description: active
                ? `${name}: ${fmt(tonnes)} tCO₂e — 인증서 기준 부분의 ${fmt(shareOf(key) * 100, 0)}% (선이 굵을수록 배출 기여가 큽니다)`
                : `${name}: 아직 입력 전`,
        };
    };

    const edges: GuidedMapFlow['edges'] = {
        fuel: solidEdge('fuel', '① 연료 직접배출', binding.directEmissions),
        precursors: solidEdge('precursors', '③ 구매 전구물질', parts.precursors),
        electricity: includesIndirect
            ? solidEdge('electricity', '② 전력 간접배출', binding.ownIndirectEmissions)
            : {
                // 전력 선은 배출량만큼 굵게 그리지 않는다. 점선·가는 선으로 「보고용 흐름」임을 구분한다.
                width: EDGE_MIN_WIDTH,
                reportOnly: true,
                flowing: false,
                description: binding.isExample || !done('electricity')
                    ? '② 전력: 아직 입력 전'
                    : `② 전력 ${fmt(binding.ownIndirectEmissions)} tCO₂e — ${labels.indirectNote}`,
            },
    };

    const provenance: GuidedMapFlow['provenance'] = {};
    if (!binding.isExample) {
        if (done('fuel')) provenance.fuel = { kind: 'OWN', label: PROVENANCE_LABEL.OWN };
        if (done('electricity')) provenance.electricity = { kind: 'OWN', label: PROVENANCE_LABEL.OWN };
        const precursorProvenance = done('precursors') ? provenanceOfPrecursors(input.results, input.precursors) : undefined;
        if (precursorProvenance) provenance.precursors = precursorProvenance;
    }

    return { edges, provenance };
}
