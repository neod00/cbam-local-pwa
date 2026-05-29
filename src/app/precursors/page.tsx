'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
    createLocalItem,
    listLocalItems,
    Product,
    ProductionProcess,
    PurchasedPrecursor,
    ReportingPeriod,
    seedLocalData,
} from '@/lib/local-db';
import { Plus } from 'lucide-react';

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

    const periodNames = useMemo(() => {
        return new Map(periods.map((period) => [period.id, period.name]));
    }, [periods]);

    const processNames = useMemo(() => {
        return new Map(processes.map((process) => [process.id, process.name]));
    }, [processes]);

    const productNames = useMemo(() => {
        return new Map(products.map((product) => [product.id, product.name]));
    }, [products]);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();

        const precursor = await createLocalItem('precursors', {
            ...newItem,
            period_id: newItem.period_id || undefined,
            process_id: newItem.process_id || undefined,
            product_id: newItem.product_id || undefined,
        });

        setPrecursors([precursor, ...precursors]);
        setNewItem({
            ...emptyDraft,
            period_id: periods[0]?.id ?? '',
            process_id: processes[0]?.id ?? '',
            product_id: products[0]?.id ?? '',
        });
        setShowForm(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">구매 전구물질</h1>
                    <p className="mt-2 max-w-3xl text-sm text-gray-600">
                        EU 템플릿의 E_PurchPrec 입력 구조에 맞춰 구매 전구물질의 소비량과 내재배출량(SEE)을 관리합니다.
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    전구물질 추가
                </button>
            </div>

            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium text-gray-900">신규 구매 전구물질</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">전구물질명</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.name}
                                onChange={(event) => setNewItem({ ...newItem, name: event.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                통합 상품군(Aggregated Goods)
                            </label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.aggregated_goods_category}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, aggregated_goods_category: event.target.value })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">생산경로(Route)</label>
                            <input
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
                            <label className="block text-sm font-medium text-gray-700">소비 공정</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.process_id}
                                onChange={(event) => setNewItem({ ...newItem, process_id: event.target.value })}
                            >
                                <option value="">미지정</option>
                                {processes.map((process) => (
                                    <option key={process.id} value={process.id}>
                                        {process.name}
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
                            <label className="block text-sm font-medium text-gray-700">구매량(t)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.purchased_mass_t}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, purchased_mass_t: toNumber(event.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">소비량(t)</label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.consumed_mass_t}
                                onChange={(event) =>
                                    setNewItem({ ...newItem, consumed_mass_t: toNumber(event.target.value) })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">비CBAM 용도(t)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.consumed_for_non_cbam_mass_t}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        consumed_for_non_cbam_mass_t: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                직접 SEE(tCO2e/t)
                            </label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.direct_see_tco2e_per_t}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        direct_see_tco2e_per_t: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">
                                간접 SEE(tCO2e/t)
                            </label>
                            <input
                                required
                                type="number"
                                min="0"
                                step="0.0001"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.indirect_see_tco2e_per_t}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        indirect_see_tco2e_per_t: toNumber(event.target.value),
                                    })
                                }
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">출처</label>
                            <input
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.source}
                                onChange={(event) => setNewItem({ ...newItem, source: event.target.value })}
                            />
                        </div>
                        <div className="md:col-span-3">
                            <label className="block text-sm font-medium text-gray-700">
                                기본값 사용 사유
                            </label>
                            <textarea
                                rows={3}
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.default_value_justification}
                                onChange={(event) =>
                                    setNewItem({
                                        ...newItem,
                                        default_value_justification: event.target.value,
                                    })
                                }
                            />
                        </div>
                        <div className="md:col-span-3">
                            <button
                                type="submit"
                                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                전구물질 저장
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">전구물질</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">공정</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">보고기간</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">소비량(t)</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">직접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">간접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">총 SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-4 text-center text-sm text-gray-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : precursors.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-4 text-center text-sm text-gray-500">
                                    등록된 구매 전구물질이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            precursors.map((precursor) => {
                                const totalSee =
                                    precursor.direct_see_tco2e_per_t + precursor.indirect_see_tco2e_per_t;

                                return (
                                    <tr key={precursor.id}>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                            {precursor.name}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {precursor.process_id
                                                ? processNames.get(precursor.process_id) ?? '알 수 없음'
                                                : '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {precursor.period_id
                                                ? periodNames.get(precursor.period_id) ?? '알 수 없음'
                                                : '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                            {precursor.product_id
                                                ? productNames.get(precursor.product_id) ?? '알 수 없음'
                                                : '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(precursor.consumed_mass_t)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(precursor.direct_see_tco2e_per_t)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(precursor.indirect_see_tco2e_per_t)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                            {formatNumber(totalSee)}
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
