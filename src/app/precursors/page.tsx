'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import {
    createLocalItem,
    deleteLocalItem,
    getLocalSetting,
    listLocalItems,
    Product,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    seedLocalData,
    updateLocalItem,
} from '@/lib/local-db';
import {
    findDefaultValueReference,
    getDefaultValueTotalForYear,
    type ImportedDefaultValueReference,
} from '@/lib/reference-workbooks';
import { Boxes, Factory, Pencil, Plus, Scale, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type PrecursorDraft = Omit<PurchasedPrecursor, 'id' | 'created_at' | 'updated_at'>;
type PrecursorErrors = Partial<Record<keyof PrecursorDraft, string>>;

const emptyDraft: PrecursorDraft = {
    period_id: '',
    process_id: '',
    product_id: '',
    name: '',
    precursor_cn_code: '',
    aggregated_goods_category: 'Iron or steel products',
    production_route: '',
    supplier_country: 'South Korea',
    supplier_installation: '',
    data_mode: 'ACTUAL',
    verification_status: 'UNVERIFIED',
    default_value_year: '2026',
    purchased_mass_t: 0,
    consumed_mass_t: 0,
    consumed_for_non_cbam_mass_t: 0,
    direct_see_tco2e_per_t: 0,
    indirect_see_tco2e_per_t: 0,
    source: '',
    default_value_justification: '',
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

function toNumber(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(value);
}

function getDataModeLabel(mode: PurchasedPrecursor['data_mode'] | undefined) {
    if (mode === 'DEFAULT') {
        return '기본값';
    }

    if (mode === 'SEMI_ACTUAL') {
        return '혼합';
    }

    return '실측';
}

function getVerificationLabel(status: PurchasedPrecursor['verification_status'] | undefined) {
    if (status === 'VERIFIED') {
        return '검증완료';
    }

    if (status === 'SUPPLIER_CONFIRMED') {
        return '공급사 확인';
    }

    return '미검증';
}

function getPrecursorEvidenceIssues(precursor: PurchasedPrecursor) {
    const issues: string[] = [];

    if (precursor.data_mode === 'DEFAULT' && !precursor.default_value_justification?.trim()) {
        issues.push('기본값 사용 사유 필요');
    }

    if (precursor.data_mode !== 'DEFAULT' && precursor.verification_status === 'UNVERIFIED') {
        issues.push('실측자료 검증 필요');
    }

    if (!precursor.source?.trim()) {
        issues.push('SEE 출처 필요');
    }

    return issues;
}

export default function PrecursorsPage() {
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [defaultValueReference, setDefaultValueReference] = useState<ImportedDefaultValueReference | undefined>();
    const [defaultLookupMessage, setDefaultLookupMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPrecursorId, setEditingPrecursorId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<PrecursorDraft>(emptyDraft);
    const [errors, setErrors] = useState<PrecursorErrors>({});

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await seedLocalData();
            const [precursorData, periodData, processData, productData, defaultReference] = await Promise.all([
                listLocalItems('precursors'),
                listLocalItems('periods'),
                listLocalItems('processes'),
                listLocalItems('products'),
                getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
            ]);
            const sortedPrecursors = precursorData.sort((a, b) => b.created_at.localeCompare(a.created_at));
            const editPrecursorId = new URLSearchParams(window.location.search).get('edit');
            const editPrecursor = editPrecursorId ? sortedPrecursors.find((item) => item.id === editPrecursorId) : undefined;

            setPrecursors(sortedPrecursors);
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            setProcesses(processData.sort((a, b) => a.name.localeCompare(b.name)));
            setProducts(productData.sort((a, b) => a.name.localeCompare(b.name)));
            setDefaultValueReference(defaultReference);
            if (editPrecursor) {
                setNewItem({
                    period_id: editPrecursor.period_id ?? '',
                    process_id: editPrecursor.process_id ?? '',
                    product_id: editPrecursor.product_id ?? '',
                    name: editPrecursor.name,
                    precursor_cn_code: editPrecursor.precursor_cn_code ?? '',
                    aggregated_goods_category: editPrecursor.aggregated_goods_category,
                    production_route: editPrecursor.production_route,
                    supplier_country: editPrecursor.supplier_country ?? 'South Korea',
                    supplier_installation: editPrecursor.supplier_installation ?? '',
                    data_mode: editPrecursor.data_mode ?? 'ACTUAL',
                    verification_status: editPrecursor.verification_status ?? 'UNVERIFIED',
                    default_value_year: editPrecursor.default_value_year ?? '2026',
                    purchased_mass_t: editPrecursor.purchased_mass_t,
                    consumed_mass_t: editPrecursor.consumed_mass_t,
                    consumed_for_non_cbam_mass_t: editPrecursor.consumed_for_non_cbam_mass_t,
                    direct_see_tco2e_per_t: editPrecursor.direct_see_tco2e_per_t,
                    indirect_see_tco2e_per_t: editPrecursor.indirect_see_tco2e_per_t,
                    source: editPrecursor.source,
                    default_value_justification: editPrecursor.default_value_justification,
                });
                setEditingPrecursorId(editPrecursor.id);
                setShowForm(true);
            } else {
                setNewItem({
                    ...emptyDraft,
                    period_id: periodData[0]?.id ?? '',
                    process_id: processData[0]?.id ?? '',
                    product_id: productData[0]?.id ?? '',
                    precursor_cn_code: productData[0]?.cn_code ?? productData[0]?.hs_code ?? '',
                });
            }
            setLoading(false);
        }

        loadData();
    }, []);

    const periodNames = useMemo(() => new Map(periods.map((period) => [period.id, period.name])), [periods]);
    const processNames = useMemo(() => new Map(processes.map((process) => [process.id, process.name])), [processes]);
    const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);

    const summary = useMemo(() => {
        const consumedMass = precursors.reduce((sum, precursor) => sum + precursor.consumed_mass_t, 0);
        const totalSee = precursors.reduce(
            (sum, precursor) => sum + precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t,
            0
        );
        const defaultModeCount = precursors.filter((precursor) => precursor.data_mode === 'DEFAULT').length;
        const evidenceReviewCount = precursors.filter((precursor) => getPrecursorEvidenceIssues(precursor).length > 0).length;
        return { consumedMass, totalSee, defaultModeCount, evidenceReviewCount };
    }, [precursors]);

    function createDefaultDraft(): PrecursorDraft {
        return {
            ...emptyDraft,
            period_id: periods[0]?.id ?? '',
            process_id: processes[0]?.id ?? '',
            product_id: products[0]?.id ?? '',
            precursor_cn_code: products[0]?.cn_code ?? products[0]?.hs_code ?? '',
        };
    }

    function resetForm() {
        setNewItem(createDefaultDraft());
        setErrors({});
        setEditingPrecursorId(null);
        setShowForm(false);
    }

    function startNewPrecursor() {
        if (showForm && !editingPrecursorId) {
            resetForm();
            return;
        }

        setNewItem(createDefaultDraft());
        setEditingPrecursorId(null);
        setShowForm(true);
    }

    function startEditPrecursor(precursor: PurchasedPrecursor) {
        setNewItem({
            period_id: precursor.period_id ?? '',
            process_id: precursor.process_id ?? '',
            product_id: precursor.product_id ?? '',
            name: precursor.name,
            precursor_cn_code: precursor.precursor_cn_code ?? '',
            aggregated_goods_category: precursor.aggregated_goods_category,
            production_route: precursor.production_route,
            supplier_country: precursor.supplier_country ?? 'South Korea',
            supplier_installation: precursor.supplier_installation ?? '',
            data_mode: precursor.data_mode ?? 'ACTUAL',
            verification_status: precursor.verification_status ?? 'UNVERIFIED',
            default_value_year: precursor.default_value_year ?? '2026',
            purchased_mass_t: precursor.purchased_mass_t,
            consumed_mass_t: precursor.consumed_mass_t,
            consumed_for_non_cbam_mass_t: precursor.consumed_for_non_cbam_mass_t,
            direct_see_tco2e_per_t: precursor.direct_see_tco2e_per_t,
            indirect_see_tco2e_per_t: precursor.indirect_see_tco2e_per_t,
            source: precursor.source,
            default_value_justification: precursor.default_value_justification,
        });
        setErrors({});
        setEditingPrecursorId(precursor.id);
        setShowForm(true);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const nextErrors: PrecursorErrors = {};

        if (!newItem.name.trim()) {
            nextErrors.name = '전구물질명을 입력하세요.';
        }

        if (!newItem.aggregated_goods_category.trim()) {
            nextErrors.aggregated_goods_category = '통합 상품군을 입력하세요.';
        }

        if (!newItem.period_id) {
            nextErrors.period_id = '보고기간을 선택하세요.';
        }

        if (!newItem.process_id) {
            nextErrors.process_id = '소비 공정을 선택하세요.';
        }

        if (!newItem.product_id) {
            nextErrors.product_id = '연결 제품을 선택하세요.';
        }

        if (!newItem.precursor_cn_code?.trim() || !/^\d{4,10}$/.test(newItem.precursor_cn_code.trim())) {
            nextErrors.precursor_cn_code = '전구물질 CN/HS 코드를 숫자 4자리 이상으로 입력하세요.';
        }

        if (!newItem.supplier_country.trim()) {
            nextErrors.supplier_country = '공급국가를 입력하세요. 예: South Korea';
        }

        if (newItem.purchased_mass_t < 0) {
            nextErrors.purchased_mass_t = '구매량은 0 이상이어야 합니다.';
        }

        if (newItem.consumed_mass_t <= 0) {
            nextErrors.consumed_mass_t = '소비량은 0보다 커야 합니다.';
        }

        if (newItem.consumed_for_non_cbam_mass_t < 0) {
            nextErrors.consumed_for_non_cbam_mass_t = '비CBAM 용도는 0 이상이어야 합니다.';
        }

        if (newItem.direct_see_tco2e_per_t < 0) {
            nextErrors.direct_see_tco2e_per_t = '직접 SEE는 0 이상이어야 합니다.';
        }

        if (newItem.indirect_see_tco2e_per_t < 0) {
            nextErrors.indirect_see_tco2e_per_t = '간접 SEE는 0 이상이어야 합니다.';
        }

        if (!newItem.source.trim()) {
            nextErrors.source = '출처를 입력하세요. 예: 공급업체 회신, 기본값, 내부 산정자료';
        }

        if (newItem.data_mode === 'DEFAULT' && !newItem.default_value_justification.trim()) {
            nextErrors.default_value_justification = '기본값을 사용하는 사유 또는 기준자료 출처를 입력하세요.';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        if (editingPrecursorId) {
            const existingPrecursor = precursors.find((precursor) => precursor.id === editingPrecursorId);

            if (!existingPrecursor) {
                return;
            }

            const updatedPrecursor = await updateLocalItem('precursors', {
                ...existingPrecursor,
                ...newItem,
                name: newItem.name.trim(),
                precursor_cn_code: newItem.precursor_cn_code?.trim(),
                aggregated_goods_category: newItem.aggregated_goods_category.trim(),
                production_route: newItem.production_route.trim(),
                supplier_country: newItem.supplier_country.trim(),
                supplier_installation: newItem.supplier_installation.trim(),
                source: newItem.source.trim(),
                default_value_justification: newItem.default_value_justification.trim(),
                period_id: newItem.period_id || undefined,
                process_id: newItem.process_id || undefined,
                product_id: newItem.product_id || undefined,
            });
            setPrecursors(
                precursors.map((precursor) =>
                    precursor.id === updatedPrecursor.id ? updatedPrecursor : precursor
                )
            );
            resetForm();
            return;
        }

        const precursor = await createLocalItem('precursors', {
            ...newItem,
            name: newItem.name.trim(),
            precursor_cn_code: newItem.precursor_cn_code?.trim(),
            aggregated_goods_category: newItem.aggregated_goods_category.trim(),
            production_route: newItem.production_route.trim(),
            supplier_country: newItem.supplier_country.trim(),
            supplier_installation: newItem.supplier_installation.trim(),
            source: newItem.source.trim(),
            default_value_justification: newItem.default_value_justification.trim(),
            period_id: newItem.period_id || undefined,
            process_id: newItem.process_id || undefined,
            product_id: newItem.product_id || undefined,
        });

        setPrecursors([precursor, ...precursors]);
        resetForm();
    }

    async function handleDeletePrecursor(precursor: PurchasedPrecursor) {
        const confirmed = window.confirm(
            `'${precursor.name}' 전구물질을 삭제할까요? 이 항목은 산정결과와 EU Export 미리보기에서 제외됩니다.`
        );

        if (!confirmed) {
            return;
        }

        await deleteLocalItem('precursors', precursor.id);
        setPrecursors(precursors.filter((item) => item.id !== precursor.id));
        if (editingPrecursorId === precursor.id) {
            resetForm();
        }
    }

    function applyDefaultValueFromReference() {
        const match = findDefaultValueReference(
            defaultValueReference,
            newItem.supplier_country,
            newItem.precursor_cn_code ?? '',
            newItem.default_value_year
        );

        if (!match) {
            setDefaultLookupMessage('일치하는 국가/CN 기본값을 찾지 못했습니다. 공식 기본값 파일을 가져왔는지와 전구물질 CN 코드를 확인하세요.');
            return;
        }

        const totalDefault = getDefaultValueTotalForYear(match, newItem.default_value_year);
        setNewItem({
            ...newItem,
            name: newItem.name || match.description,
            direct_see_tco2e_per_t: match.direct_default ?? 0,
            indirect_see_tco2e_per_t: Math.max(0, (totalDefault ?? match.total_default ?? 0) - (match.direct_default ?? 0)),
            data_mode: 'DEFAULT',
            verification_status: 'UNVERIFIED',
            source: `${defaultValueReference?.summary.filename ?? 'DVsasadopted'} / ${match.country} / ${match.cn_code}`,
            default_value_justification:
                newItem.default_value_justification ||
                `${newItem.default_value_year} 국가/CN 기본값 적용: ${match.country}, CN ${match.cn_code}`,
        });
        setDefaultLookupMessage(`기본값을 적용했습니다: ${match.country} CN ${match.cn_code}, 총 ${formatNumber(totalDefault ?? match.total_default ?? 0)} tCO2e/t`);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="E_PurchPrec"
                title="구매 전구물질"
                description="EU 템플릿의 E_PurchPrec 입력 구조에 맞춰 구매 전구물질의 소비량과 내재배출량(SEE)을 관리합니다."
                actions={
                    <Button type="button" onClick={startNewPrecursor}>
                        <Plus className="mr-2 h-4 w-4" />
                        전구물질 추가
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="등록 전구물질" value={precursors.length} helper="E_PurchPrec 후보" icon={Boxes} tone="info" />
                <StatCard label="총 소비량" value={formatNumber(summary.consumedMass)} helper="tonne" icon={Scale} tone="success" />
                <StatCard label="기본값 사용" value={summary.defaultModeCount} helper={`SEE 합계 ${formatNumber(summary.totalSee)}`} icon={Factory} tone={summary.defaultModeCount > 0 ? 'warning' : 'pending'} />
                <StatCard label="증빙 검토" value={summary.evidenceReviewCount} helper="사유·출처·검증 상태" icon={Factory} tone={summary.evidenceReviewCount > 0 ? 'warning' : 'success'} />
            </div>

            {showForm && (
                <SectionCard
                    title={editingPrecursorId ? '전구물질 정보 수정' : '신규 구매 전구물질'}
                    description="공급업체 회신 또는 기본값 사용 근거를 함께 관리하세요."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label htmlFor="precursor-name" className="text-sm font-semibold text-slate-700">전구물질명</label>
                            <input id="precursor-name" required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-goods-category" className="text-sm font-semibold text-slate-700">통합 상품군(Aggregated Goods)</label>
                            <input id="precursor-goods-category" required className={fieldClass} value={newItem.aggregated_goods_category} onChange={(event) => setNewItem({ ...newItem, aggregated_goods_category: event.target.value })} />
                            {errors.aggregated_goods_category && <p className="mt-1 text-xs font-medium text-red-600">{errors.aggregated_goods_category}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-route" className="text-sm font-semibold text-slate-700">생산경로(Route)</label>
                            <input id="precursor-route" className={fieldClass} value={newItem.production_route} onChange={(event) => setNewItem({ ...newItem, production_route: event.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-cn-code" className="text-sm font-semibold text-slate-700">전구물질 CN/HS 코드</label>
                            <input
                                id="precursor-cn-code"
                                inputMode="numeric"
                                className={fieldClass}
                                value={newItem.precursor_cn_code ?? ''}
                                onChange={(event) => setNewItem({ ...newItem, precursor_cn_code: event.target.value.replace(/\D/g, '').slice(0, 10) })}
                                placeholder="예: 72083900"
                            />
                            {errors.precursor_cn_code && <p className="mt-1 text-xs font-medium text-red-600">{errors.precursor_cn_code}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-data-mode" className="text-sm font-semibold text-slate-700">데이터 모드</label>
                            <select id="precursor-data-mode" className={fieldClass} value={newItem.data_mode} onChange={(event) => setNewItem({ ...newItem, data_mode: event.target.value as PrecursorDraft['data_mode'] })}>
                                <option value="ACTUAL">실측/공급사 회신</option>
                                <option value="SEMI_ACTUAL">혼합</option>
                                <option value="DEFAULT">공식 기본값</option>
                            </select>
                        </div>
                        <div>
                            <label htmlFor="precursor-verification" className="text-sm font-semibold text-slate-700">검증 상태</label>
                            <select id="precursor-verification" className={fieldClass} value={newItem.verification_status} onChange={(event) => setNewItem({ ...newItem, verification_status: event.target.value as PrecursorDraft['verification_status'] })}>
                                <option value="UNVERIFIED">미검증</option>
                                <option value="SUPPLIER_CONFIRMED">공급사 확인</option>
                                <option value="VERIFIED">검증완료</option>
                            </select>
                        </div>
                        {newItem.data_mode !== 'DEFAULT' && newItem.verification_status === 'UNVERIFIED' && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-3">
                                <p className="font-semibold">실측자료 검증 상태를 확인하세요</p>
                                <p className="mt-2 text-amber-900">
                                    실측/혼합 전구물질 자료가 미검증 상태입니다. 공급사 회신, 검증 문서, 내부 확인 근거 중 어떤 자료로 확인했는지 정리해 두세요.
                                </p>
                            </div>
                        )}
                        {newItem.data_mode === 'DEFAULT' && !newItem.default_value_justification.trim() && (
                            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 md:col-span-3">
                                <p className="font-semibold">기본값 사용 근거가 필요합니다</p>
                                <p className="mt-2 text-amber-900">
                                    공식 기본값을 사용하는 경우 적용연도, 국가/CN 코드, 기준자료 파일명을 사유에 남겨야 Export 전 검토가 쉬워집니다.
                                </p>
                            </div>
                        )}
                        <div>
                            <label htmlFor="precursor-period" className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select id="precursor-period" className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                            {errors.period_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.period_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-process" className="text-sm font-semibold text-slate-700">소비 공정</label>
                            <select id="precursor-process" className={fieldClass} value={newItem.process_id} onChange={(event) => setNewItem({ ...newItem, process_id: event.target.value })}>
                                <option value="">미지정</option>
                                {processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
                            </select>
                            {errors.process_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.process_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-product" className="text-sm font-semibold text-slate-700">연결 제품</label>
                            <select id="precursor-product" className={fieldClass} value={newItem.product_id} onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}>
                                <option value="">미지정</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>)}
                            </select>
                            {errors.product_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.product_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-country" className="text-sm font-semibold text-slate-700">공급국가</label>
                            <input id="precursor-country" className={fieldClass} value={newItem.supplier_country} onChange={(event) => setNewItem({ ...newItem, supplier_country: event.target.value })} placeholder="예: South Korea" />
                            {errors.supplier_country && <p className="mt-1 text-xs font-medium text-red-600">{errors.supplier_country}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-supplier-installation" className="text-sm font-semibold text-slate-700">공급사/사업장</label>
                            <input id="precursor-supplier-installation" className={fieldClass} value={newItem.supplier_installation} onChange={(event) => setNewItem({ ...newItem, supplier_installation: event.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-default-year" className="text-sm font-semibold text-slate-700">기본값 적용연도</label>
                            <select id="precursor-default-year" className={fieldClass} value={newItem.default_value_year} onChange={(event) => setNewItem({ ...newItem, default_value_year: event.target.value as PrecursorDraft['default_value_year'] })}>
                                <option value="2026">2026</option>
                                <option value="2027">2027</option>
                                <option value="2028_ONWARDS">2028년 이후</option>
                            </select>
                        </div>
                        <div className="rounded-xl border border-teal-100 bg-teal-50 p-4 md:col-span-3">
                            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                <div>
                                    <p className="text-sm font-semibold text-teal-950">공식 기본값 조회</p>
                                    <p className="mt-1 text-xs leading-5 text-teal-800">
                                        자료 업로드 화면에서 가져온 국가/CN 기본값 파일을 기준으로 직접 SEE와 총 기본값을 적용합니다.
                                    </p>
                                </div>
                                <Button type="button" variant="secondary" onClick={applyDefaultValueFromReference}>
                                    기본값 적용
                                </Button>
                            </div>
                            {defaultLookupMessage && <p className="mt-3 text-xs font-medium text-teal-900">{defaultLookupMessage}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-purchased-mass" className="text-sm font-semibold text-slate-700">구매량(t)</label>
                            <input id="precursor-purchased-mass" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.purchased_mass_t} onChange={(event) => setNewItem({ ...newItem, purchased_mass_t: toNumber(event.target.value) })} />
                            {errors.purchased_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.purchased_mass_t}</p>}
                        </div>
                        <div>
                            <label htmlFor="precursor-consumed-mass" className="text-sm font-semibold text-slate-700">소비량(t)</label>
                            <input id="precursor-consumed-mass" required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.consumed_mass_t} onChange={(event) => setNewItem({ ...newItem, consumed_mass_t: toNumber(event.target.value) })} />
                            {errors.consumed_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.consumed_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">비CBAM 용도(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.consumed_for_non_cbam_mass_t} onChange={(event) => setNewItem({ ...newItem, consumed_for_non_cbam_mass_t: toNumber(event.target.value) })} />
                            {errors.consumed_for_non_cbam_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.consumed_for_non_cbam_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">직접 SEE(tCO2e/t)</label>
                            <input required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.direct_see_tco2e_per_t} onChange={(event) => setNewItem({ ...newItem, direct_see_tco2e_per_t: toNumber(event.target.value) })} />
                            {errors.direct_see_tco2e_per_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.direct_see_tco2e_per_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">간접 SEE(tCO2e/t)</label>
                            <input required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.indirect_see_tco2e_per_t} onChange={(event) => setNewItem({ ...newItem, indirect_see_tco2e_per_t: toNumber(event.target.value) })} />
                            {errors.indirect_see_tco2e_per_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.indirect_see_tco2e_per_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">출처</label>
                            <input className={fieldClass} value={newItem.source} onChange={(event) => setNewItem({ ...newItem, source: event.target.value })} placeholder="예: Supplier communication template" />
                            {errors.source && <p className="mt-1 text-xs font-medium text-red-600">{errors.source}</p>}
                        </div>
                        <div className="md:col-span-3">
                            <label className="text-sm font-semibold text-slate-700">기본값 사용 사유</label>
                            <textarea
                                rows={3}
                                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                                value={newItem.default_value_justification}
                                onChange={(event) => setNewItem({ ...newItem, default_value_justification: event.target.value })}
                            />
                            {errors.default_value_justification && <p className="mt-1 text-xs font-medium text-red-600">{errors.default_value_justification}</p>}
                        </div>
                        <div className="md:col-span-3">
                            <Button type="submit">{editingPrecursorId ? '수정 저장' : '전구물질 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {precursors.map((precursor) => {
                    const totalSee = precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;
                    const evidenceIssues = getPrecursorEvidenceIssues(precursor);
                    return (
                        <SectionCard key={precursor.id} className="p-4">
                            <h2 className="text-base font-semibold text-slate-950">{precursor.name}</h2>
                            <p className="mt-1 text-sm text-slate-500">{precursor.aggregated_goods_category}</p>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">소비 공정</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{precursor.process_id ? processNames.get(precursor.process_id) ?? '알 수 없음' : '-'}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">소비량</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(precursor.consumed_mass_t)}t</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">데이터 모드</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{getDataModeLabel(precursor.data_mode)}</dd>
                                </div>
                                <div className={evidenceIssues.length > 0 ? 'rounded-xl bg-amber-50 p-3' : 'rounded-xl bg-slate-50 p-3'}>
                                    <dt className={evidenceIssues.length > 0 ? 'text-xs text-amber-700' : 'text-xs text-slate-500'}>증빙 상태</dt>
                                    <dd className={evidenceIssues.length > 0 ? 'mt-1 font-semibold text-amber-800' : 'mt-1 font-medium text-slate-900'}>
                                        {evidenceIssues.length > 0 ? evidenceIssues[0] : '확인 완료'}
                                    </dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">공급국가</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{precursor.supplier_country || '-'}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">직접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(precursor.direct_see_tco2e_per_t)}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">총 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(totalSee)}</dd>
                                </div>
                            </dl>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Button type="button" variant="secondary" onClick={() => startEditPrecursor(precursor)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    수정
                                </Button>
                                <Button type="button" variant="danger" onClick={() => handleDeletePrecursor(precursor)}>
                                    <Trash2 className="mr-2 h-4 w-4" />
                                    삭제
                                </Button>
                            </div>
                        </SectionCard>
                    );
                })}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">전구물질</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">모드</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공급국가</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">소비량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">총 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={11} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : precursors.length === 0 ? (
                            <tr><td colSpan={11} className="p-6 text-center text-sm text-slate-500">등록된 구매 전구물질이 없습니다.</td></tr>
                        ) : (
                            precursors.map((precursor) => {
                                const totalSee = precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;
                                const evidenceIssues = getPrecursorEvidenceIssues(precursor);
                                return (
                                    <tr key={precursor.id} className="transition hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{precursor.name}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.process_id ? processNames.get(precursor.process_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.period_id ? periodNames.get(precursor.period_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.product_id ? productNames.get(precursor.product_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            <StatusBadge tone={precursor.data_mode === 'DEFAULT' ? 'warning' : precursor.data_mode === 'SEMI_ACTUAL' ? 'pending' : 'success'}>
                                                {getDataModeLabel(precursor.data_mode)}
                                            </StatusBadge>
                                            <div className="mt-1 text-xs text-slate-400">{getVerificationLabel(precursor.verification_status)}</div>
                                            {evidenceIssues.length > 0 && (
                                                <div className="mt-1 text-xs font-semibold text-amber-700">
                                                    {evidenceIssues.join(' / ')}
                                                </div>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            {precursor.supplier_country || '-'}
                                            {precursor.precursor_cn_code && <div className="mt-1 text-xs text-slate-400">CN {precursor.precursor_cn_code}</div>}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(precursor.consumed_mass_t)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(precursor.direct_see_tco2e_per_t)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(precursor.indirect_see_tco2e_per_t)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(totalSee)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditPrecursor(precursor)}>
                                                    <Pencil className="mr-1.5 h-4 w-4" />
                                                    수정
                                                </Button>
                                                <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => handleDeletePrecursor(precursor)}>
                                                    <Trash2 className="mr-1.5 h-4 w-4" />
                                                    삭제
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
