import {
    buildInstallationPayload,
    buildInstallationUpdate,
    buildPeriodPayload,
    buildPeriodUpdate,
    buildProductPayload,
    buildProductUpdate,
    validateInstallationDraft,
    validatePeriodDraft,
    validateProductDraft,
    type InstallationDraft,
    type PeriodDraft,
    type ProductDraft,
} from '@/lib/guided-edit';
import { createLocalItem, updateLocalItem, type Installation, type Product, type ReportingPeriod } from '@/lib/local-db';

/**
 * 질문으로 입력(대화형 모드)의 **유일한 쓰기 자리**. 이 폴더의 다른 파일은 저장소를 직접 부르지 않는다(scripts/verify-talk-s1.mjs가 잠근다).
 *
 * 규칙(docs/harness/conversation-mode-design.md §2·§5): 자체 필드 매핑을 두지 않고 지도 화면 패널이 쓰는 guided-edit.ts의 검증·빌더를 그대로 거친다 —
 * 신규와 수정 모두. 그래서 같은 답을 지도 화면에서 넣든 질문으로 넣든 저장되는 레코드가 같다.
 * 반환값은 사람에게 보일 오류 문장(없으면 null)이다.
 */

export async function saveCompany(existing: Installation | undefined, draft: InstallationDraft): Promise<string | null> {
    const error = validateInstallationDraft(draft);
    if (error) {
        return error;
    }
    if (existing) {
        await updateLocalItem('installations', buildInstallationUpdate(existing, draft));
    } else {
        await createLocalItem('installations', buildInstallationPayload(draft));
    }
    return null;
}

export async function savePeriod(existing: ReportingPeriod | undefined, draft: PeriodDraft): Promise<string | null> {
    const error = validatePeriodDraft(draft);
    if (error) {
        return error;
    }
    if (existing) {
        await updateLocalItem('periods', buildPeriodUpdate(existing, draft));
    } else {
        await createLocalItem('periods', { ...buildPeriodPayload(draft), status: 'DRAFT' as const });
    }
    return null;
}

export async function saveProduct(existing: Product | undefined, draft: ProductDraft, installationId: string | undefined): Promise<string | null> {
    const error = validateProductDraft(draft);
    if (error) {
        return error;
    }
    if (existing) {
        await updateLocalItem('products', buildProductUpdate(existing, draft));
    } else {
        await createLocalItem('products', buildProductPayload(draft, installationId));
    }
    return null;
}
