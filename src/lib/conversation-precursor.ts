import { findDefaultValueReference, resolveDefaultSeeForYear, type ImportedDefaultValueReference } from './reference-workbooks';
import type { PrecursorDraft } from './guided-edit';

/**
 * 질문으로 입력(대화형 모드 S3) — 「구매한 강재」 답을 전구물질 초안(PrecursorDraft)으로 바꾸고, 「모르겠어요」면 EU 기본값으로 채우는 순수 함수.
 *
 * 저장·검증은 지도 6단계 패널이 쓰는 guided-edit.ts의 `validatePrecursorDraft`·`buildPrecursorCreate`를 그대로 거친다(talk-writes.ts).
 * 이 파일이 새로 가진 것은 **기본값 채우기의 문장과 값** 하나다 — 지도 패널의 `applyDefaultValues`가 인라인이라 같은 결과를 내는 함수를 따로 두었고,
 * scripts/verify-talk-s3.mjs가 패널의 문장 조각을 글자 단위로 대조해 어긋나지 않게 잠근다.
 */

/** 지도 패널이 기본값을 채울 때 쓰는 연도(고정) */
export const DEFAULT_FILL_YEAR = '2026' as const;

export type DefaultFill =
    | {
        ok: true;
        direct: number;
        indirect: number;
        hasIndirect: boolean;
        /** 「SEE 출처」 칸에 들어가는 글 */
        source: string;
        /** 「기본값 사용 사유」 칸에 들어가는 글 */
        justification: string;
        /** 담당자에게 보일 안내 */
        message: string;
    }
    | { ok: false; reason: string };

/**
 * 공급국가×CN으로 EU 기본값을 찾아 직접·간접 SEE로 옮긴다.
 *  · 나라를 고르기 전에는 채우지 않는다 — 같은 STS 와이어가 한국 4.015 · 대만 11이다(run11 P0-04: 한국으로 고정해 대만 원료에 한국 값이 들어갔다).
 *  · 직접·간접 분해는 모든 화면이 같은 `resolveDefaultSeeForYear`를 쓴다 — 간접이 N/A면 mark-up 포함 총액이 직접에 가고 간접은 0이다.
 */
export function fillEuDefault(input: {
    reference: ImportedDefaultValueReference | undefined;
    country: string;
    cnDigits: string;
}): DefaultFill {
    if (!input.reference) {
        return { ok: false, reason: 'EU 기본값 자료를 아직 불러오지 못했습니다. 앱을 다시 열거나, 자료 업로드 화면에서 EU 기본값(DVs) 파일을 직접 가져오세요.' };
    }
    if (!input.country.trim()) {
        return { ok: false, reason: '먼저 「공급국가」를 고르세요. EU 기본값은 원료를 만든 나라마다 다릅니다(예: 같은 STS 와이어가 한국 4.015 · 대만 11).' };
    }
    const match = findDefaultValueReference(input.reference, input.country, input.cnDigits, DEFAULT_FILL_YEAR);
    if (!match) {
        return { ok: false, reason: `${input.country} · CN ${input.cnDigits || '미입력'}에 맞는 기본값을 찾지 못했습니다. 공급국가와 CN 코드를 확인하세요.` };
    }
    const { direct, indirect, hasIndirect } = resolveDefaultSeeForYear(match, DEFAULT_FILL_YEAR);
    return {
        ok: true,
        direct,
        indirect,
        hasIndirect,
        source: `${input.reference.summary.filename} / ${match.country} / ${match.cn_code}`,
        justification:
            `공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026, markup 포함) 적용. 직접 ${direct}`
            + (hasIndirect ? ` · 간접 ${indirect}` : ' · 이 CN의 공식 DV는 간접값 미제공(간접 0)'),
        message: hasIndirect
            ? 'EU 기본값을 채웠습니다. 공급사 실측자료를 받으면 교체하세요.'
            : '이 CN의 공식 DV는 간접값을 제공하지 않아 간접을 0으로 두었습니다(직접값은 2026 markup 포함). 공급사 실측자료를 받으면 교체하세요.',
    };
}

export interface PrecursorAnswer {
    name: string;
    cn: string;
    consumed: string;
    purchased: string;
    country: string;
    /** 공급사가 준 값이면 ACTUAL, 「모르겠어요」로 EU 기본값을 채웠으면 DEFAULT */
    mode: 'ACTUAL' | 'DEFAULT';
    directSee: string;
    indirectSee: string;
    source: string;
    justification: string;
}

const parseAnswerNumber = (value: string) => {
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * 답 → 지도 6단계 패널의 `baseDraft`와 같은 모양의 초안. 칸이 없는 값(공급사 설비·생산경로·보고기간·전력 분해)은 패널이 비워 두는 값과 같이 비운다 —
 * 그 값들은 공급사 요청·회신 흐름(6단계)에서 채워진다.
 */
export function buildPrecursorDraft(answer: PrecursorAnswer): PrecursorDraft {
    return {
        name: answer.name,
        cnDigits: answer.cn.replace(/\D/g, ''),
        consumedMass: parseAnswerNumber(answer.consumed),
        purchasedMass: parseAnswerNumber(answer.purchased),
        directSee: parseAnswerNumber(answer.directSee),
        indirectSee: parseAnswerNumber(answer.indirectSee),
        bridgeUsage: 0,
        bridgeFactor: 0,
        source: answer.source,
        dataMode: answer.mode,
        justification: answer.mode === 'DEFAULT' ? answer.justification : '',
        supplierInstallation: '',
        supplierRoute: '',
        supplierPeriod: '',
        supplierCountry: answer.country,
        outputAllocations: undefined,
    };
}
