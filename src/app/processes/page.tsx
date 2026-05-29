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
import { Factory, Gauge, Pencil, Plus, Trash2, X, Zap } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ProcessDraft = Omit<ProductionProcess, 'id' | 'created_at' | 'updated_at'>;
type ProcessErrors = Partial<Record<keyof ProcessDraft, string>>;

const emptyDraft: ProcessDraft = {
    period_id: '',
    product_id: '',
    name: '',
    production_route: '',
    output_mass_t: 0,
    market_output_mass_t: 0,
    internal_consumption_mass_t: 0,
    direct_attributable_emissions_tco2e: 0,
    electricity_mwh: 0,
    electricity_ef_tco2e_per_mwh: 0.47,
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

export default function ProcessesPage() {
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProcessId, setEditingProcessId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<ProcessDraft>(emptyDraft);
    const [errors, setErrors] = useState<ProcessErrors>({});

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await seedLocalData();
            const [processData, productData, periodData, precursorData] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('precursors'),
            ]);

            setProcesses(processData.sort((a, b) => b.created_at.localeCompare(a.created_at)));
            setPrecursors(precursorData);
            setProducts(productData.sort((a, b) => a.name.localeCompare(b.name)));
            setPeriods(periodData.sort((a, b) => b.start_date.localeCompare(a.start_date)));
            setNewItem({
                ...emptyDraft,
                product_id: productData[0]?.id ?? '',
                period_id: periodData[0]?.id ?? '',
            });
            setLoading(false);
        }

        loadData();
    }, []);

    const productNames = useMemo(() => new Map(products.map((product) => [product.id, product.name])), [products]);
    const periodNames = useMemo(() => new Map(periods.map((period) => [period.id, period.name])), [periods]);

    const summary = useMemo(() => {
        const totalOutput = processes.reduce((sum, process) => sum + process.output_mass_t, 0);
        const totalElectricity = processes.reduce((sum, process) => sum + process.electricity_mwh, 0);
        return { totalOutput, totalElectricity };
    }, [processes]);

    function createDefaultDraft(): ProcessDraft {
        return {
            ...emptyDraft,
            product_id: products[0]?.id ?? '',
            period_id: periods[0]?.id ?? '',
        };
    }

    function resetForm() {
        setNewItem(createDefaultDraft());
        setErrors({});
        setEditingProcessId(null);
        setShowForm(false);
    }

    function startNewProcess() {
        if (showForm && !editingProcessId) {
            resetForm();
            return;
        }

        setNewItem(createDefaultDraft());
        setEditingProcessId(null);
        setShowForm(true);
    }

    function startEditProcess(process: ProductionProcess) {
        setNewItem({
            period_id: process.period_id ?? '',
            product_id: process.product_id ?? '',
            name: process.name,
            production_route: process.production_route,
            output_mass_t: process.output_mass_t,
            market_output_mass_t: process.market_output_mass_t,
            internal_consumption_mass_t: process.internal_consumption_mass_t,
            direct_attributable_emissions_tco2e: process.direct_attributable_emissions_tco2e,
            electricity_mwh: process.electricity_mwh,
            electricity_ef_tco2e_per_mwh: process.electricity_ef_tco2e_per_mwh,
        });
        setErrors({});
        setEditingProcessId(process.id);
        setShowForm(true);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        const nextErrors: ProcessErrors = {};

        if (!newItem.name.trim()) {
            nextErrors.name = '공정명을 입력하세요.';
        }

        if (!newItem.production_route.trim()) {
            nextErrors.production_route = '생산경로를 입력하세요.';
        }

        if (!newItem.period_id) {
            nextErrors.period_id = '보고기간을 선택하세요.';
        }

        if (!newItem.product_id) {
            nextErrors.product_id = '연결 제품을 선택하세요.';
        }

        if (newItem.output_mass_t <= 0) {
            nextErrors.output_mass_t = '총 생산량은 0보다 커야 합니다.';
        }

        if (newItem.market_output_mass_t < 0) {
            nextErrors.market_output_mass_t = '시장 출하량은 0 이상이어야 합니다.';
        }

        if (newItem.internal_consumption_mass_t < 0) {
            nextErrors.internal_consumption_mass_t = '내부 소비량은 0 이상이어야 합니다.';
        }

        if (newItem.direct_attributable_emissions_tco2e < 0) {
            nextErrors.direct_attributable_emissions_tco2e = '직접귀속배출량은 0 이상이어야 합니다.';
        }

        if (newItem.electricity_mwh < 0) {
            nextErrors.electricity_mwh = '전력 사용량은 0 이상이어야 합니다.';
        }

        if (newItem.electricity_ef_tco2e_per_mwh < 0) {
            nextErrors.electricity_ef_tco2e_per_mwh = '전력 배출계수는 0 이상이어야 합니다.';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        if (editingProcessId) {
            const existingProcess = processes.find((process) => process.id === editingProcessId);

            if (!existingProcess) {
                return;
            }

            const updatedProcess = await updateLocalItem('processes', {
                ...existingProcess,
                ...newItem,
                name: newItem.name.trim(),
                production_route: newItem.production_route.trim(),
                period_id: newItem.period_id || undefined,
                product_id: newItem.product_id || undefined,
            });
            setProcesses(processes.map((process) => (process.id === updatedProcess.id ? updatedProcess : process)));
            resetForm();
            return;
        }

        const process = await createLocalItem('processes', {
            ...newItem,
            name: newItem.name.trim(),
            production_route: newItem.production_route.trim(),
            period_id: newItem.period_id || undefined,
            product_id: newItem.product_id || undefined,
        });

        setProcesses([process, ...processes]);
        resetForm();
    }

    function getSee(process: ProductionProcess) {
        const directSee =
            process.output_mass_t > 0 ? process.direct_attributable_emissions_tco2e / process.output_mass_t : 0;
        const indirectSee =
            process.output_mass_t > 0
                ? (process.electricity_mwh * process.electricity_ef_tco2e_per_mwh) / process.output_mass_t
                : 0;
        return { directSee, indirectSee };
    }

    async function handleDeleteProcess(process: ProductionProcess) {
        const linkedPrecursors = precursors.filter((precursor) => precursor.process_id === process.id);

        if (linkedPrecursors.length > 0) {
            window.alert(
                [
                    '이 생산공정은 전구물질 데이터에 연결되어 있어 삭제할 수 없습니다.',
                    '',
                    `연결된 전구물질: ${linkedPrecursors.length}건`,
                    '',
                    '먼저 전구물질 데이터를 수정하거나 삭제한 뒤 다시 시도하세요.',
                ].join('\n')
            );
            return;
        }

        const confirmed = window.confirm(`'${process.name}' 생산공정을 삭제할까요? 산정결과와 Export 미리보기에서도 제외됩니다.`);

        if (!confirmed) {
            return;
        }

        await deleteLocalItem('processes', process.id);
        setProcesses(processes.filter((item) => item.id !== process.id));
        if (editingProcessId === process.id) {
            resetForm();
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="D_Processes"
                title="생산공정"
                description="EU 템플릿의 D_Processes 입력 구조에 맞춰 공정별 생산량, 직접귀속배출, 전력 사용량을 관리합니다."
                actions={
                    <Button type="button" onClick={startNewProcess}>
                        <Plus className="mr-2 h-4 w-4" />
                        공정 추가
                    </Button>
                }
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label="등록 공정" value={processes.length} helper="D_Processes 후보" icon={Factory} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={Gauge} tone="success" />
                <StatCard label="전력 사용량" value={formatNumber(summary.totalElectricity)} helper="MWh" icon={Zap} tone="warning" />
            </div>

            {showForm && (
                <SectionCard
                    title={editingProcessId ? '생산공정 정보 수정' : '신규 생산공정'}
                    description="공정별 생산량과 배출량 데이터를 입력하면 산정결과와 EU Export에 반영됩니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label htmlFor="process-name" className="text-sm font-semibold text-slate-700">공정명</label>
                            <input id="process-name" required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-route" className="text-sm font-semibold text-slate-700">생산경로(Route)</label>
                            <input id="process-route" required className={fieldClass} value={newItem.production_route} onChange={(event) => setNewItem({ ...newItem, production_route: event.target.value })} />
                            {errors.production_route && <p className="mt-1 text-xs font-medium text-red-600">{errors.production_route}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-period" className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select id="process-period" className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                            {errors.period_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.period_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-product" className="text-sm font-semibold text-slate-700">연결 제품</label>
                            <select id="process-product" className={fieldClass} value={newItem.product_id} onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}>
                                <option value="">미지정</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>)}
                            </select>
                            {errors.product_id && <p className="mt-1 text-xs font-medium text-red-600">{errors.product_id}</p>}
                        </div>
                        <div>
                            <label htmlFor="process-output-mass" className="text-sm font-semibold text-slate-700">총 생산량(t)</label>
                            <input id="process-output-mass" required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.output_mass_t} onChange={(event) => setNewItem({ ...newItem, output_mass_t: toNumber(event.target.value) })} />
                            {errors.output_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.output_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">시장 출하량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.market_output_mass_t} onChange={(event) => setNewItem({ ...newItem, market_output_mass_t: toNumber(event.target.value) })} />
                            {errors.market_output_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.market_output_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">내부 소비량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.internal_consumption_mass_t} onChange={(event) => setNewItem({ ...newItem, internal_consumption_mass_t: toNumber(event.target.value) })} />
                            {errors.internal_consumption_mass_t && <p className="mt-1 text-xs font-medium text-red-600">{errors.internal_consumption_mass_t}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">직접귀속배출량(tCO2e)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.direct_attributable_emissions_tco2e} onChange={(event) => setNewItem({ ...newItem, direct_attributable_emissions_tco2e: toNumber(event.target.value) })} />
                            {errors.direct_attributable_emissions_tco2e && <p className="mt-1 text-xs font-medium text-red-600">{errors.direct_attributable_emissions_tco2e}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 사용량(MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_mwh: toNumber(event.target.value) })} />
                            {errors.electricity_mwh && <p className="mt-1 text-xs font-medium text-red-600">{errors.electricity_mwh}</p>}
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 배출계수(tCO2e/MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_ef_tco2e_per_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_ef_tco2e_per_mwh: toNumber(event.target.value) })} />
                            {errors.electricity_ef_tco2e_per_mwh && <p className="mt-1 text-xs font-medium text-red-600">{errors.electricity_ef_tco2e_per_mwh}</p>}
                        </div>
                        <div className="md:col-span-3">
                            <Button type="submit">{editingProcessId ? '수정 저장' : '공정 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {processes.map((process) => {
                    const see = getSee(process);
                    return (
                        <SectionCard key={process.id} className="p-4">
                            <h2 className="text-base font-semibold text-slate-950">{process.name}</h2>
                            <p className="mt-1 text-sm text-slate-500">{process.production_route}</p>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">제품</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{process.product_id ? productNames.get(process.product_id) ?? '알 수 없음' : '-'}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">생산량</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(process.output_mass_t)}t</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">직접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(see.directSee)}</dd>
                                </div>
                                <div className="rounded-xl bg-slate-50 p-3">
                                    <dt className="text-xs text-slate-500">간접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(see.indirectSee)}</dd>
                                </div>
                            </dl>
                            <div className="mt-4 grid grid-cols-2 gap-2">
                                <Button type="button" variant="secondary" onClick={() => startEditProcess(process)}>
                                    <Pencil className="mr-2 h-4 w-4" />
                                    수정
                                </Button>
                                <Button type="button" variant="danger" onClick={() => handleDeleteProcess(process)}>
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
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">경로</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={8} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : processes.length === 0 ? (
                            <tr><td colSpan={8} className="p-6 text-center text-sm text-slate-500">등록된 생산공정이 없습니다.</td></tr>
                        ) : (
                            processes.map((process) => {
                                const see = getSee(process);
                                return (
                                    <tr key={process.id} className="transition hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{process.name}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.production_route}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.period_id ? periodNames.get(process.period_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{process.product_id ? productNames.get(process.product_id) ?? '알 수 없음' : '-'}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(process.output_mass_t)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(see.directSee)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(see.indirectSee)}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditProcess(process)}>
                                                    <Pencil className="mr-1.5 h-4 w-4" />
                                                    수정
                                                </Button>
                                                <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" onClick={() => handleDeleteProcess(process)}>
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
