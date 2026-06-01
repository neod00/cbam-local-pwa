import type { Product } from './local-db';

export type IndirectEmissionsRuleCode =
    | 'IRON_STEEL_CERTIFICATE_BASIS_EXCLUDED'
    | 'IRON_ORE_AGGLOMERATE_INCLUDED'
    | 'DEFAULT_INCLUDED'
    | 'UNKNOWN_PRODUCT_INCLUDED';

export interface IndirectEmissionsApplicability {
    applicable: boolean;
    rule_code: IndirectEmissionsRuleCode;
    label: string;
    reason: string;
}

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

export function getIndirectEmissionsApplicability(product?: Pick<Product, 'cn_code' | 'hs_code'>): IndirectEmissionsApplicability {
    const code = getProductCode(product);

    if (!code) {
        return {
            applicable: true,
            rule_code: 'UNKNOWN_PRODUCT_INCLUDED',
            label: '간접 포함 검토',
            reason: '제품 CN 코드가 없어 간접배출을 인증서 산정 기준에 임시 포함합니다. 제품 코드를 확인하세요.',
        };
    }

    if (code.startsWith('26011200')) {
        return {
            applicable: true,
            rule_code: 'IRON_ORE_AGGLOMERATE_INCLUDED',
            label: '간접 포함',
            reason: 'CN 2601 12 00 응결 철광석 및 정광은 간접배출 포함 대상입니다.',
        };
    }

    if (code.startsWith('72') || code.startsWith('73')) {
        return {
            applicable: false,
            rule_code: 'IRON_STEEL_CERTIFICATE_BASIS_EXCLUDED',
            label: '인증서 산정 제외',
            reason: 'Annex II direct-only 철강 품목은 최종제품 자체 전력 간접배출을 CBAM 인증서 산정 기준 SEE에서 제외하고, 보고/검토용으로 별도 관리합니다.',
        };
    }

    return {
        applicable: true,
        rule_code: 'DEFAULT_INCLUDED',
        label: '간접 포함',
        reason: '철강 제외 규칙에 해당하지 않아 간접배출을 포함합니다.',
    };
}

export function getCbamGoodsMetadata(product?: Pick<Product, 'cn_code' | 'hs_code'>): CbamGoodsMetadata {
    const code = getProductCode(product);

    if (code.startsWith('72') || code.startsWith('73') || code.startsWith('26011200')) {
        const annexIiDirectOnly = code.startsWith('72') || code.startsWith('73');

        return {
            sector: 'iron_steel',
            sector_label: 'Iron and steel',
            annex_i_candidate: true,
            annex_ii_direct_only: annexIiDirectOnly,
            direct_only_label: annexIiDirectOnly ? 'Annex II direct-only' : 'Indirect 포함',
            precursor_review_recommended: true,
            note: annexIiDirectOnly
                ? '철강 최종제품은 인증서 산정 기준에서 최종제품 자체 간접배출을 제외하고, 전구물질 배출은 해당되는 경우 별도 반영합니다.'
                : '응결 철광석 및 정광은 간접배출 포함 여부를 별도 확인합니다.',
        };
    }

    if (code.startsWith('7601') || code.startsWith('7604')) {
        return {
            sector: 'aluminium',
            sector_label: 'Aluminium',
            annex_i_candidate: true,
            annex_ii_direct_only: false,
            direct_only_label: 'Indirect 포함',
            precursor_review_recommended: true,
            note: '알루미늄 품목은 직접/간접배출과 전구물질 반영 여부를 제품 경계 기준으로 확인합니다.',
        };
    }

    if (code.startsWith('2523')) {
        return {
            sector: 'cement',
            sector_label: 'Cement',
            annex_i_candidate: true,
            annex_ii_direct_only: false,
            direct_only_label: 'Indirect 포함',
            precursor_review_recommended: false,
            note: '시멘트 품목은 생산공정 경계와 직접/간접배출 입력을 우선 확인합니다.',
        };
    }

    if (code.startsWith('3102') || code.startsWith('2814')) {
        return {
            sector: 'fertilisers',
            sector_label: 'Fertilisers',
            annex_i_candidate: true,
            annex_ii_direct_only: false,
            direct_only_label: 'Indirect 포함',
            precursor_review_recommended: true,
            note: '비료 품목은 원료 및 전구물질 투입자료 연결 상태를 확인합니다.',
        };
    }

    if (code.startsWith('280410')) {
        return {
            sector: 'hydrogen',
            sector_label: 'Hydrogen',
            annex_i_candidate: true,
            annex_ii_direct_only: false,
            direct_only_label: 'Indirect 포함',
            precursor_review_recommended: false,
            note: '수소 품목은 생산 경로와 전력 사용량 기준을 확인합니다.',
        };
    }

    return {
        sector: 'other',
        sector_label: '확인 필요',
        annex_i_candidate: false,
        annex_ii_direct_only: false,
        direct_only_label: '확인 필요',
        precursor_review_recommended: false,
        note: '현재 대표 규칙에 없는 코드입니다. 최신 EU Communication Template의 CN 목록과 품목군 기준을 확인하세요.',
    };
}
