import { RECONCILIATION_REVIEW_DEVIATION } from './allocation-rules';
import type { LocalEntity, ProductionProcess, SourceStream } from './local-db';

/**
 * 공용 연료 계량기 나누기 — 화면이 쓰는 순수 계산과 저장 빌더(CBAM-ALLOC-RECF-01·02·03).
 *
 * 종전에는 담당자가 엑셀로 공정별 몫을 계산해 공정마다 연료 행을 따로 넣었다(「523,500 Nm³ − 열처리로 486,000 = 38,500,
 * STS 몫 = 38,500 × 3,240/5,100 = 24,459」를 손으로). 엔진은 합계가 사업장 값과 맞는지만 검사했다.
 * 여기서는 사업장 전체 값과 기준을 받아 앱이 나누고, 공정별 연료 행과 공용 계량기 기록(shared_meter)을 한꺼번에 만든다.
 *
 * 기준(2025/2547) — 전력 나누기와 같다:
 *  - SUB_METER: 공정별 계량기 값이 있다 → 행에 **계량값 그대로** 저장하고 엔진이 정합계수 RecF로 맞춘다(부속서 III A.1 식 41·42).
 *  - OUTPUT_MASS: 공정별 자료가 없다 → 생산량(기능단위)으로 나눈다(부속서 III A.2). 나눈 값을 행에 저장한다.
 *  - ESTIMATE: 설비 정격 × 가동시간 등으로 공정별 사용량을 추정(부속서 II A.3(2), 근거 필수) → 합계를 사업장 값에 맞춰 저장한다.
 *    저장 값(enum)은 하위호환을 위해 기존 RATED_CAPACITY를 쓴다 — 엔진이 「규정에 없는 비율이 아니라 추정이어야 한다」는 확인 필요를 알린다.
 *
 * 보일러·스팀처럼 열을 만드는 연료는 여기가 아니라 「열 공급원」으로 다룬다(쓴 열량 기준, CBAM-ALLOC-HEAT-02).
 */

export type FuelSplitBasis = 'SUB_METER' | 'OUTPUT_MASS' | 'ESTIMATE';

export const FUEL_SPLIT_BASIS_LABEL: Record<FuelSplitBasis, string> = {
    SUB_METER: '공정별 계량기 값',
    OUTPUT_MASS: '생산량 비율',
    ESTIMATE: '설비용량 × 가동시간 추정',
};

export const FUEL_SPLIT_BASIS_ANCHOR: Record<FuelSplitBasis, string> = {
    SUB_METER: '2025/2547 부속서 III A.1 식 41·42',
    OUTPUT_MASS: '2025/2547 부속서 III A.2 — 기능단위 기준',
    ESTIMATE: '2025/2547 부속서 II A.3(2) 간접결정방법 · 부속서 III A.1',
};

/** 화면의 기준 → 저장하는 shared_meter.basis. 추정은 기존 enum 값 RATED_CAPACITY로 저장한다(백업 하위호환). */
export const FUEL_SPLIT_STORED_BASIS = {
    SUB_METER: 'SUB_METER',
    OUTPUT_MASS: 'OUTPUT_MASS',
    ESTIMATE: 'RATED_CAPACITY',
} as const satisfies Record<FuelSplitBasis, NonNullable<SourceStream['shared_meter']>['basis']>;

const DECIMALS = 6;
const round = (value: number) => Math.round(value * 10 ** DECIMALS) / 10 ** DECIMALS;
const fmt = (value: number, digits = DECIMALS) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

export interface FuelSplitRow {
    processId: string;
    processName: string;
    /** SUB_METER·ESTIMATE는 입력 단위의 사용량, OUTPUT_MASS는 활동수준(t). */
    value: number;
}

export interface FuelSplitDraft {
    group: string;
    /** 사업장 전체 사용량 — 입력 단위(리터 유형이면 L). */
    total: number;
    basis: FuelSplitBasis;
    rows: FuelSplitRow[];
    note: string;
}

