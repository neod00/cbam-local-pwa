'use client';

import { Button, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { createLocalItem, Installation, listLocalItems, seedLocalData } from '@/lib/local-db';
import { Building2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

export default function InstallationsPage() {
    const [items, setItems] = useState<Installation[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        country: 'KR',
    } satisfies Pick<Installation, 'name' | 'country'>);

    useEffect(() => {
        async function fetchInstallations() {
            await seedLocalData();
            const data = await listLocalItems('installations');
            setItems(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
        }

        fetchInstallations();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const installation = await createLocalItem('installations', newItem);
        setItems([installation, ...items]);
        setNewItem({ name: '', country: 'KR' });
        setShowForm(false);
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="조직 기준"
                title="사업장"
                description="CBAM 산정 대상 사업장을 관리합니다. 이 PWA 버전에서는 사업장 정보도 브라우저 로컬 DB에 저장됩니다."
                actions={
                    <Button type="button" onClick={() => setShowForm(!showForm)}>
                        <Plus className="mr-2 h-4 w-4" />
                        사업장 추가
                    </Button>
                }
            />

            {showForm && (
                <SectionCard title="신규 사업장" description="국가코드는 ISO 2자리 코드 기준으로 입력합니다.">
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-semibold text-slate-700">사업장명</label>
                            <input
                                required
                                className={fieldClass}
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                placeholder="예: 인천 제1공장"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">국가코드</label>
                            <input
                                required
                                className={fieldClass}
                                value={newItem.country}
                                onChange={(e) => setNewItem({ ...newItem, country: e.target.value.toUpperCase() })}
                                maxLength={2}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit">사업장 저장</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {items.map((item) => (
                    <SectionCard key={item.id} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <StatusBadge tone="success">{item.country}</StatusBadge>
                                <h2 className="mt-3 text-base font-semibold text-slate-950">{item.name}</h2>
                                <p className="mt-1 text-sm text-slate-500">로컬 산정 데이터 연결 가능</p>
                            </div>
                            <div className="rounded-2xl bg-teal-50 p-3 text-teal-700">
                                <Building2 className="h-5 w-5" />
                            </div>
                        </div>
                    </SectionCard>
                ))}
            </div>
        </div>
    );
}
