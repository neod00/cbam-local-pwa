import { getProductReportingScope } from './reporting-scope';
import type { InternalTransfer, Product, ProductionProcess, ProductOutputLine } from './local-db';

/**
 * 질문으로 입력(대화형 모드 S2) — 「제품별 생산량」 답을 공정과 생산라인으로 만드는 **순수 빌더**.
 *
 * 왜 따로 있나: 지도 3단계의 공정 생성은 panels.tsx 안에 인라인이라 다른 곳에서 부를 수 없다. 패널을 뜯지 않는 것이 원칙이므로(v4 §14-2)
 * 같은 값을 만드는 빌더를 새로 두고, **둘이 어긋나지 않게** 두 겹으로 잠근다 —
 *   1) scripts/verify-talk-s2.mjs가 패널의 생성 객체 리터럴에서 필드 이름·고정값을 읽어 이 빌더의 결과와 대조한다.
 *   2) 회귀에서 같은 답을 질문과 지도 패널로 넣어 저장된 레코드를 비교한다.
 *
 * 범위(S2): **첫 제품 한 개, 사내 이송 없음, 새 공정 하나**를 만든다. 둘 이상의 제품·이송·수정은 지도 화면의 몫이다.
 * 값은 지도 패널의 신규 경로와 같다 — 0.47은 패널이 쓰는 「임시 자리값」 그대로이고(5단계에서 고치게 하는 값), 여기서 다르게 정하지 않는다.
 */

/** 지도 3단계 신규 공정의 기본 생산 방식(panels.tsx와 같은 글자) */
export const DEFAULT_PROCESS_ROUTE = '가공(압연·신선·열처리)';
/** 지도 3단계 신규 공정이 전력 배출계수 칸에 미리 넣는 임시 자리값 */
export const PROCESS_PLACEHOLDER_EF = 0.47;
export const EXCLUDED_LINE_NAME = '활동수준 제외분 (불량·부산물·스크랩)';
export const EXCLUDED_LINE_NOTE = '지도 3단계 입력 — 2025/2547 ANNEX II 점 F에 따라 활동수준 제외·배출 0';

export interface ProcessAnswerDraft {
    name: string;
    /** 비우면 기본 생산 방식 */
    route: string;
    periodId: string | undefined;
    product: Pick<Product, 'id' | 'name' | 'reporting_scope' | 'cn_code' | 'hs_code'>;
    /** 그 기간에 시장에 내보낸 양(t) */
    massT: number;
    /** 불량·부산물·스크랩으로 나간 양(t, 선택). 활동수준에서 빠진다 */
    excludedMassT: number;
}

const finite = (value: number) => (Number.isFinite(value) ? value : 0);

export function defaultProcessName(productName: string): string {
    return `${productName.trim()} 공정`;
}

/** 사람에게 보일 오류 문장. 없으면 null. 문장은 지도 3단계 패널과 같은 뜻이다. */
export function validateProcessAnswer(draft: ProcessAnswerDraft): string | null {
    if (!draft.name.trim()) {
        return '공정 이름을 입력하세요. 예: 신선·소둔 라인';
    }
    if (!draft.periodId) {
        return '먼저 보고기간을 입력하세요.';
    }
    if (!(finite(draft.massT) > 0)) {
        return '이 공정에서 만든 제품의 생산량(t)을 0보다 크게 입력하세요.';
    }
    if (finite(draft.excludedMassT) < 0) {
        return '불량·부산물·스크랩 양은 0 이상이어야 합니다.';
    }
    return null;
}

export interface ProcessCreation {
    process: {
        period_id: string | undefined;
        product_id: string;
        name: string;
        production_route: string;
        output_mass_t: number;
        internal_consumption_mass_t: number;
        market_output_mass_t: number;
        direct_attributable_emissions_tco2e: number;
        electricity_mwh: number;
        electricity_ef_tco2e_per_mwh: number;
        electricity_ef_source: undefined;
    };
    /** process_id는 공정이 저장된 뒤 호출부가 붙인다 */
    productLine: {
        product_id: string;
        name: string;
        output_mass_t: number;
        allocation_basis: 'MASS';
        manual_allocation_percent: number;
        note: string;
        reporting_scope: ReturnType<typeof getProductReportingScope>;
    };
    excludedLine?: {
        name: string;
        output_mass_t: number;
        allocation_basis: 'MASS';
        manual_allocation_percent: number;
        note: string;
        reporting_scope: 'WASTE_RECYCLE';
        activity_level_role: 'EXCLUDED';
    };
}

