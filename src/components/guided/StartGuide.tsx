'use client';

import { EXPLAIN_LEVEL_LABEL, type ExplainLevel } from '@/lib/step-explainers';
import { BookOpen, FileSpreadsheet, Gauge, MessageCircleQuestion, X } from 'lucide-react';
import Link from 'next/link';
import { useExplainLevel } from './ExplainLevel';

export const START_GUIDE_DISMISSED_KEY = 'cbam-local-start-guide-dismissed';

const PRESETS: Array<{ level: ExplainLevel; title: string; text: string; icon: typeof BookOpen }> = [
    { level: 'BEGINNER', title: '처음이에요', text: '단계마다 쉬운 설명·어디서 구하는지·예시를 펼쳐 둡니다.', icon: BookOpen },
    { level: 'EXPERT', title: '해본 적 있어요', text: '설명은 접고 규정 근거만 보여 줍니다. 항목별로 바로 입력합니다.', icon: Gauge },
];

/**
 * 시작 안내(UX 컨셉 v4 §11) — 비어 있는 프로젝트에서 지도 위에 한 번 보인다. 준비물·산출물·설명 수준 카드 두 장.
 * 카드를 고르면 설명 수준만 정해지고(언제든 오른쪽 위 토글로 바뀐다) 입력한 내용에는 영향이 없다. 아직 없는 기능은 말하지 않는다.
 */
export function StartGuide({ onDone }: { onDone: () => void }) {
    const { setLevel } = useExplainLevel();

    return (
        <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label="시작 안내" data-testid="start-guide">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h2 className="text-base font-bold text-slate-950">처음이세요? 이렇게 진행됩니다</h2>
                    <p className="mt-1 text-sm text-slate-600">지도의 1단계부터 차례로 채우면, 마지막에 EU에 낼 파일이 나옵니다.</p>
                </div>
                <button type="button" onClick={onDone} aria-label="시작 안내 닫기" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700">
                    <X className="h-4 w-4" />
                </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div>
                    <p className="text-sm font-semibold text-slate-800">미리 준비하면 편한 것</p>
                    <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm leading-6 text-slate-700">
                        <li>전기·연료 고지서 (한전, 가스·유류)</li>
                        <li>제품별 생산량 (생산일지, ERP)</li>
                        <li>구매한 강재(원료) 명세서와 구매량</li>
                    </ol>
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        <FileSpreadsheet className="mt-0.5 h-4 w-4 flex-none text-teal-700" />
                        결과물: EU 수입업자에게 줄 커뮤니케이션 파일(엑셀)과 산정보고서
                    </p>
                </div>

                <div>
                    <p className="text-sm font-semibold text-slate-800">설명을 얼마나 볼까요?</p>
                    <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {PRESETS.map((preset) => {
                            const Icon = preset.icon;
                            return (
                                <button
                                    key={preset.level}
                                    type="button"
                                    onClick={() => { setLevel(preset.level); onDone(); }}
                                    className="rounded-xl border border-slate-200 p-3 text-left transition hover:border-teal-400 hover:bg-teal-50/40"
                                    data-preset={preset.level}
                                >
                                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900"><Icon className="h-4 w-4 text-teal-700" />{preset.title}</span>
                                    <span className="mt-1 block text-xs leading-5 text-slate-600">{preset.text}</span>
                                    <span className="mt-1 block text-[11px] font-semibold text-teal-700">설명 수준: {EXPLAIN_LEVEL_LABEL[preset.level]}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            <Link
                href="/talk"
                className="mt-4 flex items-start gap-3 rounded-xl border border-teal-200 bg-teal-50/50 p-3 transition hover:border-teal-400"
                data-talk-card
            >
                <MessageCircleQuestion className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                <span>
                    <span className="block text-sm font-bold text-slate-900">질문에 답만 하면 됩니다 <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">시험 버전</span></span>
                    <span className="mt-0.5 block text-xs leading-5 text-slate-600">한 번에 질문 하나씩 묻습니다. 지금은 사업장·기간·무엇을 만드는지까지이고, 그 뒤는 지도 화면에서 이어서 입력합니다. 답은 같은 곳에 저장됩니다.</span>
                </span>
            </Link>

            <p className="mt-4 text-xs leading-5 text-slate-500">언제든 오른쪽 위 「설명」 토글로 바꿀 수 있고, 입력한 내용은 그대로 유지됩니다.</p>
        </section>
    );
}
