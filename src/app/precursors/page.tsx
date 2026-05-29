'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard } from '@/components/ui';
import {
    createLocalItem,
    deleteLocalItem,
    listLocalItems,
    Product,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    seedLocalData,
    updateLocalItem,
} from '@/lib/local-db';
import { Boxes, Factory, Pencil, Plus, Scale, Trash2, X } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type PrecursorDraft = Omit<PurchasedPrecursor, 'id' | 'created_at' | 'updated_at'>;

const emptyDraft: PrecursorDraft = {
    period_id: '',
    process_id: '',
    product_id: '',
    name: '',
    aggregated_goods_category: 'Iron or steel products',
    production_route: '',
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

export default function PrecursorsPage() {
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingPrecursorId, setEditingPrecursorId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<PrecursorDraft>(emptyDraft);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await seedLocalData();
            const [precursorData, periodData, processData, productData] = await Promise.all([
                listLocalItems('precursors'),
                listLocalItems('periods'),
                listLocalItems('processes'),
                listLocalItems('products'),
            ]);

            setPrecursors(precursorData.sort((a, b) => b.created_at.localeCompare(a.created_at)));
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            setProcesses(processData.sort((a, b) => a.name.localeCompare(b.name)));
            setProducts(productData.sort((a, b) => a.name.localeCompare(b.name)));
            setNewItem({
                ...emptyDraft,
                period_id: periodData[0]?.id ?? '',
                process_id: processData[0]?.id ?? '',
                product_id: productData[0]?.id ?? '',
            });
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
        return { consumedMass, totalSee };
    }, [precursors]);

    function createDefaultDraft(): PrecursorDraft {
        return {
            ...emptyDraft,
            period_id: periods[0]?.id ?? '',
            process_id: processes[0]?.id ?? '',
            product_id: products[0]?.id ?? '',
        };
    }

    function resetForm() {
        setNewItem(createDefaultDraft());
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
            aggregated_goods_category: precursor.aggregated_goods_category,
            production_route: precursor.production_route,
            purchased_mass_t: precursor.purchased_mass_t,
            consumed_mass_t: precursor.consumed_mass_t,
            consumed_for_non_cbam_mass_t: precursor.consumed_for_non_cbam_mass_t,
            direct_see_tco2e_per_t: precursor.direct_see_tco2e_per_t,
            indirect_see_tco2e_per_t: precursor.indirect_see_tco2e_per_t,
            source: precursor.source,
            default_value_justification: precursor.default_value_justification,
        });
        setEditingPrecursorId(precursor.id);
        setShowForm(true);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        if (editingPrecursorId) {
            const existingPrecursor = precursors.find((precursor) => precursor.id === editingPrecursorId);

            if (!existingPrecursor) {
                return;
            }

            const updatedPrecursor = await updateLocalItem('precursors', {
                ...existingPrecursor,
                ...newItem,
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

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label="등록 전구물질" value={precursors.length} helper="E_PurchPrec 후보" icon={Boxes} tone="info" />
                <StatCard label="총 소비량" value={formatNumber(summary.consumedMass)} helper="tonne" icon={Scale} tone="success" />
                <StatCard label="SEE 합계" value={formatNumber(summary.totalSee)} helper="직접 + 간접" icon={Factory} tone="warning" />
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
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label htmlFor="precursor-name" className="text-sm font-semibold text-slate-700">전구물질명</label>
                            <input id="precursor-name" required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-goods-category" className="text-sm font-semibold text-slate-700">통합 상품군(Aggregated Goods)</label>
                            <input id="precursor-goods-category" required className={fieldClass} value={newItem.aggregated_goods_category} onChange={(event) => setNewItem({ ...newItem, aggregated_goods_category: event.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-route" className="text-sm font-semibold text-slate-700">생산경로(Route)</label>
                            <input id="precursor-route" className={fieldClass} value={newItem.production_route} onChange={(event) => setNewItem({ ...newItem, production_route: event.target.value })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-period" className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select id="precursor-period" className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="precursor-process" className="text-sm font-semibold text-slate-700">소비 공정</label>
                            <select id="precursor-process" className={fieldClass} value={newItem.process_id} onChange={(event) => setNewItem({ ...newItem, process_id: event.target.value })}>
                                <option value="">미지정</option>
                                {processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="precursor-product" className="text-sm font-semibold text-slate-700">연결 제품</label>
                            <select id="precursor-product" className={fieldClass} value={newItem.product_id} onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}>
                                <option value="">미지정</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>)}
                            </select>
                        </div>
                        <div>
                            <label htmlFor="precursor-purchased-mass" className="text-sm font-semibold text-slate-700">구매량(t)</label>
                            <input id="precursor-purchased-mass" type="number" min="0" step="0.0001" className={fieldClass} value={newItem.purchased_mass_t} onChange={(event) => setNewItem({ ...newItem, purchased_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label htmlFor="precursor-consumed-mass" className="text-sm font-semibold text-slate-700">소비량(t)</label>
                            <input id="precursor-consumed-mass" required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.consumed_mass_t} onChange={(event) => setNewItem({ ...newItem, consumed_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">비CBAM 용도(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.consumed_for_non_cbam_mass_t} onChange={(event) => setNewItem({ ...newItem, consumed_for_non_cbam_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">직접 SEE(tCO2e/t)</label>
                            <input required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.direct_see_tco2e_per_t} onChange={(event) => setNewItem({ ...newItem, direct_see_tco2e_per_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">간접 SEE(tCO2e/t)</label>
                            <input required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.indirect_see_tco2e_per_t} onChange={(event) => setNewItem({ ...newItem, indirect_see_tco2e_per_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">출처</label>
                            <input className={fieldClass} value={newItem.source} onChange={(event) => setNewItem({ ...newItem, source: event.target.value })} placeholder="예: Supplier communication template" />
                        </div>
                        <div className="md:col-span-3">
                            <label className="text-sm font-semibold text-slate-700">기본값 사용 사유</label>
                            <textarea
                                rows={3}
                                className="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                                value={newItem.default_value_justification}
                                onChange={(event) => setNewItem({ ...newItem, default_value_justification: event.target.value })}
                            />
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
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">소비량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">총 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={9} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : precursors.length === 0 ? (
                            <tr><td colSpan={9} className="p-6 text-center text-sm text-slate-500">등록된 구매 전구물질이 없습니다.</td></tr>
                        ) : (
                            precursors.map((precursor) => {
                                const totalSee = precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;
                                return (
                                    <tr key={precursor.id} className="transition hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{precursor.name}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.process_id ? processNames.get(precursor.process_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.period_id ? periodNames.get(precursor.period_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{precursor.product_id ? productNames.get(precursor.product_id) ?? '알 수 없음' : '-'}</td>
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
