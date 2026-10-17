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

import type { ElectricityEfBasis, ReportElectricitySourceRow, ReportInputs } from './local-db';

export const ELECTRICITY_EF_CITATION = 'Commission Implementing Regulation (EU) 2025/2547 point D.4 / Article 9';

/**
 * 설비 전력의 국가 기본계수(계통 평균)의 공식 출처. 부속서 III(EU로 수입되는 전력용)과 혼동하지 않는다 — 설비 전력은 부속서 II.
 * 표 전체(약 126개국)는 IEA 자료라 CC BY-NC-SA 4.0(비상업 목적의 재사용만 허용 — 규정 본문의 고지)이므로 앱은 **두 값만** 내장한다:
 * 사용자 대부분이 한국 업체라서 한국, 그리고 「목록에 없는 나라」 행. 나머지 나라는 사용자가 표에서 찾아 넣는다.
 * 내장한 값은 EU 관보 원문(2026-10-17 확인)과 같다: Korea, Republic of (South Korea) 0,475 · Other countries and territories 0,465.
 */
export const ELECTRICITY_GRID_FACTOR_SOURCE = 'Commission Implementing Regulation (EU) 2025/2621 Annex II';

export interface GridDefaultFactor {
    key: 'KR' | 'OTHER';
    label: string;
    value: number;
    /** 부속서 II 표의 행 이름(원문 그대로) */
    tableRow: string;
}

export const GRID_DEFAULT_FACTORS: readonly GridDefaultFactor[] = [
    { key: 'KR', label: '한국', value: 0.475, tableRow: 'Korea, Republic of (South Korea)' },
    { key: 'OTHER', label: '목록에 없는 나라·지역', value: 0.465, tableRow: 'Other countries and territories' },
];

/** 내장 값을 쓸 때 보고서 입력(제7장)에 자동으로 적는 출처 — 사용자가 이미 적은 칸은 덮어쓰지 않는다. */
export const GRID_FACTOR_META = { publisher: 'European Commission', document: 'Implementing Regulation (EU) 2025/2621 Annex II', vintage: '2025' } as const;

export const GRID_FACTOR_LICENSE_NOTE =
    '내장한 두 값은 EU 규정 2025/2621 부속서 II 표에서 가져왔습니다. 그 표는 IEA 자료로 CC BY-NC-SA 4.0 — 비상업 목적의 재사용만 허용됩니다(규정 본문의 고지).';

export const ELECTRICITY_GRID_FACTOR_GUIDE =
    '국가 기본계수는 Implementing Regulation (EU) 2025/2621 부속서 II의 「Country or territory / Emission factor」 표에서 찾습니다 — 목록에 없는 나라는 「Other countries and territories」 행입니다. 앱에는 한국과 「목록에 없는 나라」 두 값만 들어 있으니(위 단추), 그 밖의 나라는 표에서 값을 찾아 직접 넣으세요.';

/** 사업장 국가가 한국이면 내장 한국 값을 돌려준다(국가 코드 KR). 그 밖의 나라는 앱이 모른다 — 「목록에 없는 나라」 값을 대신 쓰지 않는다(그 나라가 표에 따로 있을 수 있다). */
export function gridDefaultFor(country: string | undefined): GridDefaultFactor | undefined {
    return (country ?? '').trim().toUpperCase() === 'KR' ? GRID_DEFAULT_FACTORS[0] : undefined;
}

/** 입력값이 내장 값 중 하나와 같은가 */
export function matchGridDefault(ef: number): GridDefaultFactor | undefined {
    return GRID_DEFAULT_FACTORS.find((item) => Math.abs(item.value - ef) < 1e-9);
}

/**
 * 공정의 전력 배출계수로 내장 값을 썼다면 보고서 입력(제7장)의 출처(공표기관·문서·연도)를 채운다. 아니면(다른 값·다른 출처 유형) undefined.
 * 이미 적힌 칸은 덮어쓰지 않는다 — 사용자가 다르게 적었다면 그것이 맞다.
 */
export function withGridFactorMeta(inputs: ReportInputs | undefined, processId: string, ef: number, efSource: string | undefined): ReportInputs | undefined {
    if (efSource !== 'COUNTRY_GRID_DEFAULT' || !matchGridDefault(ef)) return undefined;
    const rows = inputs?.electricity_ef_meta ?? [];
    const existing = rows.find((row) => row.process_id === processId);
    const merged = {
        ...(existing ?? { process_id: processId }),
        publisher: existing?.publisher || GRID_FACTOR_META.publisher,
        document: existing?.document || GRID_FACTOR_META.document,
        vintage: existing?.vintage || GRID_FACTOR_META.vintage,
    };
    if (existing && existing.publisher === merged.publisher && existing.document === merged.document && existing.vintage === merged.vintage) return undefined;
    return { ...(inputs ?? {}), electricity_ef_meta: [...rows.filter((row) => row.process_id !== processId), merged] };
}

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

/** 5단계(생산공정)의 「계수 출처」 선택지 → 제7장 산정근거 유형. */
const PROCESS_SOURCE_TO_BASIS: Record<string, ElectricityEfBasis> = {
    COUNTRY_GRID_DEFAULT: 'GRID_AVERAGE',
    DIRECT_TECHNICAL_LINK: 'DIRECT_LINK',
    PPA: 'PPA',
    INSTALLATION_OWN: 'SELF_GENERATION',
    MIX: 'MULTI_SOURCE',
};

/**
 * 제7장 산정근거를 정한다. 보고서 입력에서 고른 값이 있으면 그것, 없으면 **5단계에서 사람이 고른
 * 계수 출처**를 잇는다. 종전에는 둘이 이어지지 않아, 같은 전력계수가 EU 사본에는 D.4(a)로 나가고
 * 산정보고서에는 「미분류 — 기재 필요」로 나갔다(씨밤이 run11 P1-20). 앱이 새로 정하는 것이 아니라
 * 사용자가 이미 고른 값을 옮기는 것이다. 전력을 입력하지 않았으면 잇지 않는다.
 */
export function resolveElectricityEfBasis(
    reportBasis: ElectricityEfBasis | undefined,
    process: { electricity_mwh: number; electricity_ef_source?: string }
): ElectricityEfBasis {
    if (reportBasis && reportBasis !== 'UNCLASSIFIED') {
        return reportBasis;
    }
    if (process.electricity_mwh > 0 && process.electricity_ef_source) {
        return PROCESS_SOURCE_TO_BASIS[process.electricity_ef_source] ?? 'UNCLASSIFIED';
    }
    return 'UNCLASSIFIED';
}

