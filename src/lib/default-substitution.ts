import { calculateLocalResults } from './calculation-engine';
import { fillEuDefault } from './conversation-precursor';
import type { PurchasedPrecursor } from './local-db';
import type { ImportedDefaultValueReference } from './reference-workbooks';
import { buildSeeFlowBinding } from './see-flow';

/**
 * 「이 구매 강재를 EU 기본값으로 바꾸면 기준 SEE가 얼마가 되나」 — 할 일 화면의 영향 상자용.
 *
 * 자체 산술이 없다. 두 가지를 그대로 쓴다:
 *  · 바꿀 값은 질문 화면·지도 6단계의 「EU 기본값 채우기」와 같은 함수(`fillEuDefault`)가 정한다 — 그 버튼을 누르면 저장되는 값이다.
 *  · SEE는 엔진(`calculateLocalResults`)을 다시 돌려 얻고, 지도·막대와 같은 집계(`buildSeeFlowBinding`)의 기준 SEE를 읽는다.
 * 저장하지 않는다(읽기 전용 모의 계산).
 */

type EngineInput = Parameters<typeof calculateLocalResults>[0];

export interface DefaultSubstitutionImpact {
    /** 지금 기준 SEE(tCO₂e/t). 계산할 자료가 없으면 null */
    fromSee: number | null;
    /** 이 원료만 EU 기본값으로 바꿨을 때의 기준 SEE. 기본값을 못 찾으면 null */
    toSee: number | null;
    /** 계산하지 못한 이유(사람에게 보일 문장) */
    reason?: string;
}

export function computeDefaultSubstitutionImpact(input: {
    engine: EngineInput;
    /** 보고 중인 기간(막대·지도와 같은 기간만 본다). 비우면 모든 기간 */
    periodId?: string;
    precursorId: string;
    defaultValues: ImportedDefaultValueReference | undefined;
}): DefaultSubstitutionImpact {
    const precursors: PurchasedPrecursor[] = input.engine.precursors ?? [];
    const target = precursors.find((precursor) => precursor.id === input.precursorId);
    if (!target) {
        return { fromSee: null, toSee: null, reason: '원료를 찾지 못했습니다.' };
    }
    const fill = fillEuDefault({
        reference: input.defaultValues,
        country: target.supplier_country ?? '',
        cnDigits: (target.precursor_cn_code ?? '').replace(/\D/g, ''),
    });
    const seeOf = (list: PurchasedPrecursor[]) => {
        // 사내 이송을 명시해 넘긴다 — 엔진을 부르는 모든 곳이 이송을 함께 넘겨야 화면마다 숫자가 같다(verify:internal-transfer).
        const results = calculateLocalResults({ ...input.engine, internalTransfers: input.engine.internalTransfers, precursors: list })
            .filter((result) => !input.periodId || result.period_id === input.periodId);
        const binding = buildSeeFlowBinding(results);
        return binding.isExample ? null : binding.seeCbamBasis;
    };
    const fromSee = seeOf(precursors);
    if (!fill.ok) {
        return { fromSee, toSee: null, reason: fill.reason };
    }
    // 「EU 기본값 채우기」 뒤에 저장되는 모양: 기본값 모드, 직접·간접 값, 전력 분해값은 비움.
    const toSee = seeOf(precursors.map((precursor) => precursor.id === target.id
        ? {
            ...precursor,
            data_mode: 'DEFAULT' as const,
            direct_see_tco2e_per_t: fill.direct,
            indirect_see_tco2e_per_t: fill.indirect,
            indirect_electricity_mwh_per_t: undefined,
            indirect_electricity_factor_tco2e_per_mwh: undefined,
        }
        : precursor));
    return { fromSee, toSee };
}
