'use client';

import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
import { Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    createEuExportFilename,
    createExportChecklist,
    createEuTemplateExportCellWrites,
    createEuTemplateExportCopyResult,
    downloadBlob,
    evaluateEuExportReadiness,
    getEuExportDownloadStatusMessage,
    getEuExportIssueEditHref,
    REQUIRED_EU_TEMPLATE_SHEETS,
    validateEuTemplateFile,
    type EuTemplateValidationResult,
} from '@/lib/eu-template-export';
import {
    CBAM_LAST_BACKUP_AT_KEY,
    getBackupStatus,
    getLocalSetting,
    listLocalItems,
    seedLocalData,
    type Installation,
    type Product,
    type ProductOutputLine,
    type ProductionProcess,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import type { ImportedBenchmarkReference, ImportedDefaultValueReference } from '@/lib/reference-workbooks';
import {
    calculateProductScenarios,
    getScenarioReviewAction,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    summarizeScenarioRisks,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
import {
    AlertTriangle,
    CheckCircle2,
    Circle,
    Download,
    FileCheck2,
    FileSpreadsheet,
    PackageCheck,
    ShieldCheck,
    Workflow,
} from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type LastExportResult = {
    filename: string;
    generatedAt: string;
    checkedCellCount: number;
    writtenCellCount: number;
};

function formatNumber(value: number) {
    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 4,
    }).format(value);
}

function formatPercent(value: number) {
    return new Intl.NumberFormat('ko-KR', {
        maximumFractionDigits: 1,
        style: 'percent',
    }).format(value);
}

function getIssueSeverityLabel(severity: 'error' | 'warning') {
    return severity === 'error' ? '오류' : '경고';
}

