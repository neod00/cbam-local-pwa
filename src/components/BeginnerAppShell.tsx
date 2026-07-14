'use client';

import { BeginnerDashboard } from '@/components/BeginnerDashboard';
import { BeginnerExport, BeginnerResults } from '@/components/BeginnerReviewPages';
import BeginnerPrecursors from '@/components/BeginnerPrecursors';
import BeginnerProcesses from '@/components/BeginnerProcesses';
import BeginnerProducts from '@/components/BeginnerProducts';
import BeginnerSourceStreams from '@/components/BeginnerSourceStreams';
import LicenseGate from '@/components/LicenseGate';
import UpdateNotice from '@/components/UpdateNotice';
import {
    CalendarDays,
    ChevronDown,
    CircleHelp,
    CloudOff,
    Database,
    FileCheck2,
    FileSpreadsheet,
    Home,
    ListChecks,
    RotateCcw,
    Settings,
    ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';

type NavigationItem = {
    label: string;
    href: string;
    icon: typeof Home;
    routes: readonly string[];
};

const navigation: NavigationItem[] = [
    { label: '대시보드', href: '/', icon: Home, routes: ['/'] },
    {
        label: '준비 및 입력',
        href: '/workspace',
        icon: ListChecks,
        routes: ['/workspace', '/installations', '/periods', '/products', '/processes', '/source-streams', '/precursors', '/upload'],
    },
    {
        label: '검증 및 결과',
        href: '/results',
        icon: FileCheck2,
        routes: ['/results', '/scenarios'],
    },
    { label: 'EU 보고서', href: '/export', icon: FileSpreadsheet, routes: ['/export'] },
    { label: '설정', href: '/settings', icon: Settings, routes: ['/settings'] },
];

function isNavigationActive(pathname: string, item: NavigationItem) {
    if (item.href === '/') {
        return pathname === '/';
    }

    return item.routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

function BeginnerSidebar({ pathname }: { pathname: string }) {
    return (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#123D32] text-white lg:flex">
            <div className="border-b border-white/10 px-5 py-6">
                <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                        <Database className="h-5 w-5 text-emerald-100" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 whitespace-nowrap text-lg font-semibold">
                            CBAM Local
                            <span className="rounded border border-emerald-100/60 px-1.5 py-0.5 text-[10px] font-bold text-emerald-50">
                                PWA
                            </span>
                        </div>
                        <p className="mt-1 text-xs text-emerald-50/70">로컬 우선 · 데이터 보호</p>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-2 px-3 py-5" aria-label="주요 메뉴">
                {navigation.map((item) => {
                    const Icon = item.icon;
                    const active = isNavigationActive(pathname, item);

                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-12 items-center gap-3 rounded-lg px-4 text-sm font-semibold transition ${
                                active
                                    ? 'bg-white/14 text-white ring-1 ring-white/12'
                                    : 'text-emerald-50/78 hover:bg-white/8 hover:text-white'
                            }`}
                        >
                            <Icon className="h-5 w-5 flex-none" />
                            {item.label}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-white/10 px-5 py-5 text-sm">
                <div className="flex items-center gap-2 font-semibold text-emerald-50">
                    <ShieldCheck className="h-4 w-4 text-emerald-200" />
                    로컬 저장 정상
                </div>
                <div className="mt-3 flex items-center gap-2 text-emerald-50/72">
                    <CloudOff className="h-4 w-4" />
                    오프라인 사용 가능
                </div>
            </div>
        </aside>
    );
}

function MobileNavigation({ pathname }: { pathname: string }) {
    return (
        <nav className="flex gap-2 overflow-x-auto border-b border-slate-200 bg-white px-4 py-2 lg:hidden" aria-label="모바일 주요 메뉴">
            {navigation.map((item) => {
                const Icon = item.icon;
                const active = isNavigationActive(pathname, item);

                return (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`inline-flex min-h-10 flex-none items-center gap-2 rounded-md px-3 text-xs font-semibold ${
                            active ? 'bg-emerald-50 text-[#123D32]' : 'text-slate-600'
                        }`}
                    >
                        <Icon className="h-4 w-4" />
                        {item.label}
                    </Link>
                );
            })}
        </nav>
    );
}

export default function BeginnerAppShell({
    children,
    onUsePrevious,
}: {
    children: ReactNode;
    onUsePrevious: () => void;
}) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const advanced = searchParams.get('advanced') === '1' || searchParams.has('edit');
    const beginnerPages: Record<string, ReactNode> = {
        '/': <BeginnerDashboard />,
        '/products': <BeginnerProducts />,
        '/processes': <BeginnerProcesses />,
        '/source-streams': <BeginnerSourceStreams />,
        '/precursors': <BeginnerPrecursors />,
        '/results': <BeginnerResults />,
        '/export': <BeginnerExport />,
    };
    const content = advanced ? children : beginnerPages[pathname] ?? children;

    return (
        <div className="min-h-screen min-w-0 bg-[#F5F7F5] text-slate-950">
            <BeginnerSidebar pathname={pathname} />

            <div className="min-w-0 lg:pl-60">
                <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
                    <div className="flex min-h-16 items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
                        <Link
                            href="/workspace"
                            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
                        >
                            <CalendarDays className="h-4 w-4 text-slate-600" />
                            <span className="hidden sm:inline">2026 보고기간</span>
                            <span className="sm:hidden">2026</span>
                            <ChevronDown className="h-4 w-4 text-slate-400" />
                        </Link>

                        <div className="flex items-center gap-2">
                            <div className="hidden min-h-10 items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-semibold text-emerald-900 md:flex">
                                <ShieldCheck className="h-4 w-4" />
                                로컬 저장 · 오프라인 모드
                            </div>
                            <button
                                type="button"
                                onClick={onUsePrevious}
                                className="hidden min-h-10 items-center rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 sm:inline-flex"
                            >
                                <RotateCcw className="mr-2 h-4 w-4" />
                                이전 버전
                            </button>
                            <Link
                                href="/guide"
                                aria-label="도움말"
                                title="도움말"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100"
                            >
                                <CircleHelp className="h-5 w-5" />
                            </Link>
                            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 sm:flex">
                                <div className="grid h-9 w-9 place-items-center rounded-full bg-[#123D32] text-xs font-bold text-white">
                                    ESG
                                </div>
                                <span className="text-sm font-semibold text-slate-800">ESG 담당자</span>
                            </div>
                        </div>
                    </div>
                    <MobileNavigation pathname={pathname} />
                </header>

                <UpdateNotice />

                <main className="min-w-0 overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-10">
                    <div className="mx-auto w-full max-w-[1480px]">
                        {advanced && (
                            <div className="mb-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <p className="text-sm font-bold text-slate-900">고급 화면</p>
                                    <p className="mt-0.5 text-xs text-slate-500">세부 계수, 배분, 템플릿 기능을 직접 조정합니다.</p>
                                </div>
                                <Link href={pathname} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                    간단 화면으로 돌아가기
                                </Link>
                            </div>
                        )}
                        <LicenseGate>{content}</LicenseGate>
                    </div>
                </main>
            </div>
        </div>
    );
}
