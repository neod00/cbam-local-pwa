'use client';

import { ActionItemCard, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, getLocalCalculationWarningHref } from '@/lib/calculation-engine';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { listLocalItems, seedLocalData } from '@/lib/local-db';
import { AlertTriangle, ArrowRight, Factory, Gauge, Percent, Scale } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 4,
    }).format(value);
}

function formatPercent(value: number) {
    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 2,
        style: 'percent',
    }).format(value);
}

function average(values: number[]) {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getAllocationLabel(result: LocalCalculationResult) {
    if (result.allocation_basis === 'PROCESS_TOTAL') {
        return '공정 전체';
    }

    if (result.allocation_basis === 'MANUAL') {
        return '수동 비율';
    }

    return '질량 기준';
}

function getAllocationTone(result: LocalCalculationResult) {
    if (result.allocation_basis === 'PROCESS_TOTAL') {
        return 'neutral' as const;
    }

    if (result.allocation_basis === 'MANUAL') {
        return 'warning' as const;
    }

    return 'pending' as const;
}

function getIndirectApplicabilityLabel(result: LocalCalculationResult) {
    return result.indirect_emissions_applicable ? '간접 포함' : '인증서 산정 제외';
}

export default function ResultsPage() {
    const [results, setResults] = useState<LocalCalculationResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadResults() {
            setLoading(true);
            await seedLocalData();
            const [processes, precursors, products, periods, sourceStreams, productOutputLines] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('source_streams'),
                listLocalItems('product_output_lines'),
            ]);

            setResults(calculateLocalResults({ processes, precursors, products, periods, sourceStreams, productOutputLines }));
            setLoading(false);
        }

        loadResults();
    }, []);

    const summary = useMemo(() => {
        const totalOutput = results.reduce((sum, result) => sum + result.output_mass_t, 0);
        const allocatedEmissions = results.reduce(
            (sum, result) => sum + result.see_cbam_basis * result.output_mass_t,
            0
        );
        const productLineCount = results.filter((result) => result.product_output_line_id).length;
        const allWarnings = results.flatMap((result) =>
            result.warningDetails.map((warning) => ({
                resultId: result.id,
                processName: result.process_name,
                href: getLocalCalculationWarningHref(warning),
                warning,
            }))
        );

        return {
            lineCount: results.length,
            productLineCount,
            totalOutput,
            allocatedEmissions,
            averageCbamBasisSee: average(results.map((result) => result.see_cbam_basis)),
            averageInformationalTotalSee: average(results.map((result) => result.see_informational_total)),
            warningCount: allWarnings.length,
            warnings: allWarnings,
        };
    }, [results]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="산정 결과"
                title="제품별 SEE 산정 결과"
                description="생산공정과 제품 생산라인, 배분 기준을 바탕으로 직접배출량, 간접배출량, 전구물질 배출량을 제품별로 배분합니다."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="산정 라인 수" value={summary.lineCount} helper={`제품라인 ${summary.productLineCount}개`} icon={Factory} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={Scale} tone="pending" />
                <StatCard label="CBAM 기준 배출량" value={formatNumber(summary.allocatedEmissions)} helper="tCO2e" icon={Gauge} tone="success" />
                <StatCard label="확인 필요" value={summary.warningCount} helper="경고 항목" icon={AlertTriangle} tone="warning" />
            </div>

            <div className="hidden md:block">
                <DataTable>
                    <table className="min-w-full divide-y divide-gray-300">
                        <thead className="bg-slate-50">
                            <tr>
                                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정/제품라인</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                                <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">배분기준</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">배분율</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">전구물질 SEE</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 산정 기준 SEE</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">내부 검토용 total SEE</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white">
                            {loading ? (
                                <tr>
                                    <td colSpan={11} className="p-6 text-center text-sm text-slate-500">
                                        산정 결과를 불러오는 중입니다.
                                    </td>
                                </tr>
                            ) : results.length === 0 ? (
                                <tr>
                                    <td colSpan={11} className="p-6 text-center text-sm text-slate-500">
                                        산정할 생산공정이 없습니다.
                                    </td>
                                </tr>
                            ) : (
                                results.map((result) => (
                                    <tr key={result.id} className="transition hover:bg-slate-50">
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-950">
                                            {result.process_name}
                                            <div className="mt-1 flex items-center gap-2 text-xs font-normal text-slate-500">
                                                <span>{result.product_output_line_id ? '제품라인' : '공정합계'}</span>
                                                <span className="text-slate-300">/</span>
                                                <span>{result.production_route || '생산경로 미입력'}</span>
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            {result.product_name}
                                            {(result.cn_code || result.hs_code) && (
                                                <div className="text-xs text-slate-400">
                                                    {result.cn_code ? `CN ${result.cn_code}` : `HS ${result.hs_code}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            {result.period_name ?? '-'}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            <StatusBadge tone={getAllocationTone(result)}>{getAllocationLabel(result)}</StatusBadge>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.output_mass_t)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            <span className="inline-flex items-center justify-end gap-1">
                                                <Percent className="h-3.5 w-3.5 text-slate-400" />
                                                {formatPercent(result.allocation_share)}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.direct_see)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.indirect_see)}
                                            <div className={result.indirect_emissions_applicable ? 'mt-1 text-xs text-slate-400' : 'mt-1 text-xs font-semibold text-amber-700'}>
                                                {getIndirectApplicabilityLabel(result)}
                                                {!result.indirect_emissions_applicable && result.indirect_emissions_excluded_tco2e > 0
                                                    ? ` ${formatNumber(result.indirect_emissions_excluded_tco2e)} tCO2e`
                                                    : ''}
                                            </div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.precursor_see)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-950">
                                            {formatNumber(result.see_cbam_basis)}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.see_informational_total)}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </DataTable>
            </div>

            <div className="space-y-3 md:hidden">
                {loading ? (
                    <SectionCard>
                        <p className="text-sm text-slate-500">산정 결과를 불러오는 중입니다.</p>
                    </SectionCard>
                ) : results.length === 0 ? (
                    <SectionCard>
                        <p className="text-sm text-slate-500">산정할 생산공정이 없습니다.</p>
                    </SectionCard>
                ) : (
                    results.map((result) => (
                        <SectionCard key={result.id} className="p-4">
                            <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h2 className="break-words text-sm font-semibold text-slate-950">{result.process_name}</h2>
                                    <p className="mt-1 break-words text-xs text-slate-500">
                                        {result.product_name}
                                        {result.cn_code ? ` / CN ${result.cn_code}` : result.hs_code ? ` / HS ${result.hs_code}` : ''}
                                    </p>
                                </div>
                                <StatusBadge tone={getAllocationTone(result)}>{getAllocationLabel(result)}</StatusBadge>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-xs text-slate-500">CBAM 산정 기준 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-950">{formatNumber(result.see_cbam_basis)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">생산량</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.output_mass_t)} t</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">직접 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.direct_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">간접 SEE</dt>
                                    <dd className={result.indirect_emissions_applicable ? 'mt-1 font-medium text-slate-900' : 'mt-1 font-semibold text-amber-700'}>
                                        {formatNumber(result.indirect_see)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">전구물질 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.precursor_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">내부 검토용 total SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.see_informational_total)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">배분율</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatPercent(result.allocation_share)}</dd>
                                </div>
                            </dl>
                            <p className="mt-3 text-xs text-slate-500">
                                {result.period_name ?? '보고기간 미입력'} / {getIndirectApplicabilityLabel(result)}
                            </p>
                        </SectionCard>
                    ))
                )}
            </div>

            {summary.warnings.length > 0 && (
                <SectionCard>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-amber-900">확인 필요 항목</h2>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-amber-900">
                        {summary.warnings.map((item) => (
                            <li key={`${item.resultId}-${item.warning.message}`}>
                                <ActionItemCard
                                    title={item.processName}
                                    description={item.warning.message}
                                    className="border-amber-100 bg-amber-50"
                                    badge={<StatusBadge tone="warning">확인 필요</StatusBadge>}
                                    action={
                                        <Link
                                            href={item.href}
                                            className="inline-flex min-h-9 items-center rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition hover:bg-amber-100"
                                        >
                                            수정하기
                                            <ArrowRight className="ml-1 h-3.5 w-3.5" />
                                        </Link>
                                    }
                                />
                            </li>
                        ))}
                    </ul>
                </SectionCard>
            )}
        </div>
    );
}
