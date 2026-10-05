'use client';

import type { GuidedStepId } from '@/lib/guided-map';
import { summarizeEnergySplits, type EnergySplitKind } from '@/lib/energy-split-summary';
import type { ProductionProcess, SourceStream } from '@/lib/local-db';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo } from 'react';

const GUIDE: Array<{ kind: EnergySplitKind; question: string; answer: string; step: GuidedStepId }> = [
    { kind: 'HEAT', question: '보일러·스팀·온수를 만드는 연료인가요?', answer: '「보일러·스팀」 — 규정상 쓴 열량 비율로 나눕니다', step: 'fuel' },
    { kind: 'ELECTRICITY', question: '한전 고지서의 전기인가요?', answer: '「전력 나누기」 — 5단계', step: 'electricity' },
    { kind: 'FUEL', question: '그 밖의 연료(경유·LPG·가스 등)인가요?', answer: '「연료 나누기」 — 생산량 비율이 기본입니다', step: 'fuel' },
];

const KIND_LABEL: Record<EnergySplitKind, string> = { ELECTRICITY: '전기', FUEL: '연료', HEAT: '열' };

/**
 * 에너지 나누기 현황과 길 안내(4·5단계 맨 위). 전력 나누기·연료 나누기·보일러·스팀은 모두 「한 고지서를 여러 공정이 나눠 쓴다」는 같은 일인데
 * 규정이 달라 화면이 셋이다 — 담당자가 어느 것을 눌러야 하는지부터 헤매지 않게 한곳에서 보여준다. 계산하거나 저장하지 않는다.
 */
export function EnergySplitHub({
    step,
    processes,
    sourceStreams,
    onSelectStep,
}: {
    step: 'fuel' | 'electricity';
    processes: ProductionProcess[];
    sourceStreams: SourceStream[];
    onSelectStep: (id: GuidedStepId) => void;
}) {
    const summary = useMemo(() => summarizeEnergySplits({ processes, sourceStreams }), [processes, sourceStreams]);

    return (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4" aria-label="에너지 나누기 현황">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">에너지 나누기 — 한 고지서를 여러 공정이 같이 쓸 때</p>
                {summary.attentionCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-900">확인 {summary.attentionCount}건</span>
                ) : summary.items.length > 0 ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-800">{summary.items.length}건 정상</span>
                ) : null}
            </div>

            <ul className="space-y-1.5 text-xs leading-5 text-slate-700">
                {GUIDE.map((row) => {
                    const here = row.step === step;
                    return (
                        <li key={row.kind} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-semibold text-slate-800">{row.question}</span>
                            <span className="text-slate-600">→ {row.answer}</span>
                            {here ? (
                                <span className="text-slate-400">(이 화면 아래)</span>
                            ) : (
                                <button type="button" onClick={() => onSelectStep(row.step)} className="font-semibold text-teal-700 hover:underline">
                                    {row.step === 'electricity' ? '5단계로' : '4단계로'}
                                </button>
                            )}
                        </li>
                    );
                })}
            </ul>

            {summary.items.length > 0 ? (
                <ul className="space-y-1.5 border-t border-slate-100 pt-3 text-sm">
                    {summary.items.map((item) => (
                        <li key={item.key} className="flex items-start gap-2">
                            {item.problem || item.provisional ? (
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
                            ) : (
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-emerald-600" />
                            )}
                            <span className="min-w-0">
                                <span className="mr-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600">{KIND_LABEL[item.kind]}</span>
                                <span className="font-semibold text-slate-900">{item.title}</span>
                                <span className="ml-1.5 text-xs text-slate-500">{item.detail}</span>
                                {item.problem && <span className="mt-0.5 block text-xs leading-5 text-amber-800">{item.problem}</span>}
                                {!item.problem && item.provisional && (
                                    <span className="mt-0.5 block text-xs leading-5 text-amber-800">열 사용량이 임시 값입니다 — 열량계나 설비 자료로 바꾸세요.</span>
                                )}
                            </span>
                        </li>
                    ))}
                </ul>
            ) : (
                <p className="border-t border-slate-100 pt-3 text-xs leading-5 text-slate-500">
                    아직 나눈 것이 없습니다. 공정 하나만 쓰는 에너지는 나눌 필요 없이 그 공정에 그대로 넣으면 됩니다.
                </p>
            )}

            {summary.hints.map((hint) => (
                <p key={hint.text} className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                    <span>{hint.text}</span>
                </p>
            ))}
        </div>
    );
}
