import type { LocalCalculationResult } from './calculation-engine';
import type { IndirectEmissionsRelevance } from './cbam-product-rules';

// SEE 산정 흐름도(SeeFlowDiagram)에 바인딩할 값. 절대배출(tCO₂e)과 SEE(tCO₂e/t)를 함께 담는다.
// 다이어그램은 이 순수 구조만 받아 그리므로, 예시/실데이터 전환과 화면 렌더링이 분리된다.
export interface SeeFlowBinding {
    isExample: boolean;
    productName?: string;
    cnCode?: string;
    // 인증서 산정 기준에 간접이 포함되는가 — 3상태.
    // boolean이면 「판정 불가」가 「제외」로 붕괴해, 흐름도가 판정 못 한 제품에 대해
    // 「신고 대상 아님」을 단정하고 「철강(CN 72/73) 규칙 기준」이라 말한다(씨밤이 P1).
    indirectRelevance: IndirectEmissionsRelevance;
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
    // 전부 간접 포함일 때만 '기준에 포함' 문구를 쓴다.
    const indirectRelevance: IndirectEmissionsRelevance = reportable.some((result) => result.indirect_emissions_relevance === 'UNDETERMINED')
        ? 'UNDETERMINED'
        : reportable.every((result) => result.indirect_emissions_relevance === 'INCLUDED')
            ? 'INCLUDED'
            : 'NOT_RELEVANT';
    const primary = basisResults[0] ?? reportable[0];

    return {
        isExample: false,
        productName: primary.product_name,
        cnCode: primary.cn_code,
        indirectRelevance,
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
