'use client';

import { Button, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { createLocalItem, Installation, listLocalItems, seedLocalData, updateLocalItem } from '@/lib/local-db';
import { Building2, Pencil, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

type InstallationDraft = Pick<Installation, 'name' | 'country'>;
type InstallationErrors = Partial<Record<keyof InstallationDraft, string>>;

const emptyDraft: InstallationDraft = {
    name: '',
    country: 'KR',
};

export default function InstallationsPage() {
    const [items, setItems] = useState<Installation[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [editingInstallationId, setEditingInstallationId] = useState<string | null>(null);
    const [newItem, setNewItem] = useState<InstallationDraft>(emptyDraft);
    const [errors, setErrors] = useState<InstallationErrors>({});

    useEffect(() => {
        async function fetchInstallations() {
            await seedLocalData();
            const data = await listLocalItems('installations');
            setItems(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
        }

        fetchInstallations();
    }, []);

    function resetForm() {
        setNewItem(emptyDraft);
        setErrors({});
        setEditingInstallationId(null);
        setShowForm(false);
    }

    function startNewInstallation() {
        if (showForm && !editingInstallationId) {
            resetForm();
            return;
        }

        setNewItem(emptyDraft);
        setEditingInstallationId(null);
        setShowForm(true);
    }

    function startEditInstallation(installation: Installation) {
        setNewItem({
            name: installation.name,
            country: installation.country,
        });
        setErrors({});
        setEditingInstallationId(installation.id);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const nextErrors: InstallationErrors = {};
        const country = newItem.country.trim().toUpperCase();

        if (!newItem.name.trim()) {
            nextErrors.name = '사업장명을 입력하세요.';
        }

        if (!/^[A-Z]{2}$/.test(country)) {
            nextErrors.country = '국가코드는 ISO 2자리 영문 코드로 입력하세요. 예: KR';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        if (editingInstallationId) {
            const existingInstallation = items.find((item) => item.id === editingInstallationId);

            if (!existingInstallation) {
                return;
            }

            const updatedInstallation = await updateLocalItem('installations', {
                ...existingInstallation,
                name: newItem.name.trim(),
                country,
            });
            setItems(items.map((item) => (item.id === updatedInstallation.id ? updatedInstallation : item)));
            resetForm();
            return;
        }

        const installation = await createLocalItem('installations', {
            name: newItem.name.trim(),
            country,
        });
        setItems([installation, ...items]);
        resetForm();
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="조직 기준"
                title="사업장"
                description="CBAM 산정 대상 사업장을 관리합니다. 이 PWA 버전에서는 사업장 정보도 브라우저 로컬 DB에 저장됩니다."
                actions={
                    <Button type="button" onClick={startNewInstallation}>
                        <Plus className="mr-2 h-4 w-4" />
                        사업장 추가
                    </Button>
                }
            />

            {showForm && (
                <SectionCard
                    title={editingInstallationId ? '사업장 정보 수정' : '신규 사업장'}
                    description="국가코드는 ISO 2자리 코드 기준으로 입력합니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label htmlFor="installation-name" className="text-sm font-semibold text-slate-700">사업장명</label>
                            <input
                                id="installation-name"
                                required
                                className={fieldClass}
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                                placeholder="예: 인천 제1공장"
                            />
                            {errors.name && <p className="mt-1 text-xs font-medium text-red-600">{errors.name}</p>}
                        </div>
                        <div>
                            <label htmlFor="installation-country" className="text-sm font-semibold text-slate-700">국가코드</label>
                            <input
                                id="installation-country"
                                required
                                className={fieldClass}
                                value={newItem.country}
                                onChange={(e) => setNewItem({ ...newItem, country: e.target.value.toUpperCase() })}
                                maxLength={2}
                            />
                            {errors.country && <p className="mt-1 text-xs font-medium text-red-600">{errors.country}</p>}
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit">{editingInstallationId ? '수정 저장' : '사업장 저장'}</Button>
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
                                <Button type="button" variant="secondary" className="mt-4 min-h-9 px-3 py-1.5" onClick={() => startEditInstallation(item)}>
                                    <Pencil className="mr-1.5 h-4 w-4" />
                                    수정
                                </Button>
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
