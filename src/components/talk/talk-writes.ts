import {
    buildInstallationPayload,
    getOutputLineDeleteBlockers,
    buildPrecursorUpdate,
    buildInstallationUpdate,
    buildPeriodPayload,
    buildPeriodUpdate,
    buildProductPayload,
    buildElectricityUpdate,
    buildPrecursorCreate,
    buildProductUpdate,
    validateElectricityDraft,
    validateInstallationDraft,
    validatePrecursorDraft,
    validatePeriodDraft,
    validateProductDraft,
    type InstallationDraft,
    type PeriodDraft,
    type ProductDraft,
} from '@/lib/guided-edit';
import { buildOutputUpdate, buildProcessCreation, validateProcessAnswer, type ProcessAnswerDraft } from '@/lib/conversation-process';
import { sumReconciledSourceStreamEmissions } from '@/lib/allocation-rules';
import { buildFuelStreamDraft, buildFuelStreamEdit, noImportedHeatDraft, type FuelAnswer } from '@/lib/conversation-energy';
import { buildPrecursorDraft, buildPrecursorEditDraft, type PrecursorAnswer } from '@/lib/conversation-precursor';
import { buildImportedHeatUpdate, validateImportedHeatDraft } from '@/lib/measurable-heat';
import { createLocalItem, deleteLocalItem, updateLocalItem, type Installation, type Product, type ProductionProcess, type ProductOutputLine, type PurchasedPrecursor, type ReportingPeriod, type SourceStream } from '@/lib/local-db';
import { createSourceStreamValidationErrors, firstSourceStreamError } from '@/lib/source-stream-input';

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

/**
 * 「생산량」 답 — 새 공정 하나와 그 제품의 생산라인(+ 불량·스크랩이 있으면 활동수준 제외 라인)을 만든다.
 * 지도 3단계의 신규 경로와 같은 순서(공정 → 제품 라인 → 제외 라인)·같은 값이다(빌더: conversation-process.ts).
 */
export async function saveOutput(draft: ProcessAnswerDraft): Promise<string | null> {
    const error = validateProcessAnswer(draft);
    if (error) {
        return error;
    }
    const creation = buildProcessCreation(draft);
    const process = await createLocalItem('processes', creation.process);
    await createLocalItem('product_output_lines', { process_id: process.id, ...creation.productLine });
    if (creation.excludedLine) {
        await createLocalItem('product_output_lines', { process_id: process.id, ...creation.excludedLine });
    }
    return null;
}

/**
 * 「구매한 강재」 답 — 첫 공정에 전구물질을 하나 만든다. 지도 6단계의 신규 경로와 같은 검증·같은 빌더·같은 연결(기간·공정·공정의 대표 제품)이다.
 * 기본값이면 호출부가 채운 값(conversation-precursor.ts의 fillEuDefault)이 답에 들어 있다.
 */
export async function savePrecursor(process: ProductionProcess, answer: PrecursorAnswer): Promise<string | null> {
    const draft = buildPrecursorDraft(answer);
    const error = validatePrecursorDraft(draft);
    if (error) {
        return error;
    }
    await createLocalItem('precursors', buildPrecursorCreate(draft, {
        period_id: process.period_id,
        process_id: process.id,
        product_id: process.product_id,
    }));
    return null;
}

/** 「구매한 강재를 쓰지 않습니다」 확인 — 지도 6단계의 체크 칸과 같은 값(true)을 같은 방식으로 저장한다. */
export async function confirmNoPrecursors(process: ProductionProcess): Promise<string | null> {
    await updateLocalItem('processes', { ...process, no_purchased_precursors: true });
    return null;
}

/**
 * 「연료」 답 — 첫 공정에 배출원을 하나 만들고 공정의 직접배출 합계를 맞춘다. 지도 4단계의 신규 경로와 같은 순서·같은 검증이다:
 * 검증(상세 화면과 같은 함수) → 배출원 생성 → 공정 직접배출을 「배출원 합계」(공용 계량기 정합계수 보정 후)로 다시 맞춤.
 */
export async function saveFuel(process: ProductionProcess, existingStreams: SourceStream[], answer: FuelAnswer): Promise<string | null> {
    const draft = buildFuelStreamDraft(answer, process);
    // 상세 화면의 검증은 사용량 0을 통과시키지만(음수만 막는다), 질문에 답하면서 0t짜리 배출원이 저장되면 「연료를 입력했다」로 보인다 —
    // 사용량을 적지 않았다고 알린다. 저장되는 레코드의 모양은 지도 4단계와 같다(더 엄격할 뿐이다).
    if (!(draft.activity_data > 0)) {
        return '연간 사용량을 입력하세요. 연료를 쓰지 않는 공정이면 「쓰지 않아요」를 누르세요.';
    }
    const error = firstSourceStreamError(createSourceStreamValidationErrors(draft));
    if (error) {
        return error;
    }
    const created = await createLocalItem('source_streams', draft);
    const total = sumReconciledSourceStreamEmissions(process.id, [...existingStreams, created]);
    await updateLocalItem('processes', { ...process, direct_attributable_emissions_tco2e: total, direct_emissions_input_mode: 'SOURCE_STREAM_SUM' });
    return null;
}

