'use client';

import clsx from 'clsx';
import { Bell, FileText, KeyRound, LayoutDashboard, Megaphone, ShieldCheck, UploadCloud, Users } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const adminNavigation = [
    { name: '대시보드', href: '/admin', icon: LayoutDashboard },
    { name: '사용자/라이선스', href: '/admin#licenses', icon: Users },
    { name: '공지', href: '/admin#announcements', icon: Megaphone },
    { name: '업데이트', href: '/admin#updates', icon: UploadCloud },
    { name: '약관', href: '/admin#terms', icon: FileText },
    { name: '보안 체크', href: '/admin#security', icon: ShieldCheck },
];

export default function AdminShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const isAdminRoot = pathname === '/admin';

    return (
        <div className="min-h-screen min-w-0 overflow-x-hidden bg-[#F6F8F7] text-slate-950">
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/90 shadow-[0_1px_0_rgba(15,23,42,0.02)] backdrop-blur">
                <div className="mx-auto flex min-h-16 w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between gap-4">
                        <Link href="/admin" className="flex min-w-0 items-center gap-3">
                            <div className="flex h-10 w-10 flex-none items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm">
                                <KeyRound className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <p className="truncate text-base font-semibold text-slate-950">CBAM Local Admin</p>
                                <p className="truncate text-xs text-slate-500">License · Update · Notice Console</p>
                            </div>
                        </Link>

                        <div className="flex items-center gap-2">
                            <span className="hidden rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 ring-1 ring-inset ring-teal-100 sm:inline-flex">
                                Google OAuth 보호
                            </span>
                            <Link
                                href="/"
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                            >
                                사용자 앱
                            </Link>
                            <button
                                type="button"
                                aria-label="관리자 알림"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 ring-1 ring-transparent transition hover:bg-slate-100 hover:ring-slate-200"
                            >
                                <Bell className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
                        {adminNavigation.map((item) => {
                            const Icon = item.icon;
                            const isActive = isAdminRoot && item.href === '/admin';

                            return (
                                <Link
                                    key={item.name}
                                    href={item.href}
                                    className={clsx(
                                        'inline-flex min-h-10 flex-none items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition',
                                        isActive
                                            ? 'bg-slate-950 text-white shadow-sm'
                                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>
                </div>
            </header>

            <main className="px-4 py-6 pb-12 sm:px-6 lg:px-8">
                <div className="mx-auto w-full max-w-7xl">{children}</div>
            </main>
        </div>
    );
}
