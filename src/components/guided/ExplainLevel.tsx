'use client';

import {
    DEFAULT_EXPLAIN_LEVEL,
    EXPLAIN_LEVEL_LABEL,
    EXPLAIN_LEVEL_STORAGE_KEY,
    STEP_EXPLAINERS,
    parseExplainLevel,
    type ExplainLevel,
} from '@/lib/step-explainers';
import type { GuidedStepId } from '@/lib/guided-map';
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { useLocalPref } from './useLocalPref';

interface ExplainLevelValue {
    level: ExplainLevel;
    setLevel: (level: ExplainLevel) => void;
}

const ExplainLevelContext = createContext<ExplainLevelValue>({ level: DEFAULT_EXPLAIN_LEVEL, setLevel: () => undefined });

export const useExplainLevel = () => useContext(ExplainLevelContext);

/**
 * 설명 수준(실무자/입문자). 이 브라우저에만 저장한다(localStorage, 값 하나). 자동 감지는 하지 않는다 — 담당자가 고르거나 유지한다.
 * 저장소를 못 쓰는 환경에서도 화면은 그대로 동작한다(기본 = 실무자 = 종전 화면).
 */
export function ExplainLevelProvider({ children }: { children: ReactNode }) {
    const [stored, store] = useLocalPref(EXPLAIN_LEVEL_STORAGE_KEY, null);
    const level = parseExplainLevel(stored);
    const setLevel = useCallback((next: ExplainLevel) => store(next), [store]);
    const value = useMemo(() => ({ level, setLevel }), [level, setLevel]);
    return <ExplainLevelContext.Provider value={value}>{children}</ExplainLevelContext.Provider>;
}

/** 지도 화면 머리글 오른쪽의 상시 토글. 어려운 단계만 잠깐 켜고 끌 수 있게 항상 보인다. */
export function ExplainLevelToggle() {
    const { level, setLevel } = useExplainLevel();
    return (
        <div className="inline-flex items-center gap-1.5" role="group" aria-label="설명 수준">
            <span className="text-xs font-semibold text-slate-500">설명</span>
            <div className="inline-flex rounded-full border border-slate-200 bg-white p-0.5">
                {(['EXPERT', 'BEGINNER'] as const).map((item) => (
                    <button
                        key={item}
                        type="button"
                        aria-pressed={level === item}
                        onClick={() => setLevel(item)}
                        className={`min-h-7 rounded-full px-3 text-xs font-bold transition ${level === item ? 'bg-teal-600 text-white' : 'text-slate-600 hover:text-teal-800'}`}
                    >
                        {EXPLAIN_LEVEL_LABEL[item]}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * 단계 패널 맨 위의 설명 상자. 입문자는 일상어 설명·구하는 곳·예시가 펼쳐져 있고 규정 근거는 「왜 필요한가요?」 뒤에 있다.
 * 실무자는 규정 근거가 바로 보이고 쉬운 설명은 접혀 있다. 입력 칸과 계산에는 아무 영향이 없다.
 */
export function StepExplainerBox({ step }: { step: GuidedStepId }) {
    const { level } = useExplainLevel();
    const explainer = STEP_EXPLAINERS[step];
    const beginner = level === 'BEGINNER';

    const basis = (
        <ul className="space-y-0.5 text-[11px] leading-4 text-slate-500">
            {explainer.basis.map((line) => (
                <li key={line}>근거: {line}</li>
            ))}
        </ul>
    );

    const plain = (
        <div className="space-y-1.5 text-sm leading-6 text-slate-700">
            <p>{explainer.plain}</p>
            <p><span className="font-semibold text-slate-800">어디서 구하나요?</span> {explainer.where}</p>
            {explainer.example && <p className="text-slate-600"><span className="font-semibold text-slate-800">예시</span> {explainer.example}</p>}
        </div>
    );

    return (
        <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3" data-explain-level={level} data-testid="step-explainer">
            {beginner ? (
                <div className="space-y-2">
                    {plain}
                    <details className="text-xs text-slate-600">
                        <summary className="cursor-pointer font-semibold text-sky-800">왜 필요한가요? (규정 근거)</summary>
                        <div className="mt-1.5">{basis}</div>
                    </details>
                </div>
            ) : (
                <div className="space-y-1.5">
                    {basis}
                    <details className="text-xs text-slate-600">
                        <summary className="cursor-pointer font-semibold text-sky-800">쉬운 설명 · 어디서 구하나요</summary>
                        <div className="mt-1.5">{plain}</div>
                    </details>
                </div>
            )}
        </div>
    );
}
