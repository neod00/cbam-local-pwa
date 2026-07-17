'use client';

import AdminShell from '@/components/AdminShell';
import BeginnerAppShell from '@/components/BeginnerAppShell';
import { GuidedWorkspace } from '@/components/guided/GuidedWorkspace';
import LicenseGate from '@/components/LicenseGate';
import { ModernDashboard } from '@/components/ModernDashboard';
import { ModernProducts } from '@/components/ModernProducts';
import PeriodBadge from '@/components/PeriodBadge';
import Sidebar from '@/components/Sidebar';
import UpdateNotice from '@/components/UpdateNotice';
import { WorkflowRouteBanner } from '@/components/WorkflowRouteBanner';
import {
    ArrowLeft,
    BarChart3,
    Bell,
    Boxes,
    Building2,
    CalendarDays,
    CircleHelp,
    CloudOff,
    Database,
    FileSpreadsheet,
    FileText,
    Home,
    LockKeyhole,
    Map as MapIcon,
    Package,
    RotateCcw,
    Settings,
    ShieldCheck,
    Sparkles,
    Upload,
    Workflow,
    Zap,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Suspense, type ReactNode, useState } from 'react';

const UI_MODE_KEY = 'cbam-local-ui-mode';
type UiMode = 'guided' | 'modern' | 'previous' | 'legacy';

const pageTitles: Record<string, string> = {
    '/': '대시보드',
    '/announcement': '배포 안내',
    '/guide': '시작 가이드',
    '/license': '무료 사용 등록',
    '/products': '품목 관리',
    '/workspace': '준비 및 입력',
    '/periods': '보고기간',
    '/processes': '생산공정',
    '/source-streams': '배출원 자료',
    '/precursors': '구매 전구물질',
    '/upload': '자료 업로드',
    '/results': '산정 결과',
    '/scenarios': '인증서 비용 시나리오',
    '/export': 'EU Communication Export',
    '/report-inputs': '산정보고서 입력',
    '/installations': '사업장',
    '/settings': '데이터 안전',
    '/terms': '무료 약관 및 고지',
    '/privacy': '개인정보 안내',
};

const modernNavigation = [
    { section: '현황', name: '대시보드', href: '/', icon: Home },
    { section: '입력', name: '품목 관리', href: '/products', icon: Package },
    { section: '입력', name: '사업장', href: '/installations', icon: Building2 },
    { section: '입력', name: '보고기간', href: '/periods', icon: CalendarDays },
    { section: '입력', name: '생산공정', href: '/processes', icon: Workflow },
    { section: '입력', name: '배출원 자료', href: '/source-streams', icon: Zap },
    { section: '입력', name: '구매 전구물질', href: '/precursors', icon: Boxes },
    { section: '입력', name: '자료 업로드', href: '/upload', icon: Upload },
    { section: '검토', name: '산정 결과', href: '/results', icon: BarChart3 },
    { section: '검토', name: '인증서 비용 시나리오', href: '/scenarios', icon: FileText },
    { section: '내보내기', name: 'EU Communication', href: '/export', icon: FileSpreadsheet },
    { section: '관리', name: '데이터 안전', href: '/settings', icon: ShieldCheck },
    { section: '관리', name: '기준/계수 관리', href: '/source-streams', icon: Database },
    { section: '관리', name: '설정', href: '/settings', icon: Settings },
] as const;

function setUiMode(mode: UiMode) {
    window.localStorage.setItem(UI_MODE_KEY, mode);

    if (mode === 'previous' && window.location.pathname === '/workspace') {
        window.location.assign('/');
        return;
    }

    window.location.reload();
}

