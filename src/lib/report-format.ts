// 산정보고서 표기·반올림 규칙. 설계: docs/calculation-report-design.md §6
//
// 보고서는 제3자 검증 대상이므로 "표시된 값끼리 손으로 재계산해도 맞아야" 한다.
// 두 가지 함정을 여기서 막는다.
//  (1) 부동소수점 이진오차: 1.025 × 1.95 = 1.9987499999999998 → 순진하게 4자리로 자르면 1.9987이 되어
//      같은 표 안의 구성 합(2.0287)이 소계(2.0288)와 어긋난다. 실제로 샘플 v0.1에서 발생한 결함.
//  (2) 음수 반올림: Math.round는 half를 항상 +∞ 방향으로 올려 음수의 절댓값이 줄어든다
//      (Math.round(-79.5) === -79). 사사오입(절댓값 기준)과 불일치 → 차감·델타 항에서 문제가 된다.

/**
 * 보고서 표기용 반올림. 이진오차를 제거한 뒤 사사오입(절댓값 기준, half-away-from-zero)한다.
 */
export function roundForReport(value: number, digits: number): number {
    if (!Number.isFinite(value)) {
        return value;
    }

    // toPrecision(15)로 이진 표현 오차를 털어낸 뒤 스케일링한다.
    const cleaned = Number(value.toPrecision(15));
    const factor = Math.pow(10, digits);
    const scaled = Number((cleaned * factor).toPrecision(15));
    const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));

    return rounded / factor;
}

/**
 * 보고서 표기용 숫자 포맷. 반올림 후 고정 자릿수로 렌더한다.
 * 계수·원단위처럼 원천 자릿수를 보존해야 하는 값은 그 자릿수를 digits로 넘겨 쓴다.
 */
export function formatForReport(value: number | undefined, digits = 4): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(roundForReport(value, digits));
}

/** 정수(생산량 등) 표기 */
export function formatIntegerForReport(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR').format(value);
}

/** 상대차(%) 표기. 부호를 명시한다. */
export function formatPercentForReport(ratio: number | undefined, digits = 2): string {
    if (ratio === undefined || !Number.isFinite(ratio)) {
        return '-';
    }

    const percent = roundForReport(ratio * 100, digits);
    const sign = percent >= 0 ? '+' : '';

    return `${sign}${new Intl.NumberFormat('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
    }).format(percent)}%`;
}

export interface DisplaySumCheck {
    label: string;
    /** 구성 항목의 미반올림 원천값 */
    parts: number[];
    /** 소계의 미반올림 원천값 */
    total: number;
    digits?: number;
}

export interface DisplaySumResult {
    label: string;
    isValid: boolean;
    displayedPartsSum: number;
    displayedTotal: number;
}

/**
 * 게이트 G1 — "구성 항목의 표시값 합 = 소계 표시값" 검사.
 * 반올림 후 값으로 비교해야 의미가 있다(검증인은 표시된 숫자를 더해 본다).
 */
export function checkDisplaySum({ label, parts, total, digits = 4 }: DisplaySumCheck): DisplaySumResult {
    const displayedPartsSum = roundForReport(
        parts.reduce((sum, part) => sum + roundForReport(part, digits), 0),
        digits
    );
    const displayedTotal = roundForReport(total, digits);

    return {
        label,
        isValid: Math.abs(displayedPartsSum - displayedTotal) < Math.pow(10, -digits) / 2,
        displayedPartsSum,
        displayedTotal,
    };
}
