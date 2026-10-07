import { savePrecursorEdit } from '@/components/talk/talk-writes';
import { describePrecursorEditBlock, precursorAnswerFromExisting } from '@/lib/conversation-precursor';
import { updateLocalItem, type Installation, type PurchasedPrecursor, type SourceStream } from '@/lib/local-db';
import {
    buildInstallationFieldUpdate,
    buildStreamFactorSourceUpdate,
    validateInstallationFieldAnswers,
    validateStreamFactorSource,
    type FactorSourceType,
    type InstallationFieldKey,
} from '@/lib/todo-edits';

/**
 * 할 일 화면의 **유일한 쓰기 자리**(이 폴더의 다른 파일은 저장소를 직접 부르지 않는다 — scripts/verify-todo.mjs가 잠근다).
 * 규칙은 순수 함수(`todo-edits.ts`)에 있고, 구매 강재는 질문 화면의 고치기(`savePrecursorEdit`)를 그대로 쓴다.
 * 반환값은 사람에게 보일 오류 문장(없으면 null)이다.
 */

export async function saveInstallationFields(installation: Installation, fields: InstallationFieldKey[], answers: Partial<Record<InstallationFieldKey, string>>): Promise<string | null> {
    const error = validateInstallationFieldAnswers(fields, answers);
    if (error) {
        return error;
    }
    await updateLocalItem('installations', buildInstallationFieldUpdate(installation, fields, answers));
    return null;
}

export async function saveStreamFactorSource(stream: SourceStream, type: FactorSourceType | ''): Promise<string | null> {
    const updated = buildStreamFactorSourceUpdate(stream, type || 'UNCLASSIFIED');
    const error = validateStreamFactorSource(updated);
    if (error) {
        return error;
    }
    await updateLocalItem('source_streams', updated);
    return null;
}

/** 구매 강재의 「SEE 출처」·「기본값 사용 사유」. 적은 칸만 덮고 나머지 값은 질문 화면 고치기와 같이 그대로 둔다. */
export async function savePrecursorTexts(precursor: PurchasedPrecursor, values: Partial<Record<'source' | 'justification', string>>): Promise<string | null> {
    const blocked = describePrecursorEditBlock(precursor);
    if (blocked) {
        return blocked;
    }
    const source = (values.source ?? '').trim();
    const justification = (values.justification ?? '').trim();
    if (!source && !justification) {
        return '내용을 적어 주세요.';
    }
    const answer = precursorAnswerFromExisting(precursor);
    return savePrecursorEdit(precursor, { ...answer, ...(source ? { source } : {}), ...(justification ? { justification } : {}) });
}
