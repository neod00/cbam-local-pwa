import { CN_MASTER, CN_MASTER_TEMPLATE_VERSION, GOODS_INDIRECT_RELEVANCE } from './cn-master.generated';
import type { Product } from './local-db';

/**
 * 간접배출 관련성 판정 — 3상태.
 *
 * boolean이 아닌 이유: 종전 `applicable: boolean`은 **판정 실패를 판정으로 위장**했다.
 * 72/73/26011200 어디에도 안 걸린 CN이 전부 `DEFAULT_INCLUDED`(applicable: true)로 떨어졌고,
 * 엔진은 boolean만 읽어 **판정하지 못한 제품에 대해 SEE 숫자를 계산해 내놨다.**
 * UNDETERMINED를 타입에 넣어야 모든 호출부가 "모른다"를 다루도록 컴파일러가 강제한다.
 */
export type IndirectEmissionsRelevance = 'INCLUDED' | 'NOT_RELEVANT' | 'UNDETERMINED';

export type IndirectEmissionsRuleCode =
    /** 공식 워크북이 이 품목군을 확정기간 간접배출 관련으로 분류 */
    | 'GOODS_INDIRECT_RELEVANT'
    /** 공식 워크북이 이 품목군을 확정기간 간접배출 비관련으로 분류 (= 직접배출만) */
    | 'GOODS_INDIRECT_NOT_RELEVANT'
    /** CN 코드 자체가 없다 */
    | 'CN_MISSING'
    /** 공식 CN 목록에 없다. 이 목록은 포함 목록이므로 부재가 곧 명시적 배제는 아니다. */
    | 'CN_NOT_IN_MASTER'
    /** 4·6자리 입력인데 하위 8자리 CN들의 판정이 갈린다 */
    | 'PREFIX_AMBIGUOUS';

export interface IndirectEmissionsApplicability {
    relevance: IndirectEmissionsRelevance;
    rule_code: IndirectEmissionsRuleCode;
    label: string;
    /** 조회된 품목군. UNDETERMINED면 없다. */
    good?: string;
    /** 무엇을 조회해서 이렇게 판정했는지의 **사실 진술**. 보고서가 그대로 인용한다. */
    lookup: string;
    /** 4·6자리 입력을 하위 8자리 rollup으로 판정했는가 */
    matched_by_prefix?: boolean;
}

const MASTER_CITATION = `EU 공식 Communication Template(판본 ${CN_MASTER_TEMPLATE_VERSION})`;

export type CbamGoodsSector =
    | 'iron_steel'
    | 'aluminium'
    | 'cement'
    | 'fertilisers'
    | 'hydrogen'
    | 'other';

export interface CbamGoodsMetadata {
    sector: CbamGoodsSector;
    sector_label: string;
    annex_i_candidate: boolean;
    steel_app_supported: boolean;
    annex_ii_direct_only: boolean;
    direct_only_label: string;
    precursor_review_recommended: boolean;
    note: string;
}

function normalizeCode(value?: string) {
    return (value ?? '').replace(/\D/g, '');
}

export function getProductCode(product?: Pick<Product, 'cn_code' | 'hs_code'>) {
    return normalizeCode(product?.cn_code || product?.hs_code);
}

function relevanceOfGood(good: string, lookup: string, matchedByPrefix?: boolean): IndirectEmissionsApplicability {
    const indirectRelevant = GOODS_INDIRECT_RELEVANCE[good];

    return indirectRelevant
        ? { relevance: 'INCLUDED', rule_code: 'GOODS_INDIRECT_RELEVANT', label: '간접 포함', good, lookup, matched_by_prefix: matchedByPrefix }
        : { relevance: 'NOT_RELEVANT', rule_code: 'GOODS_INDIRECT_NOT_RELEVANT', label: '인증서 산정 제외', good, lookup, matched_by_prefix: matchedByPrefix };
}

/**
 * 공식 CN 목록을 **조회**해 간접배출 관련성을 판정한다. 접두 추정을 쓰지 않는다.
 *
 * 판정 근거는 `${MASTER_CITATION}`의 `Parameters_CNCodes`(CN → 품목군)와
 * `Parameters_Constants`의 확정기간 간접배출 관련성 플래그다.
 *
 * ⚠️ 이 플래그는 「Annex II 등재」가 아니다. 원본 워크북은 "Annex II"를 인용하지 않는다.
 *    확인된 사실은 「EU 공식 워크북이 확정기간 간접배출 관련성을 분류했다」뿐이며,
 *    Regulation (EU) 2023/956 Annex II와의 법적 동치는 EUR-Lex 원문 대조 미완이다.
 *    보고서 문안은 이 구분을 지켜야 한다 — cn-master.generated.ts 헤더 참조.
 */
