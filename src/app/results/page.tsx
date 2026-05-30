'use client';

import { DataTable, PageHeader, SectionCard, StatCard } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { listLocalItems, seedLocalData } from '@/lib/local-db';
import { AlertTriangle, ArrowRight, Factory, Gauge, Scale } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 4,
    }).format(value);
}

function average(values: number[]) {
    if (values.length === 0) {
        return 0;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getWarningHref(warning: LocalCalculationResult['warningDetails'][number]) {
    const encodedId = encodeURIComponent(warning.target.id);

    if (warning.target.type === 'precursor') {
        return `/precursors?edit=${encodedId}`;
    }

    return `/processes?edit=${encodedId}`;
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
        const totalSourceStreamEmissions = results.reduce((sum, result) => sum + result.source_stream_emissions_tco2e, 0);
        const totalSourceStreamEnergy = results.reduce((sum, result) => sum + result.source_stream_energy_tj, 0);
        const allWarnings = results.flatMap((result) =>
            result.warningDetails.map((warning) => ({
                resultId: result.id,
                processName: result.process_name,
                href: getWarningHref(warning),
                warning,
            }))
        );

        return {
            processCount: results.length,
            totalOutput,
            totalSourceStreamEmissions,
            totalSourceStreamEnergy,
            averageTotalSee: average(results.map((result) => result.total_see)),
            warningCount: allWarnings.length,
            warnings: allWarnings,
        };
    }, [results]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="계산 결과"
                title="산정결과"
                description="로컬에 저장된 생산공정(D_Processes)과 구매 전구물질(E_PurchPrec) 데이터를 기준으로 공정별 SEE를 산정합니다."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="산정 공정 수" value={summary.processCount} helper="공정별 SEE 계산" icon={Factory} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={Scale} tone="pending" />
                <StatCard label="배출원 합계" value={formatNumber(summary.totalSourceStreamEmissions)} helper={`${formatNumber(summary.totalSourceStreamEnergy)} TJ`} icon={Gauge} tone="success" />
                <StatCard label="검토 필요" value={summary.warningCount} helper="경고 항목" icon={AlertTriangle} tone="warning" />
            </div>

            <DataTable>
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">보고기간</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">배출원 합계</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 차이</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">
                                전구물질 SEE
                            </th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">총 SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={10} className="p-6 text-center text-sm text-slate-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : results.length === 0 ? (
                            <tr>
                                <td colSpan={10} className="p-6 text-center text-sm text-slate-500">
                                    산정할 생산공정이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            results.map((result) => (
                                <tr key={result.id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-950">
                                        {result.process_name}
                                        <div className="text-xs font-normal text-slate-500">
                                            {result.production_route || '생산경로 미지정'}
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
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(result.output_mass_t)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(result.direct_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {result.source_stream_count > 0
                                            ? `${formatNumber(result.source_stream_emissions_tco2e)} tCO2e`
                                            : '-'}
                                        {result.source_stream_count > 0 && (
                                            <div className="text-xs text-slate-400">
                                                {formatNumber(result.source_stream_energy_tj)} TJ
                                            </div>
                                        )}
                                    </td>
                                    <td className={`whitespace-nowrap px-4 py-4 text-right text-sm ${Math.abs(result.source_stream_delta_tco2e) > 0.01 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>
                                        {result.source_stream_count > 0 ? formatNumber(result.source_stream_delta_tco2e) : '-'}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(result.indirect_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(result.precursor_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-950">
                                        {formatNumber(result.total_see)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>

            {summary.warnings.length > 0 && (
                <SectionCard>
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-amber-900">검토 필요 항목</h2>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-amber-900">
                        {summary.warnings.map((item) => (
                            <li key={`${item.resultId}-${item.warning.message}`}>
                                <Link
                                    href={item.href}
                                    className="flex flex-col gap-2 rounded-xl px-3 py-2 transition hover:bg-amber-50 sm:flex-row sm:items-center sm:justify-between"
                                >
                                    <span>
                                        <span className="font-medium">{item.processName}</span>
                                        <span className="ml-2">{item.warning.message}</span>
                                    </span>
                                    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold text-amber-700">
                                        수정하기
                                        <ArrowRight className="h-3.5 w-3.5" />
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </SectionCard>
            )}
        </div>
    );
}
