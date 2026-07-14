'use client';

import { GuidedMap } from '@/components/guided/GuidedMap';
import { GuidedStepPanel, type GuidedData } from '@/components/guided/panels';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { evaluateEuExportReadiness } from '@/lib/eu-template-export';
import { deriveGuidedSteps, getGuidedProgress, type GuidedStepId } from '@/lib/guided-map';
import { listLocalItems } from '@/lib/local-db';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import { buildSeeFlowBinding } from '@/lib/see-flow';
import { Map as MapIcon } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const EMPTY_DATA: GuidedData = {
    loaded: false,
    installations: [],
    periods: [],
    products: [],
    processes: [],
    productOutputLines: [],
    sourceStreams: [],
    precursors: [],
    results: [],
    exportIssues: [],
    exportErrorCount: 0,
    exportWarningCount: 0,
};

async function fetchGuidedData(): Promise<GuidedData> {
    const [installations, periods, products, processes, productOutputLines, sourceStreams, precursors] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
    ]);
    const results = calculateLocalResults({ products, periods, processes, productOutputLines, sourceStreams, precursors });
    const readiness = evaluateEuExportReadiness({ products, processes, productOutputLines, sourceStreams, precursors });

    return {
        loaded: true,
        installations,
        periods,
        products,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
        results,
        exportIssues: readiness.issues,
        exportErrorCount: readiness.errorCount,
        exportWarningCount: readiness.warningCount,
    };
}

const fmtT = (value: number) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(value);

// 지도형 작업 공간: 지도 한 장 + 선택한 단계의 입력 패널.
// 다제품·다공정은 공정 탭으로 전환하며, 지도 가운데 숫자는 선택한 공정 기준으로 채워진다.
export function GuidedWorkspace() {
    const [data, setData] = useState<GuidedData>(EMPTY_DATA);
    const [selectedStep, setSelectedStep] = useState<GuidedStepId | null>(null);
    const [selectedProcessId, setSelectedProcessId] = useState<string>('ALL');
    const panelRef = useRef<HTMLDivElement>(null);

    const reload = useCallback(async () => {
        const nextData = await fetchGuidedData();
        setData(nextData);
    }, []);

    useEffect(() => {
        let active = true;
        fetchGuidedData()
            .then((nextData) => {
                if (active) {
                    setData(nextData);
                }
            })
            .catch(() => {
                if (active) {
                    setData((current) => ({ ...current, loaded: true }));
                }
            });
        return () => {
            active = false;
        };
    }, []);

    const reportingProducts = useMemo(
        () => data.products.filter((product) => isCbamReportingScope(getProductReportingScope(product))),
        [data.products]
    );

    const scopedResults = useMemo(
        () => (selectedProcessId === 'ALL' ? data.results : data.results.filter((result) => result.process_id === selectedProcessId)),
        [data.results, selectedProcessId]
    );
    const binding = useMemo(() => buildSeeFlowBinding(scopedResults), [scopedResults]);

    const steps = useMemo(() => deriveGuidedSteps({
        loaded: data.loaded,
        installationCount: data.installations.length,
        periodCount: data.periods.length,
        reportingProductCount: reportingProducts.length,
        cnReadyCount: reportingProducts.filter((product) => (product.cn_code ?? '').replace(/\D/g, '').length === 8).length,
        processCount: data.processes.length,
        hasProcessOutput: data.processes.some((process) => process.output_mass_t > 0),
        sourceStreamCount: data.sourceStreams.length,
        hasDirectEmissions: data.processes.some((process) => process.direct_attributable_emissions_tco2e > 0),
        hasElectricity: data.processes.some((process) => process.electricity_mwh > 0),
        precursorCount: data.precursors.length,
        results: data.results,
        exportErrorCount: data.exportErrorCount,
        exportWarningCount: data.exportWarningCount,
    }, binding), [data, reportingProducts, binding]);

    // 사용자가 상자를 고르기 전에는 '지금 여기' 단계를 자동으로 보여준다(파생값 — effect 불필요).
    const activeStep: GuidedStepId | null = selectedStep
        ?? (data.loaded ? (steps.find((step) => step.status === 'current')?.id ?? 'setup') : null);

    const progress = getGuidedProgress(steps);
    const period = data.periods[0];
    const primaryProduct = reportingProducts[0];

    const handleSelect = useCallback((id: GuidedStepId) => {
        setSelectedStep(id);
        // 좁은 화면에서는 패널이 지도 아래에 있으므로 스크롤로 데려간다.
        requestAnimationFrame(() => {
            if (window.innerWidth < 1280) {
                panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    }, []);

    return (
        <div className="space-y-4">
            <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-teal-50 text-teal-700">
                        <MapIcon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="truncate text-lg font-bold tracking-tight text-slate-950">CBAM 길잡이 지도</h1>
                        <p className="truncate text-xs text-slate-500">
                            {primaryProduct ? `${primaryProduct.name}${primaryProduct.cn_code ? ` · CN ${primaryProduct.cn_code}` : ''}` : '지도를 따라가면 EU 제출 문서가 완성됩니다'}
                            {period ? ` · ${period.name}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                        {progress.done} / {progress.total} 완료
                    </span>
                </div>
            </header>

            {data.processes.length > 1 && (
                <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="공정 선택">
                    <button
                        type="button"
                        role="tab"
                        aria-selected={selectedProcessId === 'ALL'}
                        onClick={() => setSelectedProcessId('ALL')}
                        className={`min-h-9 rounded-full border px-4 text-xs font-bold transition ${
                            selectedProcessId === 'ALL'
                                ? 'border-teal-600 bg-teal-600 text-white'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200'
                        }`}
                    >
                        전체 합계
                    </button>
                    {data.processes.map((process) => (
                        <button
                            key={process.id}
                            type="button"
                            role="tab"
                            aria-selected={selectedProcessId === process.id}
                            onClick={() => setSelectedProcessId(process.id)}
                            className={`min-h-9 rounded-full border px-4 text-xs font-bold transition ${
                                selectedProcessId === process.id
                                    ? 'border-teal-600 bg-teal-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200'
                            }`}
                        >
                            {process.name}
                        </button>
                    ))}
                </div>
            )}

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="산정 지도">
                    <GuidedMap
                        steps={steps}
                        selected={activeStep}
                        onSelect={handleSelect}
                        outputLabel={`${fmtT(binding.outputMassT)} t`}
                    />
                </section>
                <div ref={panelRef} className="min-w-0 xl:sticky xl:top-20 xl:self-start">
                    <GuidedStepPanel
                        step={activeStep}
                        steps={steps}
                        data={data}
                        selectedProcessId={selectedProcessId}
                        binding={binding}
                        onSaved={reload}
                        onSelectStep={setSelectedStep}
                    />
                </div>
            </div>
        </div>
    );
}
