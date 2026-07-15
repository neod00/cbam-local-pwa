'use client';

import {
    Boxes,
    Building2,
    Check,
    Factory,
    FileInput,
    Package,
    type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

export const beginnerSteps = [
    { label: '기본 설정', href: '/workspace', icon: Building2 },
    { label: '품목/CN', href: '/products', icon: Package },
    { label: '생산공정', href: '/processes', icon: Factory },
    { label: '사용자료', href: '/source-streams', icon: FileInput },
    { label: '전구물질', href: '/precursors', icon: Boxes },
] as const;

export function BeginnerStepHeader({
    current,
    title,
    description,
    advancedHref,
}: {
    current: number;
    title: string;
    description: string;
    advancedHref: string;
}) {
    return (
        <>
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-xs font-bold text-emerald-800">준비 및 입력</p>
                    <h1 className="mt-1 text-3xl font-bold text-slate-950">{title}</h1>
                    <p className="mt-2 text-sm text-slate-600">{description}</p>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-slate-600">
                        <span className="text-[#123D32]">{current}</span> / 5 단계
                    </span>
                    <Link href={advancedHref} className="text-xs font-semibold text-slate-500 underline-offset-4 hover:text-slate-900 hover:underline">
                        고급 화면
                    </Link>
                </div>
            </header>

            <nav className="overflow-x-auto py-1" aria-label="입력 진행 단계">
                <ol className="grid min-w-[720px] grid-cols-5">
                    {beginnerSteps.map((step, index) => {
                        const Icon = step.icon;
                        const number = index + 1;
                        const active = number === current;
                        const complete = number < current;

                        return (
                            <li key={step.href} className="relative text-center">
                                {index < beginnerSteps.length - 1 && (
                                    <span className={`absolute left-[calc(50%+24px)] right-[calc(-50%+24px)] top-5 h-px ${complete ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                                )}
                                <Link href={step.href} className="group relative inline-flex flex-col items-center px-3">
                                    <span className={`relative z-10 grid h-10 w-10 place-items-center rounded-full border text-sm font-bold ${
                                        active
                                            ? 'border-[#176B4E] bg-[#176B4E] text-white ring-4 ring-emerald-50'
                                            : complete
                                                ? 'border-emerald-600 bg-emerald-50 text-emerald-800'
                                                : 'border-slate-300 bg-white text-slate-500'
                                    }`}>
                                        {complete ? <Check className="h-4 w-4" /> : active ? number : <Icon className="h-4 w-4" />}
                                    </span>
                                    <span className={`mt-2 text-xs font-semibold ${active ? 'text-[#123D32]' : 'text-slate-500'}`}>
                                        {step.label}
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ol>
            </nav>
        </>
    );
}

export function EntryChoice({
    icon: Icon,
    title,
    description,
    selected,
    onClick,
}: {
    icon: LucideIcon;
    title: string;
    description: string;
    selected: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`flex min-h-28 w-full items-start gap-4 rounded-lg border p-4 text-left transition ${
                selected
                    ? 'border-emerald-700 bg-emerald-50 ring-2 ring-emerald-100'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
            <span className={`grid h-11 w-11 flex-none place-items-center rounded-lg ${selected ? 'bg-[#123D32] text-white' : 'bg-slate-100 text-slate-600'}`}>
                <Icon className="h-5 w-5" />
            </span>
            <span>
                <span className="block text-base font-bold text-slate-950">{title}</span>
                <span className="mt-1 block text-sm leading-6 text-slate-600">{description}</span>
            </span>
        </button>
    );
}

export const beginnerFieldClass = 'mt-2 min-h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none transition focus:border-emerald-700 focus:ring-4 focus:ring-emerald-100 disabled:bg-slate-50 disabled:text-slate-500';

export function InlineNotice({ tone = 'info', children }: { tone?: 'info' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
    const classes = {
        info: 'border-blue-200 bg-blue-50 text-blue-900',
        success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        warning: 'border-amber-200 bg-amber-50 text-amber-950',
        danger: 'border-red-200 bg-red-50 text-red-900',
    }[tone];

    return <div className={`rounded-md border px-4 py-3 text-sm font-semibold leading-6 ${classes}`}>{children}</div>;
}
