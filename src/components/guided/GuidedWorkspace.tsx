'use client';

import { GuidedMap } from '@/components/guided/GuidedMap';
import { GuidedStepPanel, type GuidedData } from '@/components/guided/panels';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { evaluateEuExportReadiness } from '@/lib/eu-template-export';
import { deriveGuidedSteps, getGuidedProgress, type GuidedStepId } from '@/lib/guided-map';
import { CBAM_LAST_BACKUP_AT_KEY, EXPORT_PERIOD_SETTING_KEY, exportLocalBackup, getLocalSetting, listLocalItems, startNewProject } from '@/lib/local-db';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import { buildSeeFlowBinding } from '@/lib/see-flow';
import { BarChart3, CircleHelp, FilePlus, Map as MapIcon, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// 지도에 없는 유틸 화면으로 가는 통로(백스테이지 슬림 헤더로 열림).
const UTILITY_LINKS = [
    { href: '/settings', label: '데이터 안전·백업', icon: ShieldCheck },
    { href: '/scenarios', label: '인증서 비용 시나리오', icon: BarChart3 },
    { href: '/upload', label: '자료 업로드', icon: Upload },
    { href: '/guide', label: '시작 가이드', icon: CircleHelp },
] as const;

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
    // periods와 고른 기간을 함께 넘긴다 — 이걸 넘기지 않으면 「어느 기간이 나가는가」를
    // 아무도 검사하지 않고, 8단계에서야(그것도 조용히) 정해진다.
    const reportingPeriodId = await getLocalSetting<string>(EXPORT_PERIOD_SETTING_KEY);
    const readiness = evaluateEuExportReadiness({
        periods, reportingPeriodId, products, processes, productOutputLines, sourceStreams, precursors,
    });

    return {
        loaded: true,
        installations,
        periods,
        reportingPeriodId,
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
    const [newProjectBusy, setNewProjectBusy] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const reload = useCallback(async () => {
        const nextData = await fetchGuidedData();
        setData(nextData);
    }, []);

    // 새 프로젝트: 입력 데이터만 비우고 라이선스·EU 기본값·비용 가정은 유지한다(startNewProject).
    // 되돌릴 수 없으므로 확인 + 삭제 전 .cbam 백업을 제안한다.
    const handleNewProject = useCallback(async () => {
        if (!window.confirm('새 프로젝트를 시작하면 현재 입력 데이터(사업장·제품·공정·연료·전력·전구물질)가 모두 삭제됩니다.\n라이선스·EU 기본값(DV)·비용 가정은 유지됩니다.\n계속할까요?')) {
            return;
        }
        setNewProjectBusy(true);
        try {
            if (window.confirm('삭제 전에 지금 데이터를 .cbam 파일로 백업할까요?\n확인 = 백업 후 시작 · 취소 = 백업 없이 시작')) {
                const backup = await exportLocalBackup();
                const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = `cbam-backup-${backup.manifest.exported_at.slice(0, 10)}.cbam`;
                document.body.appendChild(anchor);
                anchor.click();
                anchor.remove();
                URL.revokeObjectURL(url);
            }
            await startNewProject();
            window.localStorage.removeItem(CBAM_LAST_BACKUP_AT_KEY);
            setSelectedStep(null);
            setSelectedProcessId('ALL');
            await reload();
        } finally {
            setNewProjectBusy(false);
        }
    }, [reload]);

    useEffect(() => {
        let active = true;
        fetchGuidedData()
            .then((nextData) => {
                if (active) {
                    setData(nextData);
                }
            })
            .catch((error) => {
                // 삼키면 안 된다. 종전엔 조용히 loaded: true만 세워서, 자료를 못 읽었을 때
                // 화면이 **빈 프로젝트와 똑같이** 보였다 — 사용자는 자기 데이터가 날아간 줄 안다.
                // (실제로 이 침묵 때문에 원인을 못 찾고 한참 헤맸다.)
                console.error('[CBAM] 저장된 자료를 읽지 못했습니다', error);
                if (active) {
                    setData((current) => ({ ...current, loaded: true, loadError: String(error) }));
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
                    <button
                        type="button"
                        onClick={handleNewProject}
                        disabled={newProjectBusy}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <FilePlus className="h-3.5 w-3.5" />
                        새 프로젝트
                    </button>
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

            <footer className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3" aria-label="유틸 화면">
                <span className="text-xs font-semibold text-slate-500">더 필요할 때:</span>
                {UTILITY_LINKS.map((item) => {
                    const Icon = item.icon;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-600 transition hover:border-teal-200 hover:bg-white hover:text-teal-800"
                        >
                            <Icon className="h-3.5 w-3.5" />
                            {item.label}
                        </Link>
                    );
                })}
            </footer>
        </div>
    );
}
