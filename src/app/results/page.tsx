'use client';

import { ActionItemCard, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, getLocalCalculationWarningHref } from '@/lib/calculation-engine';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { ALLOCATION_BASIS_LABEL, ALLOCATION_RULES, DIRECT_EMISSIONS_INPUT_MODE_LABEL } from '@/lib/allocation-rules';
import { listLocalItems } from '@/lib/local-db';
import { INDIRECT_RELEVANCE_LABEL } from '@/lib/cbam-product-rules';
import { getProductReportingScopeLabel } from '@/lib/reporting-scope';
import { AlertTriangle, ArrowRight, Factory, Gauge, Percent, Scale, Split, TrendingUp } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number | null) {
    if (value === null) return '해당 없음';
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

// 배분기준 명칭은 규칙 모듈 한 곳에서 온다 — 여기서 따로 적으면 「활동수준 제외」 같은 새 값이
// 「질량 기준」으로 떨어져 검증인이 잘못 읽는다.
function getAllocationLabel(result: LocalCalculationResult) {
    return ALLOCATION_BASIS_LABEL[result.allocation_basis] ?? result.allocation_basis;
}

function getAllocationTone(result: LocalCalculationResult) {
    if (result.allocation_basis === 'PROCESS_TOTAL' || result.allocation_basis === 'ACTIVITY_LEVEL_EXCLUDED') {
        return 'neutral' as const;
    }

    if (result.allocation_basis === 'MANUAL') {
        return 'warning' as const;
    }

    return 'pending' as const;
}

/**
 * 배분 근거 한 줄 — 직접배출 입력방식 · 활동수준(분모) · 공용 계량기 정합계수 · 사용자 지정 사유.
 * 배지와 배분율만으로는 「이 숫자가 어떤 방법으로 나왔는지」를 검증인이 알 수 없다(ANNEX IV 1.1 항목 29·30).
 */
function describeAllocationBasis(result: LocalCalculationResult) {
    const parts = [
        `직접배출: ${DIRECT_EMISSIONS_INPUT_MODE_LABEL[result.direct_emissions_input_mode]}`,
        `활동수준(분모) ${formatNumber(result.activity_level_t)} t`,
    ];
    for (const group of result.reconciliation) {
        parts.push(
            group.applied
                ? `공용 계량기 '${group.group}' RecF ${group.factor.toFixed(4)} (${formatNumber(group.installation_total)} / ${formatNumber(group.sub_total)} ${group.unit})`
                : `공용 계량기 '${group.group}' ${group.mode === 'KEY_SPLIT' ? '배분키(정합계수 없음)' : '정합 미적용'}`
        );
    }
    if (result.allocation_basis === 'MANUAL') {
        parts.push(`사유: ${result.allocation_reason ?? '미기재'}`);
    }
    parts.push(`열·폐가스·자가발전 보정(식 55): ${ALLOCATION_RULES.ADJUSTMENTS.unsupported ? '현재 버전에서 미지원' : '적용'}`);
    return parts.join(' · ');
}

function getIndirectApplicabilityLabel(result: LocalCalculationResult) {
    // boolean이 아니라 3상태로 표시한다. boolean은 「판정 불가」를 「제외」로 뭉갠다(씨밤이 P1).
    return INDIRECT_RELEVANCE_LABEL[result.indirect_emissions_relevance];
}

/** 색도 3상태로 나눈다. 판정 불가와 비관련이 같은 amber면 화면에서 구분되지 않는다(씨밤이 P2). */
function getIndirectToneClass(result: LocalCalculationResult, base: string) {
    if (result.indirect_emissions_relevance === 'INCLUDED') {
        return `${base} font-medium text-slate-900`;
    }

    return result.indirect_emissions_relevance === 'UNDETERMINED'
        ? `${base} font-semibold text-rose-700`
        : `${base} font-semibold text-amber-700`;
}

export default function ResultsPage() {
    const [results, setResults] = useState<LocalCalculationResult[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function loadResults() {
            setLoading(true);
            const [processes, precursors, products, periods, sourceStreams, productOutputLines] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('source_streams'),
                listLocalItems('product_output_lines'),
            ]);

            // 사내 이송(공정 간 전가)도 함께 넘긴다 — 빠뜨리면 이 화면만 받는 제품의 SEE가 낮게 나온다.
            const internalTransfers = await listLocalItems('internal_transfers');
            setResults(calculateLocalResults({ internalTransfers, processes, precursors, products, periods, sourceStreams, productOutputLines }));
            setLoading(false);
        }

        loadResults();
    }, []);

    const summary = useMemo(() => {
        const reportableResults = results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null);
        const allocationOnlyResults = results.filter((result) => !result.is_cbam_reportable);
        const totalOutput = reportableResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        const allocatedEmissions = reportableResults.reduce(
            (sum, result) => sum + (result.see_cbam_basis ?? 0) * result.output_mass_t,
            0
        );
        const productLineCount = reportableResults.filter((result) => result.product_output_line_id).length;
        const allWarnings = results.flatMap((result) =>
            result.warningDetails.map((warning) => ({
                resultId: result.id,
                processName: result.process_name,
                href: getLocalCalculationWarningHref(warning),
                warning,
            }))
        );

        return {
            lineCount: reportableResults.length,
            allocationOnlyCount: allocationOnlyResults.length,
            productLineCount,
            totalOutput,
            allocatedEmissions,
            averageCbamBasisSee: average(reportableResults.map((result) => result.see_cbam_basis ?? 0)),
            averageInformationalTotalSee: average(reportableResults.map((result) => result.see_informational_total)),
            weightedCbamBasisSee: totalOutput > 0 ? allocatedEmissions / totalOutput : 0,
            weightedInformationalTotalSee: totalOutput > 0
                ? reportableResults.reduce((sum, result) => sum + result.see_informational_total * result.output_mass_t, 0) / totalOutput
                : 0,
            indirectExcludedCount: reportableResults.filter((result) => result.indirect_emissions_relevance === 'NOT_RELEVANT').length,
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
                <StatCard label="CBAM 신고 라인" value={summary.lineCount} helper={`제품라인 ${summary.productLineCount}개 · 배분 참고 ${summary.allocationOnlyCount}개`} icon={Factory} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={Scale} tone="pending" />
                <StatCard label="CBAM 기준 배출량" value={formatNumber(summary.allocatedEmissions)} helper="tCO2e" icon={Gauge} tone="success" />
                <StatCard label="확인 필요" value={summary.warningCount} helper="산정 경고만 — 내보내기 점검은 지도 7단계·Export" icon={AlertTriangle} tone="warning" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                <SectionCard title="SEE 해석 기준" description="공식 신고 지원자료에 사용할 값과 내부 검토용 값을 분리해서 확인합니다.">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-teal-900">
                                <TrendingUp className="h-4 w-4" />
                                CBAM 산정 기준 SEE
                            </div>
                            <div className="mt-2 text-3xl font-semibold tracking-tight text-teal-800">
                                {formatNumber(summary.weightedCbamBasisSee)}
                                <span className="ml-1 text-base font-medium">tCO₂e/t</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-teal-900">
                                제품 1톤당 CBAM 계산에 사용할 배출량입니다. EU 공식 CN 목록에서 간접배출 비관련으로 분류된 품목은 최종제품 자체의 간접배출을 여기서 제외합니다.
                            </p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                                <Split className="h-4 w-4" />
                                내부 검토용 total SEE
                            </div>
                            <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-800">
                                {formatNumber(summary.weightedInformationalTotalSee)}
                                <span className="ml-1 text-base font-medium">tCO₂e/t</span>
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-600">
                                직접배출, 간접배출, 전구물질 배출을 모두 더한 참고값입니다. EU 템플릿 수식 결과와 비교할 때 사용합니다.
                            </p>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="검토 포인트" description="산정 결과를 Export 전에 확인해야 할 항목입니다.">
                    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <dt className="text-xs font-semibold text-slate-500">간접배출 제외 라인</dt>
                            <dd className="mt-2 text-2xl font-semibold text-slate-950">{summary.indirectExcludedCount}개</dd>
                            <p className="mt-1 text-xs text-slate-500">EU 공식 CN 목록에서 간접배출 비관련으로 분류된 품목</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <dt className="text-xs font-semibold text-slate-500">평균 CBAM 기준 SEE</dt>
                            <dd className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(summary.averageCbamBasisSee)}</dd>
                            <p className="mt-1 text-xs text-slate-500">단순 평균</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <dt className="text-xs font-semibold text-slate-500">평균 내부 total SEE</dt>
                            <dd className="mt-2 text-2xl font-semibold text-slate-950">{formatNumber(summary.averageInformationalTotalSee)}</dd>
                            <p className="mt-1 text-xs text-slate-500">단순 평균</p>
                        </div>
                    </dl>
                </SectionCard>
            </div>

            <div className="hidden space-y-3 md:block">
                <div>
                    <h2 className="text-base font-semibold text-slate-950">제품별 상세 산정표</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                        품목별 배분율과 SEE 구성요소를 확인합니다. 값이 이상하면 해당 공정 또는 원자료 화면에서 수정하세요.
                    </p>
                </div>
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
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE(자체)</th>
                                <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE(자체)</th>
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
                                            <div className="mt-1 text-xs font-semibold text-slate-500">{result.allocation_basis === 'ACTIVITY_LEVEL_EXCLUDED' ? '활동수준 제외 (신고 대상 아님)' : getProductReportingScopeLabel(result.reporting_scope)}</div>
                                            {(result.cn_code || result.hs_code) && (
                                                <div className="text-xs text-slate-400">
                                                    {result.cn_code ? `CN ${result.cn_code}` : `HS ${result.hs_code}`}
                                                </div>
                                            )}
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">
                                            {result.period_name ?? '-'}
                                        </td>
                                        <td className="px-4 py-4 text-sm text-slate-600">
                                            <StatusBadge tone={getAllocationTone(result)}>{getAllocationLabel(result)}</StatusBadge>
                                            <div className="mt-1 max-w-xs text-xs leading-4 text-slate-500">{describeAllocationBasis(result)}</div>
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
                                            <div className="mt-1 text-xs text-slate-400">보고용 SEE(직접) {formatNumber(result.see_direct_incl_precursor)}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.indirect_see)}
                                            <div className={getIndirectToneClass(result, 'mt-1 text-xs')}>
                                                {getIndirectApplicabilityLabel(result)}
                                                {/* 제외량은 「제외로 판정된」 경우에만 붙인다. 판정 불가에 붙이면 제외를 확정한 것처럼 읽힌다. */}
                                                {result.indirect_emissions_relevance === 'NOT_RELEVANT' && result.indirect_emissions_excluded_tco2e > 0
                                                    ? ` ${formatNumber(result.indirect_emissions_excluded_tco2e)} tCO2e`
                                                    : ''}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-400">보고용 SEE(간접) {formatNumber(result.see_indirect_incl_precursor)}</div>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                            {formatNumber(result.precursor_see + (result.internal_precursor_direct_see ?? 0) + (result.internal_precursor_indirect_see ?? 0))}
                                            {/* 사내 다른 공정에서 받은 원료의 몫은 구매분과 따로 보여준다 — EU 문서에서도 다른 칸으로 나간다. */}
                                            {(result.internal_precursor_inputs ?? []).length > 0 && (
                                                <div className="mt-1 text-xs text-slate-400">
                                                    구매 {formatNumber(result.precursor_see)} · 사내 {formatNumber((result.internal_precursor_direct_see ?? 0) + (result.internal_precursor_indirect_see ?? 0))}
                                                    {(result.internal_precursor_inputs ?? []).map((input) => (
                                                        <div key={input.transfer_id}>← {input.source_process_name} {formatNumber(input.mass_t)} t</div>
                                                    ))}
                                                </div>
                                            )}
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
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{result.allocation_basis === 'ACTIVITY_LEVEL_EXCLUDED' ? '활동수준 제외 (신고 대상 아님)' : getProductReportingScopeLabel(result.reporting_scope)}</p>
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
                                    <dd className={getIndirectToneClass(result, 'mt-1')}>
                                        {formatNumber(result.indirect_see)}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">전구물질 SEE</dt>
                                    <dd className="mt-1 font-medium text-slate-900">
                                        {formatNumber(result.precursor_see + (result.internal_precursor_direct_see ?? 0) + (result.internal_precursor_indirect_see ?? 0))}
                                        {(result.internal_precursor_inputs ?? []).length > 0 && (
                                            <span className="ml-1 text-xs font-normal text-slate-500">(구매 {formatNumber(result.precursor_see)} · 사내 {formatNumber((result.internal_precursor_direct_see ?? 0) + (result.internal_precursor_indirect_see ?? 0))})</span>
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">보고용 SEE(직접)</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.see_direct_incl_precursor)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">보고용 SEE(간접)</dt>
                                    <dd className="mt-1 font-medium text-slate-900">{formatNumber(result.see_indirect_incl_precursor)}</dd>
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
                            <p className="mt-3 text-xs leading-4 text-slate-500">{describeAllocationBasis(result)}</p>
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
