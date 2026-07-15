import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import {
    BarChart3,
    Bell,
    Boxes,
    Building2,
    CalendarDays,
    ChevronDown,
    CircleHelp,
    CloudOff,
    Database,
    FileInput,
    FileSpreadsheet,
    Home,
    LockKeyhole,
    Package,
    Settings,
    ShieldCheck,
} from 'lucide-react';
import type { ReactNode } from 'react';

type NavItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    section?: string;
};

const navItems: NavItem[] = [
    { label: '대시보드', href: '/cockpit-preview', icon: Home, section: '현황' },
    { label: '품목 관리', href: '/cockpit-preview/products', icon: Package, section: '입력' },
    { label: '고지서 입력', href: '/cockpit-preview/bills', icon: FileInput, section: '입력' },
    { label: '배출량 관리', href: '/cockpit-preview/source-streams', icon: BarChart3, section: '입력' },
    { label: '검증 및 품질', href: '/cockpit-preview/validation', icon: ShieldCheck, section: '검토' },
    { label: '보고서', href: '/cockpit-preview/export', icon: FileSpreadsheet, section: '내보내기' },
    { label: 'EU Communication', href: '/cockpit-preview/export', icon: Database, section: '내보내기' },
    { label: '기준/계수 관리', href: '/cockpit-preview/source-streams', icon: Boxes, section: '관리' },
    { label: '사업장 관리', href: '/cockpit-preview', icon: Building2, section: '관리' },
    { label: '설정', href: '/cockpit-preview', icon: Settings, section: '관리' },
];

export function PreviewShell({
    activeHref,
    title,
    subtitle,
    children,
    actions,
}: {
    activeHref: string;
    title: string;
    subtitle: string;
    children: ReactNode;
    actions?: ReactNode;
}) {
    return (
        <main className="min-h-screen bg-[#F5F7F4] text-slate-950">
            <div className="flex min-h-screen">
                <aside className="hidden w-[258px] shrink-0 flex-col bg-[#0B3328] text-white shadow-[14px_0_40px_rgba(15,23,42,0.16)] lg:flex">
                    <div className="border-b border-white/10 px-5 py-5">
                        <div className="flex items-center gap-3">
                            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/12 ring-1 ring-white/12">
                                <Database className="h-5 w-5 text-emerald-100" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 text-lg font-semibold tracking-tight">
                                    CBAM Local
                                    <span className="rounded-md bg-white/12 px-1.5 py-0.5 text-[10px] font-bold text-emerald-100">PWA</span>
                                </div>
                                <p className="mt-1 text-xs font-medium text-emerald-100/70">로컬 우선 · 데이터 보호</p>
                            </div>
                        </div>
                    </div>

                    <nav className="flex-1 overflow-y-auto px-3 py-4">
                        {navItems.map((item, index) => {
                            const Icon = item.icon;
                            const active = item.href === activeHref;
                            const showSection = item.section !== navItems[index - 1]?.section;

                            return (
                                <div key={`${item.section}-${item.label}`}>
                                    {showSection && (
                                        <div className="px-3 pb-2 pt-4 text-[11px] font-bold uppercase tracking-wide text-emerald-50/45 first:pt-0">
                                            {item.section}
                                        </div>
                                    )}
                                    <Link
                                        href={item.href}
                                        className={`mb-1 flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition ${
                                            active ? 'bg-white/15 text-white ring-1 ring-white/12' : 'text-emerald-50/75 hover:bg-white/8 hover:text-white'
                                        }`}
                                    >
                                        <Icon className="h-[18px] w-[18px]" />
                                        {item.label}
                                    </Link>
                                </div>
                            );
                        })}
                    </nav>

                    <div className="p-4">
                        <div className="rounded-2xl border border-white/12 bg-white/[0.07] p-4">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center gap-2 text-sm font-semibold">
                                    <LockKeyhole className="h-4 w-4 text-emerald-200" />
                                    로컬 저장
                                </div>
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-300/15 px-2 py-0.5 text-xs font-semibold text-emerald-100">
                                    <span className="h-2 w-2 rounded-full bg-emerald-300" />
                                    정상
                                </span>
                            </div>
                            <p className="mt-3 text-xs leading-5 text-emerald-50/70">모든 데이터는 이 기기에 저장됩니다.</p>
                            <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-emerald-50/78">
                                <div className="flex items-center gap-2">
                                    <CloudOff className="h-3.5 w-3.5" />
                                    오프라인 모드
                                </div>
                                <div>마지막 동기화 2025-05-16 09:42</div>
                            </div>
                        </div>
                    </div>
                </aside>

                <div className="min-w-0 flex-1">
                    <header className="flex min-h-16 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5">
                        <div className="flex min-w-0 flex-wrap items-center gap-3">
                            <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">
                                <CalendarDays className="h-4 w-4 text-slate-500" />
                                2026 보고기간
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                            </button>
                            <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">
                                <Building2 className="h-4 w-4 text-slate-500" />
                                한빛제철(주) 포항사업장
                                <ChevronDown className="h-4 w-4 text-slate-400" />
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 md:inline-flex">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                로컬 저장 · 오프라인 모드
                            </span>
                            <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                                <Bell className="h-5 w-5" />
                            </button>
                            <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-500 hover:bg-slate-100">
                                <CircleHelp className="h-5 w-5" />
                            </button>
                            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
                                <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">ESG</div>
                                <div className="text-sm">
                                    <div className="font-semibold text-slate-900">ESG 담당자</div>
                                    <div className="text-xs text-slate-500">관리자</div>
                                </div>
                            </div>
                        </div>
                    </header>

                    <section className="space-y-5 p-5">
                        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                            <div>
                                <h1 className="text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
                                <p className="mt-2 text-sm font-medium text-slate-600">{subtitle}</p>
                            </div>
                            {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                        </div>
                        {children}
                    </section>
                </div>
            </div>
        </main>
    );
}

export function PreviewPanel({
    title,
    subtitle,
    children,
    action,
    className = '',
}: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ${className}`}>
            <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-slate-900">{title}</h2>
                    {subtitle && <p className="mt-1 text-xs font-semibold text-slate-500">{subtitle}</p>}
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

export function StatusPill({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' }) {
    const toneClass = {
        success: 'bg-emerald-50 text-emerald-800 ring-emerald-500/20',
        warning: 'bg-amber-50 text-amber-800 ring-amber-500/20',
        danger: 'bg-red-50 text-red-800 ring-red-500/20',
        info: 'bg-blue-50 text-blue-800 ring-blue-500/20',
        neutral: 'bg-slate-100 text-slate-700 ring-slate-300/70',
    }[tone];

    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${toneClass}`}>{children}</span>;
}

export function PrimaryButton({ children }: { children: ReactNode }) {
    return (
        <button className="inline-flex min-h-10 items-center justify-center rounded-xl bg-[#0F3D2E] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#15533F]">
            {children}
        </button>
    );
}

export function SecondaryButton({ children }: { children: ReactNode }) {
    return (
        <button className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
            {children}
        </button>
    );
}
