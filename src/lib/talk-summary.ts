import { describeSeeFlowIndirect, type SeeFlowBinding } from './see-flow';

/**
 * 질문으로 입력(대화형 모드 S5) — 「지금까지의 답으로 나온 결과」 요약.
 *
 * 자기 산술이 없다: 숫자는 SeeFlowBinding(지도 화면과 같은 엔진 집계), 간접배출 문안은 describeSeeFlowIndirect, 막는 항목은 EU 준비도 검사 결과를 그대로 옮긴다.
 * 입력이 덜 찬 상태(partial)면 「최종 결과」라고 말하지 않는다 — run19에서 막대가 입력이 없는데 「100% 낮다」를 그린 것과 같은 거짓을 피한다.
 */

export interface TalkIssue {
    severity: 'error' | 'warning';
    area: string;
    message: string;
    /** 그 항목을 고칠 수 있는 화면(있을 때) */
    href?: string;
}

export type TalkNextStep = 'INPUT' | 'FIX' | 'REVIEW' | 'EXPORT';

export interface TalkSummary {
    /** 계산할 자료가 아직 없다(예시 집계) */
    empty: boolean;
    /** 인증서 산정 기준 SEE(tCO₂e/t). 산출하지 않으면 null */
    headline: number | null;
    seeTotal: number;
    /** 기준 SEE와 총 SEE의 관계를 말하는 문장(간접배출 판정에서 파생) */
    relationNote: string;
    errorCount: number;
    warningCount: number;
    /** 먼저 보일 항목(오류 먼저, 최대 5) */
    issues: TalkIssue[];
    /** 입력이 덜 찬 상태의 사유(있으면 이 숫자는 최종이 아니다) */
    partialNote?: string;
    nextStep: TalkNextStep;
    /** 담당자에게 보일 한 줄 안내 */
    message: string;
}

export function summarizeTalkResult(input: { binding: SeeFlowBinding; issues: TalkIssue[]; partialNote?: string }): TalkSummary {
    const { binding } = input;
    const labels = describeSeeFlowIndirect(binding.indirectRelevance, binding.basisExcludesUndetermined);
    const errors = input.issues.filter((issue) => issue.severity === 'error');
    const warnings = input.issues.filter((issue) => issue.severity === 'warning');
    const issues = [...errors, ...warnings].slice(0, 5);

    let nextStep: TalkNextStep;
    let message: string;
    if (binding.isExample) {
        nextStep = 'INPUT';
        message = '아직 계산할 자료가 없습니다 — 생산량과 연료·전력·구매 강재를 입력하면 여기에 결과가 나옵니다.';
    } else if (input.partialNote) {
        nextStep = 'INPUT';
        message = '입력이 덜 찬 상태의 중간 값입니다. 남은 질문에 답하면 최종 값이 됩니다.';
    } else if (errors.length > 0) {
        nextStep = 'FIX';
        message = `EU 문서를 만들기 전에 해결할 오류가 ${errors.length}건 있습니다.`;
    } else if (warnings.length > 0) {
        nextStep = 'REVIEW';
        message = `막는 항목은 없습니다. 확인하면 좋은 항목이 ${warnings.length}건 있습니다 — 읽어 본 뒤 EU 문서를 만드세요.`;
    } else {
        nextStep = 'EXPORT';
        message = '막는 항목이 없습니다. EU 문서를 만들 수 있습니다.';
    }

    return {
        empty: binding.isExample,
        headline: binding.isExample ? null : binding.seeCbamBasis,
        seeTotal: binding.seeTotal,
        relationNote: labels.basisVsTotalNote,
        errorCount: errors.length,
        warningCount: warnings.length,
        issues,
        partialNote: input.partialNote,
        nextStep,
        message,
    };
}
