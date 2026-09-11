import type { ActivityLevelRole, DirectEmissionsInputMode, ProductOutputLine, ProductReportingScope, ProductionProcess, SourceStream } from './local-db';
import { calculateSourceStreamEmissions } from './source-stream-calculation';

/**
 * 할당(배분·귀속) 규칙 — 2025/2547 원문 대조본.
 *
 * 각 규칙 ID는 앱 내부 식별자다. 근거 조문은 pdftotext 원문(OJ L 2025/2547)에서 그대로 옮겼고,
 * 원문에서 확인되지 않는 것은 「규정 필수」로 표시하지 않았다. 규정이 정한 것(필수)과
 * 앱이 추적성을 위해 스스로 요구하는 것(내부 통제)을 kind로 구분한다 — 보고서와 화면이
 * 이 구분을 그대로 인용하므로, 여기서 섞으면 앱이 규정에 없는 의무를 주장하게 된다.
 */
export const ALLOCATION_CITATION = 'Commission Implementing Regulation (EU) 2025/2547';

export type AllocationRuleKind = '규정 필수' | '규정상 허용' | '앱 내부 통제' | '권고';

export interface AllocationRule {
    id: string;
    kind: AllocationRuleKind;
    anchor: string;
    /** 원문 인용(영문 그대로) 또는 앱 통제 문구. */
    text: string;
    /** 현재 버전에서 계산에 반영하지 않는 규칙이면 true — 화면·보고서에 「현재 버전에서 미지원」으로 표기. */
    unsupported?: boolean;
}

export const ALLOCATION_RULES = {
    DIRECT_INPUT: {
        id: 'CBAM-ALLOC-DIRECT-01',
        kind: '앱 내부 통제',
        anchor: 'ANNEX II A.5(7) monitoring plan · ANNEX IV 1.1 item 29 · ANNEX III A.3 (DirEm*)',
        text: '직접귀속배출량을 배출원 합계로 정했는지, 사용자가 입력했는지, 템플릿 업로드로 채웠는지 기록한다. 규정은 방법의 문서화(모니터링 계획)와 보고서의 귀속배출 산정방법 기재를 요구하고, 이 값이 어디서 왔는지는 앱이 스스로 남겨야 검증인이 대조할 수 있다.',
    },
    ACTIVITY_LEVEL: {
        id: 'CBAM-ALLOC-AL-01',
        kind: '규정 필수',
        anchor: 'ANNEX II, point F (Monitoring of activity levels)',
        text: 'Only goods which can be sold or directly used as precursor in another production process shall be taken into account. Off-spec products, by-products, waste, and scrap produced in a production process, irrespective of whether they are returned to production processes, delivered to other installations, or disposed of, shall not be included in the determination of the activity level. They shall therefore be assigned zero embedded emissions when entering another production process.',
    },
    RECONCILIATION: {
        id: 'CBAM-ALLOC-RECF-01',
        kind: '규정 필수',
        anchor: 'ANNEX III, point A.1, Equations 41–42 (공정별 보조계량기가 있을 때)',
        text: "Where several measuring instruments of different quality are contributing to measurement results, and the sum of the production process data is different from the data determined separately for the installation, a uniform 'reconciliation factor' is applied for uniform correction to meet the total figure of the installation as follows: RecF = DInst / DPP … DPP,corr = DPP × RecF",
    },
    KEY_SPLIT: {
        id: 'CBAM-ALLOC-RECF-02',
        kind: '규정상 허용',
        anchor: 'ANNEX III, point A.1 last sentence · point A.2 (공정별 측정값이 없을 때)',
        text: 'Where data for a specific data set are not available for each production process, inputs, outputs, and corresponding emissions shall be attributed based on the rules set in point A.2 — attribution will be based on a relevant underlying physical relationship. 배분키(운전시간·정격용량·생산량 등)로 나눈 행에는 정합계수를 적용하지 않는다(정의상 합계=총량).',
    },
    MANUAL_SCOPE: {
        id: 'CBAM-ALLOC-MANUAL-01',
        kind: '규정 필수',
        anchor: 'ANNEX III, point A.2 second paragraph · Article 4(2)',
        text: 'With the exception of the rules specified in points A.2.1, A.2.2 and A.2.3 of this Annex, inputs, outputs, and corresponding emissions shall be attributed based on the functional unit of individual goods produced. — 한 공정 안 재화 간 귀속은 기능단위(CN별 톤 = 질량)가 원칙이며, 열(A.2.2)·폐가스(A.2.3)·화학물질 몰비(A.2.1) 외의 사용자 지정 비율은 규정에 근거가 없다.',
    },
    MANUAL_SUM: {
        id: 'CBAM-ALLOC-MANUAL-02',
        kind: '앱 내부 통제',
        anchor: 'ANNEX III, point A.2.2 last paragraph',
        text: '사용자 지정 배분율의 합계는 100%여야 한다 — 100% 미만은 배출 누락, 초과는 이중계상이다. 원문의 「without any omission or double counting」 원칙을 따른다.',
    },
    MANUAL_REASON: {
        id: 'CBAM-ALLOC-MANUAL-03',
        kind: '앱 내부 통제',
        anchor: 'ANNEX II A.5(7) · ANNEX IV 1.1 item 29 (attribution method to be documented and reported)',
        text: '사용자 지정 배분을 쓰면 어떤 물리적 관계(예외 사유)와 증빙에 근거했는지 남긴다 — 모니터링 계획과 운영자 보고서가 귀속 방법의 기술을 요구한다.',
    },
    SINGLE_PROCESS: {
        id: 'CBAM-ALLOC-ROUTE-01',
        kind: '규정 필수',
        anchor: 'Article 4(6) · Article 4(2)',
        text: 'Where goods to which the same functional unit applies are produced using different production routes within an installation, a single production process shall be used encompassing all production routes.',
    },
    ADJUSTMENTS: {
        id: 'CBAM-ALLOC-ADJ-01',
        kind: '규정 필수',
        anchor: 'ANNEX III, point A.3, Equation 55',
        text: 'AttrEmDir = DirEm* + EmH,imp − EmH,exp + WGcorr,imp − WGcorr,exp − Emel,prod (측정 가능한 열 수입·수출, 폐가스 수입·수출, 공정 내 자가발전 보정)',
        unsupported: true,
    },
} as const satisfies Record<string, AllocationRule>;

