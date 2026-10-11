import { CN_DESCRIPTIONS } from './cn-descriptions.generated';

/**
 * CN 코드의 EU 공식 품명을 읽는다(EU Communication Template의 Parameters_CNCodes, 철강 계열만).
 * 채우는 사람이 CN을 잘못 적어도 8단계의 EU 문서를 열어서야 알던 문제(run35 P1-07) — 적은 CN이 무엇을 뜻하는지
 * 그 자리에서 되돌려 보여 주고, 품명이 말하는 것(스테인리스 여부·인장강도)과 어긋나는 자료를 알리는 데 쓴다.
 */
export interface CnDescription {
    cn: string;
    text: string;
    /** 품명이 스테인리스강을 말하는가. 「other than stainless」는 아니오. */
    stainless: boolean;
    /** 품명으로 가려지는 재질: 스테인리스 / 스테인리스가 아닌 철강 / 품명만으로는 모름 */
    material: 'STAINLESS' | 'NON_STAINLESS' | 'UNKNOWN';
    /** 품명이 정한 인장강도 구분. 없으면 undefined. */
    tensile?: 'LT_800' | 'GE_800';
}

const digits = (value: string | undefined) => (value ?? '').replace(/\D/g, '');

export function describeCn(cn: string | undefined): CnDescription | undefined {
    const code = digits(cn);
    const text = CN_DESCRIPTIONS[code];
    if (!text) return undefined;
    const stainless = /stainless/i.test(text) && !/other than stainless|non-stainless/i.test(text);
    const tensile = /tensile strength of\s*<\s*800/i.test(text) ? 'LT_800' : /tensile strength of\s*(=>|>=)\s*800/i.test(text) ? 'GE_800' : undefined;
    const material = stainless ? 'STAINLESS' : /other than stainless|non-stainless|non-alloy steel|other alloy steel|iron or/i.test(text) ? 'NON_STAINLESS' : 'UNKNOWN';
    return { cn: code, text, stainless, material, tensile };
}

/** 영문 품명에서 오입력을 가르는 말만 한국어로 짚는다 — 전체 번역이 아니다. */
export function glossCn(description: CnDescription): string[] {
    const gloss: string[] = [];
    if (description.stainless) gloss.push('스테인리스강');
    else if (/other than stainless/i.test(description.text)) gloss.push('스테인리스가 아닌 철강');
    if (description.tensile === 'LT_800') gloss.push('인장강도 800 MPa 미만');
    if (description.tensile === 'GE_800') gloss.push('인장강도 800 MPa 이상');
    return gloss;
}

/** 줄여 보여 주기 — 품명 앞부분이 제품 종류를 말한다. */
export function shortCnText(text: string, max = 110): string {
    return text.length <= max ? text : `${text.slice(0, max).replace(/[\s,;(]+$/, '')}…`;
}

const STRENGTH_CLASS = /(?<![\d.])(4\.6|4\.8|5\.6|5\.8|6\.8|8\.8|9\.8|10\.9|12\.9)(?![\d])/;

/**
 * 이름·품명에 볼트 강도 구분(4.8, 8.8, 10.9 …)이 적혀 있으면 인장강도(MPa)로 읽는다. 앞자리 × 100 — 4.8은 400, 10.9는 1000.
 * 강도 구분은 보통 볼트·나사의 표시이며, 다른 숫자(1.5 피치 등)는 거르도록 표준 구분 값만 받는다.
 */
export function strengthMpaFromText(text: string | undefined): number | undefined {
    const match = (text ?? '').match(STRENGTH_CLASS);
    if (!match) return undefined;
    return Number(match[1].split('.')[0]) * 100;
}