export function getIndirectEmissionsApplicability(product?: Pick<Product, 'cn_code' | 'hs_code'>): IndirectEmissionsApplicability {
    const code = getProductCode(product);

    if (!code) {
        return {
            relevance: 'UNDETERMINED',
            rule_code: 'CN_MISSING',
            label: '판정 불가 — CN 미기재',
            lookup: 'CN 코드가 없어 공식 CN 목록을 조회할 수 없다. 제품 CN을 기재해야 판정한다.',
        };
    }

    const exact = CN_MASTER[code];

    if (exact) {
        return relevanceOfGood(exact, `${MASTER_CITATION}의 CN 목록에서 CN ${code} → 품목군 「${exact.trim()}」로 조회됨.`);
    }

    // 사용자·공급사 자료는 4·6자리 CN을 쓰는 일이 잦다(DV 워크북도 4자리 heading을 쓴다).
    // 하위 8자리들의 판정이 일치하면 그 값으로 rollup하고, 갈리면 판정하지 않는다.
    if (code.length < 8) {
        const children = Object.entries(CN_MASTER).filter(([cn]) => cn.startsWith(code));

        if (children.length > 0) {
            const relevances = new Set(children.map(([, good]) => GOODS_INDIRECT_RELEVANCE[good]));

            if (relevances.size === 1) {
                const good = children[0][1];

                return relevanceOfGood(
                    good,
                    `${MASTER_CITATION}의 CN 목록에서 CN ${code}(${code.length}자리)에 속하는 하위 CN ${children.length}건이 모두 동일하게 분류되어 그 값을 적용함. 하위 품목군: 「${[...new Set(children.map(([, item]) => item.trim()))].join('」·「')}」.`,
                    true
                );
            }

            return {
                relevance: 'UNDETERMINED',
                rule_code: 'PREFIX_AMBIGUOUS',
                label: '판정 불가 — 하위 CN 판정 상이',
                lookup: `${MASTER_CITATION}의 CN 목록에서 CN ${code}(${code.length}자리)에 속하는 하위 CN ${children.length}건의 간접배출 관련성이 서로 다르다. 8자리 CN을 기재해야 판정한다.`,
            };
        }
    }

    return {
        relevance: 'UNDETERMINED',
        rule_code: 'CN_NOT_IN_MASTER',
        label: '판정 불가 — 공식 목록에 없음',
        lookup: `CN ${code}은(는) ${MASTER_CITATION}의 CN 목록(${Object.keys(CN_MASTER).length}건)에 없다. 이 목록은 포함 목록이므로 부재가 곧 명시적 배제는 아니다 — 확인 필요(규정).`,
    };
}

export type CbamCoverageStatus = 'COVERED' | 'NOT_COVERED' | 'CHECK_NEEDED';

export interface CbamCoverage {
    status: CbamCoverageStatus;
    label: string;
    reason: string;
}

