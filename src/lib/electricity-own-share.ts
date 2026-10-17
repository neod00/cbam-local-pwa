import type { ProductionProcess } from './local-db';

/**
 * 공정의 electricity_mwh = 자체 몫 + 외주처 전력 우리 몫(outsourced_electricity)의 합.
 * 엔진·EU 엑셀·보고서는 합계만 읽는다. 아래 함수는 「자체 몫」이 필요한 곳(공용 계량기 합계 검사·전력 나누기·전력 직접 수정)이 쓴다.
 * 의존성이 없는 순수 함수다 — 설계: docs/harness/outsourced-electricity-design.md
 */

type ElectricityShape = Pick<ProductionProcess, 'electricity_mwh'> & Partial<Pick<ProductionProcess, 'outsourced_electricity'>>;

const roundMwh = (value: number) => Math.round(value * 1e6) / 1e6;

/** 외주 몫 합계 (MWh). 숫자가 아니거나 음수인 값은 세지 않는다. */
export function outsourcedElectricityMwh(process: Partial<ElectricityShape>): number {
    return roundMwh((process.outsourced_electricity ?? []).reduce((sum, share) => sum + (Number.isFinite(share.mwh) && share.mwh > 0 ? share.mwh : 0), 0));
}

/** 자체 몫 (MWh) = 합계 − 외주 몫. 외주 몫이 합계보다 크면(데이터가 어긋남) 0으로 둔다 — 점검 OUTE02가 따로 알린다. */
export function ownElectricityMwh(process: ElectricityShape): number {
    return Math.max(0, roundMwh((process.electricity_mwh || 0) - outsourcedElectricityMwh(process)));
}

/** 자체 몫을 새 값으로 바꿀 때의 합계 — 외주 몫을 그대로 얹는다. */
export function electricityTotalFromOwn(process: Partial<ElectricityShape>, ownMwh: number): number {
    return roundMwh(ownMwh + outsourcedElectricityMwh(process));
}
