import type { LocalCalculationResult } from './calculation-engine';

/**
 * 흐름도 집계 상태. 제품별 3상태(IndirectEmissionsRelevance)와 다르다 —
 * 여러 제품을 한 장에 모으므로 「혼재」가 실재하고, 그걸 「비관련」으로 뭉치면
 * 총 SEE 항등식(총 = 기준 + 간접)이 깨진 채로 인쇄된다(씨밤이 D5).
 */
export type SeeFlowIndirectView = 'INCLUDED' | 'NOT_RELEVANT' | 'UNDETERMINED' | 'MIXED';

// SEE 산정 흐름도(SeeFlowDiagram)에 바인딩할 값. 절대배출(tCO₂e)과 SEE(tCO₂e/t)를 함께 담는다.
// 다이어그램은 이 순수 구조만 받아 그리므로, 예시/실데이터 전환과 화면 렌더링이 분리된다.
export interface SeeFlowBinding {
    isExample: boolean;
    productName?: string;
    cnCode?: string;
    // 흐름도는 여러 제품을 한 장에 집계하므로, 제품별 3상태와 별개로 **집계 상태**가 필요하다.
    // 「전부 비관련」과 「포함·비관련 혼재」를 뭉치면 총 SEE 항등식이 성립하지 않는데도 인쇄한다(씨밤이 D5).
    indirectRelevance: SeeFlowIndirectView;
    /** 집계에 판정 불가 제품이 섞였는가 — 기준 SEE가 그 제품을 빼고 계산됐다는 뜻(씨밤이 D3). */
    basisExcludesUndetermined: boolean;
    outputMassT: number;
    directEmissions: number; // ① 자체 연료·공정 직접배출 (tCO₂e)
    ownIndirectEmissions: number; // ② 자체 전력 간접배출, 제외 적용 전 총량 (tCO₂e)
    precursorDirectEmissions: number; // ③ 전구물질의 직접분 (tCO₂e)
    precursorIndirectEmissions: number; // ③ 전구물질의 간접분 (tCO₂e)
    seeCbamBasis: number | null; // CBAM 산정 기준 SEE (tCO₂e/t), 신고 대상 아니면 null
    seeIndirect: number; // 간접 SEE(자체+전구물질) (tCO₂e/t)
    seeTotal: number; // 총 SEE(내부 검토용, informational) (tCO₂e/t)
}

// 데이터가 없을 때 보여줄 가상 예시(강선). 씨밤이 검토를 반영한 v2 수치이며, 산술이 자기정합적이다.
// (200 + 1,890) / 1,000 = 2.09 · (225 + 315) / 1,000 = 0.54 · 합계 2.63
export const EXAMPLE_SEE_FLOW: SeeFlowBinding = {
    isExample: true,
    productName: '강선(예시)',
    cnCode: '7217',
    indirectRelevance: 'NOT_RELEVANT',
    basisExcludesUndetermined: false,
    outputMassT: 1000,
    directEmissions: 200,
    ownIndirectEmissions: 225,
    precursorDirectEmissions: 1890,
    precursorIndirectEmissions: 315,
    seeCbamBasis: 2.09,
    seeIndirect: 0.54,
    seeTotal: 2.63,
};

// 산정 결과 목록을 다이어그램 한 장으로 집계한다. 신고 대상(reportable) 공정/생산라인만 사용하며,
// 절대배출은 합계, SEE는 생산량 가중평균으로 모은다. 대상이 없으면 예시로 대체한다.
export function buildSeeFlowBinding(results: LocalCalculationResult[]): SeeFlowBinding {
    const reportable = results.filter((result) => result.is_cbam_reportable);
    const output = reportable.reduce((sum, result) => sum + result.output_mass_t, 0);

    if (reportable.length === 0 || output <= 0) {
        return EXAMPLE_SEE_FLOW;
    }

    const directEmissions = reportable.reduce((sum, result) => sum + result.direct_emissions_tco2e, 0);
    const ownIndirectEmissions = reportable.reduce((sum, result) => sum + result.indirect_emissions_gross_tco2e, 0);
    const precursorDirectEmissions = reportable.reduce(
        (sum, result) => sum + result.precursor_direct_see * result.output_mass_t,
        0
    );
    const precursorIndirectEmissions = reportable.reduce(
        (sum, result) => sum + result.precursor_indirect_see * result.output_mass_t,
        0
    );

    // CBAM 산정 기준 SEE는 값이 null이 아닌 결과만 가중평균한다(신고 대상 아닌 공정은 null).
    const basisResults = reportable.filter((result) => result.see_cbam_basis !== null);
    const basisOutput = basisResults.reduce((sum, result) => sum + result.output_mass_t, 0);
    const seeCbamBasis = basisOutput > 0
        ? basisResults.reduce((sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t, 0) / basisOutput
        : null;

    const seeIndirect = reportable.reduce(
        (sum, result) => sum + result.see_indirect_incl_precursor * result.output_mass_t,
        0
    ) / output;
    const seeTotal = reportable.reduce(
        (sum, result) => sum + result.see_informational_total * result.output_mass_t,
        0
    ) / output;

    // 하나라도 판정 불가면 판정 불가로 본다 — 모르는 것을 안전하게 가정하지 않는다.
    // 「전부 포함」·「전부 비관련」만 그렇게 부르고, 섞였으면 MIXED다. 혼재를 「비관련」으로
    // 부르면 총 SEE 항등식이 성립하지 않는데도 인쇄된다(씨밤이 D5).
    const hasUndetermined = reportable.some((result) => result.indirect_emissions_relevance === 'UNDETERMINED');
    const indirectRelevance: SeeFlowIndirectView = hasUndetermined
        ? 'UNDETERMINED'
        : reportable.every((result) => result.indirect_emissions_relevance === 'INCLUDED')
            ? 'INCLUDED'
            : reportable.every((result) => result.indirect_emissions_relevance === 'NOT_RELEVANT')
                ? 'NOT_RELEVANT'
                : 'MIXED';
    const primary = basisResults[0] ?? reportable[0];

    return {
        isExample: false,
        productName: primary.product_name,
        cnCode: primary.cn_code,
        indirectRelevance,
        // 기준 SEE는 basisResults(값이 있는 것)만 가중평균한다. 판정 불가 제품이 섞였으면
        // 그 제품이 빠진 값이므로, 화면이 그 사실을 말해야 한다.
        basisExcludesUndetermined: hasUndetermined && basisResults.length > 0,
        outputMassT: output,
        directEmissions,
        ownIndirectEmissions,
        precursorDirectEmissions,
        precursorIndirectEmissions,
        seeCbamBasis,
        seeIndirect,
        seeTotal,
    };
}
