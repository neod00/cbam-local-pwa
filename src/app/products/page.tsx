'use client';

import { Button, DataTable, EmptyState, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { getCbamCoverage, getCbamGoodsMetadata, getIndirectEmissionsApplicability } from '@/lib/cbam-product-rules';
import { CN_CODE_OPTIONS, type CnCodeOption } from '@/lib/cn-code-options';
import { parseEuTemplateCnCodeOptions } from '@/lib/eu-template-export';
import {
    findDetailPreset,
    findDetailPresetForProduct,
    findFamilyPreset,
    findMatchingCnOptions,
    getCalculationSetupForDetail,
    PRODUCT_FAMILY_PRESETS,
    suggestDetailPresetFromText,
    type ProductCalculationSetup,
    type ProductCnCandidate,
    type ProductFamilyDetailPreset,
} from '@/lib/product-family-presets';
import {
    createLocalItem,
    deleteLocalItem,
    getLocalSetting,
    listLocalItems,
    Product,
    ProductOutputLine,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    setLocalSetting,
    updateLocalItem,
} from '@/lib/local-db';
import { PRODUCT_REPORTING_SCOPE_OPTIONS, getProductReportingScope, getProductReportingScopeLabel } from '@/lib/reporting-scope';
import { Term } from '@/components/ux/Term';
import { FieldHelp } from '@/components/ux/FieldHelp';
import { AlertTriangle, ArrowRight, Boxes, CheckCircle2, ClipboardList, Copy, FileSpreadsheet, Pencil, Plus, Search, Table2, Trash2, Upload, Workflow, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type HsGroup = Product['hs_group'];
type ProductDraft = Pick<Product, 'name' | 'hs_code' | 'cn_code' | 'hs_group' | 'product_type_enum' | 'unit' | 'reporting_scope'>;
type ProductErrors = Partial<Record<keyof ProductDraft, string>>;

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
    name: '',
    hs_code: '',
    cn_code: '',
    hs_group: '72',
    product_type_enum: 'HS72_PLATE_SHEET',
    unit: 'tonne',
    reporting_scope: 'CBAM_GOOD',
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

type BulkProductStatus = 'ready' | 'warning' | 'error';

interface BulkProductPreviewRow {
    rowNumber: number;
    name: string;
    rawCode: string;
    cnCode: string;
    hsCode: string;
    hsGroup: HsGroup;
    productTypeEnum: string;
    unit: string;
    detail?: ProductFamilyDetailPreset;
    status: BulkProductStatus;
    message: string;
}

function splitBulkProductLine(line: string) {
    const delimiter = line.includes('\t') ? '\t' : ',';
    return line.split(delimiter).map((cell) => cell.trim());
}

function isBulkHeader(cells: string[]) {
    const joined = cells.join(' ').toLowerCase();
    return joined.includes('제품명') || joined.includes('품명') || joined.includes('product') || joined.includes('cn 코드') || joined.includes('cn code');
}

function normalizeBulkCode(value: string) {
    return value.replace(/\D/g, '');
}

function resolveCnCodeFromBulk(rawCode: string, detail: ProductFamilyDetailPreset | undefined, cnOptions: CnCodeOption[]) {
    const code = normalizeBulkCode(rawCode);

    if (code.length === 8) {
        return code;
    }

    if (code.length >= 4) {
        return cnOptions.find((option) => option.code.startsWith(code))?.code ?? '';
    }

    if (!detail) {
        return '';
    }

    for (const candidate of detail.cnCandidates) {
        const match = findMatchingCnOptions(candidate, cnOptions)[0];
        if (match) {
            return match.code;
        }
    }

    return '';
}

function createBulkPreviewRows(text: string, cnOptions: CnCodeOption[]): BulkProductPreviewRow[] {
    const lines = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    return lines.flatMap((line, index) => {
        const cells = splitBulkProductLine(line);

        if (index === 0 && isBulkHeader(cells)) {
            return [];
        }

        const rowNumber = index + 1;
        const name = cells[0]?.trim() ?? '';
        const rawCode = cells[1]?.trim() ?? '';
        const unit = cells[2]?.trim() || 'tonne';
        const detailFromText = suggestDetailPresetFromText(cells.join(' '));
        const codeForLookup = normalizeBulkCode(rawCode);
        const detail = codeForLookup
            ? findDetailPresetForProduct({
                cn_code: codeForLookup,
                hs_code: codeForLookup.slice(0, 4),
                product_type_enum: detailFromText?.productTypeEnum ?? '',
            }) ?? detailFromText
            : detailFromText;
        const cnCode = resolveCnCodeFromBulk(rawCode, detail, cnOptions);
        const hsCode = (cnCode || codeForLookup).slice(0, 4);
        const hsGroup: HsGroup = (cnCode || hsCode).slice(0, 2) || '72';
        const coverage = getCbamCoverage({ cn_code: cnCode, hs_code: hsCode });
        const productTypeEnum = detail?.productTypeEnum
            ?? (hsGroup === '73' ? 'HS73_OTHER' : hsGroup === '72' ? 'HS72_PLATE_SHEET' : 'UNKNOWN_PRODUCT');
        let status: BulkProductStatus = 'ready';
        let message = rawCode && cnCode !== normalizeBulkCode(rawCode)
            ? `CN ${rawCode} 기준으로 검색 목록의 ${cnCode} 후보를 적용합니다.`
            : '등록 가능';

        if (!name) {
            status = 'error';
            message = '제품명이 비어 있습니다.';
        } else if (!detail && !cnCode) {
            status = 'warning';
            message = '제품군을 추정하지 못했습니다. 제품명을 더 구체적으로 쓰거나 CN 8자리를 입력하세요.';
        } else if (!/^\d{8}$/.test(cnCode)) {
            status = 'warning';
            message = 'CN 8자리 후보를 확정하지 못했습니다. 수출 인보이스 또는 EU 템플릿 CN 목록으로 확인하세요.';
        } else if (coverage.status === 'NOT_COVERED') {
            status = 'error';
            message = `${coverage.label}: 일괄등록하지 않고 대상/비대상 여부를 먼저 확인하세요.`;
        } else if (coverage.status === 'CHECK_NEEDED') {
            status = 'warning';
            message = coverage.reason;
        }

        return [{
            rowNumber,
            name,
            rawCode,
            cnCode,
            hsCode,
            hsGroup,
            productTypeEnum,
            unit,
            detail,
            status,
            message,
        }];
    });
}

function GoodsRuleBadges({ product }: { product: Product }) {
    const metadata = getCbamGoodsMetadata(product);
    const scopeLabel = metadata.steel_app_supported
        ? '철강 앱 대상'
        : metadata.annex_i_candidate
            ? '앱 범위 밖'
            : 'CBAM 대상 확인 필요';

    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={metadata.steel_app_supported ? 'info' : 'warning'}>
                {scopeLabel}
            </StatusBadge>
            {metadata.steel_app_supported && (
                <StatusBadge tone={metadata.annex_ii_direct_only ? 'warning' : 'neutral'}>
                    {metadata.annex_ii_direct_only ? '직접배출 중심 계산 품목' : '간접배출 포함 검토'}
                </StatusBadge>
            )}
            {metadata.steel_app_supported && metadata.precursor_review_recommended && (
                <StatusBadge tone="pending">원재료·중간재 배출자료 확인</StatusBadge>
            )}
        </div>
    );
}

function GoodsRuleNote({ product }: { product: Product }) {
    const metadata = getCbamGoodsMetadata(product);

    return (
        <div className="mt-2 max-w-2xl space-y-1 text-xs leading-5 text-slate-500">
            <p>{metadata.sector_label} · {metadata.note}</p>
            {metadata.annex_ii_direct_only && (
                <p className="rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
                    쉽게 말해 이 품목은 CBAM 인증서 산정 시 직접배출 중심으로 계산합니다. 최종제품 자체 간접배출은 참고용으로 별도 관리합니다.
                </p>
            )}
        </div>
    );
}

function GoodsExpertDisclosure({ product }: { product: Product }) {
    const metadata = getCbamGoodsMetadata(product);
    const indirectRule = getIndirectEmissionsApplicability(product);

    return (
        <details className="mt-3 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">고급 규정 정보</summary>
            <dl className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                <div>
                    <dt className="font-semibold text-slate-500">Annex I</dt>
                    <dd>{metadata.annex_i_candidate ? 'Annex I 후보' : 'Annex I 확인 필요'}</dd>
                </div>
                <div>
                    <dt className="font-semibold text-slate-500">Annex II direct-only</dt>
                    <dd>{metadata.direct_only_label}</dd>
                </div>
                <div>
                    <dt className="font-semibold text-slate-500">Indirect emissions</dt>
                    <dd>{indirectRule.applicable ? 'certificate-basis 포함 검토' : 'certificate-basis 제외 검토'}</dd>
                </div>
                <div>
                    <dt className="font-semibold text-slate-500">Precursor</dt>
                    <dd>{metadata.precursor_review_recommended ? '전구물질 검토 권장' : '전구물질 검토 우선순위 낮음'}</dd>
                </div>
            </dl>
        </details>
    );
}

function ProductNextSteps({
    product,
    detail,
    onDuplicate,
    onCreateDraft,
}: {
    product: Product;
    detail?: ProductFamilyDetailPreset;
    onDuplicate: (product: Product) => void;
    onCreateDraft: (product: Product) => void;
}) {
    const setup = getCalculationSetupForDetail(detail);
    const requiredData = detail?.requiredData ?? setup.dataRequests.map((request) => request.item);

    return (
        <SectionCard
            title="제품 저장 후 다음 할 일"
            description={`${product.name} 기준으로 산정 입력을 이어갑니다. 제품이 많으면 먼저 대표 제품을 복제해 SKU를 늘린 뒤 공정과 전구물질을 연결하세요.`}
            actions={<StatusBadge tone="success">제품 저장 완료</StatusBadge>}
            className="border-teal-200 bg-teal-50/70"
        >
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.7fr)]">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <button
                        type="button"
                        onClick={() => onCreateDraft(product)}
                        className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:shadow-[var(--shadow-card-hover)]"
                    >
                        <Workflow className="h-5 w-5 text-teal-700" />
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">산정 초안 만들기</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">제품군에 맞는 생산공정과 매입 소재 입력 틀을 자동 생성합니다.</p>
                        <span className="mt-3 inline-flex items-center text-sm font-semibold text-teal-800">
                            생성
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </span>
                    </button>
                    <Link
                        href="/precursors"
                        className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-[var(--shadow-card-hover)]"
                    >
                        <Boxes className="h-5 w-5 text-teal-700" />
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">매입 강재 입력하기</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">구매한 소재, 공급사 SEE, 기본값 사용 사유를 정리합니다.</p>
                        <span className="mt-3 inline-flex items-center text-sm font-semibold text-teal-800">
                            이동
                            <ArrowRight className="ml-1.5 h-4 w-4 transition group-hover:translate-x-0.5" />
                        </span>
                    </Link>
                    <Link
                        href="/upload"
                        className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-teal-300 hover:shadow-[var(--shadow-card-hover)]"
                    >
                        <Upload className="h-5 w-5 text-teal-700" />
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">활동자료 템플릿 받기</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">생산량, 연료, 전력, 전구물질 자료를 한 번에 정리합니다.</p>
                        <span className="mt-3 inline-flex items-center text-sm font-semibold text-teal-800">
                            이동
                            <ArrowRight className="ml-1.5 h-4 w-4 transition group-hover:translate-x-0.5" />
                        </span>
                    </Link>
                    <button
                        type="button"
                        onClick={() => onDuplicate(product)}
                        className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-teal-300 hover:shadow-[var(--shadow-card-hover)]"
                    >
                        <Copy className="h-5 w-5 text-teal-700" />
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">비슷한 제품 복제하기</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">강종, 치수, 규격명만 다른 제품은 복제 후 이름과 CN만 수정합니다.</p>
                        <span className="mt-3 inline-flex items-center text-sm font-semibold text-teal-800">
                            복제
                            <ArrowRight className="ml-1.5 h-4 w-4" />
                        </span>
                    </button>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center gap-2">
                        <ClipboardList className="h-5 w-5 text-teal-700" />
                        <h3 className="text-sm font-semibold text-slate-950">이 제품군에서 먼저 모을 자료</h3>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        {requiredData.map((item) => (
                            <StatusBadge key={item} tone="neutral">{item}</StatusBadge>
                        ))}
                    </div>
                    <p className="mt-4 text-xs leading-5 text-slate-600">
                        자료를 바로 모으기 어렵다면 업로드 화면에서 내부 활동자료 템플릿을 내려받아 생산관리, 구매, 설비/공무 담당자에게 나눠 전달하세요.
                    </p>
                    <div className="mt-4 space-y-2">
                        {setup.dataRequests.slice(0, 4).map((request) => (
                            <div key={`${request.item}-${request.owner}`} className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                <span className="font-semibold text-slate-900">{request.item}</span>
                                <span className="text-slate-500"> · {request.owner}</span>
                                <p>{request.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </SectionCard>
    );
}

function ProductWorkflowStatus({
    product,
    processes,
    precursors,
}: {
    product: Product;
    processes: ProductionProcess[];
    precursors: PurchasedPrecursor[];
}) {
    const linkedProcesses = processes.filter((process) => process.product_id === product.id);
    const linkedPrecursors = precursors.filter((precursor) => precursor.product_id === product.id);
    const hasOutput = linkedProcesses.some((process) => process.output_mass_t > 0);
    const hasPurchasedMass = linkedPrecursors.some((precursor) => precursor.purchased_mass_t > 0 || precursor.consumed_mass_t > 0);

    return (
        <div className="mt-2 flex flex-wrap gap-1.5">
            <StatusBadge tone={linkedProcesses.length > 0 ? 'success' : 'warning'}>
                {linkedProcesses.length > 0 ? `공정 ${linkedProcesses.length}건` : '공정 초안 필요'}
            </StatusBadge>
            <StatusBadge tone={hasOutput ? 'success' : 'warning'}>
                {hasOutput ? '생산량 입력' : '생산량 필요'}
            </StatusBadge>
            <StatusBadge tone={linkedPrecursors.length > 0 ? 'success' : 'pending'}>
                {linkedPrecursors.length > 0 ? `매입 소재 ${linkedPrecursors.length}건` : '매입 소재 확인'}
            </StatusBadge>
            <StatusBadge tone={hasPurchasedMass ? 'success' : 'neutral'}>
                {hasPurchasedMass ? '소재량 입력' : '소재량 필요'}
            </StatusBadge>
        </div>
    );
}

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [productOutputLines, setProductOutputLines] = useState<ProductOutputLine[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [cnSearch, setCnSearch] = useState('');
    const [cnOptions, setCnOptions] = useState<CnCodeOption[]>(CN_CODE_OPTIONS);
    const [cnImportMessage, setCnImportMessage] = useState('');
    const [cnImportError, setCnImportError] = useState('');
    const [draft, setDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);
    const [errors, setErrors] = useState<ProductErrors>({});
    const [selectedFamilyId, setSelectedFamilyId] = useState('');
    const [selectedDetailId, setSelectedDetailId] = useState('');
    const [lastSavedProduct, setLastSavedProduct] = useState<Product | null>(null);
    const [lastSavedDetail, setLastSavedDetail] = useState<ProductFamilyDetailPreset | undefined>();
    const [bulkText, setBulkText] = useState('');
    const [bulkSaveMessage, setBulkSaveMessage] = useState('');
    const [calculationDraftMessage, setCalculationDraftMessage] = useState('');

    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            const [data, storedCnOptions, processData, precursorData, periodData, outputLineData] = await Promise.all([
                listLocalItems('products'),
                getLocalSetting<CnCodeOption[]>('cn-code-options'),
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('periods'),
                listLocalItems('product_output_lines'),
            ]);
            const sortedProducts = data.sort((a, b) => b.created_at.localeCompare(a.created_at));
            const editProductId = new URLSearchParams(window.location.search).get('edit');
            const editProduct = editProductId ? sortedProducts.find((item) => item.id === editProductId) : undefined;

            setProducts(sortedProducts);
            setProcesses(processData);
            setPrecursors(precursorData);
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            setProductOutputLines(outputLineData);
            if (storedCnOptions?.length) {
                setCnOptions(storedCnOptions);
            }
            if (editProduct) {
                setDraft({
                    name: editProduct.name,
                    hs_code: editProduct.hs_code,
                    cn_code: editProduct.cn_code ?? '',
                    hs_group: editProduct.hs_group,
                    product_type_enum: editProduct.product_type_enum,
                    unit: editProduct.unit,
                    reporting_scope: getProductReportingScope(editProduct),
                });
                setEditingProductId(editProduct.id);
                setCnSearch(editProduct.cn_code ?? editProduct.hs_code);
                setShowForm(true);
            }
            setLoading(false);
        }

        fetchProducts();
    }, []);

    const filteredCnOptions = useMemo(() => {
        const query = cnSearch.trim().toLowerCase();

        return cnOptions
            .filter((option) => {
                if (!query) {
                    return true;
                }

                return (
                    option.code.includes(query) ||
                    option.labelKo.toLowerCase().includes(query) ||
                    option.description.toLowerCase().includes(query) ||
                    option.goodsCategory.toLowerCase().includes(query)
                );
            })
            .slice(0, 12);
    }, [cnOptions, cnSearch]);

    const selectedFamily = useMemo(() => {
        return selectedFamilyId ? findFamilyPreset(selectedFamilyId) : undefined;
    }, [selectedFamilyId]);

    const selectedDetail = useMemo(() => {
        return selectedFamilyId && selectedDetailId ? findDetailPreset(selectedFamilyId, selectedDetailId) : undefined;
    }, [selectedFamilyId, selectedDetailId]);

    const bulkPreviewRows = useMemo(() => createBulkPreviewRows(bulkText, cnOptions), [bulkText, cnOptions]);
    const bulkReadyRows = useMemo(() => bulkPreviewRows.filter((row) => row.status === 'ready'), [bulkPreviewRows]);

    const productSummary = useMemo(() => {
        const cnReadyCount = products.filter((product) => product.cn_code?.length === 8).length;
        const annexCandidateCount = products.filter((product) => getCbamGoodsMetadata(product).steel_app_supported).length;
        const directOnlyCount = products.filter((product) => getCbamGoodsMetadata(product).annex_ii_direct_only).length;
        const precursorReviewCount = products.filter((product) => getCbamGoodsMetadata(product).precursor_review_recommended).length;

        return {
            annexCandidateCount,
            cnReadyCount,
            directOnlyCount,
            precursorReviewCount,
            totalCount: products.length,
        };
    }, [products]);

    function resetForm() {
        setDraft(EMPTY_PRODUCT_DRAFT);
        setErrors({});
        setEditingProductId(null);
        setCnSearch('');
        setSelectedFamilyId('');
        setSelectedDetailId('');
        setShowForm(false);
    }

    function startNewProduct() {
        if (showForm && !editingProductId) {
            resetForm();
            return;
        }

        setDraft(EMPTY_PRODUCT_DRAFT);
        setEditingProductId(null);
        setCnSearch('');
        setSelectedFamilyId('');
        setSelectedDetailId('');
        setShowForm(true);
    }

    function startEditProduct(product: Product) {
        setDraft({
            name: product.name,
            hs_code: product.hs_code,
            cn_code: product.cn_code ?? '',
            hs_group: product.hs_group,
            product_type_enum: product.product_type_enum,
            unit: product.unit,
            reporting_scope: getProductReportingScope(product),
        });
        setErrors({});
        setEditingProductId(product.id);
        setCnSearch(product.cn_code ?? product.hs_code);
        setShowForm(true);
    }

    // 다제품(수백 SKU) 대응: 기존 제품을 복제해 변형(강종·치수·표면등급)만 바꿔 빠르게 추가.
    // editingProductId를 비워 두므로 '저장' 시 새 제품으로 생성된다.
    function startDuplicateProduct(product: Product) {
        setDraft({
            name: `${product.name} (복사본)`,
            hs_code: product.hs_code,
            cn_code: product.cn_code ?? '',
            hs_group: product.hs_group,
            product_type_enum: product.product_type_enum,
            unit: product.unit,
            reporting_scope: getProductReportingScope(product),
        });
        setErrors({});
        setEditingProductId(null);
        setCnSearch(product.cn_code ?? product.hs_code);
        setSelectedFamilyId('');
        setSelectedDetailId('');
        setShowForm(true);
        if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function getProductDependencies(productId: string) {
        return {
            processes: processes.filter((process) => process.product_id === productId),
            precursors: precursors.filter((precursor) => precursor.product_id === productId),
        };
    }

    async function handleDeleteProduct(product: Product) {
        const dependencies = getProductDependencies(product.id);
        const dependencyCount = dependencies.processes.length + dependencies.precursors.length;

        if (dependencyCount > 0) {
            window.alert(
                [
                    '이 제품은 다른 데이터에 연결되어 있어 삭제할 수 없습니다.',
                    '',
                    `연결된 생산공정: ${dependencies.processes.length}건`,
                    `연결된 전구물질: ${dependencies.precursors.length}건`,
                    '',
                    '먼저 연결된 공정 또는 전구물질 데이터를 수정하거나 삭제한 뒤 다시 시도하세요.',
                ].join('\n')
            );
            return;
        }

        const confirmed = window.confirm(`'${product.name}' 제품을 삭제할까요? 이 작업은 현재 브라우저의 로컬 데이터에서 제거됩니다.`);

        if (!confirmed) {
            return;
        }

        await deleteLocalItem('products', product.id);
        setProducts(products.filter((item) => item.id !== product.id));
        if (editingProductId === product.id) {
            resetForm();
        }
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const nextErrors: ProductErrors = {};

        if (!draft.name.trim()) {
            nextErrors.name = '제품명을 입력하세요.';
        }

        if (!/^\d{4,10}$/.test(draft.hs_code.trim())) {
            nextErrors.hs_code = 'HS 코드는 숫자 4자리 이상으로 입력하세요.';
        }

        if (!draft.cn_code || !/^\d{8}$/.test(draft.cn_code)) {
            nextErrors.cn_code = 'EU Export 검증을 위해 CN 8자리 숫자를 입력하세요.';
        }

        if (!draft.product_type_enum.trim()) {
            nextErrors.product_type_enum = '제품군 템플릿을 선택하세요.';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        if (editingProductId) {
            const existingProduct = products.find((product) => product.id === editingProductId);

            if (!existingProduct) {
                return;
            }

            const updatedProduct = await updateLocalItem('products', {
                ...existingProduct,
                ...draft,
                name: draft.name.trim(),
                hs_code: draft.hs_code.trim(),
            });
            setProducts(products.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)));
            setLastSavedProduct(updatedProduct);
            setLastSavedDetail(selectedDetail ?? findDetailPresetForProduct(updatedProduct));
            resetForm();
            return;
        }

        const product = await createLocalItem('products', {
            ...draft,
            name: draft.name.trim(),
            hs_code: draft.hs_code.trim(),
        });
        setProducts([product, ...products]);
        setLastSavedProduct(product);
        setLastSavedDetail(selectedDetail ?? findDetailPresetForProduct(product));
        resetForm();
    }

    function fillBulkExample() {
        setBulkText([
            '제품명\tCN 코드\t단위',
            'ER70S-6 솔리드 용접와이어\t72171010\ttonne',
            'STS 냉연코일 304 1.0T\t72193400\ttonne',
            '일반 구조용 용접강관 50A\t73063080\ttonne',
            '육각볼트 M10\t73181595\ttonne',
            '피복 용접봉 E6013\t8311\ttonne',
        ].join('\n'));
        setBulkSaveMessage('');
    }

    async function handleBulkCreateProducts() {
        setBulkSaveMessage('');

        if (bulkReadyRows.length === 0) {
            setBulkSaveMessage('등록 가능한 행이 없습니다. CN 8자리와 제품명을 먼저 확인하세요.');
            return;
        }

        const createdProducts = await Promise.all(
            bulkReadyRows.map((row) =>
                createLocalItem('products', {
                    name: row.name.trim(),
                    hs_code: row.hsCode,
                    cn_code: row.cnCode,
                    hs_group: row.hsGroup,
                    product_type_enum: row.productTypeEnum,
                    unit: row.unit,
                    reporting_scope: 'CBAM_GOOD',
                })
            )
        );

        setProducts([...createdProducts, ...products]);
        setLastSavedProduct(createdProducts[0] ?? null);
        setLastSavedDetail(createdProducts[0] ? findDetailPresetForProduct(createdProducts[0]) : undefined);
        setBulkText('');
        setBulkSaveMessage(`${createdProducts.length}개 제품을 등록했습니다. 경고/오류 행은 저장하지 않았습니다.`);
    }

    async function handleCreateCalculationDraft(product: Product) {
        setCalculationDraftMessage('');
        const coverage = getCbamCoverage(product);

        if (coverage.status === 'NOT_COVERED') {
            setCalculationDraftMessage(`${product.name}: ${coverage.reason}`);
            return;
        }

        const detail = findDetailPresetForProduct(product);
        const setup: ProductCalculationSetup = getCalculationSetupForDetail(detail);
        const periodId = periods[0]?.id ?? '';
        const existingProcesses = processes.filter((process) => process.product_id === product.id);
        let process = existingProcesses[0];
        let createdProcessCount = 0;
        let createdOutputLineCount = 0;

        if (!process) {
            process = await createLocalItem('processes', {
                period_id: periodId,
                product_id: product.id,
                name: `${product.name} - ${setup.processName}`,
                production_route: setup.productionRoute,
                output_mass_t: 0,
                market_output_mass_t: 0,
                internal_consumption_mass_t: 0,
                direct_attributable_emissions_tco2e: 0,
                electricity_mwh: 0,
                electricity_ef_tco2e_per_mwh: 0.47,
                electricity_ef_source: 'COUNTRY_GRID_DEFAULT',
            });
            setProcesses((current) => [process, ...current]);
            createdProcessCount = 1;
        }

        let outputLine = productOutputLines.find((line) => line.process_id === process.id && line.product_id === product.id);
        if (!outputLine) {
            const createdOutputLine = await createLocalItem('product_output_lines', {
                process_id: process.id,
                product_id: product.id,
                name: product.name,
                output_mass_t: 0,
                allocation_basis: 'MASS',
                manual_allocation_percent: 100,
                note: '제품군 산정 초안에서 생성',
                reporting_scope: getProductReportingScope(product),
            });
            outputLine = createdOutputLine;
            setProductOutputLines((current) => [createdOutputLine, ...current]);
            createdOutputLineCount = 1;
        }

        const existingPrecursorKeys = new Set(
            precursors
                .filter((precursor) => precursor.product_id === product.id)
                .map((precursor) => `${precursor.name}|${precursor.precursor_cn_code ?? ''}`)
        );
        const precursorCandidates = setup.precursorCandidates.filter((candidate) =>
            !existingPrecursorKeys.has(`${candidate.name}|${candidate.precursorCnCode}`)
        );
        const createdPrecursors = await Promise.all(
            precursorCandidates.map((candidate) =>
                createLocalItem('precursors', {
                    period_id: periodId,
                    process_id: process.id,
                    product_id: product.id,
                    name: candidate.name,
                    precursor_cn_code: candidate.precursorCnCode,
                    aggregated_goods_category: 'Iron or steel products',
                    production_route: candidate.productionRoute,
                    supplier_country: 'South Korea',
                    supplier_installation: '',
                    data_mode: 'DEFAULT',
                    verification_status: 'UNVERIFIED',
                    default_value_year: '2026',
                    purchased_mass_t: 0,
                    consumed_mass_t: 0,
                    consumed_for_non_cbam_mass_t: 0,
                    direct_see_tco2e_per_t: 0,
                    indirect_see_tco2e_per_t: 0,
                    source: '제품군 산정 초안',
                    default_value_justification: '초안: 공급사 SEE 자료가 없으면 공식 기본값 조회 후 사유를 보완하세요.',
                    output_allocations: [{
                        product_output_line_id: outputLine.id,
                        product_id: product.id,
                        allocated_mass_t: 0,
                        allocation_percent: 100,
                        note: '제품군 산정 초안에서 자동 귀속',
                    }],
                })
            )
        );

        if (createdPrecursors.length > 0) {
            setPrecursors((current) => [...createdPrecursors, ...current]);
        }

        setLastSavedProduct(product);
        setLastSavedDetail(detail);
        setCalculationDraftMessage(
            `${product.name}: 생산공정 ${createdProcessCount}건, 생산라인 ${createdOutputLineCount}건, 매입 소재 ${createdPrecursors.length}건을 생성했습니다. 이제 생산량과 실제 사용량을 입력하세요.`
        );
    }

    async function handleCnTemplateImport(file: File | undefined) {
        setCnImportMessage('');
        setCnImportError('');

        if (!file) {
            return;
        }

        try {
            const importedOptions = await parseEuTemplateCnCodeOptions(file);
            await setLocalSetting('cn-code-options', importedOptions);
            setCnOptions(importedOptions);
            setCnImportMessage(`EU 템플릿에서 CN 코드 ${importedOptions.length}개를 가져왔습니다.`);
        } catch (error) {
            setCnImportError(error instanceof Error ? error.message : 'CN 코드 목록을 가져오지 못했습니다.');
        }
    }

    function applyCnOption(option: CnCodeOption) {
        setDraft({
            ...draft,
            cn_code: option.code,
            hs_code: option.code.slice(0, 4),
            hs_group: option.code.slice(0, 2) || '72',
            product_type_enum: option.goodsCategory,
        });
    }

    function selectFamily(familyId: string) {
        const family = findFamilyPreset(familyId);
        const firstDetail = family?.details[0];
        setSelectedFamilyId(familyId);
        setSelectedDetailId(firstDetail?.id ?? '');
        if (firstDetail) {
            applyDetailPreset(firstDetail);
        }
    }

    function applyDetailPreset(detail: ProductFamilyDetailPreset) {
        const candidate = detail.cnCandidates[0];
        const candidateCode = candidate?.code.replace(/\D/g, '') ?? '';

        setDraft((current) => ({
            ...current,
            hs_code: candidateCode.slice(0, 4) || current.hs_code,
            hs_group: detail.hsGroup,
            product_type_enum: detail.productTypeEnum,
            cn_code: candidateCode.length === 8 ? candidateCode : current.cn_code,
        }));
        if (candidateCode) {
            setCnSearch(candidateCode);
        }
    }

    function searchCnCandidate(detail: ProductFamilyDetailPreset, candidate: ProductCnCandidate) {
        const candidateCode = candidate.code.replace(/\D/g, '');

        setDraft((current) => ({
            ...current,
            hs_code: candidateCode.slice(0, 4) || current.hs_code,
            hs_group: detail.hsGroup,
            product_type_enum: detail.productTypeEnum,
            cn_code: candidateCode.length === 8 ? candidateCode : current.cn_code,
        }));
        setCnSearch(candidateCode);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="품목 기준 데이터"
                title="CBAM 대상 품목 관리"
                description="CN 코드 기준으로 대상 여부와 산정 상태를 관리합니다. 제품 데이터는 이 브라우저에만 저장됩니다."
                actions={
                    <Button type="button" onClick={startNewProduct}>
                        <Plus className="mr-2 h-4 w-4" />
                        품목 추가
                    </Button>
                }
            />

            <SectionCard
                title="EU 수출 품목 코드 목록"
                description="최신 EU 템플릿을 선택하면 EU 템플릿의 CN 코드 목록(Parameters_CNCodes)을 로컬에 저장해 제품 검색에 사용합니다."
                actions={
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-teal-700" />
                        EU 템플릿에서 가져오기
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            onChange={(event) => handleCnTemplateImport(event.target.files?.[0])}
                        />
                    </label>
                }
            >
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <StatusBadge tone={cnOptions === CN_CODE_OPTIONS ? 'neutral' : 'success'}>
                        {cnOptions === CN_CODE_OPTIONS ? '대표 코드 목록' : 'EU 템플릿 기준'}
                    </StatusBadge>
                    <span>현재 검색 목록: {cnOptions.length}개</span>
                </div>
                {cnImportMessage && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {cnImportMessage}
                    </div>
                )}
                {cnImportError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {cnImportError}
                    </div>
                )}
            </SectionCard>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <CheckCircle2 className="h-4 w-4 text-teal-700" />
                        품목 코드 등록
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">
                        {productSummary.totalCount === 0 ? '없음' : `${productSummary.cnReadyCount}/${productSummary.totalCount}`}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                        {productSummary.totalCount === 0 ? '아직 등록된 품목 없음' : 'CN 8자리 입력 완료'}
                    </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <FileSpreadsheet className="h-4 w-4 text-blue-700" />
                        CBAM 대상 가능 품목
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">{productSummary.annexCandidateCount}개</div>
                    <p className="mt-1 text-xs text-slate-500">대표 규칙 기준 대상 가능 품목</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                        직접배출 중심 계산 품목
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">{productSummary.directOnlyCount}개</div>
                    <p className="mt-1 text-xs text-slate-500">인증서 계산은 직접배출 중심</p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                        <Boxes className="h-4 w-4 text-slate-600" />
                        원재료·중간재 확인
                    </div>
                    <div className="mt-3 text-2xl font-semibold text-slate-950">{productSummary.precursorReviewCount}개</div>
                    <p className="mt-1 text-xs text-slate-500">공급망 SEE 자료 확인 필요</p>
                </div>
            </section>

            {lastSavedProduct && (
                <ProductNextSteps
                    product={lastSavedProduct}
                    detail={lastSavedDetail}
                    onDuplicate={startDuplicateProduct}
                    onCreateDraft={(product) => void handleCreateCalculationDraft(product)}
                />
            )}

            {calculationDraftMessage && (
                <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900">
                    {calculationDraftMessage}
                </div>
            )}

            <SectionCard
                title="다제품 회사 입력 요령"
                description="제품 수가 많은 가공사는 모든 SKU를 처음부터 새로 만들기보다 대표 제품을 먼저 저장한 뒤 복제해서 강종·치수·규격만 바꾸는 방식이 빠릅니다."
            >
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">1</div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">대표 제품 1개 저장</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">가장 많이 팔리는 제품이나 수입자가 요청한 제품부터 등록합니다.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">2</div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">복제로 SKU 확장</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">강종, 직경, 두께, 규격명만 다른 제품은 복제 후 이름과 CN을 수정합니다.</p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-inset ring-teal-100">3</div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">공정·전구물질 연결</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-600">제품 목록이 정리되면 생산공정과 매입 강재 SEE 자료를 연결합니다.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="제품 목록 붙여넣기"
                description="Excel에서 제품명, CN 코드, 단위를 복사해 붙여넣으면 여러 품목을 한 번에 점검하고 등록할 수 있습니다. CN 코드가 비어 있으면 제품명 키워드로 후보를 추정합니다."
                actions={
                    <Button type="button" variant="secondary" onClick={fillBulkExample}>
                        <Table2 className="mr-2 h-4 w-4" />
                        예시 채우기
                    </Button>
                }
            >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div>
                        <label className="text-sm font-semibold text-slate-700">붙여넣기 영역</label>
                        <textarea
                            className="mt-1 min-h-48 w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={bulkText}
                            onChange={(event) => {
                                setBulkText(event.target.value);
                                setBulkSaveMessage('');
                            }}
                            placeholder={[
                                '제품명\tCN 코드\t단위',
                                'ER70S-6 솔리드 용접와이어\t72171010\ttonne',
                                '일반 구조용 용접강관 50A\t73063080\ttonne',
                                '육각볼트 M10\t73181595\ttonne',
                            ].join('\n')}
                        />
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            <StatusBadge tone={bulkPreviewRows.length > 0 ? 'info' : 'neutral'}>
                                미리보기 {bulkPreviewRows.length}행
                            </StatusBadge>
                            <StatusBadge tone={bulkReadyRows.length > 0 ? 'success' : 'warning'}>
                                등록 가능 {bulkReadyRows.length}행
                            </StatusBadge>
                            <Button type="button" onClick={() => void handleBulkCreateProducts()} disabled={bulkReadyRows.length === 0}>
                                등록 가능한 행 저장
                            </Button>
                        </div>
                        {bulkSaveMessage && (
                            <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                                {bulkSaveMessage}
                            </div>
                        )}
                        <p className="mt-3 text-xs leading-5 text-slate-500">
                            권장 열 순서: 제품명, CN 코드, 단위. CN 코드는 8자리가 가장 좋고, 4자리만 입력하면 현재 검색 목록에서 첫 8자리 후보를 적용합니다.
                        </p>
                    </div>

                    <div className="min-w-0">
                        {bulkPreviewRows.length === 0 ? (
                            <div className="flex min-h-48 items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-center text-sm leading-6 text-slate-600">
                                붙여넣은 제품 목록이 여기에서 미리보기로 표시됩니다. 오류 또는 경고 행은 저장하지 않고, 등록 가능한 행만 일괄 저장합니다.
                            </div>
                        ) : (
                            <DataTable>
                                <table className="min-w-full divide-y divide-slate-200">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">상태</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">제품명</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">CN</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">제품군</th>
                                            <th className="px-3 py-3 text-left text-xs font-semibold text-slate-700">메시지</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 bg-white">
                                        {bulkPreviewRows.map((row) => {
                                            const tone = row.status === 'ready'
                                                ? 'success' as const
                                                : row.status === 'warning'
                                                  ? 'warning' as const
                                                  : 'danger' as const;

                                            return (
                                                <tr key={`${row.rowNumber}-${row.name}-${row.cnCode}`} className="text-sm">
                                                    <td className="whitespace-nowrap px-3 py-3">
                                                        <StatusBadge tone={tone}>
                                                            {row.status === 'ready' ? '저장 가능' : row.status === 'warning' ? '확인 필요' : '저장 제외'}
                                                        </StatusBadge>
                                                    </td>
                                                    <td className="px-3 py-3 font-medium text-slate-900">{row.name || '-'}</td>
                                                    <td className="whitespace-nowrap px-3 py-3 text-slate-700">
                                                        {row.cnCode || row.rawCode || '-'}
                                                    </td>
                                                    <td className="px-3 py-3 text-slate-700">{row.detail?.label ?? row.productTypeEnum}</td>
                                                    <td className="px-3 py-3 text-xs leading-5 text-slate-600">{row.message}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </DataTable>
                        )}
                    </div>
                </div>
            </SectionCard>

            {showForm && (
                <SectionCard
                    title={editingProductId ? '제품 정보 수정' : '신규 제품 등록'}
                    description="EU Export 정확도를 위해 CN 8자리 코드를 우선 입력하세요."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="md:col-span-2">
                            <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                    <StatusBadge tone="pending">제품군으로 시작</StatusBadge>
                                    <StatusBadge tone="neutral">철강 가공사 기준</StatusBadge>
                                </div>
                                <h3 className="mt-3 text-base font-semibold text-slate-950">제품을 고르면 CN 후보를 먼저 좁힙니다</h3>
                                <p className="mt-1 text-sm leading-6 text-teal-950">
                                    이 흐름은 강재·코일·선재·후판 등을 사서 가공하는 중소·중견 철강사 기준입니다. 쇳물, 고로, 전기로, 제강, 주조·압연 전 과정을 직접 운영하는 제철소형 산정은 간단 모드 범위를 넘어섭니다.
                                </p>
                                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                                    <div>
                                        <label className="text-sm font-semibold text-slate-800">제품군</label>
                                        <select
                                            className={fieldClass}
                                            value={selectedFamilyId}
                                            onChange={(event) => selectFamily(event.target.value)}
                                        >
                                            <option value="">제품군 선택</option>
                                            {PRODUCT_FAMILY_PRESETS.map((preset) => (
                                                <option key={preset.id} value={preset.id}>{preset.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-sm font-semibold text-slate-800">세부제품</label>
                                        <select
                                            className={fieldClass}
                                            value={selectedDetailId}
                                            onChange={(event) => {
                                                setSelectedDetailId(event.target.value);
                                                const detail = selectedFamilyId ? findDetailPreset(selectedFamilyId, event.target.value) : undefined;
                                                if (detail) {
                                                    applyDetailPreset(detail);
                                                }
                                            }}
                                            disabled={!selectedFamily}
                                        >
                                            <option value="">세부제품 선택</option>
                                            {selectedFamily?.details.map((detail) => (
                                                <option key={detail.id} value={detail.id}>{detail.label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                {selectedFamily && (
                                    <div className="mt-3 rounded-xl border border-white/70 bg-white/70 px-3 py-2 text-xs leading-5 text-slate-700">
                                        <span className="font-semibold">{selectedFamily.label}</span>: {selectedFamily.description}
                                        {selectedFamily.examples.length > 0 && (
                                            <span className="ml-1 text-slate-500">예: {selectedFamily.examples.join(', ')}</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {selectedDetail && (
                            <div className="md:col-span-2">
                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                        <div>
                                            <h3 className="text-base font-semibold text-slate-950">{selectedDetail.label}</h3>
                                            <p className="mt-1 text-sm leading-6 text-slate-600">{selectedDetail.description}</p>
                                        </div>
                                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => applyDetailPreset(selectedDetail)}>
                                            기본값 반영
                                        </Button>
                                    </div>
                                    <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                        {selectedDetail.cnCandidates.map((candidate) => {
                                            const matches = findMatchingCnOptions(candidate, cnOptions);
                                            const tone = candidate.status === 'covered'
                                                ? 'success' as const
                                                : candidate.status === 'not-covered'
                                                  ? 'danger' as const
                                                  : 'warning' as const;

                                            return (
                                                <div key={`${selectedDetail.id}-${candidate.code}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="text-sm font-semibold text-slate-950">CN {candidate.code}</span>
                                                        <StatusBadge tone={tone}>{candidate.status === 'covered' ? 'CBAM 대상 후보' : candidate.status === 'not-covered' ? '비대상 가능' : '확인 필요'}</StatusBadge>
                                                        <StatusBadge tone={matches.length > 0 ? 'info' : 'neutral'}>
                                                            {matches.length > 0 ? `검색목록 ${matches.length}개` : '8자리 확인 필요'}
                                                        </StatusBadge>
                                                    </div>
                                                    <p className="mt-2 text-sm font-medium text-slate-800">{candidate.label}</p>
                                                    <p className="mt-1 text-xs leading-5 text-slate-600">{candidate.note}</p>
                                                    {matches.length > 0 && (
                                                        <p className="mt-2 text-xs leading-5 text-slate-500">
                                                            예: {matches.map((option) => option.code).join(', ')}
                                                        </p>
                                                    )}
                                                    <Button
                                                        type="button"
                                                        variant="secondary"
                                                        className="mt-3 min-h-9 px-3 py-1.5"
                                                        onClick={() => searchCnCandidate(selectedDetail, candidate)}
                                                    >
                                                        이 후보로 검색
                                                    </Button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                                        <span className="font-semibold text-slate-800">필요 자료:</span> {selectedDetail.requiredData.join(', ')}
                                    </div>
                                </div>
                            </div>
                        )}

                        <div>
                            <label className="text-sm font-semibold text-slate-700">제품명</label>
                            <input
                                type="text"
                                required
                                className={fieldClass}
                                value={draft.name}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">HS 코드</label>
                            <input
                                type="text"
                                required
                                className={fieldClass}
                                value={draft.hs_code}
                                onChange={(e) => setDraft({ ...draft, hs_code: e.target.value })}
                            />
                            {errors.hs_code && <p className="mt-1 text-xs font-medium text-red-600">{errors.hs_code}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700"><Term term="CN 코드">CN</Term> 8자리 코드</label>{' '}
                            <FieldHelp
                                title="CN 코드는 어디서 확인하나요?"
                                sources={[
                                    '수출 인보이스·관세사에게 받은 HS코드 앞 6자리 + EU CN 뒤 2자리',
                                    'EU TARIC 또는 관세청 품목분류 조회',
                                    '아래 "CN 코드 검색"으로 EU 템플릿 목록에서 찾아 적용',
                                ]}
                                exampleLabel="예시값 채우기 (72191310)"
                                onExample={() => setDraft({ ...draft, cn_code: '72191310' })}
                            />
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{8}"
                                maxLength={8}
                                className={fieldClass}
                                value={draft.cn_code}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        cn_code: e.target.value.replace(/\D/g, '').slice(0, 8),
                                    })
                                }
                                placeholder="예: 72083900"
                            />
                            <p className="mt-1 text-xs text-slate-500">EU Communication Template 검증은 CN 8자리 기준으로 수행합니다. 용접 제품: 맨 강철 와이어(7217/7223/7229)는 대상, 피복·플럭스코어드 용접봉(8311)은 비대상입니다.</p>
                            {(draft.cn_code?.length ?? 0) >= 4 && (() => {
                                const cov = getCbamCoverage({ cn_code: draft.cn_code, hs_code: draft.hs_code });
                                const cls = cov.status === 'COVERED'
                                    ? 'border-teal-200 bg-teal-50 text-teal-900'
                                    : cov.status === 'NOT_COVERED'
                                      ? 'border-red-200 bg-red-50 text-red-800'
                                      : 'border-amber-200 bg-amber-50 text-amber-900';
                                return (
                                    <div className={`mt-2 rounded-xl border p-2.5 text-xs leading-5 ${cls}`}>
                                        <p className="font-semibold">{cov.label}</p>
                                        <p className="mt-0.5">{cov.reason}</p>
                                    </div>
                                );
                            })()}
                            {errors.cn_code && <p className="mt-1 text-xs font-medium text-red-600">{errors.cn_code}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">CN 코드 검색</label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input
                                    type="search"
                                    className={`${fieldClass} pl-9`}
                                    value={cnSearch}
                                    onChange={(event) => setCnSearch(event.target.value)}
                                    placeholder="예: 열연, 강관, 볼트, 7208, 7318"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="mb-3 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3 text-sm leading-6 text-teal-900">
                                제품의 EU Communication Template 기준은 HS 4자리보다 CN 8자리가 우선입니다. 확신이 없으면 최신 EU 템플릿에서 CN 목록을 가져온 뒤 제품명이나 코드로 검색해 선택하세요.
                            </div>
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {filteredCnOptions.map((option) => (
                                    <button
                                        key={option.code}
                                        type="button"
                                        onClick={() => applyCnOption(option)}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold text-slate-950">{option.code}</span>
                                            <span className="text-xs text-slate-500">{option.goodsCategory}</span>
                                        </div>
                                        <div className="mt-1 text-sm text-slate-700">{option.labelKo}</div>
                                        <div className="mt-1 line-clamp-1 text-xs text-slate-500">{option.description}</div>
                                    </button>
                                ))}
                            </div>
                            {filteredCnOptions.length === 0 && (
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-600">
                                    검색 결과가 없습니다. CN 8자리 숫자 일부, 제품명, 품목군 키워드로 다시 검색하거나 EU 템플릿에서 최신 CN 목록을 가져오세요.
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-slate-700">품목 용도</label>
                            <select
                                className={fieldClass}
                                value={draft.reporting_scope ?? 'CBAM_GOOD'}
                                onChange={(e) => setDraft({ ...draft, reporting_scope: e.target.value as Product['reporting_scope'] })}
                            >
                                {PRODUCT_REPORTING_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">HS 그룹</label>
                            <select
                                className={fieldClass}
                                value={draft.hs_group}
                                onChange={(e) => setDraft({ ...draft, hs_group: e.target.value as HsGroup })}
                            >
                                {!['72', '73'].includes(draft.hs_group) && <option value={draft.hs_group}>HS {draft.hs_group} (기타)</option>}
                                <option value="72">HS 72 (철강)</option>
                                <option value="73">HS 73 (철강 제품)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">제품군 템플릿</label>
                            <select
                                className={fieldClass}
                                value={draft.product_type_enum}
                                onChange={(e) => setDraft({ ...draft, product_type_enum: e.target.value })}
                            >
                                <option value="HS72_PLATE_SHEET">HS72_PLATE_SHEET</option>
                                <option value="HS72_BAR_SECTION">HS72_BAR_SECTION</option>
                                <option value="HS72_WIRE">HS72_WIRE</option>
                                <option value="HS73_PIPE_TUBE">HS73_PIPE_TUBE</option>
                                <option value="HS73_STRUCTURE">HS73_STRUCTURE</option>
                                <option value="HS73_TANK">HS73_TANK</option>
                                <option value="HS73_FASTENER">HS73_FASTENER</option>
                                <option value="HS73_OTHER">HS73_OTHER</option>
                                <option value="UNKNOWN_PRODUCT">UNKNOWN_PRODUCT</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit">{editingProductId ? '수정 저장' : '제품 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="space-y-3 md:hidden">
                {loading ? (
                    <SectionCard>
                        <p className="text-center text-sm text-slate-500">불러오는 중...</p>
                    </SectionCard>
                ) : products.length === 0 ? (
                    <SectionCard>
                        <EmptyState
                            title="등록된 제품이 없습니다"
                            description="CBAM 산정은 CN 8자리 기준의 대상 제품부터 시작합니다. 제품을 먼저 등록하면 생산공정, 전구물질, Export 매핑을 연결할 수 있습니다."
                            action={
                                <Button type="button" onClick={startNewProduct}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    제품 추가
                                </Button>
                            }
                        />
                    </SectionCard>
                ) : (
                    products.map((product) => (
                        <SectionCard key={product.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <StatusBadge tone={product.cn_code?.length === 8 ? 'success' : 'warning'}>
                                        {product.cn_code?.length === 8 ? '산정 준비' : 'CN 확인 필요'}
                                    </StatusBadge>
                                    <StatusBadge tone="neutral">{getProductReportingScopeLabel(getProductReportingScope(product))}</StatusBadge>
                                    <h2 className="mt-3 text-base font-semibold text-slate-950">{product.name}</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        {product.cn_code ? `CN ${product.cn_code}` : 'CN 미입력'} · HS {product.hs_code}
                                    </p>
                                    <GoodsRuleBadges product={product} />
                                    <ProductWorkflowStatus product={product} processes={processes} precursors={precursors} />
                                    <GoodsRuleNote product={product} />
                                    <GoodsExpertDisclosure product={product} />
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="min-h-9 px-3 py-1.5"
                                        onClick={() => startEditProduct(product)}
                                    >
                                        <Pencil className="mr-1.5 h-4 w-4" />
                                        수정
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="min-h-9 px-3 py-1.5"
                                        onClick={() => void handleCreateCalculationDraft(product)}
                                    >
                                        <Workflow className="mr-1.5 h-4 w-4" />
                                        산정 초안
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        className="min-h-9 px-3 py-1.5"
                                        aria-label={`${product.name} 복제`}
                                        onClick={() => startDuplicateProduct(product)}
                                    >
                                        <Copy className="mr-1.5 h-4 w-4" />
                                        복제
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="danger"
                                        className="min-h-9 px-3 py-1.5"
                                        aria-label={`${product.name} 삭제`}
                                        onClick={() => handleDeleteProduct(product)}
                                    >
                                        <Trash2 className="h-4 w-4" />
                                        <span className="sr-only">삭제</span>
                                    </Button>
                                </div>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">품목군</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{product.product_type_enum}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">단위</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{product.unit}</dd>
                                </div>
                            </dl>
                        </SectionCard>
                    ))
                )}
            </div>

            <div className="hidden space-y-3 md:block">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">등록 품목 목록</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        CN 코드와 Annex 처리 기준을 확인하고, 연결된 공정이나 전구물질을 만들기 전에 품목 정보를 정리하세요.
                    </p>
                </div>
            <DataTable>
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">CN 코드</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품명</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">품목군</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">HS 코드</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">단위</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-sm text-slate-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-6">
                                    <EmptyState
                                        title="등록된 제품이 없습니다"
                                        description="CBAM 대상 제품을 등록하면 공정, 전구물질, Export 준비 흐름을 이어갈 수 있습니다."
                                        action={
                                            <Button type="button" onClick={startNewProduct}>
                                                <Plus className="mr-2 h-4 w-4" />
                                                제품 추가
                                            </Button>
                                        }
                                    />
                                </td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={product.id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                                        <StatusBadge tone={product.cn_code?.length === 8 ? 'success' : 'warning'}>
                                            {product.cn_code?.length === 8 ? '산정 준비' : 'CN 확인 필요'}
                                        </StatusBadge>
                                        <StatusBadge tone="neutral">{getProductReportingScopeLabel(getProductReportingScope(product))}</StatusBadge>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">
                                        {product.cn_code || '미입력'}
                                    </td>
                                    <td className="px-4 py-4 text-sm text-slate-700">
                                        <div className="font-medium text-slate-900">{product.name}</div>
                                        <GoodsRuleBadges product={product} />
                                        <ProductWorkflowStatus product={product} processes={processes} precursors={precursors} />
                                        <GoodsRuleNote product={product} />
                                        <GoodsExpertDisclosure product={product} />
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.product_type_enum}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.hs_code}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.unit}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                        <div className="flex justify-end gap-2">
                                            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditProduct(product)}>
                                                <Pencil className="mr-1.5 h-4 w-4" />
                                                수정
                                            </Button>
                                            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => void handleCreateCalculationDraft(product)}>
                                                <Workflow className="mr-1.5 h-4 w-4" />
                                                산정 초안
                                            </Button>
                                            <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startDuplicateProduct(product)}>
                                                <Copy className="mr-1.5 h-4 w-4" />
                                                복제
                                            </Button>
                                            <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => handleDeleteProduct(product)}>
                                                <Trash2 className="mr-1.5 h-4 w-4" />
                                                삭제
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
            </div>
        </div>
    );
}
