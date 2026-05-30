'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { getLocalSetting, listLocalItems, seedLocalData, setLocalSetting } from '@/lib/local-db';
import {
    calculateProductScenarios,
    DEFAULT_SCENARIO_ASSUMPTIONS,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    summarizeScenarioRisks,
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
    const [assumptions, setAssumptions] = useState<ScenarioAssumptions>(DEFAULT_SCENARIO_ASSUMPTIONS);
    const [assumptionSaveState, setAssumptionSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

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
                savedScenarioAssumptions,
            ] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
                listLocalItems('source_streams'),
                listLocalItems('product_output_lines'),
                getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
                getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
                getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY),
            ]);
            const normalizedAssumptions = normalizeScenarioAssumptions(savedScenarioAssumptions);
            const results = calculateLocalResults({ processes, precursors, products, periods, sourceStreams, productOutputLines });

            setBenchmarkReference(benchmarks);
            setDefaultValueReference(defaultValues);
            setAssumptions(normalizedAssumptions);
            setScenarios(calculateProductScenarios(results, normalizedAssumptions, { benchmarks, defaultValues }));
            setLoading(false);
        }

        loadScenarios();
    }, []);

    async function updateAssumptions(nextAssumptions: ScenarioAssumptions) {
        setAssumptions(nextAssumptions);
        setAssumptionSaveState('saving');
        await setLocalSetting(SCENARIO_ASSUMPTIONS_SETTING_KEY, nextAssumptions);

        const [processes, precursors, products, periods, sourceStreams, productOutputLines, benchmarks, defaultValues] = await Promise.all([
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
        setScenarios(calculateProductScenarios(results, nextAssumptions, { benchmarks, defaultValues }));
        setAssumptionSaveState('saved');
    }

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
        const totalDefaultCertificateQuantity = scenarios.reduce(
            (sum, scenario) => sum + (scenario.default_certificate_quantity_indicator ?? 0),
            0
        );
        const totalDefaultCost = scenarios.reduce(
            (sum, scenario) => sum + (scenario.default_certificate_cost_indicator_eur ?? 0),
            0
        );
        const riskSummary = summarizeScenarioRisks(scenarios);

        return {
            totalOutput,
            totalCertificateQuantity,
            totalCost,
            totalDefaultCertificateQuantity,
            totalDefaultCost,
            missingReferenceCount: riskSummary.missing_reference_count,
            missingCnCount: riskSummary.missing_cn_count,
            missingOfficialReferenceCount: riskSummary.missing_official_reference_count,
            aboveDefaultCount: riskSummary.above_default_count,
        };
    }, [scenarios]);

    const actionItems = useMemo(() => {
        const items: Array<{
            key: string;
            title: string;
            description: string;
            count: number;
            unit: string;
            tone: 'danger' | 'warning' | 'info' | 'success';
            href?: string;
            cta?: string;
        }> = [];

        if (summary.missingCnCount > 0) {
            items.push({
                key: 'missing-cn',
                title: 'CN 코드 확인',
                description: 'CN 코드가 없는 품목은 기본값, 벤치마크, EU 제출용 매핑을 연결할 수 없습니다.',
                count: summary.missingCnCount,
                unit: '건',
                tone: 'danger',
                href: '/products',
                cta: '품목 관리로 이동',
            });
        }

        if (summary.missingOfficialReferenceCount > 0 || !benchmarkReference || !defaultValueReference) {
            items.push({
                key: 'missing-reference',
                title: '공식 기준자료 연결',
                description: 'EU 벤치마크와 국가/CN 기본값 파일을 가져와야 SEFA 및 인증서 지표를 비교할 수 있습니다.',
                count: summary.missingOfficialReferenceCount,
                unit: '건',
                tone: 'warning',
                href: '/upload',
                cta: '기준자료 가져오기',
            });
        }

        if (summary.aboveDefaultCount > 0) {
            items.push({
                key: 'above-default',
                title: '기본값 대비 실측 SEE 초과',
                description: '실측값이 기본값보다 높은 품목은 기본값 사용, 공급망 자료 보완, 배출 저감 시나리오를 비교해야 합니다.',
                count: summary.aboveDefaultCount,
                unit: '건',
                tone: 'warning',
            });
        }

        if (summary.totalCertificateQuantity > 0) {
            items.push({
                key: 'certificate-exposure',
                title: '인증서 수량 발생 가능',
                description: `실제자료 기준 인증서 수량 지표가 발생합니다. 기본값 시나리오는 ${formatNumber(summary.totalDefaultCertificateQuantity)} tCO2e입니다.`,
                count: summary.totalCertificateQuantity,
                unit: 'tCO2e',
                tone: 'info',
            });
        }

        if (items.length === 0 && !loading) {
            items.push({
                key: 'ready',
                title: '즉시 확인할 주요 위험 없음',
                description: '현재 입력 기준으로 CN 코드와 공식 기준자료가 연결되어 있습니다. 보고서 반영 전 산식 가정만 재확인하세요.',
                count: scenarios.length,
                unit: '건',
                tone: 'success',
            });
        }

        return items;
    }, [benchmarkReference, defaultValueReference, loading, scenarios.length, summary]);

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
                <StatCard label="실제자료 인증서 지표" value={formatNumber(summary.totalCertificateQuantity)} helper={`기본값 ${formatNumber(summary.totalDefaultCertificateQuantity)}`} icon={BadgeEuro} tone="warning" />
                <StatCard label="예상 비용 지표" value={formatCurrency(summary.totalCost)} helper={`기본값 ${formatCurrency(summary.totalDefaultCost)}`} icon={AlertTriangle} tone={summary.missingReferenceCount > 0 ? 'warning' : 'success'} />
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
                title="우선 조치"
                description="현재 입력값 기준으로 먼저 확인해야 할 항목을 업무 순서대로 정리했습니다."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {actionItems.map((item) => (
                        <div key={item.key} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                                        <StatusBadge tone={item.tone}>{formatNumber(item.count)}{item.unit}</StatusBadge>
                                    </div>
                                    <p className="mt-2 text-sm leading-6 text-slate-600">{item.description}</p>
                                </div>
                                {item.href && item.cta && (
                                    <Link
                                        href={item.href}
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                                    >
                                        {item.cta}
                                    </Link>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard
                title="시나리오 가정"
                description="공식 산식 확정 전까지는 비용 판단용 보조 지표입니다. 실제 제출·정산 전 공식 산식과 가격 기준을 반드시 확인해야 합니다."
                actions={
                    <div className="flex items-center gap-2">
                        <StatusBadge tone={assumptionSaveState === 'saving' ? 'pending' : assumptionSaveState === 'saved' ? 'success' : 'neutral'}>
                            {assumptionSaveState === 'saving' ? '저장 중' : assumptionSaveState === 'saved' ? '로컬 저장됨' : '기본 가정'}
                        </StatusBadge>
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void updateAssumptions(DEFAULT_SCENARIO_ASSUMPTIONS)}
                        >
                            기본값 복원
                        </Button>
                    </div>
                }
            >
                <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
                    <div>
                        <label className="text-sm font-semibold text-slate-700">원산지/공급국가</label>
                        <input
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.origin_country}
                            onChange={(event) => void updateAssumptions({ ...assumptions, origin_country: event.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">기본값 연도</label>
                        <select
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.default_value_year}
                            onChange={(event) => void updateAssumptions({ ...assumptions, default_value_year: event.target.value as ScenarioAssumptions['default_value_year'] })}
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
                            onChange={(event) => void updateAssumptions({ ...assumptions, cbam_factor: Number(event.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">CSCF</label>
                        <input
                            type="number"
                            step="0.0001"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.cscf}
                            onChange={(event) => void updateAssumptions({ ...assumptions, cscf: Number(event.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">인증서 가격(EUR)</label>
                        <input
                            type="number"
                            step="1"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.certificate_price_eur}
                            onChange={(event) => void updateAssumptions({ ...assumptions, certificate_price_eur: Number(event.target.value) || 0 })}
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
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">실측 SEFA</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">실측 인증서</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">실측 비용</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 SEFA</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 인증서</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 비용</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">검토</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {scenarios.length === 0 ? (
                            <tr>
                                <td colSpan={15} className="p-6 text-center text-sm text-slate-500">
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
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.default_sefa_indicator)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.default_certificate_quantity_indicator)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm font-semibold text-slate-950">{formatCurrency(scenario.default_certificate_cost_indicator_eur)}</td>
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
