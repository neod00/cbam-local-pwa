'use client';

import { Button, DataTable, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { createLocalItem, listLocalItems, ReportingPeriod, seedLocalData } from '@/lib/local-db';
import { CalendarDays, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

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
        if (status === 'DRAFT') return { label: '작성중', tone: 'pending' as const };
        if (status === 'READY') return { label: '계산준비', tone: 'info' as const };
        return { label: '계산완료', tone: 'success' as const };
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="보고 범위"
                title="보고기간"
                description="CBAM 산정에 사용할 보고기간을 관리합니다. 보고기간은 로컬 저장소와 .cbam 백업 파일에 포함됩니다."
                actions={
                    <Button type="button" onClick={() => setShowForm(!showForm)}>
                        <Plus className="mr-2 h-4 w-4" />
                        기간 추가
                    </Button>
                }
            />

            {showForm && (
                <SectionCard title="신규 보고기간" description="분기 또는 연간 단위로 내부 관리 기준에 맞춰 등록하세요.">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div>
                            <label className="text-sm font-semibold text-slate-700">기간명</label>
                            <input
                                required
                                className={fieldClass}
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                placeholder="예: 2025년 4분기"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">시작일</label>
                            <input
                                required
                                type="date"
                                className={fieldClass}
                                value={newItem.start_date}
                                onChange={(e) => setNewItem({ ...newItem, start_date: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">종료일</label>
                            <input
                                required
                                type="date"
                                className={fieldClass}
                                value={newItem.end_date}
                                onChange={(e) => setNewItem({ ...newItem, end_date: e.target.value })}
                            />
                        </div>
                        <div className="md:col-span-3">
                            <Button type="submit">기간 저장</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {periods.map((period) => {
                    const status = formatStatus(period.status);
                    return (
                        <SectionCard key={period.id} className="p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                                    <h2 className="mt-3 text-base font-semibold text-slate-950">{period.name}</h2>
                                    <p className="mt-1 text-sm text-slate-500">
                                        {period.start_date} - {period.end_date}
                                    </p>
                                </div>
                                <CalendarDays className="h-5 w-5 text-teal-700" />
                            </div>
                        </SectionCard>
                    );
                })}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">기간명</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">시작일</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">종료일</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {periods.map((period) => {
                            const status = formatStatus(period.status);
                            return (
                                <tr key={period.id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">{period.name}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{period.start_date}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{period.end_date}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                                        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