function ModernSidebar({ pathname }: { pathname: string }) {
    return (
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-[270px] flex-col bg-[#0B3328] text-white shadow-[14px_0_40px_rgba(15,23,42,0.16)] lg:flex">
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
                {modernNavigation.map((item, index) => {
                    const Icon = item.icon;
                    const active = pathname === item.href;
                    const showSection = item.section !== modernNavigation[index - 1]?.section;

                    return (
                        <div key={`${item.section}-${item.name}`}>
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
                                {item.name}
                            </Link>
                        </div>
                    );
                })}
            </nav>

            <div className="space-y-3 p-4">
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
                    <p className="mt-3 text-xs leading-5 text-emerald-50/70">기업 데이터는 이 기기에 저장되며 서버로 전송하지 않습니다.</p>
                    <div className="mt-4 space-y-2 border-t border-white/10 pt-4 text-xs text-emerald-50/78">
                        <div className="flex items-center gap-2">
                            <CloudOff className="h-3.5 w-3.5" />
                            오프라인 모드
                        </div>
                        <div>마지막 동기화 2025-05-16 09:42</div>
                    </div>
                </div>

                <button
                    type="button"
                    aria-hidden="true"
                    className="hidden"
                >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    이전 UI로 돌아가기
                </button>
            </div>
        </aside>
    );
}

function ModernAppShell({ children, title }: { children: ReactNode; title: string }) {
    const pathname = usePathname();
    const content = pathname === '/'
        ? <ModernDashboard />
        : pathname === '/products'
            ? <ModernProducts />
            : children;

    return (
        <div className="min-h-screen min-w-0 bg-[#F5F7F4] text-slate-950">
            <ModernSidebar pathname={pathname} />
            <div className="min-w-0 lg:pl-[270px]">
                <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
                    <div className="flex min-h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold text-slate-500">CBAM Local</p>
                            <h1 className="truncate text-lg font-bold tracking-tight text-slate-950">{title}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <PeriodBadge />
                            <div className="hidden items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 md:flex">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                로컬 저장 · 오프라인 모드
                            </div>
                            <Link
                                href="/cockpit-preview"
                                className="hidden"
                            >
                                <Sparkles className="mr-2 h-4 w-4 text-teal-700" />
                                프리뷰 보기
                            </Link>
                            <button
                                type="button"
                                onClick={() => setUiMode('guided')}
                                className="hidden min-h-10 items-center rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 md:inline-flex"
                            >
                                <MapIcon className="mr-2 h-4 w-4" />
                                지도 화면
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiMode('modern')}
                                className="hidden min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 md:inline-flex"
                            >
                                <Sparkles className="mr-2 h-4 w-4" />
                                새 UI
                            </button>
                            <Link
                                href="/guide"
                                aria-label="도움말"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200"
                            >
                                <CircleHelp className="h-5 w-5" />
                            </Link>
                            <button
                                type="button"
                                aria-label="알림"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200"
                            >
                                <Bell className="h-5 w-5" />
                            </button>
                            <div className="hidden items-center gap-2 border-l border-slate-200 pl-3 lg:flex">
                                <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                                    ESG
                                </div>
                                <div className="text-sm">
                                    <div className="font-semibold text-slate-900">ESG 담당자</div>
                                    <div className="text-xs text-slate-500">관리자</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </header>
                <UpdateNotice />
                <main className="min-w-0 overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
                    <div className="mx-auto w-full min-w-0 max-w-[1760px] overflow-x-hidden">
                        <LicenseGate>{content}</LicenseGate>
                    </div>
                </main>
            </div>
        </div>
    );
}