// 이 제품(CN)이 CBAM 대상 품목인지 1차 판별한다(가드레일용).
// 접두 추정이 아니라 공식 CN 목록 조회 결과를 쓴다. 다만 그 목록은 **포함 목록**이므로
// 부재가 곧 명시적 배제는 아니다 — 목록에 없으면 CHECK_NEEDED로 남기고 단정하지 않는다.
export function getCbamCoverage(product?: Pick<Product, 'cn_code' | 'hs_code'>): CbamCoverage {
    const code = getProductCode(product);

    if (!code) {
        return { status: 'CHECK_NEEDED', label: 'CN 확인', reason: 'CN 코드를 입력하면 CBAM 대상 여부를 확인합니다.' };
    }

    // 명시적 비대상: 피복·코어드 용접봉(CN 8311, Chapter 83은 CBAM Annex I 아님)
    if (code.startsWith('8311')) {
        return {
            status: 'NOT_COVERED',
            label: 'CBAM 대상 아님 (CN 8311)',
            reason: '피복·플럭스코어드·메탈코어드 용접봉(CN 8311, HS 83류)은 CBAM 대상이 아닙니다. 맨 강철 와이어(CN 7217/7223/7229)만 대상입니다. 등록이 필요한지 확인하세요.',
        };
    }

    // 고철·철스크랩(CN 7204)과 일부 페로알로이(CN 7202 46)는 공식 CN 목록에 없다(조회로 확인).
    // 내재배출 0 취급의 근거로 인용해 온 Guidance §5.6 footnote 48은 **전환기 문서**이며,
    // 확정기간에도 유효한지는 확인 필요(규정). 목록 부재 사실만 진술하고 단정하지 않는다.
    if (code.startsWith('7204') || code.startsWith('720246')) {
        return {
            status: 'NOT_COVERED',
            label: 'CBAM 대상 아님 (스크랩·제외 페로알로이)',
            reason: `고철·철스크랩(CN 7204)과 일부 페로알로이(CN 7202 46)는 ${MASTER_CITATION}의 CN 목록에 없습니다. 전구물질로 넣지 마세요. 내재배출 0 취급의 확정기간 근거는 확인 필요(규정).`,
        };
    }

    const meta = getCbamGoodsMetadata(product);

    if (meta.annex_i_candidate && meta.steel_app_supported) {
        return {
            status: 'COVERED',
            label: `CBAM 대상 · ${meta.sector_label}`,
            reason: meta.note,
        };
    }

    if (meta.annex_i_candidate && !meta.steel_app_supported) {
        return {
            status: 'NOT_COVERED',
            label: `앱 범위 밖 · ${meta.sector_label}`,
            reason: `${meta.note} 현재 씨밤이는 철강 분야 전용 앱이라 이 품목군은 산정/Export 대상으로 처리하지 않습니다.`,
        };
    }

    return {
        status: 'CHECK_NEEDED',
        label: 'CBAM 대상 여부 확인 필요',
        reason: `CN ${code}은(는) ${MASTER_CITATION}의 CN 목록에 없습니다. 이 목록은 포함 목록이므로 부재가 곧 비대상을 뜻하지는 않습니다 — 최신 확정기간 템플릿으로 확인하세요. 확인 필요(규정).`,
    };
}

/** 공식 CN 목록의 품목군 → 앱의 분야 구분. 접두가 아니라 조회된 품목군으로 가른다. */
const GOOD_SECTORS: Record<string, CbamGoodsSector> = {
    'Sintered Ore': 'iron_steel',
    'Pig iron': 'iron_steel',
    'Crude steel': 'iron_steel',
    'Direct reduced iron': 'iron_steel',
    'Alloys (FeMn, FeCr, FeNi)': 'iron_steel',
    'Iron or steel products': 'iron_steel',
    'Unwrought aluminium': 'aluminium',
    'Aluminium products': 'aluminium',
    Cement: 'cement',
    'Cement clinker': 'cement',
    'Aluminous cement': 'cement',
    'Calcined clays ': 'cement',
    Ammonia: 'fertilisers',
    'Nitric acid': 'fertilisers',
    Urea: 'fertilisers',
    'Mixed fertilisers': 'fertilisers',
    Hydrogen: 'hydrogen',
    'Electricity (export to EU)': 'other',
};

const SECTOR_LABELS: Record<CbamGoodsSector, string> = {
    iron_steel: 'Iron and steel',
    aluminium: 'Aluminium',
    cement: 'Cement',
    fertilisers: 'Fertilisers',
    hydrogen: 'Hydrogen',
    other: '확인 필요',
};

export function getCbamGoodsMetadata(product?: Pick<Product, 'cn_code' | 'hs_code'>): CbamGoodsMetadata {
    const applicability = getIndirectEmissionsApplicability(product);
    const good = applicability.good;

    if (good) {
        const sector = GOOD_SECTORS[good] ?? 'other';
        const directOnly = applicability.relevance === 'NOT_RELEVANT';

        return {
            sector,
            sector_label: SECTOR_LABELS[sector],
            annex_i_candidate: true,
            steel_app_supported: sector === 'iron_steel',
            annex_ii_direct_only: directOnly,
            direct_only_label: directOnly ? '간접배출 비관련(확정기간)' : 'Indirect 포함',
            precursor_review_recommended: sector === 'iron_steel' || sector === 'aluminium' || sector === 'fertilisers',
            note: `${MASTER_CITATION}의 CN 목록에서 품목군 「${good.trim()}」로 조회됨. ${applicability.lookup}`,
        };
    }

    return {
        sector: 'other',
        sector_label: '확인 필요',
        annex_i_candidate: false,
        steel_app_supported: false,
        annex_ii_direct_only: false,
        direct_only_label: '확인 필요',
        precursor_review_recommended: false,
        note: '현재 대표 규칙에 없는 코드입니다. 최신 EU Communication Template의 CN 목록과 품목군 기준을 확인하세요.',
    };
}
