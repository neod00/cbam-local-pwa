'use client';

import { DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { getLocalSetting, listLocalItems, seedLocalData } from '@/lib/local-db';
import {
    calculateProductScenarios,
    type ProductScenarioResult,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
import type { ImportedBenchmarkReference, ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import { AlertTriangle, BadgeEuro, BarChart3, Calculator, Database } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value?: number) {
    if (value === undefined) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 4 }).format(value);
}

function formatCurrency(value?: number) {
    if (value === undefined) {
        return '-';
    }

    return new Intl.NumberFormat('ko-KR', {
        currency: 'EUR',
        maximumFractionDigits: 0,
        style: 'currency',
    }).format(value);
}

function getQualityBadge(result: ProductScenarioResult) {
    if (result.data_quality === 'READY') {
        return <StatusBadge tone="success">기준값 연결</StatusBadge>;
    }

    if (result.data_quality === 'MISSING_CN') {
        return <StatusBadge tone="danger">CN 확인</StatusBadge>;
    }

    return <StatusBadge tone="warning">기준값 필요</StatusBadge>;
}

export default function ScenariosPage() {
    const [scenarios, setScenarios] = useState<ProductScenarioResult[]>([]);
    const [benchmarkReference, setBenchmarkReference] = useState<ImportedBenchmarkReference | undefined>();
    const [defaultValueReference, setDefaultValueReference] = useState<ImportedDefaultValueReference | undefined>();
    const [loading, setLoading] = useState(true);
    const [assumptions, setAssumptions] = useState<ScenarioAssumptions>({
        origin_country: 'South Korea',
        default_value_year: '2026',
        cbam_factor: 0.975,
        cscf: 1,
        certificate_price_eur: 80,
    });

    useEffect(() => {
        async function loadScenarios() {
            setLoading(true);
            await seedLocalData();
            const [
                processes,
                precursors,
                products,
                periods,
                sourceStreams,
                productOutputLines,
                benchmarks,
                defaultValues,
            ] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('source_streams'),
                listLocalItems('product_output_lines'),
                getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
                getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
            ]);
            const results = calculateLocalResults({ processes, precursors, products, periods, sourceStreams, productOutputLines });

            setBenchmarkReference(benchmarks);
            setDefaultValueReference(defaultValues);
            setScenarios(calculateProductScenarios(results, assumptions, { benchmarks, defaultValues }));
            setLoading(false);
        }

        loadScenarios();
    }, [assumptions]);

    const summary = useMemo(() => {
        const totalOutput = scenarios.reduce((sum, scenario) => sum + scenario.output_mass_t, 0);
        const totalCertificateQuantity = scenarios.reduce(
            (sum, scenario) => sum + (scenario.certificate_quantity_indicator ?? 0),
            0
        );
        const totalCost = scenarios.reduce(
            (sum, scenario) => sum + (scenario.certificate_cost_indicator_eur ?? 0),
            0
        );
        const missingReferenceCount = scenarios.filter((scenario) => scenario.data_quality !== 'READY').length;
        const aboveDefaultCount = scenarios.filter((scenario) => (scenario.default_gap ?? 0) > 0).length;

        return { totalOutput, totalCertificateQuantity, totalCost, missingReferenceCount, aboveDefaultCount };
    }, [scenarios]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="시나리오"
                title="SEFA 및 CBAM 인증서 시나리오"
                description="제품별 SEE, 공식 기본값, 벤치마크를 비교해 인증서 부담 가능성을 1차로 판단합니다. 현재 화면은 검증 전 의사결정 보조용입니다."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="시나리오 품목" value={loading ? '-' : scenarios.length} helper="제품 산정 라인 기준" icon={BarChart3} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={Calculator} tone="pending" />
                <StatCard label="인증서 수량 지표" value={formatNumber(summary.totalCertificateQuantity)} helper="검증 전 추정" icon={BadgeEuro} tone="warning" />
                <StatCard label="예상 비용 지표" value={formatCurrency(summary.totalCost)} helper={`${summary.missingReferenceCount}건 기준값 확인`} icon={AlertTriangle} tone={summary.missingReferenceCount > 0 ? 'warning' : 'success'} />
            </div>

            {(summary.missingReferenceCount > 0 || !benchmarkReference || !defaultValueReference) && (
                <SectionCard className="border-amber-200 bg-amber-50">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-amber-950">공식 기준자료 연결이 필요합니다</h2>
                            <p className="mt-1 text-sm leading-6 text-amber-900">
                                벤치마크와 국가/CN 기본값을 가져와야 SEFA, 기본값 비교, 인증서 지표가 계산됩니다.
                                제품 CN 코드가 누락된 경우 제품 관리에서 먼저 수정하세요.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <Link
                                href="/upload"
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                            >
                                기준자료 가져오기
                            </Link>
                            <Link
                                href="/products"
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                            >
                                CN 코드 확인
                            </Link>
                        </div>
                    </div>
                </SectionCard>
            )}

            <SectionCard
                title="시나리오 가정"
                description="공식 산식 확정 전까지는 비용 판단용 보조 지표입니다. 실제 제출·정산 전 공식 산식과 가격 기준을 반드시 확인해야 합니다."
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                    <div>
                        <label className="text-sm font-semibold text-slate-700">원산지/공급국가</label>
                        <input
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.origin_country}
                            onChange={(event) => setAssumptions({ ...assumptions, origin_country: event.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">기본값 연도</label>
                        <select
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.default_value_year}
                            onChange={(event) => setAssumptions({ ...assumptions, default_value_year: event.target.value as ScenarioAssumptions['default_value_year'] })}
                        >
                            <option value="2026">2026</option>
                            <option value="2027">2027</option>
                            <option value="2028_ONWARDS">2028년 이후</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">CBAM factor</label>
                        <input
                            type="number"
                            step="0.0001"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.cbam_factor}
                            onChange={(event) => setAssumptions({ ...assumptions, cbam_factor: Number(event.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">CSCF</label>
                        <input
                            type="number"
                            step="0.0001"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.cscf}
                            onChange={(event) => setAssumptions({ ...assumptions, cscf: Number(event.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">인증서 가격(EUR)</label>
                        <input
                            type="number"
                            step="1"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.certificate_price_eur}
                            onChange={(event) => setAssumptions({ ...assumptions, certificate_price_eur: Number(event.target.value) || 0 })}
                        />
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <Database className="mb-2 h-4 w-4 text-teal-700" />
                        벤치마크 기준자료: {benchmarkReference ? `${benchmarkReference.summary.row_count.toLocaleString('ko-KR')}행, ${benchmarkReference.summary.cn_code_count.toLocaleString('ko-KR')}개 CN` : '미가져옴'}
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <Database className="mb-2 h-4 w-4 text-teal-700" />
                        국가/CN 기본값: {defaultValueReference ? `${defaultValueReference.summary.row_count.toLocaleString('ko-KR')}행, ${defaultValueReference.summary.country_count?.toLocaleString('ko-KR') ?? '-'}개 국가` : '미가져옴'}
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="검토 요약"
                description="품목별 기준값 연결 상태와 기본값 대비 차이를 먼저 확인하세요."
            >
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">기준값 미연결</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.missingReferenceCount}건</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">실측 SEE가 기본값 초과</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.aboveDefaultCount}건</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">현재 가격 가정</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(assumptions.certificate_price_eur)}</p>
                    </div>
                </div>
            </SectionCard>

            <DataTable>
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">실측 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 차이</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">Benchmark A</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">Benchmark B</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">SEFA 지표</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">인증서 수량 지표</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">비용 지표</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">검토</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {scenarios.length === 0 ? (
                            <tr>
                                <td colSpan={12} className="p-6 text-center text-sm text-slate-500">
                                    시나리오를 만들 산정 결과가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            scenarios.map((scenario) => (
                                <tr key={scenario.result_id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">
                                        {scenario.product_name}
                                        <div className="mt-1 text-xs font-normal text-slate-500">
                                            {scenario.cn_code ? `CN ${scenario.cn_code}` : 'CN 미입력'}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.output_mass_t)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.actual_see)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.default_see)}</td>
                                    <td className={`whitespace-nowrap px-4 py-4 text-right text-sm ${(scenario.default_gap ?? 0) > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{formatNumber(scenario.default_gap)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.benchmark_column_a)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.benchmark_column_b)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.sefa_indicator)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.certificate_quantity_indicator)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-950">{formatCurrency(scenario.certificate_cost_indicator_eur)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm">{getQualityBadge(scenario)}</td>
                                    <td className="min-w-64 px-4 py-4 text-sm text-slate-600">{scenario.review_message}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
