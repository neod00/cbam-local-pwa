import { findDefaultValueReference, findDefaultValueReferencesByPrefix, resolveDefaultSeeForYear, type DefaultValueReferenceRow, type ImportedDefaultValueReference } from './reference-workbooks';
import type { PrecursorDraft } from './guided-edit';
import type { PurchasedPrecursor } from './local-db';

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
        /** 8자리가 아닌 CN을 적어, 그 숫자로 시작하는 CN들의 값이 모두 같아 채운 경우 — EU 문서에는 정확한 8자리를 적어야 한다 */
        prefixMatch?: { digits: string; count: number };
        /** 그 나라의 값이 없어(「-」) 규정에 따라 「기타 국가·지역」 값을 넣은 경우 */
        usedOtherCountries?: boolean;
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
    /** 가져올 기본값의 연도. 비우면 지도 패널과 같은 2026. */
    year?: '2026' | '2027' | '2028_ONWARDS';
}): DefaultFill {
    const year = input.year ?? DEFAULT_FILL_YEAR;
    const yearLabel = year === '2028_ONWARDS' ? '2028년 이후' : year;
    if (!input.reference) {
        return { ok: false, reason: 'EU 기본값 자료를 아직 불러오지 못했습니다. 앱을 다시 열거나, 자료 업로드 화면에서 EU 기본값(DVs) 파일을 직접 가져오세요.' };
    }
    if (!input.country.trim()) {
        return { ok: false, reason: '먼저 「공급국가」를 고르세요. EU 기본값은 원료를 만든 나라마다 다릅니다(예: 같은 STS 와이어가 한국 4.015 · 대만 5.302).' };
    }
    const match = findDefaultValueReference(input.reference, input.country, input.cnDigits, year);
    if (!match) {
        // 4~7자리: 표는 8자리 CN마다 값이 있어 정확히 맞는 줄이 없다. 그 숫자로 시작하는 CN들의 값이 모두 같으면 그 값을 쓰고,
        // 다르면 앱이 고르지 않고 후보를 보여 준다(run36 P1-05).
        const digits = input.cnDigits.replace(/\D/g, '');
        const family = digits.length >= 4 && digits.length < 8 ? findDefaultValueReferencesByPrefix(input.reference, input.country, digits, year) : [];
        if (family.length > 0) {
            const resolved = family.map((row) => resolveDefaultSeeForYear(row, year));
            const first = resolved[0];
            const same = resolved.every((item) => item.direct === first.direct && item.indirect === first.indirect && item.hasIndirect === first.hasIndirect);
            if (same) {
                return {
                    ok: true,
                    direct: first.direct,
                    indirect: first.indirect,
                    hasIndirect: first.hasIndirect,
                    source: `${input.reference.summary.filename} / ${family[0].country} / ${digits}* (CN ${family.length}개, 값 동일)`,
                    justification:
                        `공급사 measured SEE 미입수 — EU 국가/CN 기본값(${yearLabel}, markup 포함) 적용. 직접 ${first.direct}`
                        + (first.hasIndirect ? ` · 간접 ${first.indirect}` : ' · 이 CN의 공식 DV는 간접값 미제공(간접 0)')
                        + ` · CN ${digits}로 시작하는 ${family.length}개 CN의 기본값이 같아 그 값을 적용`,
                    message: `CN ${digits}는 8자리가 아니지만 그 숫자로 시작하는 ${family.length}개 CN의 EU 기본값이 모두 같아 채웠습니다. EU 문서에는 8자리 CN을 적어야 하니 수입신고서·공급사 서류에서 확인하세요.`,
                    prefixMatch: { digits, count: family.length },
                };
            }
            // 값별로 묶어 코드를 나열한다 — 설명은 앞부분이 모두 같아 잘라 보이면 구분이 안 된다.
            const byValue = new Map<number, DefaultValueReferenceRow[]>();
            family.forEach((row, index) => {
                const value = resolved[index].direct;
                byValue.set(value, [...(byValue.get(value) ?? []), row]);
            });
            const groups = Array.from(byValue, ([value, rows]) => `직접 ${value}: ${rows.slice(0, 5).map((row) => row.cn_code).join(', ')}${rows.length > 5 ? ` 외 ${rows.length - 5}개` : ''} (${rows[0].description.slice(0, 60)}${rows[0].description.length > 60 ? '…' : ''})`).join(' / ');
            return {
                ok: false,
                reason: `${input.country} · CN ${digits}로 시작하는 기본값이 ${family.length}개이고 값이 서로 다릅니다 — 8자리 CN을 확인하세요. ${groups}`,
            };
        }
        return { ok: false, reason: `${input.country} · CN ${input.cnDigits || '미입력'}에 맞는 기본값을 찾지 못했습니다. 공급국가와 CN 코드를 확인하세요.` };
    }
    const { direct, indirect, hasIndirect } = resolveDefaultSeeForYear(match, year);
    const usedOtherCountries = /^_?other countries and territories$/i.test(match.country.replace(/\s+/g, ' ').trim());
    return {
        ok: true,
        direct,
        indirect,
        hasIndirect,
        usedOtherCountries,
        source: `${input.reference.summary.filename} / ${match.country} / ${match.cn_code}`,
        justification:
            `공급사 measured SEE 미입수 — EU 국가/CN 기본값(${yearLabel}, markup 포함) 적용${usedOtherCountries ? ` · ${input.country}의 값이 없어(「-」) 「기타 국가·지역」 값을 적용(2025/2621 부속서 I 서문)` : ''}. 직접 ${direct}`
            + (hasIndirect ? ` · 간접 ${indirect}` : ' · 이 CN의 공식 DV는 간접값 미제공(간접 0)'),
        message: hasIndirect
            ? 'EU 기본값을 채웠습니다. 공급사 실측자료를 받으면 교체하세요.'
            : `이 CN의 공식 DV는 간접값을 제공하지 않아 간접을 0으로 두었습니다(직접값은 ${yearLabel} markup 포함). 공급사 실측자료를 받으면 교체하세요.`,
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

/**
 * 질문 화면에서 고칠 수 있는 구매 강재인지. 아니면 이유를 돌려준다.
 *  · 「혼합(일부 실측)」 자료는 이 화면의 두 가지(공급사 값 / EU 기본값)로 나타낼 수 없다 → 지도 6단계.
 *  · 제품별 배분이 둘 이상이면 소비량을 바꿀 때 합계를 맞추는 화면이 필요하다 → 지도 6단계. 하나뿐이면 지도 패널처럼 소비량에 맞춰 따라간다.
 */
export function describePrecursorEditBlock(existing: Pick<PurchasedPrecursor, 'data_mode' | 'output_allocations'>): string | null {
    if (existing.data_mode !== 'ACTUAL' && existing.data_mode !== 'DEFAULT') {
        return '일부만 실측한(혼합) 자료는 지도 화면 6단계에서 고칩니다.';
    }
    if ((existing.output_allocations ?? []).length > 1) {
        return '제품별 배분이 둘 이상인 구매 강재는 지도 화면 6단계에서 고칩니다.';
    }
    return null;
}

/** 저장된 전구물질 → 이 화면의 고치기 칸에 채울 답 */
export function precursorAnswerFromExisting(existing: PurchasedPrecursor): PrecursorAnswer {
    return {
        name: existing.name,
        cn: existing.precursor_cn_code ?? '',
        consumed: String(existing.consumed_mass_t),
        purchased: existing.purchased_mass_t > 0 ? String(existing.purchased_mass_t) : '',
        country: existing.supplier_country ?? '',
        mode: existing.data_mode === 'DEFAULT' ? 'DEFAULT' : 'ACTUAL',
        directSee: String(existing.direct_see_tco2e_per_t),
        indirectSee: String(existing.indirect_see_tco2e_per_t),
        source: existing.source,
        justification: existing.default_value_justification,
    };
}

/**
 * 수정용 초안: 이 화면의 답 + **칸이 없는 값은 저장된 것 그대로**(전력 분해값·공급사 설비·생산경로·보고기간·제품별 배분).
 * 신규 초안(buildPrecursorDraft)은 이 값들을 비워 두므로 그대로 수정에 쓰면 공급사 회신으로 채운 값이 지워진다 — 지도 패널은 칸에 되살려 같은 결과를 낸다.
 * 제품별 배분이 하나뿐이면 지도 패널처럼 소비량에 맞춰 따라가게 한다(100%).
 */
export function buildPrecursorEditDraft(existing: PurchasedPrecursor, answer: PrecursorAnswer): PrecursorDraft {
    const draft = buildPrecursorDraft(answer);
    const kept = existing.output_allocations ?? [];
    return {
        ...draft,
        bridgeUsage: existing.indirect_electricity_mwh_per_t ?? 0,
        bridgeFactor: existing.indirect_electricity_factor_tco2e_per_mwh ?? 0,
        supplierInstallation: existing.supplier_installation,
        supplierOperator: existing.supplier_operator_name ?? '',
        supplierRegistryId: existing.supplier_registry_id ?? '',
        supplierRoute: existing.production_route,
        supplierPeriod: existing.supplier_reporting_period ?? '',
        outputAllocations: kept.length === 1 ? [{ ...kept[0], allocated_mass_t: draft.consumedMass, allocation_percent: 100 }] : existing.output_allocations,
    };
}
