'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
    createLocalItem,
    listLocalItems,
    Product,
    ProductionProcess,
    ReportingPeriod,
    seedLocalData,
} from '@/lib/local-db';
import { Plus } from 'lucide-react';

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

    const productNames = useMemo(() => {
        return new Map(products.map((product) => [product.id, product.name]));
    }, [products]);

    const periodNames = useMemo(() => {
        return new Map(periods.map((period) => [period.id, period.name]));
    }, [periods]);

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

    return (
        <div>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">생산공정</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        EU 템플릿의 D_Processes 입력 구조에 맞춰 공정별 생산량, 직접귀속배출, 전력 사용량을 관리합니다.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    공정 추가
                </button>
            </div>

            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium text-gray-900">신규 생산공정</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">공정명</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.name}
                                onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">생산경로(Route)</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.production_route}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, production_route: event.target.value })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">보고기간</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.period_id}
                                onChange={(event) => setNewItem({ ...newItem, period_id: event.target.value })}
                            >
                                <option value="">미지정</option>
                                {periods.map((period) => (
                                    <option key={period.id} value={period.id}>
                                        {period.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">연결 제품</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.product_id}
                                onChange={(event) => setNewItem({ ...newItem, product_id: event.target.value })}
                            >
                                <option value="">미지정</option>
                                {products.map((product) => (
                                    <option key={product.id} value={product.id}>
                                        {product.name} ({product.hs_code})
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">총 생산량(t)</label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.output_mass_t}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, output_mass_t: toNumber(event.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">시장 출하량(t)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.market_output_mass_t}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, market_output_mass_t: toNumber(event.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">내부 소비량(t)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.internal_consumption_mass_t}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        internal_consumption_mass_t: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                직접귀속배출량(tCO2e)
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.direct_attributable_emissions_tco2e}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        direct_attributable_emissions_tco2e: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">전력 사용량(MWh)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.electricity_mwh}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, electricity_mwh: toNumber(event.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                전력 배출계수(tCO2e/MWh)
                            </label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.electricity_ef_tco2e_per_mwh}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        electricity_ef_tco2e_per_mwh: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div className="md:col-span-3">
                            <button
                                type="submit"
                                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                공정 저장
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">공정</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">경로</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">보고기간</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">생산량(t)</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">직접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">간접 SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="p-4 text-center text-sm text-gray-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : processes.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-4 text-center text-sm text-gray-500">
                                    등록된 생산공정이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            processes.map((process) => {
                                const directSee =
                                    process.output_mass_t > 0
                                        ? process.direct_attributable_emissions_tco2e / process.output_mass_t
                                        : 0;
                                const indirectSee =
                                    process.output_mass_t > 0
                                        ? (process.electricity_mwh *
                                              process.electricity_ef_tco2e_per_mwh) /
                                          process.output_mass_t
                                        : 0;

                                return (
                                    <tr key={process.id}>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                            {process.name}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {process.production_route}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {process.period_id ? periodNames.get(process.period_id) ?? '알 수 없음' : '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {process.product_id
                                                ? productNames.get(process.product_id) ?? '알 수 없음'
                                                : '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(process.output_mass_t)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(directSee)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(indirectSee)}
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
