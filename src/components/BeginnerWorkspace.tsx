'use client';

import {
    createLocalItem,
    listLocalItems,
    updateLocalItem,
    type Installation,
    type ReportingPeriod,
} from '@/lib/local-db';
import {
    ArrowRight,
    Boxes,
    Building2,
    CalendarDays,
    Check,
    ChevronDown,
    Factory,
    FileInput,
    LockKeyhole,
    Package,
    Save,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useState } from 'react';

type WorkspaceForm = {
    installationName: string;
    country: string;
    street: string;
    city: string;
    contactName: string;
    email: string;
    periodName: string;
    startDate: string;
    endDate: string;
};

type WorkspaceData = {
    installation?: Installation;
    period?: ReportingPeriod;
};

const INITIAL_FORM: WorkspaceForm = {
    installationName: '',
    country: 'KR',
    street: '',
    city: '',
    contactName: '',
    email: '',
    periodName: '2026 확정기간',
    startDate: '2026-01-01',
    endDate: '2026-12-31',
};

const workflowSteps = [
    { label: '기본 설정', href: '/workspace', icon: Building2 },
    { label: '품목/CN', href: '/products', icon: Package },
    { label: '생산공정', href: '/processes', icon: Factory },
    { label: '사용자료', href: '/source-streams', icon: FileInput },
    { label: '전구물질', href: '/precursors', icon: Boxes },
] as const;

async function fetchWorkspaceData(): Promise<WorkspaceData> {
    const [installations, periods] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
    ]);

    return {
        installation: installations[0],
        period: periods[0],
    };
}

function formFromData(data: WorkspaceData): WorkspaceForm {
    return {
        installationName: data.installation?.local_name || data.installation?.name || '',
        country: data.installation?.country || 'KR',
        street: data.installation?.street || '',
        city: data.installation?.city || '',
        contactName: data.installation?.authorized_representative_name || '',
        email: data.installation?.email || '',
        periodName: data.period?.name || '2026 확정기간',
        startDate: data.period?.start_date || '2026-01-01',
        endDate: data.period?.end_date || '2026-12-31',
    };
}