// ── 직접배출 입력방식 ─────────────────────────────────────────────────

export const DIRECT_EMISSIONS_INPUT_MODE_LABEL: Record<DirectEmissionsInputMode | 'UNSPECIFIED', string> = {
    SOURCE_STREAM_SUM: '배출원 자료 합계',
    MANUAL_TOTAL: '사용자 입력(수기 값)',
    TEMPLATE_UPLOAD: '활동자료 템플릿 업로드 값',
    UNSPECIFIED: '미지정(수기 값 사용)',
};

/** 저장된 방식. 없으면 UNSPECIFIED — 기존 자료를 어느 한쪽으로 단정하지 않는다. */
export function getDirectEmissionsInputMode(
    process: Pick<ProductionProcess, 'direct_emissions_input_mode'>
): DirectEmissionsInputMode | 'UNSPECIFIED' {
    return process.direct_emissions_input_mode ?? 'UNSPECIFIED';
}

// ── 활동수준 포함 여부 ────────────────────────────────────────────────

export const ACTIVITY_LEVEL_ROLE_LABEL: Record<ActivityLevelRole, string> = {
    GOOD: '활동수준 포함 (판매 가능 · 전구물질로 사용)',
    EXCLUDED: '활동수준 제외 (불량 · 부산물 · 폐기물 · 스크랩 → 배출 0)',
};

/** 이 보고범위면 사용자가 「부산물인가, 정규 제품인가」를 직접 골라야 한다. 앱이 대신 정하지 않는다. */
const ROLE_CONFIRMATION_SCOPES: ReadonlySet<ProductReportingScope> = new Set(['WASTE_RECYCLE', 'NON_CBAM_COPRODUCT']);

export interface ResolvedActivityLevelRole {
    role: ActivityLevelRole;
    /** 사용자가 명시했는가. false면 기존 자료 기본값(GOOD)이다. */
    explicit: boolean;
    /** 명시하지 않았고 보고범위가 폐기물·공동산출물이라 확인이 필요하다. */
    needsConfirmation: boolean;
}

/**
 * 라인의 활동수준 역할. 기존 자료(undefined)는 GOOD으로 다뤄 숫자를 바꾸지 않되,
 * 폐기물·재활용·비CBAM 공동산출물 범위면 needsConfirmation을 세운다 — 점 F가 그 라인을
 * 제외하라고 요구할 수 있는데 앱은 그 라인이 「판매 가능한 정규 제품」인지 「부산물」인지 모른다.
 */
