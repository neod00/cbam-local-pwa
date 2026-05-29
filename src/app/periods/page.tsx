'use client';

import { useEffect, useState } from 'react';
import { createLocalItem, listLocalItems, ReportingPeriod, seedLocalData } from '@/lib/local-db';
import { Plus } from 'lucide-react';

export default function PeriodsPage() {
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        start_date: '',
        end_date: '',
        status: 'DRAFT',
    } satisfies Pick<ReportingPeriod, 'name' | 'start_date' | 'end_date' | 'status'>);

    useEffect(() => {
        async function fetchPeriods() {
            await seedLocalData();
            const data = await listLocalItems('periods');
            setPeriods(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
        }

        fetchPeriods();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const period = await createLocalItem('periods', newItem);
        setPeriods([period, ...periods]);
        setNewItem({ name: '', start_date: '', end_date: '', status: 'DRAFT' });
        setShowForm(false);
    }

    function formatStatus(status: ReportingPeriod['status']) {
        if (status === 'DRAFT') return '작성중';
        if (status === 'READY') return '계산준비';
        return '계산완료';
    }

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">보고기간</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    기간 추가
                </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
                보고기간은 로컬에 저장되며 .cbam 백업 파일에 포함됩니다.
            </p>

            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium">신규 보고기간</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">기간명</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">시작일</label>
                            <input
                                required
                                type="date"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.start_date}
                                onChange={(e) => setNewItem({ ...newItem, start_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">종료일</label>
                            <input
                                required
                                type="date"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.end_date}
                                onChange={(e) => setNewItem({ ...newItem, end_date: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-3">
                            <button
                                type="submit"
                                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                기간 저장
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-6 flex flex-col">
                <div className="-my-2 -mx-4 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle md:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 md:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-300">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">기간명</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">시작일</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">종료일</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">상태</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {periods.map((period) => (
                                        <tr key={period.id}>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{period.name}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{period.start_date}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{period.end_date}</td>
                                            <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                                <span className="inline-flex rounded-full bg-blue-100 px-2 text-xs font-semibold leading-5 text-blue-800">
                                                    {formatStatus(period.status)}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