export default function BeginnerWorkspace() {
    const router = useRouter();
    const [data, setData] = useState<WorkspaceData>({});
    const [form, setForm] = useState<WorkspaceForm>(INITIAL_FORM);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;

        fetchWorkspaceData()
            .then((nextData) => {
                if (!active) {
                    return;
                }
                setData(nextData);
                setForm(formFromData(nextData));
                setLoading(false);
            })
            .catch(() => {
                if (active) {
                    setLoading(false);
                    setError('저장된 기본 설정을 불러오지 못했습니다.');
                }
            });

        return () => {
            active = false;
        };
    }, []);

    function updateForm(patch: Partial<WorkspaceForm>) {
        setForm((current) => ({ ...current, ...patch }));
        setError('');
        setMessage('');
    }

    function validate() {
        if (!form.installationName.trim()) {
            return '사업장명을 입력하세요.';
        }
        if (!form.country) {
            return '국가를 선택하세요.';
        }
        if (!form.startDate || !form.endDate) {
            return '보고기간의 시작일과 종료일을 입력하세요.';
        }
        if (form.startDate > form.endDate) {
            return '종료일은 시작일보다 빠를 수 없습니다.';
        }
        return '';
    }

    async function saveWorkspace(goToProducts: boolean) {
        const validationError = validate();
        if (validationError) {
            setError(validationError);
            return;
        }

        setSaving(true);
        setError('');
        setMessage('');

        try {
            const installationValues = {
                name: form.installationName.trim(),
                local_name: form.installationName.trim(),
                country: form.country,
                street: form.street.trim() || undefined,
                city: form.city.trim() || undefined,
                authorized_representative_name: form.contactName.trim() || undefined,
                email: form.email.trim() || undefined,
            };

            const installation = data.installation
                ? await updateLocalItem('installations', {
                    ...data.installation,
                    ...installationValues,
                })
                : await createLocalItem('installations', installationValues);

            const periodValues = {
                installation_id: installation.id,
                name: form.periodName,
                start_date: form.startDate,
                end_date: form.endDate,
                status: data.period?.status ?? 'DRAFT' as const,
            };

            const period = data.period
                ? await updateLocalItem('periods', {
                    ...data.period,
                    ...periodValues,
                })
                : await createLocalItem('periods', periodValues);

            setData({ installation, period });
            setMessage('기본 설정이 로컬에 저장되었습니다.');

            if (goToProducts) {
                router.push('/products');
            }
        } catch {
            setError('기본 설정을 저장하지 못했습니다. 다시 시도하세요.');
        } finally {
            setSaving(false);
        }
    }

    function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        void saveWorkspace(true);
    }

    const installationReady = Boolean(form.installationName.trim() && form.country);
    const periodReady = Boolean(form.startDate && form.endDate && form.startDate <= form.endDate);

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-950">준비 및 입력</h1>
                    <p className="mt-2 text-sm text-slate-600">필수 정보부터 순서대로 입력하세요.</p>
                </div>
                <div className="text-sm font-semibold text-slate-600">
                    <span className="text-[#123D32]">1</span> / 5 단계
                </div>
            </header>

            <section className="overflow-x-auto py-1" aria-label="입력 진행 단계">
                <ol className="grid min-w-[720px] grid-cols-5">
                    {workflowSteps.map((step, index) => {
                        const Icon = step.icon;
                        const active = index === 0;

                        return (
                            <li key={step.href} className="relative text-center">
                                {index < workflowSteps.length - 1 && (
                                    <span className="absolute left-[calc(50%+24px)] right-[calc(-50%+24px)] top-5 h-px bg-slate-300" />
                                )}
                                <Link href={step.href} className="group relative inline-flex flex-col items-center px-3">
                                    <span
                                        className={`relative z-10 grid h-10 w-10 place-items-center rounded-full border text-sm font-bold ${
                                            active
                                                ? 'border-[#176B4E] bg-[#176B4E] text-white ring-4 ring-emerald-50'
                                                : 'border-slate-300 bg-white text-slate-500'
                                        }`}
                                    >
                                        {active ? index + 1 : <Icon className="h-4 w-4" />}
                                    </span>
                                    <span className={`mt-2 text-xs font-semibold ${active ? 'text-[#123D32]' : 'text-slate-500'}`}>
                                        {step.label}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ol>
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="px-5 py-5 sm:px-6">
                        <h2 className="text-2xl font-bold text-slate-950">1. 기본 설정</h2>
                        <p className="mt-2 text-sm text-slate-600">사업장과 보고 범위를 먼저 설정합니다.</p>
                    </div>

                    <div className="border-t border-slate-200 px-5 py-6 sm:px-6">
                        <h3 className="text-base font-bold text-slate-900">사업장 정보</h3>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-700">
                                    사업장명 <span className="text-red-600">*</span>
                                </span>
                                <input
                                    value={form.installationName}
                                    onChange={(event) => updateForm({ installationName: event.target.value })}
                                    placeholder="예: 한빛제철 포항사업장"
                                    disabled={loading || saving}
                                    className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
                                />
                            </label>

                            <label className="block">
                                <span className="text-sm font-semibold text-slate-700">
                                    국가 <span className="text-red-600">*</span>
                                </span>
                                <select
                                    value={form.country}
                                    onChange={(event) => updateForm({ country: event.target.value })}
                                    disabled={loading || saving}
                                    className="mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50"
                                >
                                    <option value="KR">대한민국</option>
                                    <option value="CN">중국</option>
                                    <option value="JP">일본</option>
                                    <option value="DE">독일</option>
                                    <option value="VN">베트남</option>
                                    <option value="OTHER">기타</option>
                                </select>
                            </label>
                        </div>

                        <details className="group mt-4 border-y border-slate-200 py-3">
                            <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-slate-700">
                                <span>주소·담당자 정보 (선택)</span>
                                <ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
                            </summary>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">도시</span>
                                    <input
                                        value={form.city}
                                        onChange={(event) => updateForm({ city: event.target.value })}
                                        disabled={loading || saving}
                                        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">주소</span>
                                    <input
                                        value={form.street}
                                        onChange={(event) => updateForm({ street: event.target.value })}
                                        disabled={loading || saving}
                                        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">담당자명</span>
                                    <input
                                        value={form.contactName}
                                        onChange={(event) => updateForm({ contactName: event.target.value })}
                                        disabled={loading || saving}
                                        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                    />
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">이메일</span>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={(event) => updateForm({ email: event.target.value })}
                                        disabled={loading || saving}
                                        className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                    />
                                </label>
                            </div>
                        </details>
                    </div>

                    <div className="border-t border-slate-200 px-5 py-6 sm:px-6">
                        <h3 className="text-base font-bold text-slate-900">보고기간</h3>

                        <label className="mt-4 inline-flex min-h-10 items-center gap-3 text-sm font-semibold text-slate-800">
                            <input
                                type="radio"
                                checked
                                readOnly
                                className="h-4 w-4 accent-emerald-800"
                            />
                            2026 확정기간
                        </label>

                        <div className="mt-4 grid gap-4 md:grid-cols-2">
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-700">
                                    시작일 <span className="text-red-600">*</span>
                                </span>
                                <input
                                    type="date"
                                    value={form.startDate}
                                    onChange={(event) => updateForm({ startDate: event.target.value })}
                                    disabled={loading || saving}
                                    className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                />
                            </label>
                            <label className="block">
                                <span className="text-sm font-semibold text-slate-700">
                                    종료일 <span className="text-red-600">*</span>
                                </span>
                                <input
                                    type="date"
                                    value={form.endDate}
                                    onChange={(event) => updateForm({ endDate: event.target.value })}
                                    disabled={loading || saving}
                                    className="mt-2 min-h-11 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100"
                                />
                            </label>
                        </div>

                        <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
                            <CalendarDays className="h-4 w-4" />
                            2026년 보고 대상 자료를 입력합니다.
                        </div>
                    </div>

                    {(error || message) && (
                        <div className="border-t border-slate-200 px-5 py-4 sm:px-6">
                            {error && (
                                <div role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                                    {error}
                                </div>
                            )}
                            {message && (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-900">
                                    {message}
                                </div>
                            )}
                        </div>
                    )}

                    <div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
                        <button
                            type="button"
                            onClick={() => void saveWorkspace(false)}
                            disabled={loading || saving}
                            className="inline-flex min-h-11 items-center justify-center rounded-md px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        >
                            <Save className="mr-2 h-4 w-4" />
                            임시 저장
                        </button>
                        <button
                            type="submit"
                            disabled={loading || saving}
                            className="inline-flex min-h-11 items-center justify-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#195642] disabled:opacity-50"
                        >
                            {saving ? '저장 중...' : '저장하고 품목 등록'}
                            {!saving && <ArrowRight className="ml-2 h-4 w-4" />}
                        </button>
                    </div>
                </form>

                <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                    <h2 className="text-lg font-bold text-slate-950">현재 단계</h2>

                    <div className="mt-5 flex items-center gap-4">
                        <div className="grid h-16 w-16 place-items-center rounded-full bg-emerald-50 text-3xl font-bold text-[#123D32]">
                            1
                        </div>
                        <div>
                            <div className="text-xl font-bold text-slate-950">기본 설정</div>
                            <div className="mt-1 text-sm text-slate-500">사업장과 보고 범위</div>
                        </div>
                    </div>

                    <div className="mt-6 divide-y divide-slate-200 border-y border-slate-200">
                        <div className="flex min-h-14 items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                <Building2 className="h-5 w-5 text-emerald-800" />
                                사업장 정보
                            </div>
                            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${installationReady ? 'text-emerald-800' : 'text-blue-700'}`}>
                                <span className={`h-2 w-2 rounded-full ${installationReady ? 'bg-emerald-600' : 'bg-blue-600'}`} />
                                {installationReady ? '입력 완료' : '입력 중'}
                            </span>
                        </div>
                        <div className="flex min-h-14 items-center justify-between gap-3 py-3">
                            <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                <CalendarDays className="h-5 w-5 text-emerald-800" />
                                보고기간
                            </div>
                            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${periodReady ? 'text-emerald-800' : 'text-slate-500'}`}>
                                <span className={`h-2 w-2 rounded-full ${periodReady ? 'bg-emerald-600' : 'bg-slate-400'}`} />
                                {periodReady ? '입력 완료' : '미입력'}
                            </span>
                        </div>
                    </div>

                    <div className="mt-6">
                        <h3 className="text-base font-bold text-slate-950">왜 필요한가요?</h3>
                        <div className="mt-5 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                            {[
                                { label: '사업장', icon: Building2 },
                                { label: '보고기간', icon: CalendarDays },
                                { label: '품목', icon: Package },
                            ].map((item, index) => {
                                const Icon = item.icon;
                                return (
                                    <div key={item.label} className="contents">
                                        <div>
                                            <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-emerald-50 text-emerald-900">
                                                <Icon className="h-5 w-5" />
                                            </div>
                                            <div className="mt-2 text-[11px] font-semibold text-slate-700">{item.label}</div>
                                        </div>
                                        {index < 2 && <ArrowRight className="h-4 w-4 text-slate-300" />}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-4 text-sm leading-6 text-slate-600">모든 산정자료가 이 기준으로 연결됩니다.</p>
                    </div>

                    <div className="mt-6 flex gap-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm leading-6 text-emerald-950">
                        <LockKeyhole className="mt-0.5 h-5 w-5 flex-none" />
                        <p>입력한 정보는 이 브라우저에만 저장됩니다.</p>
                    </div>

                    {data.installation && data.period && (
                        <div className="mt-4 flex items-center gap-2 text-xs font-semibold text-emerald-800">
                            <Check className="h-4 w-4" />
                            저장된 기본 설정이 있습니다.
                        </div>
                    )}
                </aside>
            </div>
        </div>
    );
}
