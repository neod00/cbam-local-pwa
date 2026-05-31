'use client';

import { Button, EmptyState, FormSection, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { createLocalItem, Installation, listLocalItems, seedLocalData, updateLocalItem } from '@/lib/local-db';
import { Building2, Mail, MapPin, Pencil, Phone, Plus, X } from 'lucide-react';
import { useEffect, useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

type InstallationDraft = Pick<
    Installation,
    | 'name'
    | 'local_name'
    | 'country'
    | 'street'
    | 'economic_activity'
    | 'postcode'
    | 'po_box'
    | 'city'
    | 'unlocode'
    | 'latitude'
    | 'longitude'
    | 'authorized_representative_name'
    | 'email'
    | 'telephone'
>;
type InstallationErrors = Partial<Record<keyof InstallationDraft, string>>;

const emptyDraft: InstallationDraft = {
    name: '',
    local_name: '',
    country: 'KR',
    street: '',
    economic_activity: '',
    postcode: '',
    po_box: '',
    city: '',
    unlocode: '',
    latitude: '',
    longitude: '',
    authorized_representative_name: '',
    email: '',
    telephone: '',
};

function optionalValue(value: string | undefined): string | undefined {
    const trimmed = value?.trim() ?? '';
    return trimmed ? trimmed : undefined;
}

function toDraft(installation: Installation): InstallationDraft {
    return {
        name: installation.name,
        local_name: installation.local_name ?? '',
        country: installation.country,
        street: installation.street ?? '',
        economic_activity: installation.economic_activity ?? '',
        postcode: installation.postcode ?? '',
        po_box: installation.po_box ?? '',
        city: installation.city ?? '',
        unlocode: installation.unlocode ?? '',
        latitude: installation.latitude ?? '',
        longitude: installation.longitude ?? '',
        authorized_representative_name: installation.authorized_representative_name ?? '',
        email: installation.email ?? '',
        telephone: installation.telephone ?? '',
    };
}

function normalizeDraft(draft: InstallationDraft): Omit<Installation, keyof InstallationDraft | 'id' | 'created_at' | 'updated_at' | 'boundary_json'> & InstallationDraft {
    return {
        name: draft.name.trim(),
        local_name: optionalValue(draft.local_name),
        country: draft.country.trim().toUpperCase(),
        street: optionalValue(draft.street),
        economic_activity: optionalValue(draft.economic_activity),
        postcode: optionalValue(draft.postcode),
        po_box: optionalValue(draft.po_box),
        city: optionalValue(draft.city),
        unlocode: optionalValue(draft.unlocode),
        latitude: optionalValue(draft.latitude),
        longitude: optionalValue(draft.longitude),
        authorized_representative_name: optionalValue(draft.authorized_representative_name),
        email: optionalValue(draft.email),
        telephone: optionalValue(draft.telephone),
    };
}

function validateNumberRange(value: string | undefined, min: number, max: number): boolean {
    if (!value?.trim()) {
        return true;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

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
        setNewItem(toDraft(installation));
        setErrors({});
        setEditingInstallationId(installation.id);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const nextErrors: InstallationErrors = {};
        const country = newItem.country.trim().toUpperCase();

        if (!newItem.name.trim()) {
            nextErrors.name = '영문 사업장명을 입력하세요.';
        }

        if (!/^[A-Z]{2}$/.test(country)) {
            nextErrors.country = '국가 코드는 ISO 2자리 영문 코드로 입력하세요. 예: KR';
        }

        if (newItem.email?.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newItem.email.trim())) {
            nextErrors.email = '이메일 형식을 확인하세요.';
        }

        if (!validateNumberRange(newItem.latitude, -90, 90)) {
            nextErrors.latitude = '위도는 -90부터 90 사이의 숫자로 입력하세요.';
        }

        if (!validateNumberRange(newItem.longitude, -180, 180)) {
            nextErrors.longitude = '경도는 -180부터 180 사이의 숫자로 입력하세요.';
        }

        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0) {
            return;
        }

        const normalizedItem = normalizeDraft(newItem);

        if (editingInstallationId) {
            const existingInstallation = items.find((item) => item.id === editingInstallationId);

            if (!existingInstallation) {
                return;
            }

            const updatedInstallation = await updateLocalItem('installations', {
                ...existingInstallation,
                ...normalizedItem,
            });
            setItems(items.map((item) => (item.id === updatedInstallation.id ? updatedInstallation : item)));
            resetForm();
            return;
        }

        const installation = await createLocalItem('installations', normalizedItem);
        setItems([installation, ...items]);
        resetForm();
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="조직 기준"
                title="사업장"
                description="EU 제출 템플릿의 A_InstData에 들어갈 사업장 식별 정보와 담당자 정보를 관리합니다."
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
                    description="필수값은 사업장명과 국가 코드입니다. 주소와 담당자 정보는 EU 원본 템플릿 Export에 함께 반영됩니다."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form noValidate onSubmit={handleSubmit} className="space-y-5">
                        <FormSection
                            title="1. 사업장 식별정보"
                            description="EU 원본 템플릿의 사업장명과 국가 코드에 연결되는 필수 정보입니다."
                            badge={<StatusBadge tone="warning">필수</StatusBadge>}
                        >
                            <FormInput
                                id="installation-local-name"
                                label="내부 사업장명"
                                value={newItem.local_name ?? ''}
                                placeholder="예: 인천 제1공장"
                                onChange={(value) => setNewItem({ ...newItem, local_name: value })}
                            />
                            <FormInput
                                id="installation-name"
                                label="영문 사업장명"
                                required
                                value={newItem.name}
                                error={errors.name}
                                placeholder="예: Main Factory A"
                                onChange={(value) => setNewItem({ ...newItem, name: value })}
                            />
                            <FormInput
                                id="installation-country"
                                label="국가 코드"
                                required
                                value={newItem.country}
                                error={errors.country}
                                maxLength={2}
                                placeholder="KR"
                                onChange={(value) => setNewItem({ ...newItem, country: value.toUpperCase() })}
                            />
                        </FormSection>

                        <FormSection
                            title="2. 주소와 위치"
                            description="주소, UN/LOCODE, 좌표는 제출용 템플릿 보조 정보로 사용합니다. 알 수 있는 항목부터 입력하세요."
                            badge={<StatusBadge tone="neutral">선택</StatusBadge>}
                        >
                            <FormInput
                                id="installation-street"
                                label="주소"
                                value={newItem.street ?? ''}
                                placeholder="도로명, 번지"
                                onChange={(value) => setNewItem({ ...newItem, street: value })}
                            />
                            <FormInput
                                id="installation-city"
                                label="도시"
                                value={newItem.city ?? ''}
                                placeholder="예: Incheon"
                                onChange={(value) => setNewItem({ ...newItem, city: value })}
                            />
                            <FormInput
                                id="installation-postcode"
                                label="우편번호"
                                value={newItem.postcode ?? ''}
                                onChange={(value) => setNewItem({ ...newItem, postcode: value })}
                            />
                            <FormInput
                                id="installation-po-box"
                                label="P.O. Box"
                                value={newItem.po_box ?? ''}
                                onChange={(value) => setNewItem({ ...newItem, po_box: value })}
                            />
                            <FormInput
                                id="installation-unlocode"
                                label="UN/LOCODE"
                                value={newItem.unlocode ?? ''}
                                placeholder="선택 입력"
                                onChange={(value) => setNewItem({ ...newItem, unlocode: value })}
                            />
                            <FormInput
                                id="installation-economic-activity"
                                label="경제활동"
                                value={newItem.economic_activity ?? ''}
                                placeholder="예: Steel processing"
                                onChange={(value) => setNewItem({ ...newItem, economic_activity: value })}
                            />
                            <FormInput
                                id="installation-latitude"
                                label="위도"
                                value={newItem.latitude ?? ''}
                                error={errors.latitude}
                                placeholder="예: 37.456"
                                onChange={(value) => setNewItem({ ...newItem, latitude: value })}
                            />
                            <FormInput
                                id="installation-longitude"
                                label="경도"
                                value={newItem.longitude ?? ''}
                                error={errors.longitude}
                                placeholder="예: 126.705"
                                onChange={(value) => setNewItem({ ...newItem, longitude: value })}
                            />
                        </FormSection>

                        <FormSection
                            title="3. 담당자 정보"
                            description="회사 내부 검토와 EU 제출 준비 과정에서 연락 가능한 담당자 정보를 남깁니다."
                            badge={<StatusBadge tone="neutral">선택</StatusBadge>}
                        >
                            <FormInput
                                id="installation-representative"
                                label="담당자명"
                                value={newItem.authorized_representative_name ?? ''}
                                onChange={(value) => setNewItem({ ...newItem, authorized_representative_name: value })}
                            />
                            <FormInput
                                id="installation-email"
                                label="담당자 이메일"
                                type="email"
                                value={newItem.email ?? ''}
                                error={errors.email}
                                onChange={(value) => setNewItem({ ...newItem, email: value })}
                            />
                            <FormInput
                                id="installation-telephone"
                                label="담당자 전화번호"
                                value={newItem.telephone ?? ''}
                                onChange={(value) => setNewItem({ ...newItem, telephone: value })}
                            />
                        </FormSection>

                        <div className="flex items-end">
                            <Button type="submit">{editingInstallationId ? '수정 저장' : '사업장 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {items.length === 0 && (
                    <div className="lg:col-span-3">
                        <EmptyState
                            title="등록된 사업장이 없습니다"
                            description="CBAM 제출 준비는 사업장 식별정보에서 시작합니다. 사업장명과 국가 코드를 먼저 등록하면 품목, 공정, Export 흐름을 이어갈 수 있습니다."
                            action={(
                                <Button type="button" onClick={startNewInstallation}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    사업장 추가
                                </Button>
                            )}
                        />
                    </div>
                )}
                {items.map((item) => (
                    <SectionCard key={item.id} className="p-5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <StatusBadge tone="success">{item.country}</StatusBadge>
                                <h2 className="mt-3 truncate text-base font-semibold text-slate-950">{item.local_name || item.name}</h2>
                                {item.local_name && <p className="mt-1 truncate text-sm text-slate-500">{item.name}</p>}
                                <div className="mt-3 space-y-2 text-sm text-slate-600">
                                    <p className="flex items-center gap-2">
                                        <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                                        <span className="truncate">{[item.city, item.street].filter(Boolean).join(', ') || '주소 미입력'}</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Mail className="h-4 w-4 shrink-0 text-slate-400" />
                                        <span className="truncate">{item.email || '담당자 이메일 미입력'}</span>
                                    </p>
                                    <p className="flex items-center gap-2">
                                        <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                                        <span className="truncate">{item.telephone || '담당자 전화번호 미입력'}</span>
                                    </p>
                                </div>
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

type FormInputProps = {
    id: string;
    label: string;
    value: string;
    onChange: (value: string) => void;
    error?: string;
    placeholder?: string;
    required?: boolean;
    maxLength?: number;
    type?: string;
};

function FormInput({ id, label, value, onChange, error, placeholder, required, maxLength, type = 'text' }: FormInputProps) {
    return (
        <div>
            <label htmlFor={id} className="text-sm font-semibold text-slate-700">
                {label}
                {required && <span className="ml-1 text-red-500">*</span>}
            </label>
            <input
                id={id}
                type={type}
                required={required}
                className={fieldClass}
                value={value}
                maxLength={maxLength}
                placeholder={placeholder}
                onChange={(e) => onChange(e.target.value)}
            />
            {error && <p className="mt-1 text-xs font-medium text-red-600">{error}</p>}
        </div>
    );
}
