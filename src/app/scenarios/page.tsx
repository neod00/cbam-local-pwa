'use client';

import { ActionItemCard, Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { getLocalSetting, listLocalItems, seedLocalData, setLocalSetting } from '@/lib/local-db';
import {
    calculateProductScenarios,
    CERTIFICATE_INDICATOR_NOTICE,
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

function getBasisBadge(result: ProductScenarioResult) {
    if (result.lower_certificate_basis === 'ACTUAL') {
        return <StatusBadge tone="success">실측 유리</StatusBadge>;
    }

    if (result.lower_certificate_basis === 'DEFAULT') {
        return <StatusBadge tone="warning">기본값 유리</StatusBadge>;
    }

    if (result.lower_certificate_basis === 'TIE') {
        return <StatusBadge tone="neutral">동일</StatusBadge>;
    }

    return <StatusBadge tone="pending">판단 전</StatusBadge>;
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
            actualLowerCertificateCount: riskSummary.actual_lower_certificate_count,
            defaultLowerCertificateCount: riskSummary.default_lower_certificate_count,
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
                title: '기본값 대비 CBAM 기준 SEE 초과',
                description: 'CBAM 산정 기준 SEE가 기본값보다 높은 품목은 기본값 사용, 공급망 자료 보완, 배출 저감 시나리오를 비교해야 합니다.',
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

        if (summary.defaultLowerCertificateCount > 0) {
            items.push({
                key: 'default-lower',
                title: '기본값 시나리오 비용 우위',
                description: '일부 품목은 현재 가정상 기본값 시나리오의 인증서 비용 지표가 더 낮습니다. 기본값 사용 가능성과 증빙 요건을 함께 검토하세요.',
                count: summary.defaultLowerCertificateCount,
                unit: '건',
                tone: 'warning',
            });
        }

        if (summary.actualLowerCertificateCount > 0) {
            items.push({
                key: 'actual-lower',
                title: '실측자료 시나리오 비용 우위',
                description: '일부 품목은 실측자료 기준 인증서 비용 지표가 더 낮습니다. 공급망 자료와 검증 가능성을 우선 보완하세요.',
                count: summary.actualLowerCertificateCount,
                unit: '건',
                tone: 'success',
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
                description="제품별 CBAM 산정 기준 SEE, 공식 기본값, 벤치마크를 비교해 인증서 부담 가능성을 1차로 판단합니다. 현재 화면은 검증 전 의사결정 보조용입니다."
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
                        <ActionItemCard
                            key={item.key}
                            title={item.title}
                            description={item.description}
                            badge={<StatusBadge tone={item.tone}>{formatNumber(item.count)}{item.unit}</StatusBadge>}
                            action={item.href && item.cta ? (
                                <Link
                                    href={item.href}
                                    className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-100"
                                >
                                    {item.cta}
                                </Link>
                            ) : undefined}
                        />
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
                <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
                    {CERTIFICATE_INDICATOR_NOTICE}
                </p>
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
                        <p className="text-xs font-semibold text-slate-500">CBAM 기준 SEE가 기본값 초과</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.aboveDefaultCount}건</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">현재 가격 가정</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(assumptions.certificate_price_eur)}</p>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {scenarios.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                        시나리오를 만들 산정 결과가 없습니다.
                    </div>
                ) : (
                    scenarios.map((scenario) => (
                        <div key={`${scenario.result_id}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="break-words text-sm font-semibold text-slate-950">{scenario.product_name}</h3>
                                    <p className="mt-1 break-words text-xs text-slate-600">
                                        {scenario.cn_code ? `CN ${scenario.cn_code}` : 'CN 미입력'} / 생산량 {formatNumber(scenario.output_mass_t)} t
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {getBasisBadge(scenario)}
                                    {getQualityBadge(scenario)}
                                </div>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-xs text-slate-500">CBAM 기준 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(scenario.actual_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">참고용 총 SEE</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(scenario.informational_total_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">기본값 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(scenario.default_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">CBAM 기준 인증서 비용</dt>
                                    <dd className="mt-1 text-slate-700">{formatCurrency(scenario.certificate_cost_indicator_eur)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">기본값 인증서 비용</dt>
                                    <dd className="mt-1 text-slate-700">{formatCurrency(scenario.default_certificate_cost_indicator_eur)}</dd>
                                </div>
                                <div className="col-span-2">
                                    <dt className="text-xs text-slate-500">비용 차이</dt>
                                    <dd className={(scenario.certificate_cost_delta_eur ?? 0) > 0 ? 'mt-1 font-semibold text-amber-700' : 'mt-1 text-slate-700'}>
                                        {formatCurrency(scenario.certificate_cost_delta_eur)}
                                    </dd>
                                </div>
                            </dl>
                            <p className="mt-4 rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">{scenario.review_message}</p>
                        </div>
                    ))
                )}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 기준 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">참고용 총 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 차이</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">Benchmark A</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">Benchmark B</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 기준 SEFA</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 기준 인증서</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 기준 비용</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 SEFA</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 인증서</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">기본값 비용</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">비용 차이</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">유리한 기준</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">검토</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {scenarios.length === 0 ? (
                            <tr>
                                <td colSpan={18} className="p-6 text-center text-sm text-slate-500">
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
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.informational_total_see)}</td>
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
                                    <td className={`whitespace-nowrap px-4 py-4 text-right text-sm ${(scenario.certificate_cost_delta_eur ?? 0) > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{formatCurrency(scenario.certificate_cost_delta_eur)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm">{getBasisBadge(scenario)}</td>
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
