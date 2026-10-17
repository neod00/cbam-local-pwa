'use client';

import { SectionCard, StatusBadge } from '@/components/ui';
import type { PlanItemStatus, PlanSection } from '@/lib/monitoring-plan';

const STATUS_LABEL: Record<PlanItemStatus, string> = {
    AUTO: '채워짐',
    PARTIAL: '일부 채움',
    TODO: '작성 필요',
    NA: '해당 없음으로 보임',
};

const inputClass = 'w-full min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-teal-500';

/**
 * 모니터링 계획 초안(Word)에서 앱이 알 수 없어 「작성 필요」로 남는 항목을 앱 안에서 적는다.
 * 어떤 항목이 물음을 갖는지는 계획 만들기(buildMonitoringPlan)가 정한다 — 이 화면은 그 목록을 그대로 보여 주고 답을 돌려줄 뿐이다.
 * 답은 보고서 입력(report:inputs)의 monitoring_plan.answers에 항목 번호 키로 저장된다.
 */
export function MonitoringPlanAnswers({
    sections,
    answers,
    onChange,
}: {
    /** 물음이 있는 항목들(buildMonitoringPlan의 sections 중 questions가 있는 것) */
    sections: PlanSection[];
    answers: Record<string, string>;
    onChange: (no: number, text: string) => void;
}) {
    return (
        <SectionCard
            title="모니터링 계획 초안에서 직접 쓰는 항목"
            description="앱이 알 수 없는 것(측정기 위치, 시료 채취, 자가발전, 검·교정과 위험 평가 같은 회사의 운영 방식)입니다. 여기에 적으면 모니터링 계획 초안(Word)의 해당 항목 「작성 필요」 자리에 그대로 실립니다. 비워 두면 종전처럼 작성 필요로 남습니다."
        >
            {sections.length === 0 && <p className="text-sm text-slate-500">지금 입력된 자료로는 직접 쓸 항목이 없습니다.</p>}
            <div className="space-y-5" data-testid="monitoring-plan-answers">
                {sections.map((section) => (
                    <div key={section.no} className="space-y-2" data-testid={`plan-answer-${section.no}`}>
                        <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">{section.no}. {section.title}</p>
                            <StatusBadge tone={section.status === 'AUTO' ? 'success' : 'warning'}>{STATUS_LABEL[section.status]}</StatusBadge>
                        </div>
                        <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-slate-600">
                            {section.questions.map((question) => <li key={question}>{question}</li>)}
                        </ul>
                        <textarea
                            className={`${inputClass} min-h-24`}
                            value={answers[String(section.no)] ?? ''}
                            placeholder="여기에 적으세요 (여러 줄 가능)"
                            onChange={(event) => onChange(section.no, event.target.value)}
                        />
                    </div>
                ))}
            </div>
            <p className="mt-3 text-xs text-slate-500">위 「저장」을 눌러야 저장됩니다. 새 프로젝트를 시작하면 다른 보고서 입력과 함께 지워지고, 백업(.cbam)에는 함께 담깁니다.</p>
        </SectionCard>
    );
}
