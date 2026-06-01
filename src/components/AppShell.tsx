'use client';

import Sidebar from '@/components/Sidebar';
import PeriodBadge from '@/components/PeriodBadge';
import UpdateNotice from '@/components/UpdateNotice';
import { Bell, Building2, CircleHelp } from 'lucide-react';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const pageTitles: Record<string, string> = {
    '/': '대시보드',
    '/announcement': '베타 배포 안내',
    '/products': '품목 관리',
    '/periods': '보고기간',
    '/privacy': '개인정보 및 데이터 처리',
    '/processes': '생산공정',
    '/source-streams': '배출원 자료',
    '/precursors': '구매 전구물질',
    '/upload': '자료 업로드',
    '/results': '산정 결과',
    '/scenarios': '시나리오',
    '/export': 'EU Communication Template Export',
    '/installations': '사업장',
    '/settings': '데이터 안전',
    '/terms': '무료 약관 및 고지',
};

export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const title = pageTitles[pathname] ?? 'CBAM Local';

    return (
        <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#F6F8F7] text-slate-950">
            <Sidebar />
            <div className="min-w-0 overflow-x-hidden lg:pl-72">
                <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
                    <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                        <div>
                            <p className="text-xs font-medium text-slate-500">CBAM Local</p>
                            <h1 className="text-base font-semibold text-slate-950">{title}</h1>
                        </div>
                        <div className="flex items-center gap-2">
                            <PeriodBadge />
                            <div className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 md:flex">
                                <Building2 className="h-4 w-4 text-teal-700" />
                                로컬 사업장
                            </div>
                            <button
                                type="button"
                                aria-label="도움말"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                            >
                                <CircleHelp className="h-5 w-5" />
                            </button>
                            <button
                                type="button"
                                aria-label="알림"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-100"
                            >
                                <Bell className="h-5 w-5" />
                            </button>
                        </div>
                    </div>
                </header>
                <UpdateNotice />
                <main className="min-w-0 overflow-x-hidden px-4 py-6 pb-24 sm:px-6 lg:px-8 lg:pb-8">
                    <div className="mx-auto w-full min-w-0 max-w-7xl overflow-x-hidden">{children}</div>
                </main>
            </div>
        </div>
    );
}