export interface FuelSplitShare extends FuelSplitRow {
    /** 0~1 */
    share: number;
    /** 입력 단위로 나눈(또는 계량한) 사용량. SUB_METER는 입력 그대로다. */
    amount: number;
    /** 이 행에 실제로 쓰이는 값 = 저장 단위(t·Nm³)로 환산한 활동량 */
    stored: number;
    /** SUB_METER에서 정합계수를 적용한 뒤의 값(참고용). 다른 기준은 amount와 같다. */
    corrected: number;
}

export interface FuelSplitPlan {
    group: string;
    total: number;
    basis: FuelSplitBasis;
    valueSum: number;
    /** 전체 ÷ 기준값 합계. SUB_METER면 정합계수 RecF다. */
    factor: number;
    shares: FuelSplitShare[];
    note: string;
    caution?: string;
}

const VALUE_NAME: Record<FuelSplitBasis, string> = { SUB_METER: '계량기 값', OUTPUT_MASS: '생산량', ESTIMATE: '추정 사용량' };

/** 저장을 막을 문제. 없으면 undefined. existingGroups: 같은 보고기간에 이미 있는 다른 그룹 이름. */
export function validateFuelSplitDraft(draft: FuelSplitDraft, existingGroups: string[] = []): string | undefined {
    const group = draft.group.trim();
    if (!group) return '계량기 이름을 적으세요. 예: 공용 경유 지게차';
    if (existingGroups.includes(group)) {
        return `「${group}」라는 공용 계량기가 이미 있습니다. 다른 이름을 쓰거나 아래에서 그 계량기를 다시 나누세요 — 같은 이름이면 두 연료가 한 그룹으로 묶여 합계 검사가 틀어집니다.`;
    }
    if (!(draft.total > 0)) return '사업장 전체 사용량을 0보다 크게 넣으세요. 고지서·전표의 12개월 합계입니다.';
    if (draft.rows.length < 2) return '같이 쓰는 공정을 둘 이상 고르세요. 한 공정만 쓰는 연료는 나눌 필요가 없습니다 — 그 공정의 연료로 넣으세요.';
    for (const row of draft.rows) {
        if (!(row.value > 0)) {
            return draft.basis === 'OUTPUT_MASS'
                ? `「${row.processName}」의 생산량이 0입니다. 3단계에서 생산량을 먼저 넣으세요.`
                : `「${row.processName}」의 ${VALUE_NAME[draft.basis]}을 0보다 크게 넣으세요.`;
        }
    }
    if (draft.basis === 'ESTIMATE' && !draft.note.trim()) {
        return '추정으로 나눌 때는 계량기가 없는 이유와 추정 근거(설비 정격용량·가동일지 등)를 적어야 합니다. 검증인이 묻습니다.';
    }
    return undefined;
}

/** 나눈다. validateFuelSplitDraft를 통과한 입력만 넘길 것. toStorage: 입력 단위 → 저장 단위(리터 → t 등). */
export function computeFuelSplit(draft: FuelSplitDraft, toStorage: (amount: number) => number = (amount) => amount): FuelSplitPlan {
    const valueSum = draft.rows.reduce((sum, row) => sum + row.value, 0);
    const factor = valueSum > 0 ? draft.total / valueSum : 0;
    const scaled = draft.basis !== 'SUB_METER';
    const shares = draft.rows.map<FuelSplitShare>((row) => {
        const amount = scaled ? round(row.value * factor) : row.value;
        return { ...row, share: valueSum > 0 ? row.value / valueSum : 0, amount, stored: 0, corrected: scaled ? amount : round(row.value * factor) };
    });

    if (scaled && shares.length > 0) {
        // 반올림 끝수는 가장 큰 몫에 — 합계가 고지서 값과 정확히 같게.
        const largest = shares.reduce((best, share) => (share.amount > best.amount ? share : best), shares[0]);
        const others = shares.reduce((sum, share) => (share === largest ? sum : sum + share.amount), 0);
        largest.amount = round(draft.total - others);
        largest.corrected = largest.amount;
    }
    for (const share of shares) share.stored = round(toStorage(share.amount));

    const caution = !scaled && Math.abs(factor - 1) > RECONCILIATION_REVIEW_DEVIATION
        ? `공정별 계량기 값 합계 ${fmt(valueSum)}가 사업장 전체 ${fmt(draft.total)}와 ${(RECONCILIATION_REVIEW_DEVIATION * 100).toFixed(0)}% 넘게 다릅니다. 단위나 빠진 공정이 없는지 확인하세요.`
        : undefined;

    return { group: draft.group.trim(), total: draft.total, basis: draft.basis, valueSum, factor, shares, note: draft.note.trim(), caution };
}

