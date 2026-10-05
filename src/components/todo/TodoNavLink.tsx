'use client';

import { ListChecks } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { loadTodoData } from './todo-data';

/**
 * 지도 화면 머리글의 「할 일 N」 — 남은 일 수를 보여 주고 할 일 화면으로 간다(UX 목업 4번의 상단 메뉴).
 * 수는 화면을 옮길 때마다 다시 센다. 읽지 못하면 숫자 없이 링크만 둔다(막는 일이 아니다).
 */
export function TodoNavLink() {
    const pathname = usePathname();
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        let active = true;
        loadTodoData()
            .then((loaded) => {
                if (active) setCount(loaded.result.counts.total);
            })
            .catch(() => {
                if (active) setCount(null);
            });
        return () => {
            active = false;
        };
    }, [pathname]);

    const current = pathname === '/todo';
    return (
        <Link
            href="/todo"
            aria-current={current ? 'page' : undefined}
            data-testid="todo-nav"
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-3 text-sm font-bold transition ${current ? 'border-teal-300 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300'}`}
        >
            <ListChecks className="h-4 w-4" />
            할 일{count !== null && count > 0 ? <span className="rounded-full bg-amber-100 px-1.5 text-xs text-amber-900" data-testid="todo-nav-count">{count}</span> : null}
        </Link>
    );
}
