import type { Installation, SourceStream } from './local-db';
import { createSourceStreamValidationErrors, FACTOR_SOURCE_TYPE_OPTIONS, firstSourceStreamError } from './source-stream-input';

/**
 * 할 일 화면의 「칸 하나 채우기」 — 순수 규칙. 저장은 `src/components/todo/todo-writes.ts` 한 곳이다.
 *
 * 원칙(질문 화면과 같다): 기존 레코드를 펼쳐 칸이 없는 값을 지키고, 이 칸만 덮는다.
 *  · 사업장: /installations 화면이 저장하는 모양(`{ ...existing, ...normalized }`, 빈 칸은 저장하지 않음)과 같고, 채운 칸만 바꾼다.
 *  · 배출원: 지도 4단계 수정과 같은 검증(`createSourceStreamValidationErrors`)을 거친다.
 *  · 구매 강재: 질문 화면의 고치기(S7)와 같은 경로를 쓴다(todo-writes.ts).
 */

export type InstallationFieldKey = 'operator_name' | 'operator_reg_number' | 'operator_address' | 'unlocode';

export const INSTALLATION_FIELD_SPECS: Record<InstallationFieldKey, { label: string; placeholder: string; hint?: string }> = {
    operator_name: { label: '운영자(법인)명', placeholder: '예: Daeil Industrial Co., Ltd.', hint: '사업장을 운영하는 법인의 이름(영문이 있으면 영문)입니다.' },
    operator_reg_number: { label: '법인/활동 등록번호', placeholder: '000000-0000000', hint: '검증인이 반드시 확인합니다. 법인등록번호 또는 사업자등록번호를 적으세요.' },
    operator_address: { label: '운영자 주소', placeholder: '예: 12, Byeolmang-ro, Danwon-gu, Ansan-si, Gyeonggi-do', hint: '법인의 주소입니다(공장 주소와 다를 수 있습니다).' },
    unlocode: { label: 'UN/LOCODE (5자리)', placeholder: 'KRPUS', hint: 'UNECE가 도시·항만에 붙인 코드입니다(예: 부산 KRPUS, 인천 KRINC). 가까운 도시 코드를 적으세요.' },
};

/** 「KR PUS」·「krpus」처럼 적어도 EU 문서에 들어가는 모양(KRPUS)으로 맞춘다. */
export function normalizeUnlocode(value: string): string {
    return value.replace(/\s+/g, '').toUpperCase();
}

/** 사람에게 보일 오류 문장. 없으면 null. 채운 칸만 본다 — 하나도 안 채웠으면 알린다. */
export function validateInstallationFieldAnswers(fields: InstallationFieldKey[], answers: Partial<Record<InstallationFieldKey, string>>): string | null {
    const filled = fields.filter((field) => (answers[field] ?? '').trim() !== '');
    if (filled.length === 0) {
        return '채울 칸에 값을 적어 주세요.';
    }
    if (filled.includes('unlocode') && !/^[A-Z]{2}[A-Z0-9]{3}$/.test(normalizeUnlocode(answers.unlocode ?? ''))) {
        return 'UN/LOCODE는 국가 코드 2자리 + 도시 코드 3자리입니다(예: KRPUS). UNECE 목록에서 가까운 도시를 찾으세요.';
    }
    return null;
}

/** 채운 칸만 덮는다 — 비워 둔 칸은 저장된 값을 그대로 둔다(빈 칸으로 지우지 않는다). */
export function buildInstallationFieldUpdate(existing: Installation, fields: InstallationFieldKey[], answers: Partial<Record<InstallationFieldKey, string>>): Installation {
    const patch: Partial<Installation> = {};
    for (const field of fields) {
        const raw = (answers[field] ?? '').trim();
        if (raw === '') continue;
        patch[field] = field === 'unlocode' ? normalizeUnlocode(raw) : raw;
    }
    return { ...existing, ...patch };
}

export type FactorSourceType = NonNullable<SourceStream['factor_source_type']>;

export const FACTOR_SOURCE_CHOICES = FACTOR_SOURCE_TYPE_OPTIONS.filter((option) => option.value !== 'UNCLASSIFIED');

export function buildStreamFactorSourceUpdate(existing: SourceStream, type: FactorSourceType): SourceStream {
    return { ...existing, factor_source_type: type };
}

/** 「분류 전」으로는 저장하지 않는다. 그 밖의 검증은 지도 4단계 수정과 같은 함수다. */
export function validateStreamFactorSource(updated: SourceStream): string | null {
    if (!updated.factor_source_type || updated.factor_source_type === 'UNCLASSIFIED') {
        return '근거 유형을 하나 고르세요.';
    }
    return firstSourceStreamError(createSourceStreamValidationErrors(updated));
}
