import type { SourceStream } from './local-db';
import { getSourceStreamEmissionFactorBasis } from './source-stream-calculation';

/**
 * 배출원 입력 규칙 — **한 곳**.
 *
 * 종전엔 이 규칙이 /source-streams 화면 안에만 있었고, 길잡이 지도는 「연료 연소 프리셋
 * 두 개」만 제공했다. 그래서 전기로 사업장은 지도만으로 직접배출을 산정할 수 없었다 —
 * 고철·흑연전극(물질수지)과 부원료(공정배출)를 넣을 자리가 없는데, 그 상태로도 8단계에서
 * EU 문서가 **생성됐다**. 사용자는 완주했다고 믿을 근거를 앱에서 받았다(씨밤이 P1-run08-02).
 *
 * 지도에도 세 방법을 다 넣으면서, 검증을 여기로 옮겨 둘이 같은 규칙을 쓰게 한다.
 * 두 곳에 두면 한쪽만 고쳐진다 — 이 저장소가 아홉 번 반복한 실패 모양이다.
 */

export type SourceStreamDraft = Omit<SourceStream, 'id' | 'created_at' | 'updated_at'>;
export type SourceStreamErrors = Partial<Record<keyof SourceStreamDraft, string>>;

export const SOURCE_STREAM_METHODS = ['Combustion', 'Process Emissions', 'Mass balance'] as const;
export const ACTIVITY_UNITS = ['t', 'Nm3'] as const;

export const EMISSION_FACTOR_BASIS_OPTIONS = [
    { value: 'PER_TJ', label: '에너지 기준 (tCO2e/TJ)' },
    { value: 'PER_ACTIVITY_UNIT', label: '활동자료 단위 기준 (tCO2e/단위)' },
] as const;

export const FACTOR_SOURCE_TYPE_OPTIONS = [
    { value: 'UNCLASSIFIED', label: '분류 전' },
    { value: 'EU_OR_IPCC_DEFAULT', label: 'EU/IPCC 기본계수' },
    { value: 'NATIONAL_INVENTORY', label: '국가 인벤토리·공공 통계' },
    { value: 'SUPPLIER_OR_LAB', label: '공급사 보증값·시험분석' },
] as const;

/** 연료는 저장된 기준을 따르고, 공정 원료는 언제나 활동자료 단위 기준이다. */
export function resolveUiEmissionFactorBasis(
    sourceStream: Pick<SourceStream, 'stream_type' | 'emission_factor_basis'>
) {
    return sourceStream.stream_type === 'FUEL'
        ? getSourceStreamEmissionFactorBasis(sourceStream)
        : 'PER_ACTIVITY_UNIT';
}

export function emissionFactorBasisLabel(
    sourceStream: Pick<SourceStream, 'stream_type' | 'emission_factor_basis'>
) {
    const basis = resolveUiEmissionFactorBasis(sourceStream);
    return EMISSION_FACTOR_BASIS_OPTIONS.find((option) => option.value === basis)?.label
        ?? '에너지 기준 (tCO2e/TJ)';
}

export function factorSourceTypeLabel(sourceStream: Pick<SourceStream, 'factor_source_type'>) {
    return FACTOR_SOURCE_TYPE_OPTIONS.find((option) => option.value === sourceStream.factor_source_type)?.label
        ?? '분류 전';
}

export function streamTypeLabel(streamType: SourceStream['stream_type']) {
    if (streamType === 'FUEL') {
        return '연료';
    }

    if (streamType === 'PROCESS_MATERIAL') {
        return '공정 원료';
    }

    return '기타';
}

