'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    BarChart3,
    Boxes,
    Calendar,
    Database,
    FileSpreadsheet,
    Home,
    Monitor,
    Package,
    Settings,
    ShieldCheck,
    Upload,
    Workflow,
} from 'lucide-react';
import clsx from 'clsx';

const navigation = [
    { name: '대시보드', href: '/', icon: Home },
    { name: '제품 관리', href: '/products', icon: Package },
    { name: '보고기간', href: '/periods', icon: Calendar },
    { name: '생산공정', href: '/processes', icon: Workflow },
    { name: '전구물질', href: '/precursors', icon: Boxes },
    { name: '자료 업로드', href: '/upload', icon: Upload },
    { name: '산정결과', href: '/results', icon: BarChart3 },
    { name: 'EU Export', href: '/export', icon: FileSpreadsheet },
    { name: '사업장', href: '/installations', icon: Settings },
    { name: '데이터 안전', href: '/settings', icon: ShieldCheck },
    { name: '디자인 미리보기', href: '/design-preview', icon: Monitor },
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-700 text-white">
                        <Database className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="text-base font-semibold text-slate-950">CBAM Local</div>
                        <div className="text-xs text-slate-500">Clean Compliance Dashboard</div>
                    </div>
                </div>

                <nav className="flex-1 space-y-1 px-3 py-5">
                    {navigation.map((item) => {
                        const isActive = pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                href={item.href}
                                className={clsx(
                                    'group flex items-center rounded-2xl px-3 py-2.5 text-sm font-semibold transition',
                                    isActive
                                        ? 'bg-teal-50 text-teal-800'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                                )}
                            >
                                <item.icon
                                    className={clsx(
                                        'mr-3 h-5 w-5 flex-shrink-0',
                                        isActive ? 'text-teal-700' : 'text-slate-400 group-hover:text-slate-600'
                                    )}
                                />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>

                <div className="border-t border-slate-200 p-4">
                    <div className="rounded-2xl bg-slate-50 p-4">
                        <div className="text-sm font-semibold text-slate-950">로컬 사용자</div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            기업 데이터는 현재 브라우저에 저장되며 서버로 전송되지 않습니다.
                        </p>
                    </div>
                </div>
            </aside>

            <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-slate-200 bg-white/95 px-2 py-2 backdrop-blur lg:hidden">
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
