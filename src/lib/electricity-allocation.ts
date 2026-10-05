import { ELECTRICITY_SPLIT_BASIS_ANCHOR, RECONCILIATION_REVIEW_DEVIATION } from './allocation-rules';
import type { ElectricitySplitBasis } from './allocation-rules';
import type { ProductionProcess } from './local-db';

/**
 * 공용 전력 계량기 나누기 — 화면이 쓰는 순수 계산(CBAM-ALLOC-ELEC-01).
 *
 * 종전에는 담당자가 엑셀로 공정별 몫을 계산해 공정마다 따로 적었다(「한전 계량기 5,412 MWh를 생산량 비율
 * 3,240:1,860으로 배분」을 손으로). 합계가 고지서와 맞는지는 아무도 검사하지 않았다. 여기서는 사업장 전체
 * 값과 기준을 받아 앱이 나누고, 나눈 값·기준·근거 문장을 공정에 한꺼번에 적는다.
 *
 * 기준은 2025/2547 원문에 있는 셋뿐이다.
 *  - SUB_METER: 공정별 계량기 값이 있다 → 합계를 사업장 값에 맞춘다(부속서 III A.1 식 41·42).
 *  - OUTPUT_MASS: 공정별 자료가 없다 → 기능단위(생산량)로 나눈다(부속서 III A.2 둘째 단락).
 *  - INDIRECT_ESTIMATE: 설비용량 × 가동시간 등으로 공정별 사용량을 추정한다(부속서 II A.3(2)) → 합계를 맞춘다.
 * 세 경우 모두 산술은 같다: 몫 = 전체 × 기준값 ÷ 기준값 합계.
 */

/** 나눈 값의 자릿수(MWh). 0.0001 MWh = 0.1 kWh. */
const SPLIT_DECIMALS = 4;
const roundSplitMwh = (value: number) => Math.round(value * 10 ** SPLIT_DECIMALS) / 10 ** SPLIT_DECIMALS;
const formatSplitNumber = (value: number, digits = SPLIT_DECIMALS) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(value);

export interface ElectricitySplitRow {
    processId: string;
    processName: string;
    /** SUB_METER·INDIRECT_ESTIMATE는 MWh, OUTPUT_MASS는 활동수준(t). */
    value: number;
}

export interface ElectricitySplitDraft {
    group: string;
    totalMwh: number;
    basis: ElectricitySplitBasis;
    rows: ElectricitySplitRow[];
    note: string;
}

export interface ElectricitySplitShare extends ElectricitySplitRow {
    /** 0~1 */
    share: number;
    mwh: number;
}

export interface ElectricitySplitPlan {
    group: string;
    totalMwh: number;
    basis: ElectricitySplitBasis;
    /** 기준값 합계 */
    valueSum: number;
    /** 전체 ÷ 기준값 합계. SUB_METER면 정합계수 RecF다. */
    factor: number;
    shares: ElectricitySplitShare[];
    note: string;
    /** 저장은 막지 않지만 확인을 권하는 것(예: 계량기 합계가 전체와 20% 넘게 다름). */
    caution?: string;
}

const SPLIT_VALUE_NAME: Record<ElectricitySplitBasis, string> = {
    SUB_METER: '계량기 값',
    OUTPUT_MASS: '생산량',
    INDIRECT_ESTIMATE: '추정 사용량',
};

/** 저장을 막을 문제. 없으면 undefined. */
export function validateElectricitySplitDraft(draft: ElectricitySplitDraft): string | undefined {
    if (!draft.group.trim()) return '계량기 이름을 적으세요. 예: 한전 계량기';
    if (!(draft.totalMwh > 0)) return '공장 전체 전력 사용량(MWh)을 0보다 크게 넣으세요. 고지서 12개월 합계(kWh) ÷ 1,000 입니다.';
    if (draft.rows.length < 2) return '같이 쓰는 공정을 둘 이상 고르세요. 한 공정만 쓰는 계량기는 나눌 필요가 없습니다.';
    for (const row of draft.rows) {
        if (!(row.value > 0)) {
            return draft.basis === 'OUTPUT_MASS'
                ? `「${row.processName}」의 생산량이 0입니다. 3단계에서 생산량을 먼저 넣으세요.`
                : `「${row.processName}」의 ${SPLIT_VALUE_NAME[draft.basis]}(MWh)을 0보다 크게 넣으세요.`;
        }
    }
    if (draft.basis === 'INDIRECT_ESTIMATE' && !draft.note.trim()) {
        return '추정으로 나눌 때는 계량기가 없는 이유와 추정 근거(설비 정격용량·가동일지 등)를 적어야 합니다. 검증인이 묻습니다.';
    }
    return undefined;
}

