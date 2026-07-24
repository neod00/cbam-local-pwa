import type { LocalCalculationResult } from './calculation-engine';

/**
 * 흐름도 집계 상태. 제품별 3상태(IndirectEmissionsRelevance)와 다르다 —
 * 여러 제품을 한 장에 모으므로 「혼재」가 실재하고, 그걸 「비관련」으로 뭉치면
 * 총 SEE 항등식(총 = 기준 + 간접)이 깨진 채로 인쇄된다(씨밤이 D5).
 */
export type SeeFlowIndirectView = 'INCLUDED' | 'NOT_RELEVANT' | 'UNDETERMINED' | 'MIXED';

/** 흐름도·패널이 인쇄할 문안. 상태 타입 옆에 두어 4상태 전수 검사가 가능하게 한다. */
export interface SeeFlowIndirectLabels {
    /** 기준 SEE 상자의 산식 설명 */
    basisSub: string;
    /** 기준 SEE 상자의 판정 근거 */
    basisNote: string;
    /** 간접 SEE 상자 제목 */
    indirectLabel: string;
    /** 간접 SEE 상자 설명 */
    indirectNote: string;
    /** 기준 SEE와 총 SEE의 관계 서술(패널 하단 안내) */
    basisVsTotalNote: string;
    /** 총 SEE = 기준 + 간접 항등식을 인쇄해도 되는가 */
    showTotalIdentity: boolean;
}

/**
 * 집계 상태 → 문안. **컴포넌트가 직접 삼항식으로 만들지 않는다.**
 *
 * 왜 여기 있는가: 문안을 .tsx에 두면 상태가 늘 때마다 「N상태 위의 2상태 삼항식」이 생기고,
 * else 팔이 조용히 거짓을 단정한다. 실제로 그렇게 다섯 번 났다 —
 * 판정 불가가 「보고용」(제외 확정)으로, MIXED가 「제외」로 떨어졌다.
 * 상태 타입 옆에 두면 4상태 전수 검사가 가능하고, 소비자는 렌더만 한다.
 *
 * 그리고 「간접배출이 인증서 기준에서 빠진다」를 **판정 없이** 말하는 컴포넌트가 없어진다 —
 * 그 문장을 쓰려면 이 함수를 부르고, 이 함수는 상태를 요구한다.
 */
export function describeSeeFlowIndirect(
    view: SeeFlowIndirectView,
    basisExcludesUndetermined = false
): SeeFlowIndirectLabels {
    switch (view) {
        case 'INCLUDED':
            return {
                basisSub: '= ① + ② + ③ 전부',
                basisNote: '간접 포함 품목 기준',
                indirectLabel: '간접 SEE (기준에 포함)',
                indirectNote: '인증서 계산에도 포함',
                basisVsTotalNote: '이 품목은 간접분이 인증서 산정 기준에 포함되므로 기준 SEE와 총 SEE가 같습니다.',
                showTotalIdentity: false,
            };
        case 'NOT_RELEVANT':
            return {
                basisSub: '= ① 전부 + ③의 태운 몫',
                basisNote: 'EU 공식 CN 목록상 간접배출 비관련',
                indirectLabel: '간접 SEE (보고용)',
                indirectNote: '인증서 계산에서만 제외 · 입력 필수',
                basisVsTotalNote: '이 품목은 간접분이 인증서 산정 기준에서 빠지지만 보고에는 반드시 포함됩니다 — 그래서 기준과 총 SEE가 다릅니다.',
                // 항등식은 「전부 비관련」일 때만 성립한다. 포함이 섞이면 그 제품의 기준 SEE에
                // 이미 간접이 들어 있어 우변이 이중계상된다.
                showTotalIdentity: true,
            };
        case 'UNDETERMINED':
            return {
                basisSub: basisExcludesUndetermined ? '= 판정된 제품만 · 판정 불가 제품 제외' : '판정 전이라 산출하지 않음',
                basisNote: '간접배출 관련성 판정 불가 — 확인 필요',
                indirectLabel: '간접 SEE (기준 반영 여부 확인 필요)',
                indirectNote: '인증서 기준 반영 여부 확인 필요',
                basisVsTotalNote: '간접배출 관련성을 판정하지 못한 제품이 있어 기준 SEE와 총 SEE의 관계를 확정할 수 없습니다 — 확인 필요.',
                showTotalIdentity: false,
            };
        case 'MIXED':
            return {
                basisSub: '= 제품마다 다름 · 제품별 결과 참조',
                basisNote: '제품별 간접배출 관련성 상이',
                indirectLabel: '간접 SEE (제품마다 다름)',
                indirectNote: '제품별 결과 참조 — 일부는 기준에 포함',
                basisVsTotalNote: '제품마다 간접분의 인증서 기준 반영 여부가 달라, 기준 SEE와 총 SEE의 관계를 한 줄로 말할 수 없습니다 — 제품별 결과를 확인하세요.',
                showTotalIdentity: false,
            };
    }
}

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