export default function ExportPage() {
    const [templateFile, setTemplateFile] = useState<File | undefined>();
    const [validation, setValidation] = useState<EuTemplateValidationResult | undefined>();
    const [validationError, setValidationError] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [results, setResults] = useState<LocalCalculationResult[]>([]);
    const [installations, setInstallations] = useState<Installation[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [productOutputLines, setProductOutputLines] = useState<ProductOutputLine[]>([]);
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [benchmarkReference, setBenchmarkReference] = useState<ImportedBenchmarkReference | undefined>();
    const [defaultValueReference, setDefaultValueReference] = useState<ImportedDefaultValueReference | undefined>();
    const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumptions>();
    const [exportError, setExportError] = useState('');
    const [lastExportResult, setLastExportResult] = useState<LastExportResult | undefined>();
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();

    useEffect(() => {
        async function loadPreviewData() {
            await seedLocalData();
            setLastBackupAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY) ?? undefined);

            const [
                installationData,
                periodData,
                processData,
                outputLineData,
                sourceStreamData,
                precursorData,
                productData,
                benchmarkData,
                defaultValueData,
                savedScenarioAssumptions,
            ] = await Promise.all([
                listLocalItems('installations'),
                listLocalItems('periods'),
                listLocalItems('processes'),
                listLocalItems('product_output_lines'),
                listLocalItems('source_streams'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
                getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
                getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY),
            ]);

            setInstallations(installationData);
            setPeriods(periodData);
            setProcesses(processData);
            setProductOutputLines(outputLineData);
            setSourceStreams(sourceStreamData);
            setPrecursors(precursorData);
            setProducts(productData);
            setBenchmarkReference(benchmarkData);
            setDefaultValueReference(defaultValueData);
            setScenarioAssumptions(normalizeScenarioAssumptions(savedScenarioAssumptions));
            setResults(calculateLocalResults({
                processes: processData,
                precursors: precursorData,
                products: productData,
                periods: periodData,
                sourceStreams: sourceStreamData,
                productOutputLines: outputLineData,
            }));
        }

        loadPreviewData();
    }, []);

    const summary = useMemo(() => {
        const productNames = new Set(results.map((result) => result.product_name));
        const totalOutput = results.reduce((sum, result) => sum + result.output_mass_t, 0);
        const warningCount = results.reduce((sum, result) => sum + result.warnings.length, 0);

        return {
            productCount: productNames.size,
            processCount: results.length,
            totalOutput,
            warningCount,
        };
    }, [results]);

    const readiness = useMemo(
        () => evaluateEuExportReadiness({ processes, productOutputLines, sourceStreams, precursors, products }, validation?.cnCodeMap),
        [processes, productOutputLines, sourceStreams, precursors, products, validation?.cnCodeMap]
    );

    const scenarioRiskSummary = useMemo(() => {
        const scenarios = calculateProductScenarios(results, normalizeScenarioAssumptions(scenarioAssumptions), {
            benchmarks: benchmarkReference,
            defaultValues: defaultValueReference,
        });

        return summarizeScenarioRisks(scenarios);
    }, [benchmarkReference, defaultValueReference, results, scenarioAssumptions]);

    const scenarioChecklistAction = useMemo(() => {
        return getScenarioReviewAction(
            scenarioRiskSummary,
            Boolean(benchmarkReference),
            Boolean(defaultValueReference)
        );
    }, [benchmarkReference, defaultValueReference, scenarioRiskSummary]);

    const plannedCellWrites = useMemo(
        () => createEuTemplateExportCellWrites({ installations, periods, processes, productOutputLines, sourceStreams, precursors, products }, validation?.cnCodeMap),
        [installations, periods, processes, productOutputLines, sourceStreams, precursors, products, validation?.cnCodeMap]
    );

    const backupStatus = useMemo(() => getBackupStatus(lastBackupAt), [lastBackupAt]);

    const exportChecklist = useMemo(
        () => createExportChecklist({
            backupStatus,
            lastExportResult,
            plannedCellWriteCount: plannedCellWrites.length,
            readiness,
            resultCount: results.length,
            scenarioAction: scenarioChecklistAction,
            scenarioRiskSummary,
            templateFileName: templateFile?.name,
            validation,
        }),
        [
            backupStatus,
            lastExportResult,
            plannedCellWrites.length,
            readiness,
            results.length,
            scenarioChecklistAction,
            scenarioRiskSummary,
            templateFile,
            validation,
        ]
    );

    const downloadStatusMessage = useMemo(
        () => getEuExportDownloadStatusMessage({
            backupStatus,
            hasTemplateFile: Boolean(templateFile),
            readiness,
            validation,
        }),
        [backupStatus, readiness, templateFile, validation]
    );

    const issueAreaSummaries = useMemo(() => {
        const summaryByArea = new Map<string, { errorCount: number; warningCount: number }>();

        for (const issue of readiness.issues) {
            const current = summaryByArea.get(issue.area) ?? { errorCount: 0, warningCount: 0 };

            if (issue.severity === 'error') {
                current.errorCount += 1;
            } else {
                current.warningCount += 1;
            }

            summaryByArea.set(issue.area, current);
        }

        return Array.from(summaryByArea.entries()).map(([area, areaSummary]) => ({ area, ...areaSummary }));
    }, [readiness.issues]);

    const sortedReadinessIssues = useMemo(
        () => [...readiness.issues].sort((a, b) => {
            if (a.severity !== b.severity) {
                return a.severity === 'error' ? -1 : 1;
            }

            return a.area.localeCompare(b.area, 'ko-KR');
        }),
        [readiness.issues]
    );

    const summaryProductPreviewRows = useMemo(
        () => results.slice(0, 100).map((result, index) => ({
            rowNumber: 10 + index,
            processName: result.process_name,
            productCode: result.cn_code || result.hs_code || '-',
            productName: result.product_name,
            allocationShare: result.allocation_share,
            directSee: result.direct_see,
            indirectSee: result.indirect_see,
            totalSee: result.total_see,
            isIndirectIncluded: result.indirect_emissions_applicable,
        })),
        [results]
    );

    const summaryProductsWriteCount = useMemo(
        () => plannedCellWrites.filter((write) => write.sheetName === 'Summary_Products').length,
        [plannedCellWrites]
    );

    async function handleTemplateFileChange(file: File | undefined) {
        setTemplateFile(file);
        setValidation(undefined);
        setValidationError('');
        setExportError('');
        setLastExportResult(undefined);

        if (!file) {
            return;
        }

        setIsValidating(true);
        try {
            setValidation(await validateEuTemplateFile(file));
        } catch (error) {
            setValidationError(error instanceof Error ? error.message : 'EU 템플릿 검증 중 오류가 발생했습니다.');
        } finally {
            setIsValidating(false);
        }
    }

    async function handleDownloadCopy() {
        if (!templateFile || !validation?.isValid) {
            return;
        }

        setExportError('');
        setLastExportResult(undefined);

        try {
            const exportResult = await createEuTemplateExportCopyResult(templateFile, {
                installations,
                periods,
                processes,
                productOutputLines,
                sourceStreams,
                precursors,
                products,
            });
            const filename = createEuExportFilename(templateFile.name);
            downloadBlob(exportResult.blob, filename);
            setLastExportResult({
                filename,
                generatedAt: new Date().toLocaleString('ko-KR'),
                checkedCellCount: exportResult.verification.checkedCellCount,
                writtenCellCount: exportResult.writtenCellCount,
            });
        } catch (error) {
            setExportError(error instanceof Error ? error.message : 'EU 템플릿 Export 중 오류가 발생했습니다.');
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="제출 파일 준비"
                title="EU 템플릿 Export"
                description="사용자가 보유한 EU 원본 Communication template을 브라우저에서만 검증하고, 원본 구조를 보존한 제출용 복사본을 생성합니다."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="제품 수" value={summary.productCount} helper="Export 대상" icon={PackageCheck} tone="pending" />
                <StatCard label="공정 수" value={summary.processCount} helper="A/D/Summary 반영" icon={Workflow} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={FileSpreadsheet} tone="success" />
                <StatCard label="검토 경고" value={summary.warningCount + readiness.warningCount} helper="산정 + Export" icon={AlertTriangle} tone="warning" />
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <SectionCard>
                    <div className="flex items-start gap-3">
                        <FileSpreadsheet className="mt-1 h-5 w-5 text-teal-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">EU 원본 템플릿 선택</h2>
                            <p className="mt-1 text-sm text-slate-600">
                                EU에서 제공한 최신 `.xlsx` 템플릿을 선택합니다. 파일은 서버로 전송하지 않고 브라우저 안에서만 처리합니다.
                            </p>
                        </div>
                    </div>

                    <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:bg-teal-50">
                        <FileSpreadsheet className="h-10 w-10 text-teal-700" />
                        <span className="mt-3 text-sm font-semibold text-teal-800">EU 원본 템플릿 파일 선택</span>
                        <span className="mt-1 text-xs text-slate-500">XLSX 파일만 지원</span>
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            onChange={(event) => handleTemplateFileChange(event.target.files?.[0])}
                        />
                    </label>

                    {templateFile && (
                        <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
                            선택한 파일: <span className="font-medium">{templateFile.name}</span>
                        </div>
                    )}

                    {isValidating && (
                        <div className="mt-4 rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
                            템플릿 구조를 확인하는 중입니다.
                        </div>
                    )}

                    {validationError && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{validationError}</span>
                        </div>
                    )}

                    {validation && (
                        <div
                            className={
                                validation.isValid
                                    ? 'mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3'
                                    : 'mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3'
                            }
                        >
                            <div className="flex items-start gap-2">
                                {validation.isValid ? (
                                    <FileCheck2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
                                ) : (
                                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-700" />
                                )}
                                <div>
                                    <p className="text-sm font-medium text-gray-900">
                                        {validation.isValid
                                            ? '필수 EU 시트를 모두 확인했습니다.'
                                            : '필수 EU 시트 일부가 없습니다.'}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        확인된 시트 {validation.sheetNames.length}개 / 필수 시트 {REQUIRED_EU_TEMPLATE_SHEETS.length}개
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        Parameters_CNCodes에서 CN 코드 {validation.cnCodeCount}개를 읽었습니다.
                                    </p>
                                </div>
                            </div>

                            {validation.missingSheets.length > 0 && (
                                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-amber-900">
                                    {validation.missingSheets.map((sheetName) => (
                                        <li key={sheetName}>{sheetName}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}

                    <Button
                        type="button"
                        onClick={handleDownloadCopy}
                        disabled={!validation?.isValid || !readiness.canExportDraft}
                        className="mt-5"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        산정 데이터가 반영된 복사본 다운로드
                    </Button>
                    <p className="mt-2 text-xs text-slate-500">{downloadStatusMessage}</p>

                    {exportError && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{exportError}</span>
                        </div>
                    )}

                    {lastExportResult && (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <div className="flex items-start gap-2">
                                <FileCheck2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
                                <div>
                                    <p className="text-sm font-semibold text-emerald-900">복사본 생성 및 셀 검증 완료</p>
                                    <dl className="mt-2 grid gap-1 text-xs leading-5 text-emerald-900/80">
                                        <div>
                                            <dt className="inline font-medium">파일명: </dt>
                                            <dd className="inline break-all">{lastExportResult.filename}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium">생성 시각: </dt>
                                            <dd className="inline">{lastExportResult.generatedAt}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium">검증 셀: </dt>
                                            <dd className="inline">
                                                {lastExportResult.checkedCellCount}개 확인, {lastExportResult.writtenCellCount}개 반영
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    )}
                </SectionCard>

                <SectionCard>
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
                        <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h2 className="text-lg font-semibold text-slate-950">제출 전 체크리스트</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        EU 템플릿 복사본을 만들기 전에 필요한 준비 상태를 확인합니다.
                                    </p>
                                </div>
                                <StatusBadge tone={exportChecklist.isComplete ? 'success' : 'warning'}>
                                    {exportChecklist.isComplete ? '준비 완료' : `검토 ${exportChecklist.reviewCount}건`}
                                </StatusBadge>
                            </div>

                            <div className="mt-4">
                                <ScenarioAssumptionSummary assumptions={scenarioAssumptions} mode="panel" />
                            </div>

                            <ul className="mt-4 space-y-3">
                                {exportChecklist.items.map((item) => {
                                    const Icon = item.complete ? CheckCircle2 : Circle;

                                    return (
                                        <li key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3">
                                            <div className="flex items-start gap-3">
                                                <Icon
                                                    className={
                                                        item.complete
                                                            ? 'mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-600'
                                                            : item.tone === 'danger'
                                                              ? 'mt-0.5 h-4 w-4 flex-shrink-0 text-red-600'
                                                              : 'mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600'
                                                    }
                                                />
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <p className="text-sm font-semibold text-slate-900">{item.label}</p>
                                                        <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                                                    </div>
                                                    <p className="mt-1 text-xs leading-5 text-slate-600">{item.description}</p>
                                                    {item.actionHref && item.actionLabel && (
                                                        <Link
                                                            href={item.actionHref}
                                                            className="mt-2 inline-flex min-h-8 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                                                        >
                                                            {item.actionLabel}
                                                        </Link>
                                                    )}
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="mt-5 rounded-xl border border-teal-100 bg-teal-50 px-4 py-3">
                                <h3 className="text-sm font-semibold text-teal-900">Export 원칙</h3>
                                <ul className="mt-2 space-y-2 text-xs leading-5 text-teal-900/80">
                                    <li>원본 EU 템플릿 파일은 앱에 내장하지 않습니다.</li>
                                    <li>업로드한 파일은 브라우저 메모리에서만 처리합니다.</li>
                                    <li>공식 시트명, 서식, 수식, 영문 라벨은 유지합니다.</li>
                                    <li>A_InstData, B_EmInst, C_Emissions&Energy, D_Processes, E_PurchPrec, Summary_Products의 확인된 입력 셀에 현재 로컬 데이터를 반영합니다.</li>
                                    <li>품목군과 생산공정 경계는 A_InstData에 선언하고, 제품 생산라인은 Summary_Products의 생산공정, CN 코드, 제품명 입력 셀에 반영합니다. SEE 값은 공식 수식 셀이 계산하도록 직접 덮어쓰지 않습니다.</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">Export 데이터 검토</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            다운로드를 막는 오류와 제출 전 확인이 필요한 경고를 구분해서 확인합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <StatusBadge tone="danger">오류 {readiness.errorCount}</StatusBadge>
                        <StatusBadge tone="warning">경고 {readiness.warningCount}</StatusBadge>
                    </div>
                </div>

                {issueAreaSummaries.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-4">
                        {issueAreaSummaries.map((areaSummary) => (
                            <div key={areaSummary.area} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                                <p className="font-semibold text-slate-900">{areaSummary.area}</p>
                                <p className="mt-1 text-xs text-slate-600">
                                    오류 {areaSummary.errorCount}건 / 경고 {areaSummary.warningCount}건
                                </p>
                            </div>
                        ))}
                    </div>
                )}

                {readiness.issues.length === 0 ? (
                    <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        현재 로컬 데이터는 Export 매핑 검토를 통과했습니다.
                    </div>
                ) : (
                    <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
                        {sortedReadinessIssues.map((issue, index) => {
                            const issueEditHref = getEuExportIssueEditHref(issue);

                            return (
                                <li key={`${issue.area}-${issue.message}-${index}`} className="flex gap-3 px-4 py-3 text-sm">
                                    <AlertTriangle
                                        className={
                                            issue.severity === 'error'
                                                ? 'mt-0.5 h-4 w-4 flex-shrink-0 text-red-600'
                                                : 'mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600'
                                        }
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div>
                                            <StatusBadge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                                                {getIssueSeverityLabel(issue.severity)}
                                            </StatusBadge>{' '}
                                            <span className="ml-1 font-medium text-gray-900">[{issue.area}]</span>{' '}
                                            <span className="text-gray-700">{issue.message}</span>
                                        </div>
                                        {issueEditHref && (
                                            <Link
                                                href={issueEditHref}
                                                className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                            >
                                                해당 화면에서 수정
                                            </Link>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SectionCard>

            <SectionCard>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">Summary_Products 반영 검토</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            EU 템플릿에는 생산공정, CN 코드, 제품명을 입력하고 직접, 간접, 총 SEE는 공식 수식 셀이 계산하도록 둡니다.
                            아래 값은 앱 내부 product-line 산정 결과와 비교하기 위한 사전 검토용입니다.
                        </p>
                    </div>
                    <StatusBadge tone={summaryProductsWriteCount > 0 ? 'success' : 'pending'}>
                        반영 셀 {summaryProductsWriteCount}개
                    </StatusBadge>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">EU 행</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">생산공정</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">CN 코드</th>
                                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">제품명</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">배분율</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">직접 SEE</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">간접 SEE</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">총 SEE</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {summaryProductPreviewRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                                            Summary_Products에 반영할 제품 산정 결과가 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    summaryProductPreviewRows.map((row) => (
                                        <tr key={`${row.rowNumber}-${row.productCode}-${row.productName}`} className="hover:bg-slate-50">
                                            <td className="whitespace-nowrap px-4 py-3 text-sm font-medium text-slate-900">{row.rowNumber}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.processName}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.productCode}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-700">{row.productName}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">{formatPercent(row.allocationShare)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">{formatNumber(row.directSee)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                                                <div>{formatNumber(row.indirectSee)}</div>
                                                <div className={row.isIndirectIncluded ? 'text-xs text-slate-400' : 'text-xs font-semibold text-amber-700'}>
                                                    {row.isIndirectIncluded ? '포함' : '제외'}
                                                </div>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-950">{formatNumber(row.totalSee)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                    Export 후 Excel에서 생성된 복사본을 열면 `Summary_Products`의 I:J:K 열 공식 수식 결과를 확인할 수 있습니다.
                    이 화면의 SEE는 앱 계산값이며, 공식 제출 전에는 Excel 수식 결과와 차이를 검토해야 합니다.
                </p>
            </SectionCard>

            <DataTable>
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">총 SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {results.length === 0 ? (
                            <tr>
                                <td colSpan={6} className="p-4 text-center text-sm text-gray-500">
                                    Export 미리보기에 표시할 산정 결과가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            results.map((result) => (
                                <tr key={result.id}>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{result.process_name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{result.product_name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">{formatNumber(result.output_mass_t)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">{formatNumber(result.direct_see)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.indirect_see)}
                                        <div className={result.indirect_emissions_applicable ? 'text-xs text-slate-400' : 'text-xs font-semibold text-amber-700'}>
                                            {result.indirect_emissions_applicable ? '간접 포함' : '간접 제외'}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold text-gray-900">{formatNumber(result.total_see)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
