'use client';

import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import { evaluateEuExportReadiness, getEuExportIssueEditHref, type EuExportReadinessIssue } from '@/lib/eu-template-export';
import {
    listLocalItems,
    type Product,
    type ProductionProcess,
    type ProductOutputLine,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import {
    AlertTriangle,
    ArrowRight,
    BarChart3,
    Boxes,
    CheckCircle2,
    Factory,
    Flame,
    Package,
    ShieldCheck,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type DashboardState = {
    loaded: boolean;
    products: Product[];
    processes: ProductionProcess[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    results: LocalCalculationResult[];
    exportIssues: EuExportReadinessIssue[];
    exportErrorCount: number;
    exportWarningCount: number;
};

type NextAction = {
    title: string;
    description: string;
    href: string;
    label: string;
    tone: 'success' | 'warning' | 'danger' | 'neutral';
};

const EMPTY_STATE: DashboardState = {
    loaded: false,
    products: [],
    processes: [],
    sourceStreams: [],
    precursors: [],
    results: [],
    exportIssues: [],
    exportErrorCount: 0,
    exportWarningCount: 0,
};

function formatNumber(value: number, maximumFractionDigits = 1) {
    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits }).format(Number.isFinite(value) ? value : 0);
}

function hasCnCode(product: Product) {
    return product.cn_code?.replace(/\D/g, '').length === 8;
}

function getMetricToneClass(tone: 'green' | 'blue' | 'amber' | 'purple' | 'slate') {
    return {
        green: 'bg-emerald-50 text-emerald-900 ring-emerald-100',
        blue: 'bg-blue-50 text-blue-900 ring-blue-100',
        amber: 'bg-amber-50 text-amber-900 ring-amber-100',
        purple: 'bg-violet-50 text-violet-900 ring-violet-100',
        slate: 'bg-slate-50 text-slate-900 ring-slate-200',
    }[tone];
}

function MetricCard({
    label,
    value,
    caption,
    icon: Icon,
    tone,
}: {
    label: string;
    value: string;
    caption: string;
    icon: LucideIcon;
    tone: 'green' | 'blue' | 'amber' | 'purple' | 'slate';
}) {
    return (
        <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-bold text-slate-700">{label}</p>
                    <p className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
                    <p className="mt-2 text-xs font-semibold text-slate-500">{caption}</p>
                </div>
                <div className={`grid h-11 w-11 flex-none place-items-center rounded-xl ring-1 ${getMetricToneClass(tone)}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </article>
    );
}

function FlowStep({
    index,
    title,
    caption,
    done,
}: {
    index: number;
    title: string;
    caption: string;
    done: boolean;
}) {
    return (
        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className={`grid h-9 w-9 flex-none place-items-center rounded-full text-sm font-bold ${done ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {done ? <CheckCircle2 className="h-4 w-4" /> : index}
            </div>
            <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-950">{title}</h3>
                <p className="mt-1 text-xs leading-5 text-slate-500">{caption}</p>
            </div>
        </div>
    );
}

function ReadinessBar({ value }: { value: number }) {
    return (
        <div>
            <div className="flex items-center justify-between text-sm font-bold text-slate-700">
                <span>보고 준비율</span>
                <span>{Math.round(value)}%</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
            </div>
        </div>
    );
}

function getNextAction(state: DashboardState): NextAction {
    const productsMissingCn = state.products.filter((product) => !hasCnCode(product)).length;

    if (state.products.length === 0) {
        return {
            title: '품목을 먼저 등록하세요',
            description: 'CBAM 대상 제품명과 CN 8자리 코드를 먼저 잡아야 뒤의 계산이 이어집니다.',
            href: '/products',
            label: '품목 등록',
            tone: 'warning',
        };
    }

    if (productsMissingCn > 0) {
        return {
            title: 'CN 코드가 빠진 품목이 있습니다',
            description: `${productsMissingCn}개 품목의 CN 8자리 코드를 확인하면 보고서 매핑이 쉬워집니다.`,
            href: '/products',
            label: 'CN 확인',
            tone: 'warning',
        };
    }

    if (state.processes.length === 0) {
        return {
            title: '생산공정을 등록하세요',
            description: '제품을 어떤 공정에서 생산했는지 연결해야 배출량을 배분할 수 있습니다.',
            href: '/processes',
            label: '공정 등록',
            tone: 'warning',
        };
    }

    if (state.sourceStreams.length === 0) {
        return {
            title: '고지서나 배출원 자료를 입력하세요',
            description: '전기, 연료, 공정 원료 사용량을 공정과 연결하면 산정 결과가 생성됩니다.',
            href: '/source-streams',
            label: '배출원 입력',
            tone: 'warning',
        };
    }

    if (state.results.length === 0) {
        return {
            title: '산정 결과를 확인하세요',
            description: '입력 자료가 계산 결과로 이어지는지 먼저 확인해야 합니다.',
            href: '/results',
            label: '결과 확인',
            tone: 'neutral',
        };
    }

    if (state.exportErrorCount > 0 || state.exportWarningCount > 0) {
        const firstIssue = state.exportIssues[0];
        return {
            title: state.exportErrorCount > 0 ? '보고서를 막는 오류가 있습니다' : '보고 전 확인할 항목이 있습니다',
            description: firstIssue?.message ?? 'Export 준비 상태에서 확인할 항목이 있습니다.',
            href: firstIssue ? getEuExportIssueEditHref(firstIssue) ?? '/export' : '/export',
            label: '문제 해결',
            tone: state.exportErrorCount > 0 ? 'danger' : 'warning',
        };
    }

    return {
        title: '보고서 생성 단계입니다',
        description: '핵심 입력과 검증이 끝났습니다. EU Communication 템플릿으로 내보내기를 진행하세요.',
        href: '/export',
        label: '보고서 생성',
        tone: 'success',
    };
}

function getActionToneClass(tone: NextAction['tone']) {
    return {
        success: 'border-emerald-200 bg-emerald-50 text-emerald-950',
        warning: 'border-amber-200 bg-amber-50 text-amber-950',
        danger: 'border-red-200 bg-red-50 text-red-950',
        neutral: 'border-slate-200 bg-white text-slate-950',
    }[tone];
}

export function ModernDashboard() {
    const [state, setState] = useState<DashboardState>(EMPTY_STATE);

    useEffect(() => {
        let cancelled = false;

        async function loadDashboard() {
            const [products, periods, processes, productOutputLines, sourceStreams, precursors] = await Promise.all([
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('processes'),
                listLocalItems('product_output_lines'),
                listLocalItems('source_streams'),
                listLocalItems('precursors'),
            ]);

            if (cancelled) {
                return;
            }

            const typedProducts = products as Product[];
            const typedPeriods = periods as ReportingPeriod[];
            const typedProcesses = processes as ProductionProcess[];
            const typedProductOutputLines = productOutputLines as ProductOutputLine[];
            const typedSourceStreams = sourceStreams as SourceStream[];
            const typedPrecursors = precursors as PurchasedPrecursor[];
            const results = calculateLocalResults({
                products: typedProducts,
                periods: typedPeriods,
                processes: typedProcesses,
                productOutputLines: typedProductOutputLines,
                sourceStreams: typedSourceStreams,
                precursors: typedPrecursors,
            });
            const readiness = evaluateEuExportReadiness({
                products: typedProducts,
                processes: typedProcesses,
                productOutputLines: typedProductOutputLines,
                sourceStreams: typedSourceStreams,
                precursors: typedPrecursors,
            });

            setState({
                loaded: true,
                products: typedProducts,
                processes: typedProcesses,
                sourceStreams: typedSourceStreams,
                precursors: typedPrecursors,
                results,
                exportIssues: readiness.issues,
                exportErrorCount: readiness.errorCount,
                exportWarningCount: readiness.warningCount,
            });
        }

        loadDashboard().catch(() => {
            if (!cancelled) {
                setState((current) => ({ ...current, loaded: true }));
            }
        });

        return () => {
            cancelled = true;
        };
    }, []);

    const summary = useMemo(() => {
        const reportableResults = state.results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
        const totalOutput = reportableResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        const directEmissions = reportableResults.reduce((sum, result) => sum + result.see_direct_incl_precursor * result.output_mass_t, 0);
        const indirectEmissions = reportableResults.reduce((sum, result) => sum + result.see_indirect_incl_precursor * result.output_mass_t, 0);
        const cbamBasisSee = totalOutput > 0
            ? reportableResults.reduce((sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t, 0) / totalOutput
            : 0;
        const cnReadyCount = state.products.filter(hasCnCode).length;
        const completedChecks = [
            state.products.length > 0,
            state.products.length > 0 && cnReadyCount === state.products.length,
            state.processes.length > 0,
            state.sourceStreams.length > 0,
            reportableResults.length > 0,
            state.exportErrorCount === 0 && state.exportWarningCount === 0 && reportableResults.length > 0,
        ].filter(Boolean).length;

        return {
            totalOutput,
            directEmissions,
            indirectEmissions,
            totalEmissions: directEmissions + indirectEmissions,
            cbamBasisSee,
            cnReadyCount,
            readinessRate: Math.round((completedChecks / 6) * 100),
            calculationWarningCount: state.results.reduce((sum, result) => sum + result.warnings.length, 0),
        };
    }, [state]);

    const nextAction = useMemo(() => getNextAction(state), [state]);
    const issueCount = state.exportErrorCount + state.exportWarningCount + summary.calculationWarningCount;

    return (
        <div className="mx-auto max-w-[1480px] space-y-5">
            <section className={`rounded-3xl border p-5 shadow-sm ${getActionToneClass(nextAction.tone)}`}>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div className="min-w-0">
                        <div className="inline-flex items-center rounded-full bg-white/60 px-3 py-1 text-xs font-bold text-current ring-1 ring-current/10">
                            지금 할 일
                        </div>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{nextAction.title}</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{nextAction.description}</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Link href={nextAction.href} className="inline-flex min-h-11 items-center rounded-xl bg-[#0F3D2E] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#15533F]">
                                {nextAction.label}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                            <Link href="/guide" className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                                3단계 가이드
                            </Link>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-white/75 p-4 ring-1 ring-current/10">
                        <ReadinessBar value={summary.readinessRate} />
                        <div className="mt-4 grid grid-cols-2 gap-2 text-xs font-semibold text-slate-600">
                            <span>품목 {state.products.length}개</span>
                            <span>공정 {state.processes.length}개</span>
                            <span>산정 {state.results.length}행</span>
                            <span>확인 {issueCount}건</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <MetricCard label="CBAM 기준 배출량" value={`${formatNumber(summary.totalEmissions)} t`} caption="직접+간접+전구물질 기준" icon={BarChart3} tone="green" />
                <MetricCard label="직접 배출" value={`${formatNumber(summary.directEmissions)} t`} caption="Scope 1 + 전구물질 직접" icon={Flame} tone="green" />
                <MetricCard label="간접 배출" value={`${formatNumber(summary.indirectEmissions)} t`} caption="Scope 2 + 전구물질 간접" icon={Zap} tone="blue" />
                <MetricCard label="SEE" value={formatNumber(summary.cbamBasisSee, 2)} caption="see_cbam_basis 가중평균" icon={Package} tone="purple" />
            </section>

            <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">처음부터 제출까지 흐름</h2>
                            <p className="mt-1 text-sm text-slate-500">완료된 단계와 다음에 막힌 지점을 한 줄로 봅니다.</p>
                        </div>
                        <Factory className="h-5 w-5 text-emerald-800" />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        <FlowStep index={1} title="품목/CN" caption={`${summary.cnReadyCount}/${state.products.length}개 준비`} done={state.products.length > 0 && summary.cnReadyCount === state.products.length} />
                        <FlowStep index={2} title="공정" caption={`${state.processes.length}개 공정 등록`} done={state.processes.length > 0} />
                        <FlowStep index={3} title="배출원" caption={`${state.sourceStreams.length}개 입력 자료`} done={state.sourceStreams.length > 0} />
                        <FlowStep index={4} title="전구물질" caption={`${state.precursors.length}개 구매 자료`} done={state.precursors.length > 0} />
                        <FlowStep index={5} title="산정 결과" caption={`${state.results.length}개 결과 행`} done={state.results.length > 0} />
                        <FlowStep index={6} title="보고서" caption={`${state.exportErrorCount + state.exportWarningCount}개 Export 이슈`} done={state.results.length > 0 && state.exportErrorCount === 0 && state.exportWarningCount === 0} />
                    </div>
                </div>

                <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">검증 상태</h2>
                            <p className="mt-1 text-sm text-slate-500">보고 전에 해결할 항목입니다.</p>
                        </div>
                        {issueCount > 0 ? <AlertTriangle className="h-5 w-5 text-amber-700" /> : <ShieldCheck className="h-5 w-5 text-emerald-800" />}
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <span className="font-semibold text-slate-600">계산 경고</span>
                            <span className="font-bold text-slate-950">{summary.calculationWarningCount}건</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <span className="font-semibold text-slate-600">Export 오류</span>
                            <span className="font-bold text-slate-950">{state.exportErrorCount}건</span>
                        </div>
                        <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3 text-sm">
                            <span className="font-semibold text-slate-600">Export 경고</span>
                            <span className="font-bold text-slate-950">{state.exportWarningCount}건</span>
                        </div>
                    </div>
                    <Link href={issueCount > 0 ? nextAction.href : '/export'} className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#0F3D2E] px-4 text-sm font-bold text-white shadow-sm transition hover:bg-[#15533F]">
                        {issueCount > 0 ? '막힌 항목 해결' : '보고서 생성'}
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </aside>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
                <MetricCard label="품목" value={`${state.products.length}개`} caption={`${summary.cnReadyCount}개 CN 준비`} icon={Package} tone="slate" />
                <MetricCard label="공정" value={`${state.processes.length}개`} caption="생산량과 배출량 연결 단위" icon={Factory} tone="slate" />
                <MetricCard label="입력 자료" value={`${state.sourceStreams.length + state.precursors.length}개`} caption="배출원 + 전구물질" icon={Boxes} tone="slate" />
            </section>

            {!state.loaded && (
                <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm font-semibold text-slate-500 shadow-sm">
                    로컬 데이터를 불러오는 중입니다.
                </div>
            )}
        </div>
    );
}
