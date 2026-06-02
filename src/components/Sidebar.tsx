'use client';

import clsx from 'clsx';
import {
    BarChart3,
    Boxes,
    Calculator,
    Calendar,
    Database,
    FileSpreadsheet,
    FileText,
    Flame,
    Home,
    ListChecks,
    Megaphone,
    Package,
    ServerOff,
    Settings,
    ShieldCheck,
    Upload,
    Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const navigationGroups = [
    {
        label: '시작',
        items: [
            { name: '대시보드', href: '/', icon: Home },
            { name: '시작 가이드', href: '/guide', icon: ListChecks },
            { name: '사업장', href: '/installations', icon: Settings },
            { name: '보고기간', href: '/periods', icon: Calendar },
        ],
    },
    {
        label: '입력자료',
        items: [
            { name: '품목 관리', href: '/products', icon: Package },
            { name: '생산공정', href: '/processes', icon: Workflow },
            { name: '배출원 자료', href: '/source-streams', icon: Flame },
            { name: '구매 전구물질', href: '/precursors', icon: Boxes },
            { name: '자료 업로드', href: '/upload', icon: Upload },
        ],
    },
    {
        label: '산정·검토',
        items: [
            { name: '산정 결과', href: '/results', icon: BarChart3 },
            { name: 'SEFA·인증서 시나리오', href: '/scenarios', icon: Calculator },
        ],
    },
    {
        label: '내보내기',
        items: [
            { name: 'EU Communication', href: '/export', icon: FileSpreadsheet },
        ],
    },
    {
        label: '보안·관리',
        items: [
            { name: '데이터 안전', href: '/settings', icon: ShieldCheck },
            { name: '배포 안내', href: '/announcement', icon: Megaphone },
            { name: '약관/고지', href: '/terms', icon: FileText },
            { name: '개인정보 안내', href: '/privacy', icon: ServerOff },
        ],
    },
];

const mobileNavigation = [
    { name: '홈', href: '/', icon: Home },
    { name: '품목', href: '/products', icon: Package },
    { name: '결과', href: '/results', icon: BarChart3 },
    { name: '설정', href: '/settings', icon: ShieldCheck },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <>
            <aside className="fixed inset-y-0 left-0 z-30 hidden w-72 border-r border-slate-200 bg-white lg:flex lg:flex-col">
                <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-700 text-white shadow-sm shadow-teal-900/20">
                        <Database className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-base font-semibold text-slate-950">CBAM Local</div>
                        <div className="text-xs text-slate-500">Clean Compliance Dashboard</div>
                    </div>
                </div>

                <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
                    {navigationGroups.map((group) => (
                        <div key={group.label}>
                            <div className="px-3 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                                {group.label}
                            </div>
                            <div className="mt-2 space-y-1">
                                {group.items.map((item) => {
                                    const isActive = pathname === item.href;
                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.href}
                                            className={clsx(
                                                'group flex items-center rounded-xl px-3 py-2.5 text-sm font-semibold transition',
                                                isActive
                                                    ? 'bg-teal-50 text-teal-900 ring-1 ring-inset ring-teal-100'
                                                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                                            )}
                                        >
                                            <item.icon
                                                className={clsx(
                                                    'mr-3 h-5 w-5 flex-shrink-0',
                                                    isActive ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                                                )}
                                            />
                                            <span className="min-w-0 break-words">{item.name}</span>
                                        </Link>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="border-t border-slate-200 p-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
                            <ShieldCheck className="h-4 w-4 text-teal-700" />
                            로컬 사용 중
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            기업 데이터는 현재 브라우저에 저장되며 서버로 전송하지 않습니다.
                        </p>
                    </div>
                </div>
            </aside>

            <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 py-2 shadow-[0_-10px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden">
                {mobileNavigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'flex min-h-12 flex-col items-center justify-center rounded-xl text-xs font-semibold',
                                isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-500'
                            )}
                        >
                            <item.icon className="mb-1 h-5 w-5" />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
        </>
    );
}
