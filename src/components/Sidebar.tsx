'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
    Home,
    Package,
    Calendar,
    Upload,
    FileSpreadsheet,
    BarChart,
    Monitor,
    Settings,
    ShieldCheck,
    Workflow,
    Boxes,
} from 'lucide-react';
import clsx from 'clsx';

const navigation = [
    { name: '대시보드', href: '/', icon: Home },
    { name: '완성 디자인', href: '/design-preview', icon: Monitor },
    { name: '제품(HS72/73)', href: '/products', icon: Package },
    { name: '보고기간', href: '/periods', icon: Calendar },
    { name: '생산공정', href: '/processes', icon: Workflow },
    { name: '구매 전구물질', href: '/precursors', icon: Boxes },
    { name: '자료 업로드', href: '/upload', icon: Upload },
    { name: '산정결과', href: '/results', icon: BarChart },
    { name: 'EU 템플릿 Export', href: '/export', icon: FileSpreadsheet },
    { name: '사업장', href: '/installations', icon: Settings },
    { name: '데이터 안전', href: '/settings', icon: ShieldCheck },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
            <div className="flex h-16 items-center justify-center border-b border-gray-800">
                <h1 className="text-xl font-bold">CBAM Local</h1>
            </div>
            <nav className="flex-1 space-y-1 px-2 py-4">
                {navigation.map((item) => {
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={clsx(
                                'group flex items-center rounded-md px-2 py-2 text-sm font-medium',
                                isActive
                                    ? 'bg-gray-800 text-white'
                                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                            )}
                        >
                            <item.icon
                                className={clsx(
                                    'mr-3 h-6 w-6 flex-shrink-0',
                                    isActive ? 'text-white' : 'text-gray-400 group-hover:text-gray-300'
                                )}
                            />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>
            <div className="border-t border-gray-800 p-4">
                <div className="flex items-center">
                    <div className="ml-3">
                        <p className="text-sm font-medium text-white">로컬 사용자</p>
                        <p className="text-xs text-gray-400">서버 전송 없음</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
