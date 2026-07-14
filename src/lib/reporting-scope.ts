import type { Product, ProductOutputLine, ProductReportingScope } from './local-db';

export const PRODUCT_REPORTING_SCOPE_OPTIONS: Array<{
    value: ProductReportingScope;
    label: string;
    description: string;
}> = [
    { value: 'CBAM_GOOD', label: 'CBAM 신고 대상', description: 'CBAM 결과와 EU 보고서에 포함합니다.' },
    { value: 'NON_CBAM_COPRODUCT', label: '비CBAM 공동산출물', description: '공정 배분에는 사용하지만 CBAM 합계와 Export에서는 제외합니다.' },
    { value: 'WASTE_RECYCLE', label: '폐기물·재활용', description: '질량수지와 배분 검토에만 사용합니다.' },
    { value: 'INTERNAL_ONLY', label: '내부소비', description: '외부 출하·신고 없이 내부 공정 연결에만 사용합니다.' },
];

export function getProductReportingScope(
    product?: Pick<Product, 'reporting_scope'>,
    outputLine?: Pick<ProductOutputLine, 'reporting_scope'>
): ProductReportingScope {
    return outputLine?.reporting_scope ?? product?.reporting_scope ?? 'CBAM_GOOD';
}

export function isCbamReportingScope(scope: ProductReportingScope) {
    return scope === 'CBAM_GOOD';
}

export function getProductReportingScopeLabel(scope: ProductReportingScope) {
    return PRODUCT_REPORTING_SCOPE_OPTIONS.find((item) => item.value === scope)?.label ?? scope;
}
