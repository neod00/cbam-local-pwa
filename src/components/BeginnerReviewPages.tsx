'use client';

import { InlineNotice } from '@/components/BeginnerFlow';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    evaluateEuExportReadiness,
    getEuExportIssueEditHref,
    type EuExportReadinessIssue,
    type EuExportReadinessResult,
} from '@/lib/eu-template-export';
import {
    listLocalItems,
    type Installation,
    type Product,
    type ProductOutputLine,
    type ProductionProcess,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Check,
    ChevronDown,
    CircleCheck,
    FileCheck2,
    FileSpreadsheet,
    Package,
    ShieldCheck,
    Upload,
    Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ReviewData = {
    loaded: boolean;
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    results: LocalCalculationResult[];
    readiness: EuExportReadinessResult;
};

const EMPTY_READINESS: EuExportReadinessResult = {
    issues: [],
    errorCount: 0,
    warningCount: 0,
    canExportDraft: false,
    isSubmissionReady: false,
};

const EMPTY_DATA: ReviewData = {
    loaded: false,
    installations: [],
    periods: [],
    products: [],
    processes: [],
    productOutputLines: [],
    sourceStreams: [],
    precursors: [],
    results: [],
    readiness: EMPTY_READINESS,
};

async function loadReviewData(): Promise<ReviewData> {
    const [installations, periods, products, processes, productOutputLines, sourceStreams, precursors] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
    ]);
    const results = calculateLocalResults({ periods, products, processes, productOutputLines, sourceStreams, precursors });
    const readiness = evaluateEuExportReadiness({ installations, periods, products, processes, productOutputLines, sourceStreams, precursors });
    return { loaded: true, installations, periods, products, processes, productOutputLines, sourceStreams, precursors, results, readiness };
}

function format(value: number, digits = 2) {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);
}

function advancedIssueHref(issue: EuExportReadinessIssue) {
    const href = getEuExportIssueEditHref(issue);
    if (!href) return undefined;
    return `${href}${href.includes('?') ? '&' : '?'}advanced=1`;
}

function MetricCard({ label, value, unit, caption, tone }: { label: string; value: string; unit: string; caption: string; tone: 'green' | 'blue' | 'violet' }) {
    const toneClass = {
        green: 'bg-emerald-50 text-emerald-800',
        blue: 'bg-blue-50 text-blue-700',
        violet: 'bg-violet-50 text-violet-700',
    }[tone];
    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div><p className="text-sm font-semibold text-slate-600">{label}</p><p className="mt-3 text-3xl font-bold text-slate-950">{value}<span className="ml-1 text-sm font-semibold text-slate-500">{unit}</span></p><p className="mt-2 text-xs text-slate-500">{caption}</p></div>
                <span className={`grid h-10 w-10 place-items-center rounded-lg ${toneClass}`}><BarChart3 className="h-5 w-5" /></span>
            </div>
        </article>
    );
}

