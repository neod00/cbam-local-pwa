'use client';

import { HelpCircle, Lightbulb, X } from 'lucide-react';
import { useState } from 'react';

// 입력 칸 옆에 "이 값 어디서?" 도우미를 다는 공용 부품(자체 열림 상태 관리).
// 사용: <FieldHelp title="..." sources={[...]} exampleLabel="예시값 채우기" onExample={() => setNewItem({...})} />
export function FieldHelp({
    title,
    sources,
    exampleLabel,
    onExample,
}: {
    title: string;
    sources: string[];
    exampleLabel?: string;
    onExample?: () => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <span className="relative inline-block align-middle">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-expanded={open}
                className="inline-flex h-6 items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 text-xs font-medium text-teal-700 transition hover:bg-teal-100"
            >
                <HelpCircle className="h-3.5 w-3.5" /> 이 값 어디서?
            </button>
            {open && (
                <div className="absolute left-0 top-8 z-40 w-72 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs leading-5 text-slate-700 shadow-xl">
                    <div className="mb-1 flex items-start justify-between gap-2">
                        <p className="font-semibold text-slate-900">{title}</p>
                        <button type="button" onClick={() => setOpen(false)} aria-label="닫기" className="text-slate-400 hover:text-slate-600">
                            <X className="h-3.5 w-3.5" />
                        </button>
                    </div>
                    <ul className="list-disc space-y-1 pl-4">
                        {sources.map((s, i) => (
                            <li key={i}>{s}</li>
                        ))}
                    </ul>
                    {exampleLabel && onExample && (
                        <button
                            type="button"
                            onClick={() => {
                                onExample();
                                setOpen(false);
                            }}
                            className="mt-2 inline-flex items-center gap-1 rounded-lg bg-teal-600 px-2 py-1 text-xs font-medium text-white hover:bg-teal-700"
                        >
                            <Lightbulb className="h-3.5 w-3.5" /> {exampleLabel}
                        </button>
                    )}
                </div>
            )}
        </span>
    );
}
