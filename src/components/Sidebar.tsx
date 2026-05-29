'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Package, Calendar, Upload, BarChart, Settings, ShieldCheck, Workflow } from 'lucide-react';
import clsx from 'clsx';

const navigation = [
    { name: 'Dashboard', href: '/', icon: Home },
    { name: 'Products (HS72/73)', href: '/products', icon: Package },
    { name: 'Periods', href: '/periods', icon: Calendar },
    { name: 'Processes', href: '/processes', icon: Workflow },
    { name: 'Data Upload', href: '/upload', icon: Upload },
    { name: 'Results', href: '/results', icon: BarChart },
    { name: 'Installations', href: '/installations', icon: Settings },
    { name: 'Data Safety', href: '/settings', icon: ShieldCheck },
];

export default function Sidebar() {
    const pathname = usePathname();

    return (
        <div className="flex h-full w-64 flex-col bg-gray-900 text-white">
            <div className="flex h-16 items-center justify-center border-b border-gray-800">
                <h1 className="text-xl font-bold">CBAM Platform</h1>
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
                        <p className="text-sm font-medium text-white">User</p>
                        <p className="text-xs text-gray-400">user@example.com</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