/** 이 공정의 근거 한 문장. 연료 행의 shared_meter.note에 들어가 산정보고서가 싣는다. */
export function describeFuelSplit(plan: FuelSplitPlan, processId: string, unit: string): string {
    const own = plan.shares.find((share) => share.processId === processId);
    if (!own) return '';
    const anchor = FUEL_SPLIT_BASIS_ANCHOR[plan.basis];
    const head = `공용 계량기 「${plan.group}」 ${fmt(plan.total)} ${unit}`;
    if (plan.basis === 'OUTPUT_MASS') {
        const ratio = plan.shares.map((share) => `${share.processName} ${fmt(share.value, 3)} t`).join(' : ');
        return `${head}를 공정별 생산량(활동수준) 비율로 배분 — ${ratio}. 공정별 계량값이 없어 기능단위 기준을 적용(${anchor}). 이 공정 몫 ${fmt(own.amount)} ${unit} (${(own.share * 100).toFixed(2)}%).`;
    }
    if (plan.basis === 'SUB_METER') {
        return `${head}: 공정별 보조계량기 값 합계 ${fmt(plan.valueSum)} ${unit}를 사업장 계량값에 맞춰 정합계수 RecF = ${plan.factor.toFixed(4)} 적용(${anchor}). 이 공정: 계량기 값 ${fmt(own.amount)} ${unit}.`;
    }
    return `${head}: 공정별 추정 사용량(설비용량 × 가동시간) 합계 ${fmt(plan.valueSum)} ${unit}를 사업장 계량값에 맞춰 보정(계수 ${plan.factor.toFixed(4)}) — ${anchor}. 이 공정: 추정 ${fmt(own.value)} → ${fmt(own.amount)} ${unit}. 근거: ${plan.note}`;
}

/** 리터 → 톤. 밀도(kg/L)를 곱해 1,000으로 나눈다. EU 템플릿(B_EmInst)의 활동자료 단위는 t·Nm³뿐이라 저장 단위는 t다. */
export function litresToTonnes(litres: number, densityKgPerL: number): number {
    return Math.round(litres * densityKgPerL * 1000) / 1e6;
}

/** 톤 → 리터. 다시 나누기 화면이 저장된 값을 입력 단위로 되돌릴 때 쓴다. */
export function tonnesToLitres(tonnes: number, densityKgPerL: number): number {
    return Math.round((tonnes * 1000) / densityKgPerL * 1000) / 1000;
}

