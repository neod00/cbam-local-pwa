import { getAppScopeExclusion, APP_SCOPE_EXCLUSION_TEXT, getCbamCoverage } from './cbam-product-rules';
import type { Installation, Product, ReportingPeriod } from './local-db';

/**
 * 질문으로 입력(대화형 모드 S1) — 어느 질문이 지금 차례인지와 답을 칩으로 보여 주는 순수 규칙.
 *
 * 원칙(docs/harness/conversation-mode-design.md): 자체 저장 코드가 없다. 이 파일은 읽고 판단만 하고, 쓰기는 guided-edit.ts의 빌더를 거친다.
 * 값의 원본은 지도 화면과 같은 IndexedDB 하나라서, 질문으로 넣은 값을 지도 화면에서 고치고 돌아와도 칩이 따라간다 — 상태를 따로 두지 않는다.
 */

export type TalkQuestionId = 'company' | 'period' | 'product';

export interface TalkChip {
    id: TalkQuestionId;
    /** 질문 이름 */
    title: string;
    /** 담당자가 한 답 */
    answer: string;
}

export interface TalkState {
    /** 지금 물을 질문. 이번 단계(S1)의 모든 질문에 답했으면 undefined */
    current?: TalkQuestionId;
    chips: TalkChip[];
    /** 첫 번째 말고 더 있는 것들 — 질문 화면은 첫 번째만 다루므로 나머지는 지도 화면으로 안내한다 */
    more: { installations: number; periods: number; products: number };
}

export function deriveTalkState(input: {
    installations: Installation[];
    periods: ReportingPeriod[];
    /** 신고 대상 제품(reporting scope)만 */
    products: Product[];
}): TalkState {
    const [installation] = input.installations;
    const [period] = input.periods;
    const [product] = input.products;
    const chips: TalkChip[] = [];

    if (installation) {
        chips.push({ id: 'company', title: '회사·공장', answer: `${installation.local_name || installation.name} · ${installation.country}` });
    }
    if (period) {
        chips.push({ id: 'period', title: '보고기간', answer: `${period.name} (${period.start_date} ~ ${period.end_date})` });
    }
    if (product) {
        chips.push({ id: 'product', title: '만드는 제품', answer: `${product.name} · CN ${product.cn_code ?? '—'}` });
    }

    // 앞 질문에 답이 있어야 다음 질문이 뜬다 — 사업장이 없으면 제품을 저장할 곳이 없다.
    const current: TalkQuestionId | undefined = !installation ? 'company' : !period ? 'period' : !product ? 'product' : undefined;

    return {
        current,
        chips,
        more: {
            installations: Math.max(0, input.installations.length - 1),
            periods: Math.max(0, input.periods.length - 1),
            products: Math.max(0, input.products.length - 1),
        },
    };
}

/** 연간 보고기간 한 칸 — 지도 1단계의 「2025년 연간」 버튼과 같은 값 */
export function yearlyPeriodDraft(year: number) {
    return { name: `${year}년 연간`, startDate: `${year}-01-01`, endDate: `${year}-12-31` };
}

export type CnHintLevel = 'ok' | 'warn' | 'blocked' | 'idle';

export interface CnHint {
    level: CnHintLevel;
    text: string;
}

/**
 * 담당자가 입력한 CN 8자리에 대한 한 줄 안내. 막지 않는다(저장 검증은 validateProductDraft) — 알릴 뿐이다.
 *  · 고른 제품군의 후보 코드(앞 4자리)와 다르면 알린다 — 수출 신고필증의 코드가 정답이므로 앱이 바꾸지 않는다.
 *  · 대상이 아니거나 앱 범위 밖(철강 외·고로 일관제철)이면 그 사실을 말한다.
 */
export function describeCnInput(cnDigits: string, candidateCodes: string[]): CnHint {
    if (cnDigits.length === 0) {
        return { level: 'idle', text: '수출 신고필증이나 인보이스의 HS 코드 8자리를 적으세요.' };
    }
    if (cnDigits.length < 8) {
        return { level: 'idle', text: `${cnDigits.length}자리 입력됨 — 8자리가 필요합니다.` };
    }
    if (cnDigits.length > 8) {
        return { level: 'warn', text: 'CN 코드는 8자리입니다.' };
    }

    const product = { cn_code: cnDigits, hs_code: cnDigits.slice(0, 4) };
    const exclusion = getAppScopeExclusion(product);
    if (exclusion) {
        return { level: 'blocked', text: APP_SCOPE_EXCLUSION_TEXT[exclusion] };
    }
    const coverage = getCbamCoverage(product);
    if (coverage.status === 'NOT_COVERED') {
        return { level: 'blocked', text: coverage.reason };
    }
    const candidates = candidateCodes.map((code) => code.replace(/\D/g, '')).filter(Boolean);
    if (candidates.length > 0 && !candidates.some((code) => cnDigits.startsWith(code))) {
        return {
            level: 'warn',
            text: `고른 제품군의 후보 코드(${candidates.join(', ')})와 앞자리가 다릅니다. 수출 신고필증의 코드가 맞다면 그대로 쓰세요 — 앱이 코드를 바꾸지 않습니다.`,
        };
    }
    if (coverage.status === 'CHECK_NEEDED') {
        return { level: 'warn', text: `${coverage.reason || 'CBAM 대상 여부를 확인하세요.'}` };
    }
    return { level: 'ok', text: 'CBAM 대상 품목으로 보입니다.' };
}