export function createSourceStreamValidationErrors(sourceStream: SourceStreamDraft): SourceStreamErrors {
    const nextErrors: SourceStreamErrors = {};

    if (!sourceStream.name.trim()) {
        nextErrors.name = '배출원 이름을 입력하세요.';
    }

    if (!sourceStream.period_id) {
        nextErrors.period_id = '보고기간을 선택하세요.';
    }

    if (!sourceStream.process_id) {
        nextErrors.process_id = '연결할 생산공정을 선택하세요.';
    }

    if (!SOURCE_STREAM_METHODS.includes(sourceStream.method as (typeof SOURCE_STREAM_METHODS)[number])) {
        nextErrors.method = 'EU 템플릿에서 지원하는 산정방법을 선택하세요.';
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.method !== 'Combustion') {
        nextErrors.method = '연료 배출원은 Combustion 방식으로 입력하세요.';
    }

    if (sourceStream.stream_type === 'PROCESS_MATERIAL' && sourceStream.method === 'Combustion') {
        nextErrors.method = '공정 원료는 Process Emissions 또는 Mass balance로 입력하세요.';
    }

    if (sourceStream.stream_type === 'OTHER') {
        nextErrors.stream_type = '기타 배출원은 아직 EU Export 대상이 아닙니다. 연료 또는 공정 원료로 분류할 수 있는지 확인하세요.';
    }

    // 물질수지는 **산출 측 차감**을 음수로 적는다(조강·슬래그가 갖고 나가는 탄소).
    // 다른 방법에서 음수는 입력 실수다.
    if (sourceStream.activity_data < 0 && sourceStream.method !== 'Mass balance') {
        nextErrors.activity_data = '활동자료는 0 이상이어야 합니다. (산출물 차감은 물질수지 방법에서만 음수로 입력)';
    }

    if (!ACTIVITY_UNITS.includes(sourceStream.activity_unit as (typeof ACTIVITY_UNITS)[number])) {
        nextErrors.activity_unit = 'EU 템플릿에서 지원하는 활동자료 단위를 선택하세요.';
    }

    if (sourceStream.ncv_gj_per_unit < 0) {
        nextErrors.ncv_gj_per_unit = '순발열량은 0 이상이어야 합니다.';
    }

    if (sourceStream.stream_type === 'FUEL' && sourceStream.ncv_gj_per_unit <= 0) {
        nextErrors.ncv_gj_per_unit = '연료 배출원은 순발열량을 0보다 크게 입력하세요.';
    }

    if (sourceStream.emission_factor_tco2e_per_unit < 0) {
        nextErrors.emission_factor_tco2e_per_unit = '배출계수는 0 이상이어야 합니다.';
    }

    if (sourceStream.stream_type !== 'FUEL' && sourceStream.emission_factor_tco2e_per_unit <= 0) {
        nextErrors.emission_factor_tco2e_per_unit = '공정 원료 배출원은 배출계수를 0보다 크게 입력하세요.';
    }

    const emissionFactorBasis = resolveUiEmissionFactorBasis(sourceStream);
    if (!EMISSION_FACTOR_BASIS_OPTIONS.some((option) => option.value === emissionFactorBasis)) {
        nextErrors.emission_factor_basis = '배출계수 기준을 선택하세요.';
    }

    if (sourceStream.stream_type !== 'FUEL' && emissionFactorBasis === 'PER_TJ') {
        nextErrors.emission_factor_basis = 'tCO2e/TJ 기준은 연료 연소 배출원에만 사용하세요. 공정 원료는 활동자료 단위 기준으로 입력하세요.';
    }

    if (
        sourceStream.factor_source_type
        && !FACTOR_SOURCE_TYPE_OPTIONS.some((option) => option.value === sourceStream.factor_source_type)
    ) {
        nextErrors.factor_source_type = '배출계수 출처 유형을 선택하세요.';
    }

    if (sourceStream.oxidation_factor < 0 || sourceStream.oxidation_factor > 1) {
        nextErrors.oxidation_factor = '산화계수는 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.conversion_factor < 0 || sourceStream.conversion_factor > 1) {
        nextErrors.conversion_factor = '전환계수는 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.fossil_fraction < 0 || sourceStream.fossil_fraction > 1) {
        nextErrors.fossil_fraction = '화석탄소 비율은 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.biomass_fraction < 0 || sourceStream.biomass_fraction > 1) {
        nextErrors.biomass_fraction = '바이오매스 비율은 0부터 1 사이로 입력하세요.';
    }

    if (sourceStream.fossil_fraction + sourceStream.biomass_fraction > 1) {
        nextErrors.fossil_fraction = '화석탄소 비율과 바이오매스 비율의 합은 1을 넘을 수 없습니다.';
        nextErrors.biomass_fraction = '화석탄소 비율과 바이오매스 비율의 합은 1을 넘을 수 없습니다.';
    }

    if (!sourceStream.source.trim()) {
        nextErrors.source = '출처를 입력하세요. 예: 연료 청구서, 계측기 검침표, 배출계수 근거자료';
    }

    return nextErrors;
}