export function buildProcessCreation(draft: ProcessAnswerDraft): ProcessCreation {
    const mass = finite(draft.massT);
    const excluded = finite(draft.excludedMassT);
    return {
        process: {
            period_id: draft.periodId,
            product_id: draft.product.id,
            name: draft.name.trim(),
            production_route: draft.route.trim() || DEFAULT_PROCESS_ROUTE,
            output_mass_t: mass,
            // 사내 이송이 없으니 내부 소비 0, 시장 = 총 생산량. 둘 다 0이면 EU 문서 D_Processes에 「시장 0」이 나간다.
            internal_consumption_mass_t: 0,
            market_output_mass_t: mass,
            direct_attributable_emissions_tco2e: 0,
            electricity_mwh: 0,
            electricity_ef_tco2e_per_mwh: PROCESS_PLACEHOLDER_EF,
            electricity_ef_source: undefined,
        },
        productLine: {
            product_id: draft.product.id,
            name: draft.product.name,
            output_mass_t: mass,
            allocation_basis: 'MASS',
            manual_allocation_percent: 100,
            note: '',
            reporting_scope: getProductReportingScope(draft.product),
        },
        excludedLine: excluded > 0
            ? {
                name: EXCLUDED_LINE_NAME,
                output_mass_t: excluded,
                allocation_basis: 'MASS',
                manual_allocation_percent: 0,
                note: EXCLUDED_LINE_NOTE,
                reporting_scope: 'WASTE_RECYCLE',
                activity_level_role: 'EXCLUDED',
            }
            : undefined,
    };
}

/**
 * 질문 화면에서 생산량을 직접 고칠 수 있는 **단순한 경우**인지. 아니면 고칠 수 없는 이유(사람에게 보일 문장)를 돌려준다.
 * 지도 3단계의 수정은 제품 라인 여럿·보고범위 밖 라인·사내 이송까지 함께 맞추는데, 이 화면이 만드는 공정은 제품 라인 하나(+선택한 제외 라인)뿐이다 —
 * 그 밖의 모양이면 질문 화면이 일부만 맞추고 나머지를 어긋나게 둘 수 있으므로 지도 3단계로 보낸다.
 */
export function describeOutputEditBlock(input: { process: ProductionProcess; lines: ProductOutputLine[]; transfers: InternalTransfer[] }): string | null {
    const { process } = input;
    const lines = input.lines.filter((line) => line.process_id === process.id);
    const excluded = lines.filter((line) => line.activity_level_role === 'EXCLUDED');
    const others = lines.filter((line) => line.activity_level_role !== 'EXCLUDED');
    if (others.length !== 1 || others[0].product_id !== process.product_id) {
        return '이 공정은 제품 라인이 하나가 아니거나 다른 제품이 섞여 있어 지도 화면 3단계에서 고칩니다.';
    }
    if (excluded.length > 1 || excluded.some((line) => line.product_id)) {
        return '이 공정의 활동수준 제외 라인이 여러 개라 지도 화면 3단계에서 고칩니다.';
    }
    if ((process.internal_consumption_mass_t ?? 0) !== 0 || input.transfers.some((transfer) => transfer.source_process_id === process.id || transfer.target_process_id === process.id)) {
        return '이 공정은 다른 공정과 사내 이송이 있어 지도 화면 3단계에서 고칩니다.';
    }
    return null;
}

export interface OutputEdit {
    process: ProductionProcess;
    productLine: ProductOutputLine;
    /** 활동수준 제외 라인: 값이 있으면 만들거나 고치고, 0이면 있던 것을 지운다 */
    excluded:
        | { action: 'none' }
        | { action: 'update'; line: ProductOutputLine }
        | { action: 'create'; line: ReturnType<typeof buildProcessCreation>['excludedLine'] & object }
        | { action: 'delete'; id: string };
}

/**
 * 생산량 수정 → 저장할 레코드들. 지도 3단계 수정 경로와 같은 규칙이다:
 *  · 제품 라인: 기존 라인을 펼치고 질량·보고범위만 덮는다(이름·비고·배분은 보존).
 *  · 제외 라인: 기존 라인은 질량만 고치고(이름·비고 보존), 없으면 새로 만들고, 값이 0이면 지운다.
 *  · 공정: 기존을 펼치고 이름·총량·시장 출하량(= 총량 − 사내 이송 0)만 덮는다. 생산 방식·기간·전력·배출원 값은 건드리지 않는다.
 * 호출부가 describeOutputEditBlock으로 단순한 경우만 부른다.
 */
export function buildOutputUpdate(input: { process: ProductionProcess; productLine: ProductOutputLine; excludedLine?: ProductOutputLine; product: ProcessAnswerDraft['product']; name: string; massT: number; excludedMassT: number }): OutputEdit {
    const mass = finite(input.massT);
    const excludedMass = finite(input.excludedMassT);
    const creation = buildProcessCreation({ name: input.name, route: '', periodId: input.process.period_id, product: input.product, massT: mass, excludedMassT: excludedMass });
    let excluded: OutputEdit['excluded'] = { action: 'none' };
    if (excludedMass > 0) {
        excluded = input.excludedLine
            ? { action: 'update', line: { ...input.excludedLine, output_mass_t: excludedMass } }
            : { action: 'create', line: creation.excludedLine as NonNullable<typeof creation.excludedLine> };
    } else if (input.excludedLine) {
        excluded = { action: 'delete', id: input.excludedLine.id };
    }
    return {
        process: {
            ...input.process,
            name: input.name.trim(),
            production_route: input.process.production_route || DEFAULT_PROCESS_ROUTE,
            output_mass_t: mass,
            internal_consumption_mass_t: 0,
            market_output_mass_t: mass,
        },
        productLine: { ...input.productLine, output_mass_t: mass, reporting_scope: creation.productLine.reporting_scope },
        excluded,
    };
}
