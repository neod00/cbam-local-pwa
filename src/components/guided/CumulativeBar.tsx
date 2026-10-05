'use client';

import { buildCumulativeBar, type BarBlockKind } from '@/lib/cumulative-bar';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { getLocalSetting, type Product, type PurchasedPrecursor } from '@/lib/local-db';
import type { ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import { DEFAULT_SCENARIO_ASSUMPTIONS, normalizeScenarioAssumptions, SCENARIO_ASSUMPTIONS_SETTING_KEY, type ScenarioAssumptions } from '@/lib/scenario-calculation';
import { describeSeeFlowIndirect, type SeeFlowBinding } from '@/lib/see-flow';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

const fmt = (value: number, digits = 3) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

const HATCH = 'repeating-linear-gradient(135deg, rgba(255,255,255,0.55) 0 4px, transparent 4px 8px)';
const BLOCK_STYLE: Record<BarBlockKind, { className: string; hatched: boolean; source: string }> = {
    OWN: { className: 'bg-teal-700', hatched: false, source: '자사 입력' },
    PRECURSOR_ACTUAL: { className: 'bg-amber-600', hatched: false, source: '실측' },
    PRECURSOR_MIXED: { className: 'bg-amber-400', hatched: false, source: '일부 실측' },
    PRECURSOR_DEFAULT: { className: 'bg-amber-500', hatched: true, source: 'EU 기본값' },
};

/**
 * 누적 막대(UX 컨셉 v4 §6) — 지도 아래에서 「EU 기본값으로 신고하면 / 내 값으로 신고하면」을 두 기둥으로 보여준다.
 * 숫자는 모두 buildCumulativeBar(= SeeFlowBinding + 결과)에서 온다. 이 컴포넌트는 그리기만 한다.
 */
export function CumulativeBar({
    binding,
    results,
    precursors,
    products,
    partialReason,
}: {
    binding: SeeFlowBinding;
    results: LocalCalculationResult[];
    precursors: PurchasedPrecursor[];
    products?: Array<Pick<Product, 'name' | 'cn_code' | 'hs_code'>>;
    /** 아직 안 들어온 큰 입력이 있을 때의 안내 — 있으면 기본값과의 비교를 내지 않는다. */
    partialReason?: string;
}) {
    const [defaultValues, setDefaultValues] = useState<ImportedDefaultValueReference>();
    const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEFAULT_SCENARIO_ASSUMPTIONS);

    useEffect(() => {
        let active = true;
        Promise.all([
            getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
            getLocalSetting<Partial<ScenarioAssumptions>>(SCENARIO_ASSUMPTIONS_SETTING_KEY),
        ]).then(([reference, saved]) => {
            if (!active) return;
            setDefaultValues(reference);
            setAssumptions(normalizeScenarioAssumptions(saved));
        });
        return () => {
            active = false;
        };
    }, []);

    const model = useMemo(
        () => buildCumulativeBar({ binding, results, precursors, products, partialReason, defaultValues, originCountry: assumptions.origin_country, year: assumptions.default_value_year }),
        [binding, results, precursors, products, partialReason, defaultValues, assumptions]
    );
    const labels = describeSeeFlowIndirect(binding.indirectRelevance, binding.basisExcludesUndetermined);

    const defaultValue = model.defaultColumn.available ? model.defaultColumn.value : 0;
    const myTotal = (model.headline ?? 0) + model.reportOnly;
    // 두 기둥이 같은 눈금을 쓰도록 큰 쪽에 맞춘다.
    const scale = Math.max(defaultValue, myTotal, 1e-9);
    const heightOf = (value: number) => `${Math.max(0, Math.min(100, (value / scale) * 100))}%`;
    const share = model.measuredShare === null ? null : Math.round(model.measuredShare * 100);

    return (
        <section className="mt-4 rounded-xl border border-slate-200 bg-slate-50/60 p-4" aria-label="누적 막대 — EU 기본값과 내 값 비교" data-testid="cumulative-bar">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-slate-900">내 숫자, EU 기본값보다 얼마나 줄었나</h2>
                <span className="text-[11px] text-slate-500">아무것도 안 넣으면 왼쪽 EU 기본값으로 신고됩니다</span>
            </div>

            {model.empty ? (
                model.defaultColumn.available ? (
                    // 제품 CN만 넣은 단계 — 내 값은 아직 없고 아무것도 안 넣으면 신고될 EU 기본값만 먼저 선다.
                    <div className="mt-3 flex items-end gap-5" data-testid="bar-products-only">
                        <div className="flex h-40 w-20 flex-col items-center justify-end border-b border-slate-300">
                            <span className="mb-1 text-xs font-bold tabular-nums text-slate-700">{fmt(model.defaultColumn.value)}</span>
                            <div className="h-[75%] w-full rounded-t-md bg-slate-300" title={`EU 기본값 ${model.defaultColumn.country} · ${model.defaultColumn.yearLabel}년(mark-up 포함) ${fmt(model.defaultColumn.value)} tCO₂e/t`} data-testid="bar-default" />
                        </div>
                        <p className="pb-2 text-xs leading-5 text-slate-600">
                            이 제품(CN)의 EU 기본값은 <span className="font-semibold text-slate-900">{fmt(model.defaultColumn.value)} tCO₂e/t</span>
                            ({model.defaultColumn.country} · {model.defaultColumn.yearLabel}년, mark-up 포함)입니다. 아무것도 안 넣으면 이 숫자로 신고됩니다.
                            생산량·연료·전구물질을 넣을 때마다 오른쪽에 내 값 기둥이 쌓이고, 기본값보다 얼마나 낮아졌는지 보입니다.
                        </p>
                    </div>
                ) : (
                    <p className="mt-3 rounded-lg bg-white px-3 py-3 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                        {model.defaultColumn.reason} 연료·전구물질을 넣을 때마다 내 값 기둥이 쌓입니다.
                    </p>
                )
            ) : (
                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
                    <div className="flex h-52 items-end justify-center gap-6 border-b border-slate-300 px-2" role="img" aria-label={`EU 기본값 ${model.defaultColumn.available ? fmt(defaultValue) : '없음'}, 내 값 ${model.headline === null ? '없음' : fmt(model.headline)} tCO₂e/t`}>
                        {/* EU 기본값 기둥 */}
                        <div className="flex h-full w-20 flex-col items-center justify-end">
                            {model.defaultColumn.available ? (
                                <>
                                    <span className="mb-1 text-xs font-bold tabular-nums text-slate-700">{fmt(defaultValue)}</span>
                                    <div
                                        className="w-full rounded-t-md bg-slate-300 transition-[height] duration-300 ease-out motion-reduce:transition-none"
                                        style={{ height: heightOf(defaultValue) }}
                                        title={`EU 기본값 ${model.defaultColumn.country} · ${model.defaultColumn.yearLabel}년(mark-up 포함) ${fmt(defaultValue)} tCO₂e/t`}
                                        data-testid="bar-default"
                                    />
                                </>
                            ) : (
                                <div className="flex h-24 w-full items-center justify-center rounded-t-md border-2 border-dashed border-slate-300 text-lg font-bold text-slate-400" data-testid="bar-default-missing">—</div>
                            )}
                        </div>
                        {/* 내 값 기둥 */}
                        <div className="flex h-full w-20 flex-col items-center justify-end">
                            {model.headline !== null && model.blocks.length > 0 ? (
                                <>
                                    <span className="mb-1 text-xs font-bold tabular-nums text-teal-900">{fmt(model.headline)}</span>
                                    {model.reportOnly > 0 && (
                                        <div
                                            className="w-full rounded-t-md border-2 border-dashed border-slate-400 bg-white transition-[height] duration-300 ease-out motion-reduce:transition-none"
                                            style={{ height: heightOf(model.reportOnly) }}
                                            title={`보고용 ${fmt(model.reportOnly)} tCO₂e/t — 인증서 계산에서 빠지는 몫(전력·구매 원료의 간접분)`}
                                            data-testid="bar-report-only"
                                        />
                                    )}
                                    {[...model.blocks].reverse().map((block) => {
                                        const style = BLOCK_STYLE[block.kind];
                                        return (
                                            <div
                                                key={block.kind}
                                                className={`w-full transition-[height] duration-300 ease-out motion-reduce:transition-none ${style.className}`}
                                                style={{ height: heightOf(block.value), backgroundImage: style.hatched ? HATCH : undefined }}
                                                title={`${block.label} ${fmt(block.value)} tCO₂e/t · ${fmt((block.value / (model.headline ?? 1)) * 100, 0)}% · ${style.source}`}
                                                data-testid={`bar-block-${block.kind}`}
                                            />
                                        );
                                    })}
                                </>
                            ) : (
                                <div className="flex h-24 w-full items-center justify-center rounded-t-md border-2 border-dashed border-slate-300 text-lg font-bold tabular-nums text-slate-500" data-testid="bar-mine-headline-only">
                                    {model.headline === null ? '—' : fmt(model.headline)}
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="min-w-0 space-y-3">
                        <div className="flex items-end justify-between gap-2">
                            <div>
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">기준 SEE (인증서 산정)</p>
                                <p className="text-3xl font-bold tabular-nums text-slate-950" data-testid="bar-headline">
                                    {model.headline === null ? '—' : fmt(model.headline)}
                                    <span className="ml-1.5 text-xs font-semibold text-slate-500">tCO₂e/t</span>
                                </p>
                            </div>
                            <div className="text-right">
                                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">실측 비율</p>
                                <p className="text-xl font-bold tabular-nums text-teal-800" data-testid="bar-share">{share === null ? '—' : `${share}%`}</p>
                            </div>
                        </div>

                        {share !== null && (
                            <div className="h-2 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
                                <div className="h-full rounded-full bg-teal-600 transition-[width] delay-[250ms] duration-300 ease-out motion-reduce:transition-none" style={{ width: `${share}%` }} />
                            </div>
                        )}
                        <p className="text-[11px] leading-4 text-slate-500">
                            실측 비율 = 인증서 기준 부분 중 우리가 직접 넣은 값(연료·공정)과 실측으로 받은 전구물질의 몫. 전력을 넣는다고 오르지 않습니다.
                        </p>

                        {model.partialNote && (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900" data-testid="bar-partial">{model.partialNote}</p>
                        )}
                        <p className="text-xs leading-5 text-slate-700" data-testid="bar-gap">
                            {model.partialNote
                                ? '기본값과의 차이는 입력이 갖춰진 뒤에 보여 드립니다.'
                                : !model.defaultColumn.available
                                ? model.defaultColumn.reason
                                : model.gap === null
                                    ? '기준 SEE를 산출하면 기본값과의 차이를 보여줍니다.'
                                    : model.gap.perTonne > 1e-9
                                        ? `EU 기본값(${model.defaultColumn.country} · ${model.defaultColumn.yearLabel}년)보다 ${fmt(model.gap.perTonne)} tCO₂e/t (${fmt(model.gap.percent, 1)}%) 낮습니다.`
                                        : model.gap.perTonne < -1e-9
                                            ? `EU 기본값(${model.defaultColumn.country} · ${model.defaultColumn.yearLabel}년)보다 ${fmt(-model.gap.perTonne)} tCO₂e/t 높습니다. 어느 쪽이 유리한지는 「시나리오」에서 비교해 보세요.`
                                            : 'EU 기본값과 같습니다.'}
                            {model.defaultColumn.available && model.defaultColumn.productCount > 1 ? ` (제품 CN ${model.defaultColumn.productCount}종 생산량 가중평균)` : ''}
                            {' '}
                            <Link href="/scenarios" className="font-semibold text-teal-700 hover:underline">시나리오 비교</Link>
                        </p>

                        {model.blocksNote && <p className="text-[11px] leading-4 text-slate-500">{model.blocksNote}</p>}
                        {model.reportOnly > 0 && (
                            <p className="text-[11px] leading-4 text-slate-500">
                                점선 조각 = {labels.indirectLabel} {fmt(model.reportOnly)} tCO₂e/t. {labels.basisVsTotalNote}
                            </p>
                        )}

                        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600" aria-label="값 출처 범례">
                            <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" />EU 기본값(기준선)</li>
                            <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-teal-700" />자체 연료·공정(자사 입력)</li>
                            <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-600" />전구물질 실측</li>
                            <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" style={{ backgroundImage: HATCH }} />전구물질 기본값(빗금)</li>
                            <li className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-slate-400 bg-white" />보고용(인증서 제외)</li>
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