export function BeginnerResults() {
    const [data, setData] = useState<ReviewData>(EMPTY_DATA);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        void loadReviewData().then(setData).catch(() => setLoadError('산정 결과를 불러오지 못했습니다.'));
    }, []);

    const summary = useMemo(() => {
        const reportableResults = data.results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
        const allocationOnlyResults = data.results.filter((result) => !result.is_cbam_reportable);
        const totalOutput = reportableResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        const direct = reportableResults.reduce((sum, result) => sum + result.direct_see * result.output_mass_t, 0);
        const indirect = reportableResults.reduce((sum, result) => sum + result.own_indirect_see * result.output_mass_t, 0);
        const precursor = reportableResults.reduce((sum, result) => sum + result.precursor_see * result.output_mass_t, 0);
        const cbamTotal = reportableResults.reduce((sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t, 0);
        const weightedSee = totalOutput > 0 ? cbamTotal / totalOutput : 0;
        const compositionTotal = direct + indirect + precursor;
        return { totalOutput, direct, indirect, precursor, cbamTotal, weightedSee, compositionTotal, reportableResults, allocationOnlyResults };
    }, [data.results]);

    const missing = [
        { ready: data.installations.length > 0 && data.periods.length > 0, label: '사업장과 보고기간', href: '/workspace' },
        { ready: data.products.length > 0, label: '품목과 CN 코드', href: '/products' },
        { ready: data.processes.length > 0, label: '생산공정과 생산량', href: '/processes' },
        { ready: data.sourceStreams.length > 0 || data.processes.some((process) => process.electricity_mwh > 0), label: '전기·연료 사용자료', href: '/source-streams' },
    ].filter((item) => !item.ready);

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div><p className="text-xs font-bold text-emerald-800">검증 및 결과</p><h1 className="mt-1 text-3xl font-bold text-slate-950">산정 결과 확인</h1><p className="mt-2 text-sm text-slate-600">핵심 결과와 수정할 항목만 먼저 보여드립니다.</p></div>
                <Link href="/results?advanced=1" className="text-xs font-semibold text-slate-500 underline-offset-4 hover:underline">상세 산정표</Link>
            </header>

            {loadError && <InlineNotice tone="danger">{loadError}</InlineNotice>}

            {data.loaded && missing.length > 0 ? (
                <section className="rounded-lg border border-amber-200 bg-amber-50 p-5 sm:p-6">
                    <div className="flex items-start gap-4"><span className="grid h-11 w-11 flex-none place-items-center rounded-full bg-white text-amber-800"><AlertTriangle className="h-5 w-5" /></span><div><h2 className="text-xl font-bold text-amber-950">산정 전에 {missing[0].label}이 필요합니다</h2><p className="mt-1 text-sm text-amber-900">한 단계씩 완료하면 결과가 자동 계산됩니다.</p></div></div>
                    <div className="mt-5 flex flex-wrap gap-2">{missing.map((item) => <Link key={item.href} href={item.href} className="inline-flex min-h-10 items-center rounded-md border border-amber-300 bg-white px-3 text-sm font-semibold text-amber-950">{item.label}<ArrowRight className="ml-2 h-4 w-4" /></Link>)}</div>
                </section>
            ) : summary.reportableResults.length > 0 ? (
                <>
                    <section className="grid gap-4 md:grid-cols-3">
                        <MetricCard label="총 CBAM 배출량" value={format(summary.cbamTotal)} unit="tCO2e" caption={`생산량 ${format(summary.totalOutput)} tonne 기준`} tone="green" />
                        <MetricCard label="제품 1톤당 배출량" value={format(summary.weightedSee, 4)} unit="tCO2e/t" caption="생산량 가중 평균" tone="blue" />
                        <MetricCard label="검토 필요" value={String(data.readiness.errorCount + data.readiness.warningCount)} unit="건" caption={`오류 ${data.readiness.errorCount} · 주의 ${data.readiness.warningCount}`} tone="violet" />
                    </section>

                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">배출량 구성</h2><p className="mt-1 text-sm text-slate-600">어디에서 배출량이 발생했는지 비교합니다.</p></div><BarChart3 className="h-5 w-5 text-emerald-800" /></div>
                            <div className="mt-7 space-y-6">
                    {summary.indirect > 0 && summary.cbamTotal < summary.compositionTotal && (
                        <InlineNotice>간접배출 중 일부는 해당 CN 품목 규칙에 따라 CBAM 기준값에서 제외되지만, 내부 검토용 배출량 구성에는 계속 표시됩니다.</InlineNotice>
                    )}
                                {[
                                    { label: '직접배출', value: summary.direct, color: 'bg-emerald-700' },
                                    { label: '간접배출', value: summary.indirect, color: 'bg-blue-600' },
                                    { label: '전구물질', value: summary.precursor, color: 'bg-violet-600' },
                                ].map((item) => {
                                    const percent = summary.compositionTotal > 0 ? Math.round((item.value / summary.compositionTotal) * 100) : 0;
                                    return <div key={item.label}><div className="flex items-center justify-between text-sm"><span className="font-semibold text-slate-700">{item.label}</span><span className="font-bold text-slate-900">{format(item.value)} tCO2e · {percent}%</span></div><div className="mt-2 h-4 overflow-hidden rounded bg-slate-100"><div className={`h-full rounded ${item.color}`} style={{ width: `${percent}%` }} /></div></div>;
                                })}
                            </div>
                        </section>

                        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                            <div className="flex items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-950">검증 결과</h2><p className="mt-1 text-sm text-slate-600">우선순위가 높은 항목부터 확인하세요.</p></div><ShieldCheck className="h-5 w-5 text-emerald-800" /></div>
                            {data.readiness.issues.length === 0 ? (
                                <div className="mt-6 rounded-lg border border-emerald-200 bg-emerald-50 p-5 text-center"><CircleCheck className="mx-auto h-8 w-8 text-emerald-700" /><p className="mt-3 font-bold text-emerald-950">필수 검증을 통과했습니다</p></div>
                            ) : (
                                <div className="mt-5 space-y-3">{data.readiness.issues.slice(0, 4).map((issue, index) => {
                                    const href = advancedIssueHref(issue);
                                    return <article key={`${issue.message}-${index}`} className={`rounded-md border p-4 ${issue.severity === 'error' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-3"><AlertTriangle className={`mt-0.5 h-4 w-4 flex-none ${issue.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`} /><div><p className="text-xs font-bold text-slate-500">{issue.area}</p><p className="mt-1 text-sm font-semibold leading-5 text-slate-900">{issue.message}</p>{href && <Link href={href} className="mt-2 inline-flex text-xs font-bold text-slate-700 underline">상세 화면에서 수정</Link>}</div></div></article>;
                                })}</div>
                            )}
                        </section>
                    </div>
                    {summary.allocationOnlyResults.length > 0 && (
                        <details className="group rounded-lg border border-slate-200 bg-white">
                            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 text-sm font-bold text-slate-700">
                                <span>공동산출물 배분 참고 {summary.allocationOnlyResults.length}개</span>
                                <span className="rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">CBAM 신고 제외</span>
                            </summary>
                            <div className="space-y-2 border-t border-slate-200 p-5">
                                {summary.allocationOnlyResults.map((result) => (
                                    <div key={result.id} className="flex flex-col justify-between gap-1 rounded-md bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center">
                                        <span className="font-semibold text-slate-800">{result.product_name}</span>
                                        <span className="text-slate-500">{format(result.output_mass_t)} tonne · {format(result.see_informational_total * result.output_mass_t)} tCO2e 내부 참고</span>
                                    </div>
                                ))}
                                <p className="pt-1 text-xs leading-5 text-slate-500">공정 질량·배분 검토에는 사용하지만 위 CBAM 합계와 EU 보고서에는 포함하지 않습니다.</p>
                            </div>
                        </details>
                    )}

                    <div className="flex justify-end">
                        {data.readiness.errorCount === 0 ? <Link href="/export" className="inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white">EU 보고서 준비 <ArrowRight className="ml-2 h-4 w-4" /></Link> : <Link href={advancedIssueHref(data.readiness.issues.find((issue) => issue.severity === 'error')!) || '/products'} className="inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white">첫 오류 수정 <ArrowRight className="ml-2 h-4 w-4" /></Link>}
                    </div>
                </>
            ) : data.loaded ? <InlineNotice tone="warning">산정 가능한 생산공정이 없습니다.</InlineNotice> : <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">결과를 계산하는 중입니다.</div>}
        </div>
    );
}

export function BeginnerExport() {
    const [data, setData] = useState<ReviewData>(EMPTY_DATA);
    const [loadError, setLoadError] = useState('');

    useEffect(() => {
        void loadReviewData().then(setData).catch(() => setLoadError('보고서 준비 상태를 불러오지 못했습니다.'));
    }, []);

    const reportableResultCount = data.results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null).length;
    const steps = [
        { title: '입력자료 검증', description: '품목·공정·배출원 연결 상태를 확인합니다.', complete: data.readiness.errorCount === 0 && reportableResultCount > 0, action: data.readiness.errorCount > 0 ? '/results' : undefined },
        { title: 'EU 템플릿 선택', description: 'EU에서 받은 원본 Excel 템플릿을 선택합니다.', complete: false, action: '/export?advanced=1' },
        { title: '보고서 복사본 생성', description: '원본은 보존하고 입력된 복사본을 만듭니다.', complete: false, action: '/export?advanced=1' },
        { title: 'Excel 최종 확인', description: '수식·드롭다운·제출 범위를 담당자가 확인합니다.', complete: false },
    ];

    return (
        <div className="space-y-6">
            <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold text-emerald-800">EU 보고서</p><h1 className="mt-1 text-3xl font-bold text-slate-950">보고서 생성 준비</h1><p className="mt-2 text-sm text-slate-600">제출 전에 네 단계만 확인하세요.</p></div><Link href="/export?advanced=1" className="text-xs font-semibold text-slate-500 underline-offset-4 hover:underline">고급 Export 화면</Link></header>
            {loadError && <InlineNotice tone="danger">{loadError}</InlineNotice>}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 p-5 sm:p-6"><h2 className="text-xl font-bold text-slate-950">제출 준비 순서</h2><p className="mt-1 text-sm text-slate-600">완료된 단계는 자동으로 표시됩니다.</p></div>
                    <ol className="divide-y divide-slate-200 px-5 sm:px-6">{steps.map((step, index) => (
                        <li key={step.title} className="flex gap-4 py-5">
                            <span className={`grid h-10 w-10 flex-none place-items-center rounded-full text-sm font-bold ${step.complete ? 'bg-emerald-700 text-white' : index === 0 && data.loaded ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-500'}`}>{step.complete ? <Check className="h-5 w-5" /> : index + 1}</span>
                            <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold text-slate-950">{step.title}</h3><span className={`text-xs font-bold ${step.complete ? 'text-emerald-700' : 'text-slate-500'}`}>{step.complete ? '완료' : '확인 필요'}</span></div><p className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>{step.action && <Link href={step.action} className="mt-2 inline-flex text-sm font-bold text-[#123D32]">{index === 0 ? '검증 결과 보기' : '이 단계 진행'} <ArrowRight className="ml-1 h-4 w-4" /></Link>}</div>
                        </li>
                    ))}</ol>
                </section>

                <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                    <div className="flex items-center justify-between"><h2 className="text-lg font-bold text-slate-950">현재 상태</h2><FileCheck2 className="h-5 w-5 text-emerald-800" /></div>
                    {!data.loaded ? <p className="mt-5 text-sm text-slate-500">확인 중입니다.</p> : (
                        <>
                            <div className={`mt-5 rounded-lg p-5 text-center ${data.readiness.errorCount === 0 && reportableResultCount > 0 ? 'bg-emerald-50' : 'bg-amber-50'}`}><p className="text-sm font-semibold text-slate-700">산정 결과</p><p className="mt-2 text-4xl font-bold text-slate-950">{reportableResultCount}</p><p className="mt-1 text-xs text-slate-500">CBAM 신고 산정 라인</p></div>
                            <dl className="mt-4 divide-y divide-slate-200 border-y border-slate-200 text-sm"><div className="flex justify-between py-3"><dt className="text-slate-500">차단 오류</dt><dd className="font-bold text-red-700">{data.readiness.errorCount}건</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">주의 항목</dt><dd className="font-bold text-amber-700">{data.readiness.warningCount}건</dd></div><div className="flex justify-between py-3"><dt className="text-slate-500">품목</dt><dd className="font-bold text-slate-900">{data.products.length}개</dd></div></dl>
                            <Link href={data.readiness.errorCount > 0 ? '/results' : '/export?advanced=1'} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white">{data.readiness.errorCount > 0 ? '오류부터 수정' : '템플릿 선택 및 생성'}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </>
                    )}
                </aside>
            </div>

            <details className="group rounded-lg border border-slate-200 bg-white">
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-5 text-sm font-bold text-slate-700"><span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> 고급 기능</span><ChevronDown className="h-4 w-4 transition group-open:rotate-180" /></summary>
                <div className="grid gap-3 border-t border-slate-200 p-5 sm:grid-cols-3">
                    <Link href="/upload?advanced=1" className="rounded-md border border-slate-200 p-4 hover:bg-slate-50"><Upload className="h-5 w-5 text-slate-600" /><p className="mt-3 font-bold text-slate-900">자료 일괄 업로드</p><p className="mt-1 text-xs leading-5 text-slate-500">정해진 형식의 데이터를 한 번에 가져옵니다.</p></Link>
                    <Link href="/scenarios?advanced=1" className="rounded-md border border-slate-200 p-4 hover:bg-slate-50"><Package className="h-5 w-5 text-slate-600" /><p className="mt-3 font-bold text-slate-900">비용 시나리오</p><p className="mt-1 text-xs leading-5 text-slate-500">인증서 가격 가정으로 비용을 비교합니다.</p></Link>
                    <Link href="/settings" className="rounded-md border border-slate-200 p-4 hover:bg-slate-50"><FileSpreadsheet className="h-5 w-5 text-slate-600" /><p className="mt-3 font-bold text-slate-900">백업 및 복원</p><p className="mt-1 text-xs leading-5 text-slate-500">로컬 프로젝트를 .cbam 파일로 보관합니다.</p></Link>
                </div>
            </details>
        </div>
    );
}