/** 「전력」 답 — 지도 5단계와 같은 검증·같은 갱신 빌더(guided-edit.ts). */
export async function saveElectricity(process: ProductionProcess, draft: { mwh: number; ef: number; efSource: string }): Promise<string | null> {
    // 배분 근거 메모는 이 화면에 칸이 없다 — 저장된 것을 그대로 싣는다(비워 보내면 고치기 한 번에 근거가 지워진다. 지도 5단계는 칸에 되살려 같은 결과를 낸다).
    const full = { ...draft, allocationNote: process.electricity_allocation_note ?? '' };
    const error = validateElectricityDraft(full);
    if (error) {
        return error;
    }
    await updateLocalItem('processes', buildElectricityUpdate(process, full));
    return null;
}

/** 「밖에서 산 스팀·온수 없음」 — 지도 4단계 열 폼의 「아니요」 저장과 같은 검증·같은 빌더(measurable-heat.ts). 「예」는 여기서 받지 않는다. */
export async function confirmNoImportedHeat(process: ProductionProcess): Promise<string | null> {
    const draft = noImportedHeatDraft(process);
    const error = validateImportedHeatDraft(draft);
    if (error) {
        return error;
    }
    await updateLocalItem('processes', buildImportedHeatUpdate(process, draft));
    return null;
}

/**
 * 「생산량」 고치기 — 지도 3단계 수정 경로와 같은 순서(제품 라인 → 제외 라인 → 공정)·같은 값이다(빌더: conversation-process.ts).
 * 호출부가 describeOutputEditBlock으로 단순한 경우만 부른다. 제외 라인을 지울 때는 지도와 같이 전구물질 배분이 가리키는지 먼저 본다.
 */
export async function saveOutputEdit(args: { process: ProductionProcess; productLine: ProductOutputLine; excludedLine?: ProductOutputLine; product: ProcessAnswerDraft['product']; name: string; massT: number; excludedMassT: number; precursors: PurchasedPrecursor[] }): Promise<string | null> {
    const error = validateProcessAnswer({ name: args.name, route: '', periodId: args.process.period_id, product: args.product, massT: args.massT, excludedMassT: args.excludedMassT });
    if (error) {
        return error;
    }
    const edit = buildOutputUpdate(args);
    if (edit.excluded.action === 'delete') {
        const blockers = getOutputLineDeleteBlockers(edit.excluded.id, { precursors: args.precursors });
        if (blockers.total > 0) {
            return '활동수준 제외 라인을 비우면 지워지는데, ' + blockers.reasons.join(' · ') + '이 이 라인을 가리키고 있습니다. 먼저 6단계에서 전구물질 배분을 고치세요.';
        }
    }
    await updateLocalItem('product_output_lines', edit.productLine);
    if (edit.excluded.action === 'update') {
        await updateLocalItem('product_output_lines', edit.excluded.line);
    } else if (edit.excluded.action === 'create') {
        await createLocalItem('product_output_lines', { process_id: args.process.id, ...edit.excluded.line });
    } else if (edit.excluded.action === 'delete') {
        await deleteLocalItem('product_output_lines', edit.excluded.id);
    }
    await updateLocalItem('processes', edit.process);
    return null;
}

/** 「연료」 고치기 — 지도 4단계 수정 경로와 같다: 검증 → 기존을 펼친 배출원 갱신 → 공정 직접배출을 배출원 합계로 다시 맞춤. */
export async function saveFuelEdit(process: ProductionProcess, existing: SourceStream, allStreams: SourceStream[], answer: FuelAnswer): Promise<string | null> {
    const draft = buildFuelStreamEdit(existing, answer, process);
    if (!(draft.activity_data > 0)) {
        return '연간 사용량을 입력하세요. 연료를 쓰지 않는 공정이면 이 연료를 지도 화면 4단계에서 지우세요.';
    }
    const error = firstSourceStreamError(createSourceStreamValidationErrors(draft));
    if (error) {
        return error;
    }
    const updated = await updateLocalItem('source_streams', draft as SourceStream);
    const total = sumReconciledSourceStreamEmissions(process.id, allStreams.map((stream) => (stream.id === updated.id ? updated : stream)));
    await updateLocalItem('processes', { ...process, direct_attributable_emissions_tco2e: total, direct_emissions_input_mode: 'SOURCE_STREAM_SUM' });
    return null;
}

/** 「구매한 강재」 고치기 — 지도 6단계와 같은 검증·같은 갱신 빌더(buildPrecursorUpdate: 연결·검증 상태는 기존 값을 지킨다). */
export async function savePrecursorEdit(existing: PurchasedPrecursor, answer: PrecursorAnswer): Promise<string | null> {
    const draft = buildPrecursorEditDraft(existing, answer);
    const error = validatePrecursorDraft(draft);
    if (error) {
        return error;
    }
    await updateLocalItem('precursors', buildPrecursorUpdate(existing, draft));
    return null;
}
