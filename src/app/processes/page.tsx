'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard } from '@/components/ui';
import {
    createLocalItem,
    listLocalItems,
    Product,
    ProductionProcess,
    ReportingPeriod,
    seedLocalData,
} from '@/lib/local-db';
import { Factory, Gauge, Plus, Zap } from 'lucide-react';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ProcessDraft = Omit<ProductionProcess, 'id' | 'created_at' | 'updated_at'>;

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
    const [products, setProducts] = useState<Product[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState<ProcessDraft>(emptyDraft);

    useEffect(() => {
        async function loadData() {
            setLoading(true);
            await seedLocalData();
            const [processData, productData, periodData] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('products'),
                listLocalItems('periods'),
            ]);

            setProcesses(processData.sort((a, b) => b.created_at.localeCompare(a.created_at)));
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

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        const process = await createLocalItem('processes', {
            ...newItem,
            period_id: newItem.period_id || undefined,
            product_id: newItem.product_id || undefined,
        });

        setProcesses([process, ...processes]);
        setNewItem({
            ...emptyDraft,
            product_id: products[0]?.id ?? '',
            period_id: periods[0]?.id ?? '',
        });
        setShowForm(false);
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

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="D_Processes"
                title="생산공정"
                description="EU 템플릿의 D_Processes 입력 구조에 맞춰 공정별 생산량, 직접귀속배출, 전력 사용량을 관리합니다."
                actions={
                    <Button type="button" onClick={() => setShowForm(!showForm)}>
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
                <SectionCard title="신규 생산공정" description="공정별 생산량과 배출량 데이터를 입력하면 산정결과와 EU Export에 반영됩니다.">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="text-sm font-semibold text-slate-700">공정명</label>
                            <input required className={fieldClass} value={newItem.name} onChange={(event) => setNewItem({ ...newItem, name: event.target.value })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">생산경로(Route)</label>
                            <input required className={fieldClass} value={newItem.production_route} onChange={(event) => setNewItem({ ...newItem, production_route: event.target.value })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">보고기간</label>
                            <select className={fieldClass} value={newItem.period_id} onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}>
                                <option value="">미지정</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">연결 제품</label>
                            <select className={fieldClass} value={newItem.product_id} onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}>
                                <option value="">미지정</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name} ({product.hs_code})</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">총 생산량(t)</label>
                            <input required type="number" min="0" step="0.0001" className={fieldClass} value={newItem.output_mass_t} onChange={(event) => setNewItem({ ...newItem, output_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">시장 출하량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.market_output_mass_t} onChange={(event) => setNewItem({ ...newItem, market_output_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">내부 소비량(t)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.internal_consumption_mass_t} onChange={(event) => setNewItem({ ...newItem, internal_consumption_mass_t: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">직접귀속배출량(tCO2e)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.direct_attributable_emissions_tco2e} onChange={(event) => setNewItem({ ...newItem, direct_attributable_emissions_tco2e: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 사용량(MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_mwh: toNumber(event.target.value) })} />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">전력 배출계수(tCO2e/MWh)</label>
                            <input type="number" min="0" step="0.0001" className={fieldClass} value={newItem.electricity_ef_tco2e_per_mwh} onChange={(event) => setNewItem({ ...newItem, electricity_ef_tco2e_per_mwh: toNumber(event.target.value) })} />
                        </div>
                        <div className="md:col-span-3">
                            <Button type="submit">공정 저장</Button>
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
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-500">불러오는 중...</td></tr>
                        ) : processes.length === 0 ? (
                            <tr><td colSpan={7} className="p-6 text-center text-sm text-slate-500">등록된 생산공정이 없습니다.</td></tr>
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