// 지도형 작업 공간 셸: '/'는 지도, 그 외 라우트는 백스테이지(상세 입력)로 취급하고
// "지도로 돌아가기" 헤더만 남긴다. 메뉴·사이드바 없음 — 지도가 곧 내비게이션.
function GuidedShell({ children, title }: { children: ReactNode; title: string }) {
    const pathname = usePathname();
    const isMap = pathname === '/';

    return (
        <div className="min-h-screen min-w-0 bg-[#F5F7F4] text-slate-950">
            <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/92 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
                <div className="mx-auto flex min-h-14 w-full max-w-[1480px] items-center justify-between gap-3 px-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        {isMap ? (
                            <div className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-950">
                                CBAM Local
                                <span className="rounded-md bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-800">지도</span>
                            </div>
                        ) : (
                            <Link
                                href="/"
                                className="inline-flex min-h-9 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 text-sm font-bold text-teal-800 transition hover:bg-teal-100"
                            >
                                <ArrowLeft className="h-4 w-4" />
                                지도로 돌아가기
                            </Link>
                        )}
                        {!isMap && <span className="truncate text-sm font-semibold text-slate-600">{title}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                        <PeriodBadge />
                        <button
                            type="button"
                            onClick={() => setUiMode('modern')}
                            className="hidden min-h-9 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 md:inline-flex"
                        >
                            <RotateCcw className="mr-2 h-3.5 w-3.5" />
                            이전 화면
                        </button>
                    </div>
                </div>
            </header>
            <UpdateNotice />
            <main className="min-w-0 overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:pb-10">
                <div className="mx-auto w-full min-w-0 max-w-[1480px] overflow-x-hidden">
                    <LicenseGate>{isMap ? <GuidedWorkspace /> : children}</LicenseGate>
                </div>
            </main>
        </div>
    );
}

function LegacyShell({ children, title }: { children: ReactNode; title: string }) {
    return (
        <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#F6F8F7] text-slate-950">
            <Sidebar />
            <div className="min-w-0 overflow-x-hidden lg:pl-72">
                <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
                    <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                        <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-500">CBAM Local</p>
                            <h1 className="truncate text-base font-semibold text-slate-950">{title}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <PeriodBadge />
                            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 md:flex">
                                <Building2 className="h-4 w-4 text-teal-700" />
                                로컬 사업장
                            </div>
                            <button
                                type="button"
                                onClick={() => setUiMode('guided')}
                                className="hidden min-h-10 items-center rounded-xl border border-teal-200 bg-teal-50 px-3 text-xs font-bold text-teal-800 shadow-sm transition hover:bg-teal-100 md:inline-flex"
                            >
                                <MapIcon className="mr-2 h-4 w-4" />
                                지도 화면
                            </button>
                            <button
                                type="button"
                                onClick={() => setUiMode('modern')}
                                className="hidden min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 md:inline-flex"
                            >
                                <Sparkles className="mr-2 h-4 w-4" />
                                새 UI
                            </button>
                            <Link
                                href="/guide"
                                aria-label="도움말"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200"
                            >
                                <CircleHelp className="h-5 w-5" />
                            </Link>
                            <button
                                type="button"
                                aria-label="알림"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200"
                            >
                                <Bell className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </header>
                <UpdateNotice />
                <WorkflowRouteBanner />
                <main className="min-w-0 overflow-x-hidden px-4 py-7 pb-24 sm:px-6 lg:px-8 lg:pb-8">
                    <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden">
                        <LicenseGate>{children}</LicenseGate>
                    </div>
                </main>
            </div>
        </div>
    );
}

export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const title = pageTitles[pathname] ?? 'CBAM Local';
    const [uiMode] = useState<UiMode>(() => {
        if (typeof window === 'undefined') {
            return 'guided';
        }

        const storedMode = window.localStorage.getItem(UI_MODE_KEY);
        if (storedMode === 'legacy' || storedMode === 'previous' || storedMode === 'modern') {
            return storedMode;
        }

        return 'guided';
    });

    if (pathname.startsWith('/cockpit-preview')) {
        return <>{children}</>;
    }

    if (pathname.startsWith('/admin')) {
        return <AdminShell>{children}</AdminShell>;
    }

    if (uiMode === 'legacy') {
        return <LegacyShell title={title}>{children}</LegacyShell>;
    }

    if (uiMode === 'previous') {
        return <ModernAppShell title={title}>{children}</ModernAppShell>;
    }

    if (uiMode === 'modern') {
        return (
            <Suspense fallback={null}>
                <BeginnerAppShell onUsePrevious={() => setUiMode('previous')} onUseGuided={() => setUiMode('guided')}>
                    {children}
                </BeginnerAppShell>
            </Suspense>
        );
    }

    return (
        <Suspense fallback={null}>
            <GuidedShell title={title}>{children}</GuidedShell>
        </Suspense>
    );
}
