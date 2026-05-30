import type { Product } from './local-db';

export type IndirectEmissionsRuleCode =
    | 'IRON_STEEL_EXCLUDED'
    | 'IRON_ORE_AGGLOMERATE_INCLUDED'
    | 'DEFAULT_INCLUDED'
    | 'UNKNOWN_PRODUCT_INCLUDED';

export interface IndirectEmissionsApplicability {
    applicable: boolean;
    rule_code: IndirectEmissionsRuleCode;
    label: string;
    reason: string;
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
            label: '간접 포함',
            reason: '제품 CN 코드가 없어 간접배출을 임시 포함합니다. 제품 코드를 확인하세요.',
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
            rule_code: 'IRON_STEEL_EXCLUDED',
            label: '간접 제외',
            reason: '철강 HS 72/73 제품은 현 단계 규칙에서 전력 간접배출을 SEE에서 제외합니다.',
        };
    }

    return {
        applicable: true,
        rule_code: 'DEFAULT_INCLUDED',
        label: '간접 포함',
        reason: '철강 제외 규칙에 해당하지 않아 간접배출을 포함합니다.',
    };
}
