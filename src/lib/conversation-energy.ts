import { litresToTonnes } from './fuel-allocation';
import type { ImportedHeatDraft } from './measurable-heat';
import type { ProductionProcess } from './local-db';
import { GUIDED_STREAM_KINDS, type GuidedStreamKind, type SourceStreamDraft } from './source-stream-input';

/**
 * 질문으로 입력(대화형 모드 S4) — 「연료」 답을 배출원 초안으로 바꾸는 순수 빌더와, 전력·열 질문이 쓰는 값들.
 *
 * 지도 4단계의 배출원 생성(`buildDraft`)이 panels.tsx 안에 인라인이라 같은 값을 만드는 빌더를 새로 두었다(패널은 건드리지 않는다).
 * 어긋나지 않게 scripts/verify-talk-s4.mjs가 패널의 생성 코드(필드 이름·표현식 조각)와 이 빌더의 결과를 대조한다.
 * 전력은 새 빌더가 필요 없다 — 지도 5단계가 쓰는 `validateElectricityDraft`·`buildElectricityUpdate`(guided-edit.ts)를 그대로 쓴다.
 * 「밖에서 산 열 없음」도 마찬가지로 measurable-heat.ts의 `buildImportedHeatUpdate`를 그대로 쓴다.
 */

/** 이 화면이 받는 연료 연소 유형(도시가스·유류·경유 L·등유 L). 공정배출·물질수지는 지도 4단계에서 입력한다. */
export const TALK_FUEL_KIND_KEYS = ['fuel-gas', 'fuel-mass', 'fuel-diesel-l', 'fuel-kerosene-l'] as const;

export const TALK_FUEL_KINDS: GuidedStreamKind[] = GUIDED_STREAM_KINDS.filter((kind) => (TALK_FUEL_KIND_KEYS as readonly string[]).includes(kind.key));

/** 지도 5단계의 전력 배출계수 칸이 미리 채우는 임시 자리값 */
export const ELECTRICITY_PLACEHOLDER_EF = 0.47;
/** 지도 5단계의 계수 출처 기본 선택 */
export const ELECTRICITY_DEFAULT_EF_SOURCE = 'COUNTRY_GRID_DEFAULT';
/** 지도 5단계의 계수 출처 선택지(panels.tsx와 같은 값·글자 — 게이트가 대조한다) */
export const ELECTRICITY_EF_SOURCE_OPTIONS = [
    { value: 'COUNTRY_GRID_DEFAULT', label: '원산지국 계통 평균 (국가 공표값·IEA 등 — 출처를 적어 두세요)' },
    { value: 'DIRECT_TECHNICAL_LINK', label: '발전설비 직접 기술적 연결 (실측)' },
    { value: 'PPA', label: '전력구매계약(PPA) (실측)' },
    { value: 'INSTALLATION_OWN', label: '설비 내 자가발전' },
    { value: 'MIX', label: '혼합(Mix)' },
] as const;

const parseAnswerNumber = (value: string) => {
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};
const fmtOne = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(Number.isFinite(value) ? value : 0);

export interface FuelAnswer {
    kind: GuidedStreamKind;
    /** 사용량 — 유형의 단위(Nm³·t·L) 그대로, 쉼표 허용 */
    amount: string;
    /** 비우면 유형 이름 */
    name: string;
    ncv: string;
    factor: string;
    factorSource: SourceStreamDraft['factor_source_type'];
    source: string;
}

/**
 * 연료 답 → 저장할 배출원 한 벌(지도 4단계 신규 경로와 같은 값).
 *  · 리터 유형은 밀도로 t 환산해 저장하고 원자료 리터를 출처 글에 남긴다(EU 템플릿 단위는 t·Nm³뿐).
 *  · 순발열량은 연료 유형만 받고, 아니면 유형 기본값.
 */
export function buildFuelStreamDraft(answer: FuelAnswer, process: Pick<ProductionProcess, 'id' | 'period_id'>): SourceStreamDraft {
    const { kind } = answer;
    const amount = parseAnswerNumber(answer.amount);
    return {
        ...kind.defaults,
        period_id: process.period_id,
        process_id: process.id,
        name: kind.litres
            ? `${answer.name.trim() || kind.label} · ${fmtOne(amount)} L`
            : answer.name.trim() || kind.label,
        activity_data: kind.litres ? litresToTonnes(amount, kind.litres.densityKgPerL) : amount,
        ncv_gj_per_unit: kind.needsNcv ? parseAnswerNumber(answer.ncv) : kind.defaults.ncv_gj_per_unit,
        emission_factor_tco2e_per_unit: parseAnswerNumber(answer.factor),
        factor_source_type: answer.factorSource,
        source: kind.litres && answer.source.trim()
            ? `${answer.source.trim()} · 원자료 ${fmtOne(amount)} L × ${kind.litres.densityKgPerL} kg/L`
            : answer.source.trim(),
    } as SourceStreamDraft;
}

/** 「밖에서 산 스팀·온수 없음」 — 지도 4단계 열 폼이 「아니요」를 고르고 저장할 때의 초안과 같다. */
export function noImportedHeatDraft(process: Pick<ProductionProcess, 'imported_heat_unit'>): ImportedHeatDraft {
    return { answer: 'NO', amount: 0, unit: process.imported_heat_unit ?? 'Gcal', basis: '', supplierEf: 0, fuel: '', source: '' };
}
