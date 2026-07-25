// 전력 배출계수 산정근거 — Commission Implementing Regulation (EU) 2025/2547 point D.4 / Article 9.
//
// 왜 이 파일이 필요한가:
//   씨밤이 검증심사(2547 대조)의 P1: 소결광은 간접배출이 인증서 기준 SEE에 포함되므로 전력계수
//   0.4594가 기준값의 6.7%를 차지한다. 그런데 그 계수가 계통 평균(default)인지 실측 주장인지
//   보고서가 밝히지 않아, 검증인이 「default(쉬움)냐 actual(D.4.3 증빙 필요)이냐」조차 판별 못 했다.
//
// 규정 구조 (원문 D.4):
//   전력 EF는 다음 중 하나로 정한다.
//     · 원산지국 계통 평균 (기본) — Annex IV(2023/956)에 따라 공표된 값
//     · 대체 default (D.4.4) — 제3국 계통이 더 낮음을 공표자료로 입증할 때
//     · 실측 (D.4.1~D.4.3) — 직접 기술연결 또는 PPA + 스마트미터 증빙이 있을 때만
//   다출처(Article 9): 공급원별 EF를 소비 비중으로 가중평균. 단일 공급원은 증빙 있으면 그 값.
//
// 앱은 유형을 대신 정하지 않는다 — 기본 UNCLASSIFIED, 사용자가 고른다(계수 출처 유형과 같은 원칙).

import type { ElectricityEfBasis, ReportElectricitySourceRow } from './local-db';

export const ELECTRICITY_EF_CITATION = 'Commission Implementing Regulation (EU) 2025/2547 point D.4 / Article 9';

export const ELECTRICITY_EF_BASIS_LABEL: Record<ElectricityEfBasis, string> = {
    GRID_AVERAGE: '원산지국 계통 평균 (default)',
    DIRECT_LINK: '직접 기술연결 (actual)',
    PPA: 'PPA — 전력구매계약 (actual)',
    SELF_GENERATION: '자가발전',
    MULTI_SOURCE: '다출처 혼합 (Article 9 가중평균)',
    UNCLASSIFIED: '미분류',
};

/** actual(실측) 근거인지 — D.4.3 증빙이 필요한 유형. */
export function isActualBasis(basis?: ElectricityEfBasis): boolean {
    return basis === 'DIRECT_LINK' || basis === 'PPA';
}

/**
 * D.4.3 증빙 목록 — 원문 verbatim. 직접연결·PPA 각각 4항목.
 * 실측 계수를 인정받으려면 이 증빙을 검증인에게 제출해야 한다.
 */
export const D43_EVIDENCE: Record<'DIRECT_LINK' | 'PPA', string[]> = {
    DIRECT_LINK: [
        'single line diagram demonstrating the existence of a direct technical link between the installation in which the imported good is produced and the electricity generation source;',
        'data from a smart metering system demonstrating that the amount of electricity … was produced by the installation producing electricity connected by the direct technical link … with reference to measurements periods not exceeding an hour;',
        'data from a smart metering system demonstrating that the amount of electricity … was delivered, within the same measurement period not exceeding one hour, to an installation connected by the direct technical link and producing a good listed in Annex I;',
        'a contract between the operators of the two installations (or an intra-company off-take agreement where owned by the same legal entity) requiring delivery of at least the amount of electricity for which the actual emissions are claimed;',
    ],
    PPA: [
        'contractual evidence demonstrating the existence of a PPA concluded directly between the good-producing installation and a producer of electricity in a third country for the physical delivery of electricity (single contract even if through an intermediary);',
        'data from a smart metering system demonstrating that a given amount of electricity was produced by the installation producing electricity … the period of time of production;',
        'data from a smart metering system demonstrating that an equivalent amount of electricity was delivered, within the same measurement period not exceeding one hour, to the good-producing installation;',
        'written documentation (from transmission system operators, public authorities or other reliable public sources) demonstrating a physical grid connection between the electricity-producing and the good-producing installations.',
    ],
};

export interface WeightedAverage {
    /** Σ(EFᵢ × MWhᵢ) / Σ(MWhᵢ). 유효한 행이 없으면 undefined. */
    ef?: number;
    totalMwh: number;
    usableRows: number;
    /** 파싱 불가·음수 등으로 계산에서 빠진 행 수. */
    droppedRows: number;
}

/**
 * Article 9(1) 가중평균 — 공급원별 EF를 소비 전력량 비중으로 가중.
 * 문자열 입력을 관대하게 파싱하되, 숫자가 아니거나 음수인 행은 버리고 그 수를 보고한다
 * (조용히 0으로 넣으면 가중평균이 왜곡된다).
 */
export function weightedAverageEf(sources: ReportElectricitySourceRow[] | undefined): WeightedAverage {
    let weighted = 0;
    let totalMwh = 0;
    let usableRows = 0;
    let droppedRows = 0;

    for (const source of sources ?? []) {
        const mwh = Number((source.mwh ?? '').replace(/,/g, ''));
        const ef = Number((source.ef ?? '').replace(/,/g, ''));

        if (!Number.isFinite(mwh) || !Number.isFinite(ef) || mwh < 0 || ef < 0 || (source.mwh ?? '').trim() === '' || (source.ef ?? '').trim() === '') {
            if ((source.mwh ?? '').trim() !== '' || (source.ef ?? '').trim() !== '' || (source.name ?? '').trim() !== '') {
                droppedRows += 1;
            }
            continue;
        }

        weighted += ef * mwh;
        totalMwh += mwh;
        usableRows += 1;
    }

    return {
        ef: totalMwh > 0 ? weighted / totalMwh : undefined,
        totalMwh,
        usableRows,
        droppedRows,
    };
}
