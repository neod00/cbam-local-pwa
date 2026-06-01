'use client';

import { getNextWorkflowStep, getWorkflowStepByRoute, workflowGuideSteps } from '@/lib/workflow-guide';
import { ArrowRight, ListChecks } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button, StatusBadge } from './ui';

export function WorkflowRouteBanner() {
    const pathname = usePathname();
    const currentStep = pathname === '/' ? undefined : getWorkflowStepByRoute(pathname);
    const isDashboard = pathname === '/';

    if (!isDashboard && !currentStep) {
        return null;
    }

    const nextStep = isDashboard ? workflowGuideSteps[0] : getNextWorkflowStep(pathname);
    const currentLabel = currentStep ? `${currentStep.order}. ${currentStep.title}` : '대시보드';
    const currentDescription = currentStep
        ? currentStep.primaryAction
        : '처음 사용하는 경우 전체 업무 흐름을 먼저 보고 사업장 등록부터 시작하세요.';

    return (
        <div className="border-b border-slate-200 bg-white/70">
            <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 flex-none items-center justify-center rounded-xl bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">
                        <ListChecks className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                            <p className="break-words text-sm font-semibold text-slate-950">현재 흐름: {currentLabel}</p>
                            <StatusBadge tone={currentStep ? 'info' : 'pending'}>{currentStep?.group ?? '시작 전 점검'}</StatusBadge>
                        </div>
                        <p className="mt-1 break-words text-xs leading-5 text-slate-600">{currentDescription}</p>
                    </div>
                </div>

                <div className="flex flex-wrap gap-2 lg:flex-none">
                    <Link href="/guide">
                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5">
                            전체 흐름
                        </Button>
                    </Link>
                    <Link href={nextStep.route}>
                        <Button type="button" className="min-h-9 px-3 py-1.5">
                            다음: {nextStep.title}
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            </div>
        </div>
    );
}