export function shortProcessName(name: string): string {
    return name.split(/\s+[(—-]\s*|\s*[(—]/)[0].trim() || name;
}

/** 연료 행의 공통 필드 — 연료 유형 기본값 위에 사용자가 고친 순발열량·계수·출처 유형을 얹은 한 벌. */
export type FuelSplitTemplate = Pick<
    SourceStream,
    'stream_type' | 'method' | 'activity_unit' | 'ncv_gj_per_unit' | 'emission_factor_tco2e_per_unit' | 'emission_factor_basis'
    | 'oxidation_factor' | 'conversion_factor' | 'fossil_fraction' | 'biomass_fraction' | 'factor_source_type'
>;

export type FuelSplitNewStream = Omit<SourceStream, keyof LocalEntity>;

/**
 * 나눈 결과를 연료 행으로 옮긴다. 새로 만들 행(create)과 바뀐 행(update)만 돌려준다.
 * - 같은 보고기간·같은 그룹·같은 공정의 행이 있으면 갱신한다(기존 필드를 펼쳐 id·생성일·다른 필드와 담당자가 붙인 이름을 지킨다).
 * - 이번에 빠진 공정의 행은 공용 계량기 기록만 지운다 — 활동량은 앱이 모르므로 그대로 둔다.
 * - 열 공급원 행(heat_system)은 건드리지 않는다.
 */
export function buildFuelSplitStreams(input: {
    streams: SourceStream[];
    processes: Array<Pick<ProductionProcess, 'id' | 'name' | 'period_id'>>;
    plan: FuelSplitPlan;
    template: FuelSplitTemplate;
    /** 행 이름 앞부분. 예: 경유 */
    fuelName: string;
    /** 입력 단위 표시(리터 유형이면 L). 있으면 이름과 출처에 원자료 리터를 남긴다. */
    inputUnit?: string;
    source: string;
    /** 저장 단위의 사업장 전체 사용량 */
    storedTotal: number;
}): { create: FuelSplitNewStream[]; update: SourceStream[] } {
    const { plan } = input;
    const processById = new Map(input.processes.map((process) => [process.id, process]));
    const periodId = processById.get(plan.shares[0]?.processId ?? '')?.period_id;
    const inGroup = (stream: SourceStream) =>
        stream.shared_meter?.group?.trim() === plan.group && (stream.period_id ?? '') === (periodId ?? '') && !stream.heat_system?.name?.trim();
    const create: FuelSplitNewStream[] = [];
    const update: SourceStream[] = [];

    for (const share of plan.shares) {
        const process = processById.get(share.processId);
        const existing = input.streams.find((stream) => inGroup(stream) && stream.process_id === share.processId);
        const fields = {
            ...input.template,
            period_id: process?.period_id,
            process_id: share.processId,
            name: `${input.fuelName} · ${plan.group} · ${shortProcessName(share.processName)}${input.inputUnit ? ` · ${fmt(share.amount, 3)} ${input.inputUnit}` : ''}`,
            activity_data: share.stored,
            source: input.inputUnit
                ? `${input.source.trim()} · 공용 계량기 「${plan.group}」 몫 ${fmt(share.amount, 3)} ${input.inputUnit}`
                : `${input.source.trim()} · 공용 계량기 「${plan.group}」 몫`,
            shared_meter: {
                group: plan.group,
                installation_total_activity_data: input.storedTotal,
                basis: FUEL_SPLIT_STORED_BASIS[plan.basis],
                note: describeFuelSplit(plan, share.processId, input.inputUnit ?? input.template.activity_unit),
            },
        };
        // 다시 나눌 때 담당자가 붙인 행 이름을 덮어쓰지 않는다. 이름에 입력 단위 사용량(리터)이 들어가는 연료만 새 몫에 맞춰 다시 만든다.
        if (existing) update.push({ ...existing, ...fields, name: input.inputUnit ? fields.name : existing.name });
        else create.push(fields as FuelSplitNewStream);
    }

    const kept = new Set(plan.shares.map((share) => share.processId));
    for (const stream of input.streams) {
        if (inGroup(stream) && !kept.has(stream.process_id ?? '')) update.push({ ...stream, shared_meter: undefined });
    }
    return { create, update };
}

/** 나누기 해제 — 공용 계량기 기록만 지운다. 연료 행과 활동량은 그대로 둔다. */
export function buildFuelSplitRelease(streams: SourceStream[], group: string, periodId: string | undefined): SourceStream[] {
    return streams
        .filter((stream) => stream.shared_meter?.group?.trim() === group.trim() && (stream.period_id ?? '') === (periodId ?? '') && !stream.heat_system?.name?.trim())
        .map((stream) => ({ ...stream, shared_meter: undefined }));
}
