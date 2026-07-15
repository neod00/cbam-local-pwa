'use client';

import { SeeFlowDiagram } from '@/components/SeeFlowDiagram';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    evaluateEuExportReadiness,
    type EuExportReadinessIssue,
} from '@/lib/eu-template-export';
import {
    listLocalItems,
    type Installation,
    type Product,
    type ProductionProcess,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import {
    ArrowRight,
    Building2,
    Calculator,
    CalendarDays,
    Check,
    ClipboardCheck,
    FileCheck2,
    FileText,
    Flame,
    ListChecks,
    Package,
    Settings,
    ShieldCheck,
    Zap,
    type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type DashboardData = {
    loaded: boolean;
    installations: Installation[];
    periods: ReportingPeriod[];
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
    step: number;
    label: string;
    title: string;
    description: string;
    href?: string;
    buttonLabel?: string;
};

const EMPTY_DATA: DashboardData = {
    loaded: false,
    installations: [],
    periods: [],
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

function hasCompleteCnCode(product: Product) {
    return product.cn_code?.replace(/\D/g, '').length === 8;
}

async function fetchDashboardData(): Promise<DashboardData> {
    const [
        installations,
        periods,
        products,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
    ] = await Promise.all([
        listLocalItems('installations'),
        listLocalItems('periods'),
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('product_output_lines'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
    ]);

    const results = calculateLocalResults({
        products,
        periods,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
    });
    const readiness = evaluateEuExportReadiness({
        products,
        processes,
        productOutputLines,
        sourceStreams,
        precursors,
    });

    return {
        loaded: true,
        installations,
        periods,
        products,
        processes,
        sourceStreams,
        precursors,
        results,
        exportIssues: readiness.issues,
        exportErrorCount: readiness.errorCount,
        exportWarningCount: readiness.warningCount,
    };
}

function ProgressRing({ value }: { value: number }) {
    const radius = 42;
    const circumference = 2 * Math.PI * radius;
    const normalized = Math.max(0, Math.min(100, value));
    const offset = circumference - (normalized / 100) * circumference;

    return (
        <div className="relative h-28 w-28" role="img" aria-label={`전체 진행률 ${normalized}%`}>
            <svg className="h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r={radius} fill="none" stroke="#E2E8F0" strokeWidth="7" />
                <circle
                    cx="50"
                    cy="50"
                    r={radius}
                    fill="none"
                    stroke="#176B4E"
                    strokeWidth="7"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                />
            </svg>
            <div className="absolute inset-0 grid place-items-center text-center">
                <div>
                    <div className="text-2xl font-bold text-[#123D32]">{normalized}%</div>
                    <div className="mt-0.5 text-[11px] font-semibold text-slate-500">전체 진행률</div>
                </div>
            </div>
        </div>
    );
}

function SummaryCard({
    icon: Icon,
    label,
    value,
    caption,
    tone = 'green',
}: {
    icon: LucideIcon;
    label: string;
    value: string;
    caption: string;
    tone?: 'green' | 'blue' | 'slate';
}) {
    const iconClass = {
        green: 'bg-emerald-50 text-emerald-800',
        blue: 'bg-blue-50 text-blue-700',
        slate: 'bg-slate-100 text-slate-700',
    }[tone];

    return (
        <article className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-4">
                <div className={`grid h-12 w-12 flex-none place-items-center rounded-lg ${iconClass}`}>
                    <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-600">{label}</p>
                    <p className="mt-1 text-2xl font-bold text-slate-950">{value}</p>
                    <p className="mt-1 text-xs text-slate-500">{caption}</p>
                </div>
            </div>
        </article>
    );
}

export function BeginnerDashboard() {
    const [data, setData] = useState<DashboardData>(EMPTY_DATA);

    useEffect(() => {
        let active = true;

        fetchDashboardData()
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

    const summary = useMemo(() => {
        const basicReady = data.installations.length > 0 && data.periods.length > 0;
        const reportingProducts = data.products.filter((product) => isCbamReportingScope(getProductReportingScope(product)));
        const cnReadyCount = reportingProducts.filter(hasCompleteCnCode).length;
        const productReady = reportingProducts.length > 0 && cnReadyCount === reportingProducts.length;
        const processReady = data.processes.length > 0;
        const sourceReady = data.sourceStreams.length > 0 || data.processes.some((process) => process.electricity_mwh > 0);
        const reportableResults = data.results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
        const allocationOnlyResults = data.results.filter((result) => !result.is_cbam_reportable);
        const calculationReady = reportableResults.length > 0;
        const validationReady = calculationReady && data.exportErrorCount === 0;
        const reportReady = validationReady && data.exportWarningCount === 0;
        const requiredChecks = [basicReady, productReady, processReady, sourceReady, validationReady, reportReady];
        const completedRequired = requiredChecks.filter(Boolean).length;
        const readinessRate = Math.round((completedRequired / requiredChecks.length) * 100);

        const totalOutput = reportableResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        const directEmissions = reportableResults.reduce(
            (sum, result) => sum + result.see_direct_incl_precursor * result.output_mass_t,
            0
        );
        const indirectEmissions = reportableResults.reduce(
            (sum, result) => sum + result.see_indirect_incl_precursor * result.output_mass_t,
            0
        );
        const cbamBasisSee = totalOutput > 0
            ? reportableResults.reduce(
                (sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t,
                0
            ) / totalOutput
            : 0;

        return {
            basicReady,
            productReady,
            processReady,
            sourceReady,
            calculationReady,
            validationReady,
            reportReady,
            cnReadyCount,
            reportingProductCount: reportingProducts.length,
            allocationOnlyCount: allocationOnlyResults.length,
            completedRequired,
            readinessRate,
            directEmissions,
            indirectEmissions,
            cbamBasisSee,
        };
    }, [data]);

    const nextAction = useMemo<NextAction>(() => {
        if (!data.loaded) {
            return {
                step: 1,
                label: '로컬 데이터 확인',
                title: '작업 상태를 불러오고 있습니다',
                description: '이 브라우저에 저장된 CBAM 자료를 확인합니다.',
            };
        }

        if (!summary.basicReady) {
            return {
                step: 1,
                label: '기본 설정',
                title: '사업장과 보고기간을 먼저 등록하세요',
                description: '산정을 시작하기 전에 회사와 보고 범위를 설정합니다.',
                href: '/workspace',
                buttonLabel: '기본 설정 시작',
            };
        }

        if (!summary.productReady) {
            return {
                step: 2,
                label: '품목/CN',
                title: data.products.length === 0 ? '대표 품목을 등록하세요' : '품목의 CN 코드를 확인하세요',
                description: '수출 품목과 CN 8자리 코드를 연결하면 다음 입력 단계가 열립니다.',
                href: '/products',
                buttonLabel: data.products.length === 0 ? '품목 등록' : 'CN 코드 확인',
            };
        }

        if (!summary.processReady) {
            return {
                step: 3,
                label: '생산공정',
                title: '품목이 생산되는 공정을 연결하세요',
                description: '생산량과 에너지 사용량을 배분할 공정을 등록합니다.',
                href: '/processes',
                buttonLabel: '생산공정 등록',
            };
        }

        if (!summary.sourceReady) {
            return {
                step: 4,
                label: '사용자료',
                title: '전기·연료 사용자료를 입력하세요',
                description: '고지서와 사용량 자료를 생산공정에 연결합니다.',
                href: '/source-streams',
                buttonLabel: '사용자료 입력',
            };
        }

        if (!summary.calculationReady) {
            return {
                step: 6,
                label: '검증',
                title: '산정 결과를 확인하세요',
                description: '입력한 자료가 계산 결과로 이어지는지 확인합니다.',
                href: '/results',
                buttonLabel: '산정 결과 확인',
            };
        }

        if (!summary.validationReady) {
            const firstIssue = data.exportIssues[0];
            return {
                step: 6,
                label: '검증',
                title: '보고서를 막는 항목을 해결하세요',
                description: firstIssue?.message ?? '필수 입력값과 연결 상태를 확인해야 합니다.',
                href: '/results',
                buttonLabel: '문제 해결',
            };
        }

        return {
            step: 7,
            label: '보고서',
            title: summary.reportReady ? 'EU 보고서를 생성할 수 있습니다' : '마지막 검토 항목이 남아 있습니다',
            description: summary.reportReady
                ? '입력과 검증이 완료되었습니다. 최신 EU 템플릿으로 보고서 사본을 만드세요.'
                : `${data.exportWarningCount}개 확인 항목을 검토한 뒤 보고서를 생성하세요.`,
            href: '/export',
            buttonLabel: summary.reportReady ? 'EU 보고서 생성' : '보고 준비 확인',
        };
    }, [data, summary]);

    const steps = [
        { label: '기본 설정', href: '/workspace', done: summary.basicReady },
        { label: '품목/CN', href: '/products', done: summary.productReady },
        { label: '생산공정', href: '/processes', done: summary.processReady },
        { label: '사용자료', href: '/source-streams', done: summary.sourceReady },
        { label: '전구물질', href: '/precursors', done: data.precursors.length > 0, optional: true },
        { label: '검증', href: '/results', done: summary.validationReady },
        { label: '보고서', href: '/export', done: summary.reportReady },
    ];
    const currentStepIndex = Math.max(
        0,
        steps.findIndex((step) => !step.done && !step.optional)
    );

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-3xl font-bold tracking-tight text-slate-950">대시보드</h1>
                <p className="mt-2 text-sm text-slate-600">지금 해야 할 작업부터 하나씩 진행하세요.</p>
                {data.loaded && data.installations[0] && (
                    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-semibold text-slate-500" aria-label="현재 산정 범위">
                        <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-4 w-4 text-slate-400" />
                            {data.installations[0].local_name || data.installations[0].name}
                        </span>
                        {data.periods[0] && (
                            <span className="inline-flex items-center gap-1.5">
                                <CalendarDays className="h-4 w-4 text-slate-400" />
                                {data.periods[0].name}
                            </span>
                        )}
                        {data.products[0] && (
                            <span className="inline-flex items-center gap-1.5"><Package className="h-4 w-4 text-slate-400" />{data.products[0].name}{data.products[0].cn_code ? ` · CN ${data.products[0].cn_code}` : ''}</span>
                        )}
                        <span className="inline-flex items-center gap-1.5"><ListChecks className="h-4 w-4 text-slate-400" />CBAM 신고 품목 {summary.reportingProductCount}개 · 배분 참고 {summary.allocationOnlyCount}개</span>
                    </div>

                )}
            </header>
            <section className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid items-center gap-6 lg:grid-cols-[minmax(0,1fr)_180px]">
                    <div>
                        <span className="inline-flex rounded-md bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-900">
                            {nextAction.step}단계 · {nextAction.label}
                        </span>
                        <h2 className="mt-4 text-2xl font-bold text-slate-950 sm:text-3xl">{nextAction.title}</h2>
                        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">{nextAction.description}</p>
                        {nextAction.href && nextAction.buttonLabel && (
                            <Link
                                href={nextAction.href}
                                className="mt-5 inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#195642]"
                            >
                                {nextAction.buttonLabel}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        )}
                    </div>
                    <div className="flex justify-center border-t border-slate-200 pt-5 lg:border-l lg:border-t-0 lg:pt-0">
                        <ProgressRing value={summary.readinessRate} />
                    </div>
                </div>
            </section>

            <section className="overflow-x-auto py-1" aria-label="업무 진행 단계">
                <ol className="grid min-w-[860px] grid-cols-7">
                    {steps.map((step, index) => {
                        const active = index === currentStepIndex;
                        return (
                            <li key={step.label} className="relative text-center">
                                {index < steps.length - 1 && (
                                    <span className="absolute left-[calc(50%+24px)] right-[calc(-50%+24px)] top-5 h-px bg-slate-300" />
                                )}
                                <Link href={step.href} className="group relative inline-flex flex-col items-center px-2">
                                    <span
                                        className={`relative z-10 grid h-10 w-10 place-items-center rounded-full border text-sm font-bold ${
                                            step.done
                                                ? 'border-[#176B4E] bg-[#176B4E] text-white'
                                                : active
                                                    ? 'border-[#176B4E] bg-white text-[#123D32] ring-4 ring-emerald-50'
                                                    : 'border-slate-300 bg-white text-slate-500'
                                        }`}
                                    >
                                        {step.done ? <Check className="h-4 w-4" /> : index + 1}
                                    </span>
                                    <span className={`mt-2 text-xs font-semibold ${active || step.done ? 'text-[#123D32]' : 'text-slate-500'}`}>
                                        {step.label}
                                    </span>
                                    {step.optional && !step.done && (
                                        <span className="mt-0.5 text-[10px] text-slate-400">해당 시</span>
                                    )}
                                </Link>
                            </li>
                        );
                    })}
                </ol>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
                <SummaryCard
                    icon={ListChecks}
                    label="입력 준비"
                    value={`${summary.completedRequired} / 6`}
                    caption="필수 항목"
                />
                <SummaryCard
                    icon={Calculator}
                    label="산정 상태"
                    value={summary.calculationReady ? '계산 완료' : '미산정'}
                    caption={summary.calculationReady ? `${data.results.length}개 결과` : '입력 완료 후 계산'}
                    tone="blue"
                />
                <SummaryCard
                    icon={FileCheck2}
                    label="보고 준비"
                    value={`${summary.readinessRate}%`}
                    caption={summary.reportReady ? '보고서 생성 가능' : '검증 전'}
                    tone="slate"
                />
            </section>

            {summary.calculationReady && (
                <section className="grid gap-4 md:grid-cols-3" aria-label="핵심 배출량">
                    <SummaryCard
                        icon={Flame}
                        label="직접 배출"
                        value={`${formatNumber(summary.directEmissions)} tCO₂e`}
                        caption="CBAM 신고 품목 기준"
                    />
                    <SummaryCard
                        icon={Zap}
                        label="간접 배출"
                        value={`${formatNumber(summary.indirectEmissions)} tCO₂e`}
                        caption="CBAM 신고 품목 기준"
                        tone="blue"
                    />
                    <SummaryCard
                        icon={Package}
                        label="CBAM 기준 SEE"
                        value={formatNumber(summary.cbamBasisSee, 2)}
                        caption="신고 대상 생산량 가중평균"
                        tone="slate"
                    />
                </section>
            )}

            <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm" aria-label="배출량 계산 흐름">
                <h2 className="text-lg font-bold text-slate-950">배출량이 어떻게 계산되나요?</h2>
                <p className="mt-1 text-sm text-slate-600">
                    제품 1톤당 배출량(SEE)이 만들어지는 3가지 길입니다. 상자를 누르면 해당 입력·결과 화면으로 이동합니다.
                </p>
                <div className="mt-4">
                    <SeeFlowDiagram results={data.results} />
                </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-950">준비 현황</h2>
                    <div className="mt-4 divide-y divide-slate-200">
                        {[
                            {
                                label: '사업장',
                                icon: Building2,
                                ready: data.installations.length > 0,
                                status: data.installations.length > 0 ? data.installations[0].local_name || data.installations[0].name : '미등록',
                            },
                            {
                                label: '보고기간',
                                icon: CalendarDays,
                                ready: data.periods.length > 0,
                                status: data.periods.length > 0 ? data.periods[0].name : '미등록',
                            },
                            {
                                label: '대표 품목',
                                icon: Package,
                                ready: data.products.length > 0,
                                status: data.products.length > 0 ? `${data.products.length}개 등록` : '미등록',
                            },
                        ].map((item) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.label} className="flex min-h-14 items-center justify-between gap-4 py-3">
                                    <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
                                        <Icon className="h-5 w-5 text-slate-500" />
                                        {item.label}
                                    </div>
                                    <span className={`text-sm font-semibold ${item.ready ? 'text-emerald-800' : 'text-slate-500'}`}>
                                        {item.status}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <h2 className="text-lg font-bold text-slate-950">처음이라면</h2>
                    <div className="mt-6 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 text-center">
                        {[
                            { label: '기본 설정', icon: Settings },
                            { label: '자료 입력', icon: FileText },
                            { label: '검증 및 보고', icon: ClipboardCheck },
                        ].map((item, index) => {
                            const Icon = item.icon;
                            return (
                                <div key={item.label} className="contents">
                                    <div>
                                        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-50 text-emerald-900">
                                            <Icon className="h-5 w-5" />
                                        </div>
                                        <div className="mt-2 text-xs font-semibold text-slate-700">{item.label}</div>
                                    </div>
                                    {index < 2 && <ArrowRight className="h-4 w-4 text-slate-300" />}
                                </div>
                            );
                        })}
                    </div>
                    <Link href="/guide" className="mt-6 inline-flex items-center text-sm font-bold text-blue-700 hover:text-blue-800">
                        전체 흐름 보기
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                </div>
            </section>

            <div className="flex items-center gap-2 text-xs text-slate-500">
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                모든 계산 자료는 현재 브라우저에만 저장됩니다.
            </div>
        </div>
    );
}