export function resolveActivityLevelRole(
    line: Pick<ProductOutputLine, 'activity_level_role'>,
    scope: ProductReportingScope
): ResolvedActivityLevelRole {
    if (line.activity_level_role === 'EXCLUDED' || line.activity_level_role === 'GOOD') {
        return { role: line.activity_level_role, explicit: true, needsConfirmation: false };
    }

    return { role: 'GOOD', explicit: false, needsConfirmation: ROLE_CONFIRMATION_SCOPES.has(scope) };
}

/** 신규 라인의 기본 역할 — 폐기물·재활용은 점 F가 제외를 명시하므로 EXCLUDED, 그 외는 GOOD. */
export function defaultActivityLevelRole(scope: ProductReportingScope): ActivityLevelRole {
    return scope === 'WASTE_RECYCLE' ? 'EXCLUDED' : 'GOOD';
}

// ── 배분기준 화면 명칭 ────────────────────────────────────────────────

export type AllocationBasisKey = ProductOutputLine['allocation_basis'] | 'PROCESS_TOTAL' | 'ACTIVITY_LEVEL_EXCLUDED';

/** 화면 명칭. MANUAL은 「수동 비율」이 아니라 「사용자 지정 배분」 — 임의 비율이 아니라 근거 있는 배분임을 이름이 요구한다. */
export const ALLOCATION_BASIS_LABEL: Record<AllocationBasisKey, string> = {
    PROCESS_TOTAL: '공정 전체',
    MASS: '질량 기준',
    MANUAL: '사용자 지정 배분 (규정 예외 — 사유 필요)',
    ACTIVITY_LEVEL_EXCLUDED: '활동수준 제외 (배출 0)',
};

/** 사용자 지정 배분율 합계 허용 오차(%p). */
export const MANUAL_ALLOCATION_SUM_TOLERANCE = 0.01;

export function hasManualAllocationReason(
    line: Pick<ProductOutputLine, 'manual_allocation_reason' | 'manual_allocation_evidence'>
) {
    return Boolean(line.manual_allocation_reason?.trim()) && Boolean(line.manual_allocation_evidence?.trim());
}

// ── 공용 계량기 정합계수 ──────────────────────────────────────────────

export const SHARED_METER_BASIS_LABEL: Record<NonNullable<SourceStream['shared_meter']>['basis'], string> = {
    SUB_METER: '공정별 보조계량기',
    OPERATING_HOURS: '운전시간 배분',
    RATED_CAPACITY: '정격용량 배분',
    OUTPUT_MASS: '생산량 배분',
    OTHER: '기타 물리적 배분키',
};

export type ReconciliationMode = 'SUB_METER' | 'KEY_SPLIT' | 'MIXED';

export interface ReconciliationGroup {
    group: string;
    period_id?: string;
    unit: string;
    /** SUB_METER = 식 41·42 정합계수 적용, KEY_SPLIT = A.2 배분키(합계=총량 검사만), MIXED = 두 종류가 섞임(보정 불가). */
    mode: ReconciliationMode;
    installation_total: number;
    sub_total: number;
    /** RecF = installation_total / sub_total. 보정하지 않았으면 1. */
    factor: number;
    applied: boolean;
    stream_ids: string[];
    /** 확인이 필요한 이유(문제 없으면 빈 문자열). */
    reason: string;
}

export interface ReconciliationResult<T extends SourceStream> {
    /** 보정된 사본. 그룹에 없거나 보정하지 못한 행은 원본 그대로. */
    streams: T[];
    groups: ReconciliationGroup[];
}

/** 정합계수가 이 비율 이상 1에서 벗어나면 단위·계량 오류일 가능성이 커 확인을 권고한다(규정 한도 아님). */
export const RECONCILIATION_REVIEW_DEVIATION = 0.2;
/** 배분키 행 합계와 전체 계량값의 허용 차이(비율). */
export const KEY_SPLIT_SUM_TOLERANCE = 0.005;

/**
 * 공용 계량기 그룹 처리. 같은 보고기간·같은 group 이름의 행을 묶는다(기간을 섞으면 두 해가 한 계수로 묶인다).
 * - 보조계량기(SUB_METER): 식 41·42 — RecF = 사업장 계량값 / Σ행, 각 행 활동량 × RecF. 행이 1개여도
 *   「보조계량기 1개 vs 사업장 계량기」이므로 적용한다(규정 조건은 계기 수이지 공정 수가 아니다).
 * - 배분키(그 외): A.2 물리적 관계 배분 — 정의상 Σ행 = 총량이어야 하므로 계수를 만들지 않고 합계만 검사한다.
 *   계수를 적용하면 「정합계수 1.000」 흔적이 측정 데이터가 있는 것처럼 오도한다.
 * 보정하지 못하는 경우는 원본을 두고 reason에 남긴다 — 조용히 절반만 보정하면 보고서가 거짓을 말한다.
 */
