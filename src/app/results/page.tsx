'use client';

import { calculateLocalResults } from '@/lib/calculation-engine';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { listLocalItems, seedLocalData } from '@/lib/local-db';
import { AlertTriangle } from 'lucide-react';
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

export default function ResultsPage() {
    const [results, setResults] = useState<LocalCalculationResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadResults() {
            setLoading(true);
            await seedLocalData();
            const [processes, precursors, products, periods] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
            ]);

            setResults(calculateLocalResults({ processes, precursors, products, periods }));
            setLoading(false);
        }

        loadResults();
    }, []);

    const summary = useMemo(() => {
        const totalOutput = results.reduce((sum, result) => sum + result.output_mass_t, 0);
        const allWarnings = results.flatMap((result) =>
            result.warnings.map((warning) => ({
                resultId: result.id,
                processName: result.process_name,
                warning,
            }))
        );

        return {
            processCount: results.length,
            totalOutput,
            averageTotalSee: average(results.map((result) => result.total_see)),
            warningCount: allWarnings.length,
            warnings: allWarnings,
        };
    }, [results]);

    return (
        <div>
            <div>
                <h1 className="text-2xl font-bold text-gray-900">산정결과</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    로컬에 저장된 생산공정(D_Processes)과 구매 전구물질(E_PurchPrec) 데이터를 기준으로
                    공정별 SEE를 산정합니다. EU 제출 템플릿 Export 시에는 원본 템플릿 구조를 유지해야 합니다.
                </p>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">산정 공정 수</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">{summary.processCount}</dd>
                </div>
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">총 생산량</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                        {formatNumber(summary.totalOutput)}
                    </dd>
                    <dd className="text-xs text-gray-400">t</dd>
                </div>
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">평균 총 SEE</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                        {formatNumber(summary.averageTotalSee)}
                    </dd>
                    <dd className="text-xs text-gray-400">tCO2e/t</dd>
                </div>
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">경고</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">{summary.warningCount}</dd>
                    <dd className="text-xs text-gray-400">검토 필요 항목</dd>
                </div>
            </dl>

            <div className="mt-6 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">공정</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">보고기간</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">생산량(t)</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">직접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">간접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">
                                전구물질 SEE
                            </th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">총 SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={8} className="p-4 text-center text-sm text-gray-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : results.length === 0 ? (
                            <tr>
                                <td colSpan={8} className="p-4 text-center text-sm text-gray-500">
                                    산정할 생산공정이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            results.map((result) => (
                                <tr key={result.id}>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                        {result.process_name}
                                        <div className="text-xs font-normal text-gray-500">
                                            {result.production_route || '생산경로 미지정'}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        {result.product_name}
                                        {result.hs_code && <div className="text-xs text-gray-400">HS {result.hs_code}</div>}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        {result.period_name ?? '-'}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.output_mass_t)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.direct_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.indirect_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.precursor_see)}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold text-gray-900">
                                        {formatNumber(result.total_see)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {summary.warnings.length > 0 && (
                <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-amber-900">검토 필요 항목</h2>
                    </div>
                    <ul className="mt-3 space-y-2 text-sm text-amber-900">
                        {summary.warnings.map((item) => (
                            <li key={`${item.resultId}-${item.warning}`}>
                                <span className="font-medium">{item.processName}</span>: {item.warning}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}
