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

/**
 * 반올림 없이 원천 자릿수 그대로 표기한다.
 * 부속서 A.2가 「산식에 표기하는 피연산자는 반올림하지 않는다」를 선언하므로,
 * 산식의 피연산자는 formatForReport(반올림)가 아니라 이 함수를 써야 선언과 출력이 일치한다(씨밤이 P1).
 */
export function formatRawForReport(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return '-';
    }

    // 이진 부동소수 잔재(1.9987499999999998)를 유효자릿수로 정리하되 반올림 표기는 하지 않는다.
    return String(Number(value.toPrecision(15)));
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

    // roundForReport가 -0을 반환하면 `-0 >= 0`이 true라 '+'가 붙고 Intl은 '-0.00'을 찍어 `+-0.00%`가 된다.
    const percent = roundForReport(ratio * 100, digits) + 0;
    const sign = percent > 0 ? '+' : '';

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
    /** 원천값 기준 — 구성 합이 소계와 실제로 같은가. 이게 깨지면 산정 데이터가 틀린 것이다. */
    isMathValid: boolean;
    /** 표시값 기준 — 반올림된 구성 합이 반올림된 소계와 같은가. 이것만 깨지면 반올림 표기 문제다. */
    isDisplayValid: boolean;
    displayedPartsSum: number;
    displayedTotal: number;
    rawDelta: number;
}

/**
 * 게이트 G1 — 표의 구성 항목과 소계 정합.
 *
 * 두 가지를 구분해서 답해야 한다. 게이트가 물어야 할 것은 "인쇄된 숫자가 더해지는가"가 아니라
 * "데이터가 틀렸는가"이다.
 *  - isMathValid  = 원천값의 합이 소계와 같은가 → 아니면 **산정 오류**(발행 차단)
 *  - isDisplayValid = 표시값(반올림)의 합이 소계 표시값과 같은가 → 아니면 **반올림 표기 문제**(각주로 처리)
 *
 * 후자는 반올림의 본질적 성질이라 정상 데이터에서도 발생한다. 예: 0.20655 → 0.2066,
 * 0.01755 → 0.0176 (둘 다 올림) 이면 표시 합 0.2242 vs 소계 표시 0.2241 로 0.0001이 벌어진다.
 * 이걸 차단하면 정상 데이터로 보고서를 못 만든다.
 */
export function checkDisplaySum({ label, parts, total, digits = 4 }: DisplaySumCheck): DisplaySumResult {
    const rawPartsSum = parts.reduce((sum, part) => sum + part, 0);
    const rawDelta = rawPartsSum - total;
    const displayedPartsSum = roundForReport(
        parts.reduce((sum, part) => sum + roundForReport(part, digits), 0),
        digits
    );
    const displayedTotal = roundForReport(total, digits);
    // 원천값 비교는 부동소수점 오차만 흡수할 정도로만 느슨하게(표시 정밀도의 1/100).
    const mathTolerance = Math.pow(10, -digits) / 100;

    return {
        label,
        isMathValid: Math.abs(rawDelta) <= mathTolerance,
        isDisplayValid: Math.abs(displayedPartsSum - displayedTotal) < Math.pow(10, -digits) / 2,
        displayedPartsSum,
        displayedTotal,
        rawDelta,
    };
}