/** 오류 객체를 한 줄 문구로. 지도 패널은 칸별 오류 표시가 없어 첫 문제 하나만 말한다. */
export function firstSourceStreamError(errors: SourceStreamErrors): string | null {
    const first = Object.values(errors).find(Boolean);
    return first ?? null;
}

// ── 지도 패널이 쓰는 입력 유형 ─────────────────────────────────────────

/**
 * 배출원 입력 유형. EU 템플릿의 세 산정방법을 사용자 말로 옮긴 것이다.
 *
 * 계수는 **자리값**이지 정답이 아니다. 사용자가 자기 성적서 값으로 바꿔 넣어야 하며,
 * 화면이 그렇게 말한다. 앱이 계수를 대신 정해주는 것처럼 보이면 안 된다.
 */
export interface GuidedStreamKind {
    key: string;
    label: string;
    /** 이 유형이 무엇을 담는지 — 사용자가 자기 자료를 알아볼 수 있게 */
    hint: string;
    /** 활동자료 칸의 라벨 */
    activityLabel: string;
    activityHint: string;
    /** 계수 칸의 라벨·단위 */
    factorLabel: string;
    factorHint: string;
    /** 음수 활동자료를 허용하는가(물질수지의 산출 측 차감) */
    allowsNegative: boolean;
    /** 순발열량 칸을 보여주는가(연료만) */
    needsNcv: boolean;
    defaults: Pick<
        SourceStreamDraft,
        'stream_type' | 'method' | 'activity_unit' | 'ncv_gj_per_unit'
        | 'emission_factor_tco2e_per_unit' | 'emission_factor_basis' | 'oxidation_factor'
        | 'conversion_factor' | 'fossil_fraction' | 'biomass_fraction' | 'factor_source_type'
    >;
}