export function reconcileSourceStreams<T extends SourceStream>(streams: T[]): ReconciliationResult<T> {
    const byGroup = new Map<string, T[]>();

    for (const stream of streams) {
        const group = stream.shared_meter?.group?.trim();
        if (!group) continue;
        const key = (stream.period_id ?? '') + '|' + group;
        const members = byGroup.get(key) ?? [];
        members.push(stream);
        byGroup.set(key, members);
    }

    const groups: ReconciliationGroup[] = [];
    const corrected = new Map<string, T>();

    for (const members of byGroup.values()) {
        const first = members[0];
        const group = first.shared_meter?.group?.trim() ?? '';
        const ids = members.map((stream) => stream.id);
        const units = new Set(members.map((stream) => (stream.activity_unit ?? '').trim().toLowerCase()));
        const totals = new Set(members.map((stream) => stream.shared_meter?.installation_total_activity_data));
        const installationTotal = first.shared_meter?.installation_total_activity_data ?? 0;
        const subTotal = members.reduce((sum, stream) => sum + stream.activity_data, 0);
        const subMeterCount = members.filter((stream) => stream.shared_meter?.basis === 'SUB_METER').length;
        const mode: ReconciliationMode = subMeterCount === members.length
            ? 'SUB_METER'
            : subMeterCount === 0 ? 'KEY_SPLIT' : 'MIXED';
        const base = {
            group,
            period_id: first.period_id,
            unit: first.activity_unit,
            mode,
            installation_total: installationTotal,
            sub_total: subTotal,
            stream_ids: ids,
        };

        let reason = '';
        if (mode === 'MIXED') {
            reason = '보조계량기 행과 배분키 행이 한 그룹에 섞여 있습니다 — 근거를 한 종류로 맞추세요.';
        } else if (units.size > 1) {
            reason = '행들의 활동량 단위가 다릅니다(' + [...units].join(', ') + ') — 같은 단위로 맞추세요.';
        } else if (totals.size > 1) {
            reason = '행마다 적힌 사업장 전체 계량값이 서로 다릅니다 — 같은 값을 적으세요.';
        } else if (!(installationTotal > 0)) {
            reason = '사업장 전체 계량값이 비어 있거나 0입니다.';
        } else if (!(subTotal > 0)) {
            reason = '공정별 활동량 합계가 0 이하입니다.';
        }

        if (reason) {
            groups.push({ ...base, factor: 1, applied: false, reason });
            continue;
        }

        if (mode === 'KEY_SPLIT') {
            const gap = Math.abs(subTotal - installationTotal);
            const keyReason = gap > Math.max(0.01, installationTotal * KEY_SPLIT_SUM_TOLERANCE)
                ? '배분키로 나눈 행 합계 ' + subTotal + ' ' + first.activity_unit + '가 전체 계량값 ' + installationTotal + ' ' + first.activity_unit + '와 다릅니다 — 배분 비율을 확인하세요(배분키 행에는 정합계수를 적용하지 않습니다).'
                : '';
            groups.push({ ...base, factor: 1, applied: false, reason: keyReason });
            continue;
        }

        const factor = installationTotal / subTotal;
        for (const stream of members) {
            corrected.set(stream.id, { ...stream, activity_data: stream.activity_data * factor });
        }
        groups.push({ ...base, factor, applied: true, reason: '' });
    }

    return {
        streams: streams.map((stream) => corrected.get(stream.id) ?? stream),
        groups: groups.sort((a, b) => ((a.period_id ?? '') + '|' + a.group).localeCompare((b.period_id ?? '') + '|' + b.group)),
    };
}

/**
 * 공정에 연결된 배출원의 직접배출 합계 — 정합계수(식 41·42) 보정 후. 화면·내보내기·지도 동기화가
 * 전부 이 함수를 써야 엔진과 같은 숫자를 낸다. 원본 행을 그대로 더하면 공용 계량기 그룹이 있는
 * 사업장에서 지도의 ①·EU 문서·결과표가 서로 다른 값을 인쇄한다.
 */
export function sumReconciledSourceStreamEmissions(processId: string, streams: SourceStream[]) {
    return reconcileSourceStreams(streams)
        .streams.filter((stream) => stream.process_id === processId)
        .reduce((sum, stream) => sum + calculateSourceStreamEmissions(stream), 0);
}
