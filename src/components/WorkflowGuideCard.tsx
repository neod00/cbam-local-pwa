import { workflowGuideSteps } from '@/lib/workflow-guide';
import clsx from 'clsx';
import { ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { Button, SectionCard, StatusBadge } from './ui';

const toneClass = {
    start: 'border-blue-100 bg-blue-50/60 text-blue-800',
    input: 'border-teal-100 bg-teal-50/60 text-teal-800',
    review: 'border-amber-100 bg-amber-50/60 text-amber-800',
    export: 'border-indigo-100 bg-indigo-50/60 text-indigo-800',
    safety: 'border-emerald-100 bg-emerald-50/60 text-emerald-800',
};

export function WorkflowGuideCard({
    currentRoute = '/',
    compact = false,
}: {
    currentRoute?: string;
    compact?: boolean;
}) {
    const currentIndex = workflowGuideSteps.findIndex((step) => step.route === currentRoute);
    const activeIndex = currentIndex >= 0 ? currentIndex : 0;
    const visibleSteps = compact
        ? workflowGuideSteps.slice(Math.max(activeIndex - 1, 0), Math.min(activeIndex + 4, workflowGuideSteps.length))
        : workflowGuideSteps;

    return (
        <SectionCard
            title="처음 따라하기"
            description="CBAM 업무가 익숙하지 않다면 아래 순서대로 진행하세요. 계산 화면보다 입력 근거와 Export 검토 순서를 먼저 잡는 흐름입니다."
            actions={compact ? (
                <Link href="/guide">
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5">
                        전체 흐름 보기
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
            ) : undefined}
        >
            <div className={clsx('grid grid-cols-1 gap-3', compact ? 'xl:grid-cols-4' : 'md:grid-cols-2 xl:grid-cols-3')}>
                {visibleSteps.map((step) => {
                    const Icon = step.icon;
                    const isCurrent = step.route === currentRoute;

                    return (
                        <Link
                            key={`${step.order}-${step.id}`}
                            href={step.route}
                            className={clsx(
                                'group block min-w-0 rounded-2xl border p-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-card-hover)]',
                                toneClass[step.tone],
                                isCurrent && 'ring-2 ring-teal-600 ring-offset-2 ring-offset-white'
                            )}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-white text-sm font-semibold ring-1 ring-inset ring-black/5">
                                        {step.order}
                                    </div>
                                    <div className="min-w-0">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <h3 className="break-words text-sm font-semibold text-slate-950">{step.title}</h3>
                                            {isCurrent && <StatusBadge tone="success">현재 화면</StatusBadge>}
                                        </div>
                                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{step.group}</p>
                                    </div>
                                </div>
                                <Icon className="h-5 w-5 flex-none opacity-80" />
                            </div>
                            <p className="mt-3 break-words text-sm leading-6 text-slate-700">{step.primaryAction}</p>
                            {!compact && (
                                <div className="mt-3 rounded-xl bg-white/75 p-3 text-xs leading-5 text-slate-600 ring-1 ring-inset ring-black/5">
                                    <div className="flex gap-2">
                                        <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-teal-700" />
                                        <span>{step.completionSignal}</span>
                                    </div>
                                </div>
                            )}
                        </Link>
                    );
                })}
            </div>
        </SectionCard>
    );
}