export const GUIDED_STREAM_KINDS: GuidedStreamKind[] = [
    {
        key: 'fuel-gas',
        label: '연료 연소 — 도시가스 (Nm³)',
        hint: '도시가스 고지서의 12개월 사용량 합계',
        activityLabel: '연간 사용량 (Nm³)',
        activityHint: '고지서 사용량(Nm³) 12개월 합계',
        factorLabel: '배출계수 (tCO₂e/TJ)',
        factorHint: '국가 인벤토리 기본값 자리값입니다. 자기 성적서 값이 있으면 그것으로 바꾸세요.',
        allowsNegative: false,
        needsNcv: true,
        defaults: {
            stream_type: 'FUEL', method: 'Combustion', activity_unit: 'Nm3',
            ncv_gj_per_unit: 0.037, emission_factor_tco2e_per_unit: 56.1,
            emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'NATIONAL_INVENTORY',
        },
    },
    {
        key: 'fuel-mass',
        label: '연료 연소 — 유류·기타 (t)',
        hint: '연료 구매대장의 연간 사용량',
        activityLabel: '연간 사용량 (t)',
        activityHint: '연료 구매대장·계량기 검침 합계',
        factorLabel: '배출계수 (tCO₂e/TJ)',
        factorHint: 'EU/IPCC 기본값 자리값입니다. 자기 성적서 값이 있으면 그것으로 바꾸세요.',
        allowsNegative: false,
        needsNcv: true,
        defaults: {
            stream_type: 'FUEL', method: 'Combustion', activity_unit: 't',
            ncv_gj_per_unit: 48, emission_factor_tco2e_per_unit: 73,
            emission_factor_basis: 'PER_TJ', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'EU_OR_IPCC_DEFAULT',
        },
    },
    {
        key: 'process-emissions',
        label: '공정배출 — 부원료 (석회석 등)',
        hint: '가소·분해로 CO₂가 나오는 원료. 투입량 × 배출계수',
        activityLabel: '연간 투입량 (t)',
        activityHint: '원료 투입대장의 연간 합계',
        factorLabel: '배출계수 (tCO₂e/t)',
        factorHint: '성분분석표 기준. 예: 석회석 약 0.44, 백운석 약 0.47 — 자기 값으로 바꾸세요.',
        allowsNegative: false,
        needsNcv: false,
        defaults: {
            stream_type: 'PROCESS_MATERIAL', method: 'Process Emissions', activity_unit: 't',
            ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 0.44,
            emission_factor_basis: 'PER_ACTIVITY_UNIT', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'SUPPLIER_OR_LAB',
        },
    },
    {
        key: 'mass-balance-in',
        label: '물질수지 — 투입 (고철·전극·합금철)',
        hint: '탄소를 갖고 들어오는 원료. 투입량 × 탄소함량 × 3.664',
        activityLabel: '연간 투입량 (t)',
        activityHint: '원료 투입대장의 연간 합계',
        factorLabel: '탄소 기준 배출계수 (tCO₂e/t)',
        factorHint: '탄소함량(tC/t) × 3.664로 넣으세요. 예: 흑연전극 0.819 tC/t → 3.000',
        allowsNegative: false,
        needsNcv: false,
        defaults: {
            stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't',
            ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 3,
            emission_factor_basis: 'PER_ACTIVITY_UNIT', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'SUPPLIER_OR_LAB',
        },
    },
    {
        key: 'mass-balance-out',
        label: '물질수지 — 산출 차감 (조강·슬래그)',
        hint: '탄소를 갖고 나가는 산출물. 활동량을 **음수**로 적습니다',
        activityLabel: '연간 산출량 (t · 음수로)',
        activityHint: '차감이므로 음수로 적습니다. 예: 조강 2,234,000 t → -2234000',
        factorLabel: '탄소 기준 배출계수 (tCO₂e/t)',
        factorHint: '탄소함량(tC/t) × 3.664. 예: 조강 0.0018 tC/t → 0.0066',
        allowsNegative: true,
        needsNcv: false,
        defaults: {
            stream_type: 'PROCESS_MATERIAL', method: 'Mass balance', activity_unit: 't',
            ncv_gj_per_unit: 0, emission_factor_tco2e_per_unit: 0.0066,
            emission_factor_basis: 'PER_ACTIVITY_UNIT', oxidation_factor: 1, conversion_factor: 1,
            fossil_fraction: 1, biomass_fraction: 0, factor_source_type: 'SUPPLIER_OR_LAB',
        },
    },
];

/** 저장된 배출원이 어느 입력 유형인지 되짚는다(수정 폼이 알맞은 칸을 그리도록). */
export function matchGuidedStreamKind(stream: Pick<SourceStream,
    'stream_type' | 'method' | 'activity_unit' | 'activity_data'>): GuidedStreamKind {
    if (stream.stream_type === 'FUEL') {
        return GUIDED_STREAM_KINDS.find((kind) =>
            kind.defaults.stream_type === 'FUEL' && kind.defaults.activity_unit === stream.activity_unit
        ) ?? GUIDED_STREAM_KINDS[1];
    }

    if (stream.method === 'Mass balance') {
        return GUIDED_STREAM_KINDS.find((kind) =>
            kind.key === (stream.activity_data < 0 ? 'mass-balance-out' : 'mass-balance-in')
        ) ?? GUIDED_STREAM_KINDS[3];
    }

    return GUIDED_STREAM_KINDS[2];
}