/** 나눈다. validateElectricitySplitDraft를 통과한 입력만 넘길 것. */
export function computeElectricitySplit(draft: ElectricitySplitDraft): ElectricitySplitPlan {
    const valueSum = draft.rows.reduce((sum, row) => sum + row.value, 0);
    const factor = valueSum > 0 ? draft.totalMwh / valueSum : 0;
    const shares = draft.rows.map<ElectricitySplitShare>((row) => ({
        ...row,
        share: valueSum > 0 ? row.value / valueSum : 0,
        mwh: roundSplitMwh(row.value * factor),
    }));

    // 반올림 끝수는 가장 큰 몫에 넣는다 — 그래야 합계가 고지서 값과 정확히 같다.
    const largest = shares.reduce((best, share) => (share.mwh > best.mwh ? share : best), shares[0]);
    if (largest) {
        const others = shares.reduce((sum, share) => (share === largest ? sum : sum + share.mwh), 0);
        largest.mwh = roundSplitMwh(draft.totalMwh - others);
    }

    const measured = draft.basis !== 'OUTPUT_MASS';
    const caution = measured && Math.abs(factor - 1) > RECONCILIATION_REVIEW_DEVIATION
        ? `공정별 ${SPLIT_VALUE_NAME[draft.basis]} 합계 ${formatSplitNumber(valueSum)} MWh가 공장 전체 ${formatSplitNumber(draft.totalMwh)} MWh와 ${(RECONCILIATION_REVIEW_DEVIATION * 100).toFixed(0)}% 넘게 다릅니다. 단위(kWh ↔ MWh)나 빠진 공정이 없는지 확인하세요.`
        : undefined;

    return {
        group: draft.group.trim(),
        totalMwh: draft.totalMwh,
        basis: draft.basis,
        valueSum,
        factor,
        shares,
        note: draft.note.trim(),
        caution,
    };
}

/** 이 공정의 배분 근거 한 문장. 산정보고서가 「전력 사용량 배분 근거」로 그대로 싣는다. */
export function describeElectricitySplit(plan: ElectricitySplitPlan, processId: string): string {
    const own = plan.shares.find((share) => share.processId === processId);
    if (!own) return '';
    const head = `공용 계량기 「${plan.group}」 ${formatSplitNumber(plan.totalMwh)} MWh`;
    const anchor = ELECTRICITY_SPLIT_BASIS_ANCHOR[plan.basis];

    if (plan.basis === 'OUTPUT_MASS') {
        const ratio = plan.shares.map((share) => `${share.processName} ${formatSplitNumber(share.value, 3)} t`).join(' : ');
        return `${head}를 공정별 생산량(활동수준) 비율로 배분 — ${ratio}. 공정별 계량값이 없어 기능단위 기준을 적용(${anchor}). 이 공정 몫 ${formatSplitNumber(own.mwh)} MWh (${(own.share * 100).toFixed(2)}%).`;
    }

    if (plan.basis === 'SUB_METER') {
        return `${head}: 공정별 계량기 값 합계 ${formatSplitNumber(plan.valueSum)} MWh를 사업장 계량값에 맞춰 정합계수 RecF = ${plan.factor.toFixed(4)} 적용(${anchor}). 이 공정: 계량기 값 ${formatSplitNumber(own.value)} → ${formatSplitNumber(own.mwh)} MWh.`;
    }

    return `${head}: 공정별 추정 사용량(설비용량 × 가동시간) 합계 ${formatSplitNumber(plan.valueSum)} MWh를 사업장 계량값에 맞춰 보정(계수 ${plan.factor.toFixed(4)}) — ${anchor}. 이 공정: 추정 ${formatSplitNumber(own.value)} → ${formatSplitNumber(own.mwh)} MWh. 근거: ${plan.note}`;
}

const inSameElectricityGroup = (process: ProductionProcess, group: string, periodId: string | undefined) =>
    process.electricity_shared_meter?.group?.trim() === group && (process.period_id ?? '') === (periodId ?? '');

/**
 * 나눈 결과를 공정 레코드에 얹는다. 바뀐 공정만 돌려준다(기존 레코드를 펼쳐 id·다른 필드를 지킨다).
 * 같은 그룹에 있다가 이번에 빠진 공정은 그룹 기록과 근거 문장을 지운다 — 남겨두면 합계 검사가 그 공정을
 * 계속 세어 「합계가 다르다」고 한다. 그 공정의 전력량은 건드리지 않는다(무엇이 맞는지 앱은 모른다).
 */
export function buildElectricitySplitUpdates<T extends ProductionProcess>(processes: T[], plan: ElectricitySplitPlan): T[] {
    const shareByProcessId = new Map(plan.shares.map((share) => [share.processId, share]));
    const periodId = processes.find((process) => shareByProcessId.has(process.id))?.period_id;
    const updates: T[] = [];

    for (const process of processes) {
        const share = shareByProcessId.get(process.id);
        if (share) {
            updates.push({
                ...process,
                electricity_mwh: share.mwh,
                electricity_shared_meter: {
                    group: plan.group,
                    installation_total_mwh: plan.totalMwh,
                    basis: plan.basis,
                    basis_value: share.value,
                    note: plan.note || undefined,
                },
                electricity_allocation_note: describeElectricitySplit(plan, process.id),
            });
        } else if (inSameElectricityGroup(process, plan.group, periodId)) {
            updates.push({ ...process, electricity_shared_meter: undefined, electricity_allocation_note: undefined });
        }
    }

    return updates;
}

/** 나누기 해제 — 그룹 기록과 근거 문장만 지운다. 공정별 전력량은 그대로 둔다. */
export function buildElectricitySplitRelease<T extends ProductionProcess>(processes: T[], group: string, periodId: string | undefined): T[] {
    return processes
        .filter((process) => inSameElectricityGroup(process, group.trim(), periodId))
        .map((process) => ({ ...process, electricity_shared_meter: undefined, electricity_allocation_note: undefined }));
}
