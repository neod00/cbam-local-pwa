import type { PurchasedPrecursor } from './local-db';

/**
 * 2025/2547 부속서 II A.1 4·5항, E(3): 사업장 밖(EU·면제국 외 제3국)에서 만든 전구물질의 실측값은
 * 공인 검증기관이 그 전구물질의 생산기간을 다룬 검증보고서가 있을 때만 쓸 수 있다. 없으면 기본값을 쓴다.
 */
export const PRECURSOR_ACTUAL_VALUE_RULE = {
    anchor: '2025/2547 ANNEX II, point A.1(4)–(5) · point E(3) · Article 11(2)',
    text: 'actual data obtained from the operator of the installation producing the precursor shall be used only if … the data must be taken from a verification report … Where the operator does not have a verification report meeting conditions (a) and (b), the relevant default values … shall be used.',
} as const;

/** 실측(또는 혼합) 값인데 제3자 검증이 없는 전구물질. 「공급사 확인」도 제3자 검증이 아니다. */
export function isUnverifiedActualPrecursor(precursor: Pick<PurchasedPrecursor, 'data_mode' | 'verification_status'>) {
    return precursor.data_mode !== 'DEFAULT' && precursor.verification_status !== 'VERIFIED';
}

export function unverifiedActualPrecursorMessage(precursor: Pick<PurchasedPrecursor, 'name' | 'verification_status'>) {
    const status = precursor.verification_status === 'SUPPLIER_CONFIRMED' ? '공급사 확인 — 제3자 검증 아님' : '미검증';
    return `확인 필요(규정): ${precursor.name}의 실측 SEE에 제3자 검증보고서가 없습니다(${status}). `
        + `2025/2547 부속서 II A.1 4·5항: 제3국 전구물질의 실측값은 공인 검증기관이 그 생산기간을 다룬 검증보고서가 있을 때만 쓸 수 있고, 없으면 기본값을 써야 합니다. `
        + '지금 결과는 잠정값입니다 — 검증보고서를 받거나 기본값으로 바꾸세요.';
}
