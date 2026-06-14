'use client';

import { CBAM_GLOSSARY } from '@/lib/cbam-glossary';
import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

// 전문용어에 호버 툴팁(쉬운말 풀이)을 다는 공용 부품.
// 사용: <Term term="SEE" /> 또는 <Term term="CN 코드">CN 코드</Term>
export function Term({ term, children }: { term: string; children?: ReactNode }) {
    const desc = CBAM_GLOSSARY[term];

    if (!desc) {
        return <>{children ?? term}</>;
    }

    return (
        <span className="group relative inline-flex cursor-help items-center gap-0.5 border-b border-dashed border-teal-400 text-teal-800">
            {children ?? term}
            <HelpCircle className="h-3 w-3 flex-none text-teal-500" />
            <span
                role="tooltip"
                className="pointer-events-none absolute bottom-full left-1/2 z-40 mb-2 w-64 -translate-x-1/2 rounded-xl bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-5 text-white opacity-0 shadow-lg transition group-hover:opacity-100"
            >
                <span className="font-semibold">{term}</span>
                <br />
                {desc}
            </span>
        </span>
    );
}
