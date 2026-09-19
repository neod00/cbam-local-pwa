'use client';

import { GuidedMap } from '@/components/guided/GuidedMap';
import { GuidedStepPanel, type GuidedData } from '@/components/guided/panels';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { evaluateEuExportReadiness, scopeRecordsToExportPeriod } from '@/lib/eu-template-export';
import { deriveGuidedSteps, getGuidedProgress, type GuidedStepId } from '@/lib/guided-map';
import { CBAM_LAST_BACKUP_AT_KEY, EXPORT_PERIOD_SETTING_KEY, exportLocalBackup, getLocalSetting, listLocalItems, setLocalSetting, startNewProject } from '@/lib/local-db';
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
    internalTransfers: [],
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
    // 사내 이송(공정 간 전가)도 함께 넘긴다 — 빠뜨리면 이 화면만 받는 제품의 SEE가 낮게 나온다.
    const internalTransfers = await listLocalItems('internal_transfers');
    const results = calculateLocalResults({ internalTransfers, products, periods, processes, productOutputLines, sourceStreams, precursors });
    // periods와 고른 기간을 함께 넘긴다 — 이걸 넘기지 않으면 「어느 기간이 나가는가」를
    // 아무도 검사하지 않고, 8단계에서야(그것도 조용히) 정해진다.
    const reportingPeriodId = await getLocalSetting<string>(EXPORT_PERIOD_SETTING_KEY);
    const readiness = evaluateEuExportReadiness({
        internalTransfers,
        periods, reportingPeriodId, products, processes, productOutputLines, sourceStreams, precursors, installations,
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
        internalTransfers,
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

    // 저장 직후 머물 단계. activeStep은 「사용자가 고르기 전에는 첫 미완료 단계」로 파생되는데,
    // 저장하면 그 단계가 완료로 바뀌어 화면이 즉시 다음 단계로 떠났다. 방금 넣은 값을
    // 확인할 새도, 새로 생긴 수정 버튼을 볼 새도 없었다(씨밤이 P2-run08-05).
    const activeStepRef = useRef<GuidedStepId | null>(null);

    const reload = useCallback(async () => {
        // 저장으로 화면이 떠나지 않도록, 보고 있던 단계를 고정한다.
        setSelectedStep((current) => current ?? activeStepRef.current);
        const nextData = await fetchGuidedData();
        setData(nextData);
    }, []);

    // 새 프로젝트: 입력 데이터만 비우고 라이선스·EU 기본값·비용 가정은 유지한다(startNewProject).
    // 되돌릴 수 없으므로 확인 + 삭제 전 .cbam 백업을 제안한다.
    const handleNewProject = useCallback(async () => {
        if (!window.confirm('새 프로젝트를 시작하면 현재 입력 데이터(사업장·제품·공정·연료·전력·전구물질)가 모두 삭제됩니다.\n라이선스·EU 기본값(DV)·벤치마크 파일·비용 가정은 유지됩니다.\n산정보고서 입력값(문서번호 등)과 EU 문서 기간 선택은 함께 지워집니다.\n계속할까요?')) {
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
            // reload()는 「보고 있던 단계」를 고정한다 — 새 프로젝트에서는 그 기억도 지워야 1단계로 돌아간다(run11 P2-25).
            activeStepRef.current = null;
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

    // 기간이 둘 이상이면 지도는 한 기간만 본다. 종전에는 두 해의 공정·배출·생산량을 합산해 보여줬다
    // (「공정 4개 · 6,397,300 t」, 기준 SEE는 두 해 네 제품의 평균). 어느 문서에도 나가지 않는 숫자였다.
    // 보는 기간 = EU 문서에 나갈 기간(같은 설정값). 아직 고르지 않았으면 첫 기간을 보여주되 그렇다고 말한다.
    const periodChosen = data.periods.some((item) => item.id === data.reportingPeriodId);
    const viewPeriod = data.periods.length > 1
        ? (data.periods.find((item) => item.id === data.reportingPeriodId) ?? data.periods[0])
        : undefined;
    const allData = data;
    const viewData = useMemo<GuidedData>(() => {
        if (!viewPeriod) {
            return allData;
        }
        const scoped = scopeRecordsToExportPeriod({
            periods: allData.periods,
            reportingPeriodId: viewPeriod.id,
            processes: allData.processes,
            productOutputLines: allData.productOutputLines,
            sourceStreams: allData.sourceStreams,
            precursors: allData.precursors,
            results: allData.results,
        });
        return {
            ...allData,
            processes: scoped.processes,
            productOutputLines: scoped.productOutputLines,
            sourceStreams: scoped.sourceStreams,
            precursors: scoped.precursors,
            results: scoped.results,
            // A transfer belongs to the period of its sending process.
            internalTransfers: allData.internalTransfers.filter((transfer) => scoped.processes.some((process) => process.id === transfer.source_process_id)),
            viewPeriodId: viewPeriod.id,
            allRecords: {
                processes: allData.processes,
                productOutputLines: allData.productOutputLines,
                sourceStreams: allData.sourceStreams,
                precursors: allData.precursors,
                internalTransfers: allData.internalTransfers,
            },
        };
    }, [allData, viewPeriod]);

    const choosePeriod = useCallback(async (periodId: string) => {
        await setLocalSetting(EXPORT_PERIOD_SETTING_KEY, periodId);
        setSelectedProcessId('ALL');
        await reload();
    }, [reload]);

    const scopedResults = useMemo(
        () => (selectedProcessId === 'ALL' ? viewData.results : viewData.results.filter((result) => result.process_id === selectedProcessId)),
        [viewData.results, selectedProcessId]
    );
    const binding = useMemo(() => buildSeeFlowBinding(scopedResults), [scopedResults]);

    const steps = useMemo(() => deriveGuidedSteps({
        loaded: data.loaded,
        installationCount: data.installations.length,
        periodCount: data.periods.length,
        reportingProductCount: reportingProducts.length,
        cnReadyCount: reportingProducts.filter((product) => (product.cn_code ?? '').replace(/\D/g, '').length === 8).length,
        processCount: viewData.processes.length,
        hasProcessOutput: viewData.processes.some((process) => process.output_mass_t > 0),
        sourceStreamCount: viewData.sourceStreams.length,
        hasDirectEmissions: viewData.processes.some((process) => process.direct_attributable_emissions_tco2e > 0),
        hasElectricity: viewData.processes.some((process) => process.electricity_mwh > 0),
        precursorCount: viewData.precursors.length,
        // 준비도가 「구매 전구물질이 없습니다」를 냈으면 6단계는 선택이 아니라 할 일이다.
        noPrecursorsConfirmed: viewData.precursors.length === 0 && viewData.processes.some((process) => process.no_purchased_precursors),
        precursorsExpected: data.exportIssues.some((issue) => issue.area === '구매 전구물질' && issue.message.includes('구매 전구물질이 없습니다')),
        results: viewData.results,
        exportErrorCount: data.exportErrorCount,
        exportWarningCount: data.exportWarningCount,
    }, binding), [data, viewData, reportingProducts, binding]);

    // 사용자가 상자를 고르기 전에는 '지금 여기' 단계를 자동으로 보여준다(파생값 — effect 불필요).
    const activeStep: GuidedStepId | null = selectedStep
        ?? (data.loaded ? (steps.find((step) => step.status === 'current')?.id ?? 'setup') : null);
    activeStepRef.current = activeStep;

    const progress = getGuidedProgress(steps);
    const period = viewPeriod ?? data.periods[0];
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
                            {!data.loaded
                                ? '저장된 자료를 읽는 중입니다…'
                                : primaryProduct ? `${primaryProduct.name}${primaryProduct.cn_code ? ` · CN ${primaryProduct.cn_code}` : ''}` : '지도를 따라가면 EU 제출 문서가 완성됩니다'}
                            {data.loaded && period ? ` · ${period.name}` : ''}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleNewProject}
                        // 자료를 다 읽기 전에는 누를 수 없다 — 「빈 프로젝트」로 보이는 화면에서 새 프로젝트를 시작하면 읽히지 않은 자료가 지워진다.
                        disabled={newProjectBusy || !data.loaded}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 transition hover:border-teal-300 hover:text-teal-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        <FilePlus className="h-3.5 w-3.5" />
                        새 프로젝트
                    </button>
                    {data.loaded ? (
                        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-800">
                            {progress.done} / {progress.total} 완료
                        </span>
                    ) : (
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-500">읽는 중…</span>
                    )}
                </div>
            </header>

            {data.periods.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2" role="tablist" aria-label="보고기간 선택">
                    <span className="text-xs font-semibold text-slate-500">보는 기간 = EU 문서에 나갈 기간</span>
                    {data.periods.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={periodChosen && item.id === viewPeriod?.id}
                            onClick={() => void choosePeriod(item.id)}
                            className={`min-h-9 rounded-full border px-4 text-xs font-bold transition ${
                                periodChosen && item.id === viewPeriod?.id
                                    ? 'border-teal-600 bg-teal-600 text-white'
                                    : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200'
                            }`}
                        >
                            {item.name}
                        </button>
                    ))}
                    {!periodChosen && viewPeriod && (
                        <span className="text-xs font-semibold text-amber-700">아직 고르지 않았습니다. 지금은 「{viewPeriod.name}」 자료를 보여주고 있습니다.</span>
                    )}
                </div>
            )}

            {viewData.processes.length > 1 && (
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
                    {viewData.processes.map((process) => (
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

            {/* 자료를 읽지 못했으면 그렇다고 말한다. 종전에는 사유를 저장만 하고 화면에 내지 않아, 읽기 실패가 빈 프로젝트와 똑같이 보였다. */}
            {data.loadError && (
                <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-900">
                    <p className="font-semibold">저장된 자료를 읽지 못했습니다. 아래 화면은 빈 프로젝트가 아니라 「읽기 실패」 상태입니다.</p>
                    <p className="mt-1">새 프로젝트를 시작하거나 값을 새로 입력하지 마세요 — 브라우저를 완전히 닫았다가 다시 열어 보세요. 다른 탭에서 이 앱이 열려 있으면 닫으세요. 백업(.cbam)이 있으면 「데이터 안전·백업」에서 복원할 수 있습니다.</p>
                    <p className="mt-1 text-xs text-red-800">사유: {data.loadError}</p>
                </div>
            )}

            {/* 읽는 동안에는 지도의 빈 골격(0 / 6 · 「회사·공장 정보부터」)을 보여주지 않는다. 느린 PC에서는 그 화면이
                몇 초 동안 떠 있고, 「내 자료가 사라졌다」로 읽힌다(씨밤이 run16 — 첫 로딩 10초 이상). */}
            {!data.loaded && (
                <div role="status" aria-live="polite" className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <span className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-teal-600" aria-hidden="true" />
                    <p className="text-sm font-semibold text-slate-800">저장된 자료를 읽는 중입니다…</p>
                    <p className="max-w-md text-xs leading-5 text-slate-500">자료는 이 브라우저 안에 그대로 있습니다. 기준자료 파일이 크거나 PC가 바쁘면 몇 초 걸릴 수 있습니다.</p>
                </div>
            )}

            <div className={data.loaded ? 'grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]' : 'hidden'}>
                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="산정 지도">
                    <GuidedMap
                        steps={steps}
                        selected={activeStep}
                        onSelect={handleSelect}
                        // 데이터가 없으면 예시(강선 1,000 t) 숫자가 그대로 뜬다. 다른 상자는
                        // 「수출 제품을 등록하세요」 같은 안내인데 이 노드만 숫자여서 자기 값으로 읽힌다.
                        outputLabel={binding.isExample ? '생산량 미입력' : `${fmtT(binding.outputMassT)} t`}
                    />
                </section>
                <div ref={panelRef} className="min-w-0 xl:sticky xl:top-20 xl:self-start">
                    <GuidedStepPanel
                        step={activeStep}
                        steps={steps}
                        data={viewData}
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
