'use client';

import { ActionItemCard, Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults } from '@/lib/calculation-engine';
import { getLocalSetting, listLocalItems, setLocalSetting } from '@/lib/local-db';
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
        const normalizedAssumptions = normalizeScenarioAssumptions(nextAssumptions);
        setAssumptions(normalizedAssumptions);
        setAssumptionSaveState('saving');
        await setLocalSetting(SCENARIO_ASSUMPTIONS_SETTING_KEY, normalizedAssumptions);

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
        setScenarios(calculateProductScenarios(results, normalizedAssumptions, { benchmarks, defaultValues }));
        setAssumptionSaveState('saved');
    }

    const summary = useMemo(() => {
        const totalOutput = scenarios.reduce((sum, scenario) => sum + scenario.output_mass_t, 0);
        const totalImportMass = scenarios.reduce((sum, scenario) => sum + scenario.import_mass_t, 0);
        const totalCertificateQuantity = scenarios.reduce(
            (sum, scenario) => sum + (scenario.certificate_quantity_indicator ?? 0),
            0
        );
        const totalGrossCertificateQuantity = scenarios.reduce(
            (sum, scenario) => sum + (scenario.gross_certificate_quantity_indicator ?? 0),
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
        const totalGrossDefaultCertificateQuantity = scenarios.reduce(
            (sum, scenario) => sum + (scenario.gross_default_certificate_quantity_indicator ?? 0),
            0
        );
        const totalDefaultCost = scenarios.reduce(
            (sum, scenario) => sum + (scenario.default_certificate_cost_indicator_eur ?? 0),
            0
        );
        const riskSummary = summarizeScenarioRisks(scenarios);

        return {
            totalOutput,
            totalImportMass,
            totalCertificateQuantity,
            totalGrossCertificateQuantity,
            totalCost,
            totalDefaultCertificateQuantity,
            totalGrossDefaultCertificateQuantity,
            totalDefaultCost,
            missingReferenceCount: riskSummary.missing_reference_count,
            missingCnCount: riskSummary.missing_cn_count,
            missingOfficialReferenceCount: riskSummary.missing_official_reference_count,
            aboveDefaultCount: riskSummary.above_default_count,
            actualLowerCertificateCount: riskSummary.actual_lower_certificate_count,
            defaultLowerCertificateCount: riskSummary.default_lower_certificate_count,
        };
    }, [scenarios]);

    const hasBenchmarkFile = Boolean(benchmarkReference);
    const hasDefaultValueFile = Boolean(defaultValueReference);
    const hasAllOfficialReferenceFiles = hasBenchmarkFile && hasDefaultValueFile;
    const missingReferenceFileCount = Number(!hasBenchmarkFile) + Number(!hasDefaultValueFile);
    const hasUnmatchedReferenceRows = hasAllOfficialReferenceFiles && summary.missingOfficialReferenceCount > 0;
    const unmatchedScenarios = useMemo(() => {
        return scenarios.filter((scenario) => scenario.data_quality !== 'READY');
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
                description: 'CN 코드가 없는 품목은 기본값, 벤치마크, EU Communication Template 매핑을 연결할 수 없습니다.',
                count: summary.missingCnCount,
                unit: '건',
                tone: 'danger',
                href: '/products',
                cta: '품목 관리로 이동',
            });
        }

        if (!hasAllOfficialReferenceFiles) {
            items.push({
                key: 'missing-reference',
                title: '공식 기준자료 연결',
                description: 'EU 벤치마크와 국가/CN 기본값 파일이 모두 있어야 SEFA 및 인증서 지표를 비교할 수 있습니다.',
                count: missingReferenceFileCount,
                unit: '건',
                tone: 'warning',
                href: '/upload',
                cta: '기준자료 가져오기',
            });
        } else if (hasUnmatchedReferenceRows) {
            items.push({
                key: 'unmatched-reference',
                title: '기준자료 매칭 확인',
                description: '기준자료 파일은 저장되어 있지만 일부 제품의 CN 코드, 생산경로, 원산지/공급국가 조합과 일치하는 기준값을 찾지 못했습니다.',
                count: summary.missingOfficialReferenceCount,
                unit: '건',
                tone: 'warning',
                href: '/products',
                cta: 'CN 코드 확인',
            });
        }

        if (summary.aboveDefaultCount > 0) {
            items.push({
                key: 'above-default',
                title: '기본값 대비 CBAM 산정 기준 SEE 초과',
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
    }, [hasAllOfficialReferenceFiles, hasUnmatchedReferenceRows, loading, missingReferenceFileCount, scenarios.length, summary]);

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="고급 검토"
                title="인증서 비용 시나리오"
                description="이 화면은 비용을 대략 검토하는 고급 단계입니다. 먼저 품목, 생산공정, 배출량 입력을 완료하세요. SEFA와 CBAM 인증서 지표는 사전 검토용으로 사용합니다."
            />

            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <StatCard label="시나리오 품목" value={loading ? '-' : scenarios.length} helper="제품 산정 라인 기준" icon={BarChart3} tone="info" />
                <StatCard label="EU 수입 예정량" value={formatNumber(summary.totalImportMass)} helper={`생산량 ${formatNumber(summary.totalOutput)}t 기준`} icon={Calculator} tone="pending" />
                <StatCard label="차감 후 인증서 지표" value={formatNumber(summary.totalCertificateQuantity)} helper={`차감 전 ${formatNumber(summary.totalGrossCertificateQuantity)} tCO2e`} icon={BadgeEuro} tone="warning" />
                <StatCard label="예상 비용 지표" value={formatCurrency(summary.totalCost)} helper={`기본값 ${formatCurrency(summary.totalDefaultCost)}`} icon={AlertTriangle} tone={summary.missingReferenceCount > 0 ? 'warning' : 'success'} />
            </div>

            {(summary.missingReferenceCount > 0 || !hasAllOfficialReferenceFiles) && (
                <SectionCard className="border-amber-200 bg-amber-50">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <h2 className="text-base font-semibold text-amber-950">
                                {!hasAllOfficialReferenceFiles ? '공식 기준자료 업로드가 필요합니다' : '기준자료 매칭 확인이 필요합니다'}
                            </h2>
                            <p className="mt-1 text-sm leading-6 text-amber-900">
                                {!hasAllOfficialReferenceFiles
                                    ? '벤치마크와 국가/CN 기본값 파일을 모두 가져와야 SEFA, 기본값 비교, 인증서 지표가 계산됩니다.'
                                    : '기준자료 파일은 저장되어 있습니다. 다만 일부 제품의 CN 코드, 생산경로, 원산지/공급국가 조합과 맞는 기준값을 찾지 못했습니다.'}
                                {' '}제품 CN 코드가 누락되었거나 기준자료에 없는 CN인 경우 제품 관리에서 먼저 수정하세요.
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                <StatusBadge tone={hasBenchmarkFile ? 'success' : 'warning'}>
                                    벤치마크 {hasBenchmarkFile ? `${benchmarkReference?.summary.row_count.toLocaleString('ko-KR')}행` : '미업로드'}
                                </StatusBadge>
                                <StatusBadge tone={hasDefaultValueFile ? 'success' : 'warning'}>
                                    국가/CN 기본값 {hasDefaultValueFile ? `${defaultValueReference?.summary.row_count.toLocaleString('ko-KR')}행` : '미업로드'}
                                </StatusBadge>
                                {hasUnmatchedReferenceRows && (
                                    <StatusBadge tone="warning">매칭 실패 {summary.missingOfficialReferenceCount}건</StatusBadge>
                                )}
                            </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {!hasAllOfficialReferenceFiles && (
                                <Link
                                    href="/upload"
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 py-2 text-sm font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                                >
                                    기준자료 가져오기
                                </Link>
                            )}
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

            {hasUnmatchedReferenceRows && unmatchedScenarios.length > 0 && (
                <SectionCard
                    title="제품별 매칭 진단"
                    description="기준자료 파일은 저장되어 있습니다. 아래 항목에서 실패한 쪽을 보고 CN 코드, 생산경로, 원산지/공급국가를 수정하세요."
                >
                    <div className="grid grid-cols-1 gap-3">
                        {unmatchedScenarios.map((scenario) => (
                            <div key={`${scenario.result_id}-reference-diagnostic`} className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="text-sm font-semibold text-slate-950">{scenario.product_name}</h3>
                                            {scenario.cn_code ? (
                                                <StatusBadge tone="neutral">CN {scenario.cn_code}</StatusBadge>
                                            ) : (
                                                <StatusBadge tone="danger">CN 없음</StatusBadge>
                                            )}
                                        </div>
                                        <dl className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5 text-slate-700 sm:grid-cols-3">
                                            <div>
                                                <dt className="font-semibold text-slate-500">현재 생산경로</dt>
                                                <dd className="break-words">{scenario.production_route || '미입력'}</dd>
                                            </div>
                                            <div>
                                                <dt className="font-semibold text-slate-500">현재 원산지/공급국가</dt>
                                                <dd className="break-words">{scenario.origin_country || '미입력'}</dd>
                                            </div>
                                            <div>
                                                <dt className="font-semibold text-slate-500">기본값 연도</dt>
                                                <dd>{scenario.default_value_year}</dd>
                                            </div>
                                        </dl>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <StatusBadge tone={scenario.benchmark_matched ? 'success' : 'warning'}>
                                            벤치마크 {scenario.benchmark_matched ? '매칭됨' : '못 찾음'}
                                        </StatusBadge>
                                        <StatusBadge tone={scenario.default_value_matched ? 'success' : 'warning'}>
                                            국가/CN 기본값 {scenario.default_value_matched ? '매칭됨' : '못 찾음'}
                                        </StatusBadge>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-xl bg-white/80 px-3 py-2 text-xs leading-5 text-amber-950">
                                    {!scenario.cn_code
                                        ? '먼저 제품 관리에서 CN 8자리 코드를 입력하세요.'
                                        : !scenario.benchmark_matched && !scenario.default_value_matched
                                            ? 'CN 코드가 기준자료에 없거나 생산경로/원산지 조합이 맞지 않습니다. 제품 CN과 생산공정의 생산경로를 먼저 확인하세요.'
                                            : !scenario.benchmark_matched
                                                ? '국가/CN 기본값은 찾았지만 벤치마크를 찾지 못했습니다. 생산공정의 생산경로 또는 제품 CN이 기준자료의 벤치마크 항목과 맞는지 확인하세요.'
                                                : '벤치마크는 찾았지만 국가/CN 기본값을 찾지 못했습니다. 원산지/공급국가와 제품 CN이 기본값 파일에 있는 조합인지 확인하세요.'}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    <Link
                                        href="/products"
                                        className="inline-flex min-h-9 items-center rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                                    >
                                        제품 CN 수정
                                    </Link>
                                    <Link
                                        href="/processes"
                                        className="inline-flex min-h-9 items-center rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 shadow-sm hover:bg-amber-100"
                                    >
                                        생산경로 수정
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            )}

            <SectionCard
                title="철강 소량면제 검토"
                description="철강 품목의 EU 수입자 기준 연간 순중량이 단일 질량 임계값 이하인지 검토합니다. 최종 면제 판단은 수입자와 최신 규정값으로 확인하세요."
                actions={
                    <StatusBadge tone={summary.totalImportMass > 0 && summary.totalImportMass <= assumptions.de_minimis_threshold_t ? 'success' : 'warning'}>
                        {summary.totalImportMass > 0 && summary.totalImportMass <= assumptions.de_minimis_threshold_t ? '면제 가능성 검토' : '임계값 초과 또는 입력 필요'}
                    </StatusBadge>
                }
            >
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">EU 수입 예정량</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(summary.totalImportMass)}t</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">소량면제 임계값</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(assumptions.de_minimis_threshold_t)}t</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">판단 기준</p>
                        <p className="mt-1 text-sm leading-6 text-slate-700">철강만 표시합니다. 알루미늄·시멘트·비료는 이 앱의 타겟 범위에서 제외합니다.</p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="검증 준비 체크"
                description="확정기간 대응 시 검증인에게 설명해야 할 자료를 미리 점검합니다. 이 앱은 공식 검증보고서를 대체하지 않습니다."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <ActionItemCard
                        title="모니터링 계획"
                        description="생산량, 전력, 직접배출, 전구물질 데이터를 어떤 담당자와 원천자료로 모으는지 계획을 남기세요."
                        badge={<StatusBadge tone="warning">작성 필요</StatusBadge>}
                    />
                    <ActionItemCard
                        title="자료 보관 6년"
                        description="검침표, 구매전표, 생산실적, 공급사 SEE, 기본값 사용 근거를 회사 보안정책에 맞게 장기 보관하세요."
                        badge={<StatusBadge tone="info">보관</StatusBadge>}
                    />
                    <ActionItemCard
                        title="영문 산정자료"
                        description="검증인 또는 수입자가 볼 수 있도록 산정근거 요약 보고서와 증빙 체크리스트를 영문 포함 DOCX로 준비하세요."
                        badge={<StatusBadge tone="success">패키지 제공</StatusBadge>}
                    />
                    <ActionItemCard
                        title="현장방문 가능성"
                        description="첫 검증 또는 중요 데이터 검증에서는 현장방문이 요구될 수 있으므로 공정·계량기·자료 위치를 설명할 수 있게 정리하세요."
                        badge={<StatusBadge tone="pending">검토</StatusBadge>}
                    />
                </div>
            </SectionCard>

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
                description="입력자료와 기준자료를 바탕으로 한 사전 검토용 시나리오입니다. 인증서 수량은 EU 수입 예정량 기준으로 계산하고, 기지불 탄소가격은 증빙 확인 전 가정값으로만 반영합니다."
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
                <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                    <div>
                        <label className="text-sm font-semibold text-slate-700">원산지/공급국가</label>
                        <input
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.origin_country}
                            onChange={(event) => void updateAssumptions({ ...assumptions, origin_country: event.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">EU 수입 예정 비율(%)</label>
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.eu_import_share_percent}
                            onChange={(event) => void updateAssumptions({ ...assumptions, eu_import_share_percent: Number(event.target.value) || 0 })}
                        />
                        <p className="mt-1 text-xs text-slate-500">제품 생산량 중 EU 수입자에게 넘어갈 물량 비율입니다.</p>
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
                        <p className="mt-1 text-xs text-slate-500">기본값(default)에는 연도별 mark-up(보수적 가산)이 포함됩니다. 실측 자료가 있으면 보통 기본값보다 유리합니다.</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">소량면제 임계값(t)</label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.de_minimis_threshold_t}
                            onChange={(event) => void updateAssumptions({ ...assumptions, de_minimis_threshold_t: Number(event.target.value) || 0 })}
                        />
                        <p className="mt-1 text-xs text-slate-500">수입자 기준 연간 철강 순중량 임계값입니다. 최신 규정값으로 확인하세요.</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">CBAM factor</label>
                        <input
                            type="number"
                            min="0"
                            max="1"
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
                            min="0"
                            max="1"
                            step="0.0001"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.cscf}
                            onChange={(event) => void updateAssumptions({ ...assumptions, cscf: Number(event.target.value) || 0 })}
                        />
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">기지불 탄소가격(EUR/tCO2e)</label>
                        <input
                            type="number"
                            min="0"
                            step="1"
                            className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-4 focus:ring-teal-100"
                            value={assumptions.paid_carbon_price_eur_per_tco2e}
                            onChange={(event) => void updateAssumptions({ ...assumptions, paid_carbon_price_eur_per_tco2e: Number(event.target.value) || 0 })}
                        />
                        <p className="mt-1 text-xs text-slate-500">증빙 확인 전 검토용 차감값입니다. 없으면 0으로 두세요.</p>
                    </div>
                    <div>
                        <label className="text-sm font-semibold text-slate-700">인증서 가격(EUR)</label>
                        <input
                            type="number"
                            min="0"
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
                description="수입량 기준 인증서 수량, 기지불 탄소가격 차감 효과, 기준값 연결 상태를 먼저 확인하세요."
            >
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-4">
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">차감 전 인증서 수량</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(summary.totalGrossCertificateQuantity)}tCO2e</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">차감 후 인증서 수량</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatNumber(summary.totalCertificateQuantity)}tCO2e</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">기지불 탄소가격</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{formatCurrency(assumptions.paid_carbon_price_eur_per_tco2e)}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">기준값 미연결</p>
                        <p className="mt-1 text-2xl font-semibold text-slate-950">{summary.missingReferenceCount}건</p>
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
                                        {scenario.cn_code ? `CN ${scenario.cn_code}` : 'CN 미입력'} / 생산량 {formatNumber(scenario.output_mass_t)} t / EU 수입 {formatNumber(scenario.import_mass_t)} t
                                    </p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    {getBasisBadge(scenario)}
                                    {getQualityBadge(scenario)}
                                </div>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-xs text-slate-500">CBAM 산정 기준 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(scenario.actual_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">내부 검토용 total SEE</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(scenario.informational_total_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">기본값 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(scenario.default_see)}</dd>
                                    {scenario.default_markup_amount !== undefined && scenario.default_markup_amount > 0 && (
                                        <p className="mt-0.5 text-xs text-amber-700">mark-up 포함값 · 기준 {formatNumber(scenario.default_see_raw)} + 가산 {formatNumber(scenario.default_markup_amount)}</p>
                                    )}
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">차감 전 인증서</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(scenario.gross_certificate_quantity_indicator)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">차감 후 인증서 비용</dt>
                                    <dd className="mt-1 text-slate-700">{formatCurrency(scenario.certificate_cost_indicator_eur)}</dd>
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
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량 / EU 수입량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 산정 기준 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">내부 검토용 total SEE</th>
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
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(scenario.output_mass_t)}
                                        <div className="text-xs text-slate-500">EU {formatNumber(scenario.import_mass_t)}</div>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.actual_see)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.informational_total_see)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(scenario.default_see)}
                                        {scenario.default_markup_amount !== undefined && scenario.default_markup_amount > 0 && (
                                            <div className="text-xs text-amber-700">mark-up +{formatNumber(scenario.default_markup_amount)}</div>
                                        )}
                                    </td>
                                    <td className={`whitespace-nowrap px-4 py-4 text-right text-sm ${(scenario.default_gap ?? 0) > 0 ? 'font-semibold text-amber-700' : 'text-slate-600'}`}>{formatNumber(scenario.default_gap)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.benchmark_column_a)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.benchmark_column_b)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">{formatNumber(scenario.sefa_indicator)}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm text-slate-600">
                                        {formatNumber(scenario.certificate_quantity_indicator)}
                                        {scenario.gross_certificate_quantity_indicator !== undefined && (
                                            <div className="text-xs text-slate-500">차감 전 {formatNumber(scenario.gross_certificate_quantity_indicator)}</div>
                                        )}
                                    </td>
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
