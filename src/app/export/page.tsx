'use client';

import { ContactDialog } from '@/components/ContactDialog';
import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
import { ActionItemCard, Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
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
import { createDeliveryPackage } from '@/lib/delivery-package';
import {
    CBAM_LAST_BACKUP_AT_KEY,
    exportLocalBackup,
    getBackupStatus,
    getLocalSetting,
    listLocalItems,
    setLocalSetting,
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
    ArrowRight,
    Building2,
    CheckCircle2,
    Circle,
    Download,
    FileCheck2,
    FileText,
    FileSpreadsheet,
    Handshake,
    Mail,
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
    writtenSheets: string[];
    protectedFormulaCellsOverwritten: boolean;
};

type LastPackageResult = {
    filename: string;
    generatedAt: string;
    files: string[];
};

type ExportResponseType = 'TYPE_1_DECLARANT_EXPORTER' | 'TYPE_2_EXPORTER' | 'TYPE_3_INDIRECT_EXPORTER';

const EXPORT_RESPONSE_TYPE_SETTING_KEY = 'export:response-type';

const exportResponseTypes: Array<{
    type: ExportResponseType;
    label: string;
    title: string;
    summary: string;
    appOutput: string;
    responsibility: string;
    icon: typeof Building2;
    tone: 'success' | 'info' | 'warning';
}> = [
    {
        type: 'TYPE_1_DECLARANT_EXPORTER',
        label: '유형 1',
        title: '수출 + EU 수입 통관',
        summary: 'EU 법인이 수입자 역할까지 맡거나 한국 수출과 EU 수입 통관을 모두 관리하는 경우입니다.',
        appOutput: '앱은 사업장·제품·공정·배출량 근거와 내부 백업을 준비합니다. 최종 CBAM 신고서와 인증서는 CBAM 등록부/DP 포털에서 별도 처리해야 합니다.',
        responsibility: '승인된 CBAM 신고인 자격, 검증, 인증서 구매·예치 의무를 별도로 확인하세요.',
        icon: Building2,
        tone: 'warning',
    },
    {
        type: 'TYPE_2_EXPORTER',
        label: '유형 2',
        title: '일반 수출기업',
        summary: '별도 EU 수입업자에게 철강 제품을 수출하는 국내 제조기업입니다. 이 앱의 기본 타겟입니다.',
        appOutput: '수입자 전달용 Communication Template 복사본, 산정근거 요약, 증빙 체크리스트, .cbam 백업 패키지를 준비합니다.',
        responsibility: 'CN 코드, 연간 수입량, 전구물질 SEE, 검증 일정은 수입자와 확인해야 합니다.',
        icon: FileText,
        tone: 'success',
    },
    {
        type: 'TYPE_3_INDIRECT_EXPORTER',
        label: '유형 3',
        title: 'EU 간접수출·공급사',
        summary: 'EU로 수출하는 다른 기업에 철강 제품 또는 전구물질 정보를 제공하는 경우입니다.',
        appOutput: '정해진 공식 양식이 없을 수 있으므로 사업장 정보, 고유 내재배출량, 기지불 탄소가격 근거를 자유양식 패키지로 정리합니다.',
        responsibility: '정보 미제공 시 고객사 요청, 거래 지연, 공급망 재검토가 생길 수 있어 요청 범위를 먼저 확인하세요.',
        icon: Handshake,
        tone: 'info',
    },
];

function normalizeExportResponseType(value: unknown): ExportResponseType {
    return exportResponseTypes.some((item) => item.type === value)
        ? value as ExportResponseType
        : 'TYPE_2_EXPORTER';
}

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

function getCellColumn(cell: string) {
    return cell.match(/^[A-Z]+/)?.[0] ?? '';
}

function ExportStepCard({
    description,
    index,
    status,
    tone,
    title,
}: {
    description: string;
    index: number;
    status: string;
    tone: 'success' | 'warning' | 'danger' | 'pending' | 'info';
    title: string;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-slate-50 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                        {index}
                    </div>
                    <div className="min-w-0">
                        <h3 className="break-words text-sm font-semibold text-slate-950">{title}</h3>
                        <p className="mt-1 break-words text-xs leading-5 text-slate-500">{description}</p>
                    </div>
                </div>
                <StatusBadge tone={tone}>{status}</StatusBadge>
            </div>
        </div>
    );
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
    const [packageError, setPackageError] = useState('');
    const [isPackaging, setIsPackaging] = useState(false);
    const [lastExportResult, setLastExportResult] = useState<LastExportResult | undefined>();
    const [lastPackageResult, setLastPackageResult] = useState<LastPackageResult | undefined>();
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
    const [exportResponseType, setExportResponseType] = useState<ExportResponseType>('TYPE_2_EXPORTER');

    useEffect(() => {
        async function loadPreviewData() {
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
                savedExportResponseType,
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
                getLocalSetting<ExportResponseType>(EXPORT_RESPONSE_TYPE_SETTING_KEY),
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
            setExportResponseType(normalizeExportResponseType(savedExportResponseType));
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
    const reportableResults = useMemo(() => results.filter((result) => result.is_cbam_reportable && result.see_cbam_basis !== null), [results]);

    const summary = useMemo(() => {
        const productNames = new Set(reportableResults.map((result) => result.product_name));
        const totalOutput = reportableResults.reduce((sum, result) => sum + result.output_mass_t, 0);
        const warningCount = reportableResults.reduce((sum, result) => sum + result.warnings.length, 0);

        return {
            productCount: productNames.size,
            processCount: reportableResults.length,
            totalOutput,
            warningCount,
        };
    }, [reportableResults]);

    const readiness = useMemo(
        () => evaluateEuExportReadiness({ processes, productOutputLines, sourceStreams, precursors, products }, validation?.cnCodeMap),
        [processes, productOutputLines, sourceStreams, precursors, products, validation?.cnCodeMap]
    );

    const scenarioRiskSummary = useMemo(() => {
        const scenarios = calculateProductScenarios(reportableResults, normalizeScenarioAssumptions(scenarioAssumptions), {
            benchmarks: benchmarkReference,
            defaultValues: defaultValueReference,
        });

        return summarizeScenarioRisks(scenarios);
    }, [benchmarkReference, defaultValueReference, reportableResults, scenarioAssumptions]);

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
    const selectedExportResponseType = useMemo(
        () => exportResponseTypes.find((item) => item.type === exportResponseType) ?? exportResponseTypes[1],
        [exportResponseType]
    );

    const exportChecklist = useMemo(
        () => createExportChecklist({
            backupStatus,
            lastExportResult,
            plannedCellWriteCount: plannedCellWrites.length,
            readiness,
            resultCount: reportableResults.length,
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
            reportableResults.length,
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

    const firstBlockingIssue = sortedReadinessIssues.find((issue) => issue.severity === 'error') ?? sortedReadinessIssues[0];
    const firstBlockingIssueHref = firstBlockingIssue ? getEuExportIssueEditHref(firstBlockingIssue) : undefined;
    const exportGate = useMemo(() => {
        if (readiness.errorCount > 0) {
            return {
                title: '오류 항목을 먼저 해결해야 합니다',
                description: `수입자 전달용 Communication Template 복사본을 만들기 전에 오류 ${readiness.errorCount}건을 수정해야 합니다. 첫 번째 항목부터 정리하면 Export 가능 상태로 이동합니다.`,
                badge: 'Export 차단',
                tone: 'danger' as const,
            };
        }

        if (!templateFile || !validation?.isValid) {
            return {
                title: '최신 EU 원본 템플릿을 선택하세요',
                description: '사용자가 보유한 최신 EU Communication template을 업로드하면 공식 시트와 CN 코드 기준을 확인한 뒤 복사본을 만들 수 있습니다.',
                badge: '템플릿 필요',
                tone: 'warning' as const,
            };
        }

        if (readiness.warningCount > 0 || !exportChecklist.isComplete) {
            return {
                title: '복사본 생성은 가능하지만 전달 전 검토가 필요합니다',
                description: `경고 ${readiness.warningCount}건과 체크리스트 검토 항목을 확인하세요. 다운로드 후 Excel에서 공식 수식 결과도 반드시 확인해야 합니다.`,
                badge: '검토 필요',
                tone: 'warning' as const,
            };
        }

        return {
            title: '수입자 전달용 복사본을 생성할 수 있습니다',
            description: '현재 로컬 데이터, 공식 템플릿 구조, Export 쓰기 계획이 모두 준비되었습니다. 다운로드 후 Excel 수식 결과를 최종 검토하세요.',
            badge: '생성 가능',
            tone: 'success' as const,
        };
    }, [exportChecklist.isComplete, readiness.errorCount, readiness.warningCount, templateFile, validation?.isValid]);

    const summaryProductPreviewRows = useMemo(
        () => reportableResults.slice(0, 100).map((result, index) => ({
            rowNumber: 10 + index,
            processName: result.process_name,
            productCode: result.cn_code || result.hs_code || '-',
            productName: result.product_name,
            allocationShare: result.allocation_share,
            directSee: result.direct_see,
            indirectSee: result.indirect_see,
            reportingDirectSee: result.see_direct_incl_precursor,
            reportingIndirectSee: result.see_indirect_incl_precursor,
            cbamBasisSee: result.see_cbam_basis ?? 0,
            informationalTotalSee: result.see_informational_total,
            isIndirectIncluded: result.indirect_emissions_applicable,
        })),
        [reportableResults]
    );

    const summaryProductsWriteCount = useMemo(
        () => plannedCellWrites.filter((write) => write.sheetName === 'Summary_Products').length,
        [plannedCellWrites]
    );

    const writtenSheetNames = useMemo(
        () => Array.from(new Set(plannedCellWrites.map((write) => write.sheetName))),
        [plannedCellWrites]
    );

    const protectedSummaryProductFormulaOverwriteCount = useMemo(
        () => plannedCellWrites.filter((write) => write.sheetName === 'Summary_Products' && ['I', 'J', 'K'].includes(getCellColumn(write.cell))).length,
        [plannedCellWrites]
    );

    const exportWorkflowSteps = useMemo(
        () => [
            {
                title: '원본 템플릿 선택',
                description: templateFile
                    ? `${templateFile.name} 파일을 브라우저에서 검증합니다.`
                    : 'EU에서 받은 최신 Communication Template을 선택합니다.',
                status: validation?.isValid ? '확인 완료' : templateFile ? '검증 중' : '선택 필요',
                tone: validation?.isValid ? 'success' as const : templateFile ? 'warning' as const : 'pending' as const,
            },
            {
                title: '입력 데이터 정리',
                description: readiness.errorCount > 0
                    ? '오류 항목을 먼저 수정해야 복사본을 만들 수 있습니다.'
                    : '오류 없이 Export 가능한 로컬 데이터 상태입니다.',
                status: readiness.errorCount > 0 ? `오류 ${readiness.errorCount}건` : '통과',
                tone: readiness.errorCount > 0 ? 'danger' as const : 'success' as const,
            },
            {
                title: '공식 수식 보호',
                description: 'Summary_Products I:J:K는 공식 수식 셀로 두고 앱이 직접 덮어쓰지 않습니다.',
                status: protectedSummaryProductFormulaOverwriteCount > 0 ? '확인 필요' : '보호',
                tone: protectedSummaryProductFormulaOverwriteCount > 0 ? 'danger' as const : 'success' as const,
            },
            {
                title: '전달용 복사본 생성',
                description: lastExportResult
                    ? `${lastExportResult.writtenCellCount}개 셀 반영 후 검증했습니다.`
                    : '다운로드 후 Excel에서 공식 수식 재계산 결과를 확인합니다.',
                status: lastExportResult ? '생성 완료' : readiness.canExportDraft && validation?.isValid ? '생성 가능' : '대기',
                tone: lastExportResult ? 'success' as const : readiness.canExportDraft && validation?.isValid ? 'info' as const : 'pending' as const,
            },
        ],
        [lastExportResult, protectedSummaryProductFormulaOverwriteCount, readiness.canExportDraft, readiness.errorCount, templateFile, validation?.isValid]
    );

    async function handleExportResponseTypeChange(nextType: ExportResponseType) {
        setExportResponseType(nextType);
        await setLocalSetting(EXPORT_RESPONSE_TYPE_SETTING_KEY, nextType);
    }

    async function handleTemplateFileChange(file: File | undefined) {
        setTemplateFile(file);
        setValidation(undefined);
        setValidationError('');
        setExportError('');
        setPackageError('');
        setLastExportResult(undefined);
        setLastPackageResult(undefined);

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
                writtenSheets: writtenSheetNames,
                protectedFormulaCellsOverwritten: protectedSummaryProductFormulaOverwriteCount > 0,
            });
        } catch (error) {
            setExportError(error instanceof Error ? error.message : 'EU Communication Template Export 중 오류가 발생했습니다.');
        }
    }

    async function handleDownloadDeliveryPackage() {
        if (!templateFile || !validation?.isValid) {
            return;
        }

        setPackageError('');
        setExportError('');
        setLastPackageResult(undefined);
        setIsPackaging(true);

        try {
            const generatedAt = new Date();
            const exportResult = await createEuTemplateExportCopyResult(templateFile, {
                installations,
                periods,
                processes,
                productOutputLines,
                sourceStreams,
                precursors,
                products,
            });
            const exportWorkbookFilename = createEuExportFilename(templateFile.name);
            const backup = await exportLocalBackup();
            const packageResult = await createDeliveryPackage({
                backup,
                exportChecklist,
                exportVerification: exportResult.verification,
                exportWorkbookBlob: exportResult.blob,
                exportWorkbookFilename,
                generatedAt,
                installations,
                periods,
                precursors,
                processes,
                products,
                readiness,
                results: reportableResults,
                sourceStreams,
                templateFilename: templateFile.name,
                writtenCellCount: exportResult.writtenCellCount,
            });

            downloadBlob(packageResult.blob, packageResult.filename);
            window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at);
            setLastBackupAt(backup.manifest.exported_at);
            setLastExportResult({
                filename: exportWorkbookFilename,
                generatedAt: generatedAt.toLocaleString('ko-KR'),
                checkedCellCount: exportResult.verification.checkedCellCount,
                writtenCellCount: exportResult.writtenCellCount,
                writtenSheets: writtenSheetNames,
                protectedFormulaCellsOverwritten: protectedSummaryProductFormulaOverwriteCount > 0,
            });
            setLastPackageResult({
                filename: packageResult.filename,
                generatedAt: generatedAt.toLocaleString('ko-KR'),
                files: packageResult.files,
            });
        } catch (error) {
            setPackageError(error instanceof Error ? error.message : 'CBAM 전달 패키지 생성 중 오류가 발생했습니다.');
        } finally {
            setIsPackaging(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="전달 파일 준비"
                title="EU Communication Template Export"
                description="사용자가 보유한 EU 원본 Communication Template을 브라우저에서만 검증하고, 원본 구조를 보존한 수입자 전달용 복사본을 생성합니다. 이 파일은 연간 CBAM 신고서 자체가 아니라 신고 지원자료입니다."
            />

            <section className="w-full min-w-0 overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                    <div className="min-w-0">
                        <StatusBadge tone={exportGate.tone}>{exportGate.badge}</StatusBadge>
                        <h2 className="mt-3 break-words text-2xl font-semibold tracking-tight text-slate-950">{exportGate.title}</h2>
                        <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-600">{exportGate.description}</p>
                        <p className="mt-3 max-w-3xl break-words text-sm leading-6 text-slate-600">
                            처음 사용하는 경우에는 오류를 먼저 고친 뒤, 산정근거 요약 보고서·증빙 체크리스트·Excel·내부 백업을 묶은 수입자 전달 패키지를 생성하세요. 세부 EU 템플릿 검토 기능은 아래에서 계속 사용할 수 있습니다.
                        </p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            {firstBlockingIssueHref && firstBlockingIssue ? (
                                <Link href={firstBlockingIssueHref}>
                                    <Button type="button">
                                        오류 먼저 고치기
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            ) : (
                                <Button
                                    type="button"
                                    onClick={handleDownloadDeliveryPackage}
                                    disabled={!validation?.isValid || !readiness.canExportDraft || isPackaging}
                                >
                                    <PackageCheck className="mr-2 h-4 w-4" />
                                    {isPackaging ? '패키지 생성 중' : '수입자 전달 패키지 만들기'}
                                </Button>
                            )}
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleDownloadCopy}
                                disabled={!validation?.isValid || !readiness.canExportDraft}
                            >
                                <Download className="mr-2 h-4 w-4" />
                                EU 템플릿 복사본만 생성
                            </Button>
                            <Link href="/settings">
                                <Button type="button" variant="secondary">
                                    내부 백업 저장하기
                                </Button>
                            </Link>
                        </div>
                    </div>
                    <div className="min-w-0 rounded-2xl bg-slate-50 p-4">
                        <p className="text-sm font-semibold text-slate-950">게이트 요약</p>
                        <dl className="mt-4 space-y-3 text-sm">
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-slate-500">EU 템플릿</dt>
                                <dd>
                                    <StatusBadge tone={validation?.isValid ? 'success' : templateFile ? 'warning' : 'pending'}>
                                        {validation?.isValid ? '확인 완료' : templateFile ? '검증 필요' : '선택 필요'}
                                    </StatusBadge>
                                </dd>
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <dt className="text-slate-500">오류</dt>
                                <dd className="flex-none font-semibold text-slate-950">{readiness.errorCount}건</dd>
                            </div>
                            <div className="flex min-w-0 items-center justify-between gap-3">
                                <dt className="text-slate-500">경고</dt>
                                <dd className="flex-none font-semibold text-slate-950">{readiness.warningCount}건</dd>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <dt className="text-slate-500">백업</dt>
                                <dd><StatusBadge tone={backupStatus.tone}>{backupStatus.label}</StatusBadge></dd>
                            </div>
                        </dl>
                    </div>
                </div>
            </section>

            <SectionCard
                title="수출 유형별 대응 범위"
                description="국내 철강 제조기업이 CBAM에서 맡는 역할에 따라 준비해야 할 파일과 책임 범위가 달라집니다. 대부분의 중소·중견 수출기업은 유형 2에 해당합니다."
                actions={<StatusBadge tone={selectedExportResponseType.tone}>현재 선택: {selectedExportResponseType.label}</StatusBadge>}
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {exportResponseTypes.map((item) => {
                        const Icon = item.icon;
                        const selected = item.type === exportResponseType;

                        return (
                            <button
                                key={item.type}
                                type="button"
                                onClick={() => void handleExportResponseTypeChange(item.type)}
                                className={`min-w-0 rounded-2xl border p-4 text-left transition ${
                                    selected
                                        ? 'border-teal-400 bg-teal-50 shadow-[var(--shadow-card)]'
                                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white'
                                }`}
                            >
                                <div className="flex min-w-0 items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2">
                                        <span className="rounded-xl bg-white p-2 text-teal-700 ring-1 ring-slate-200">
                                            <Icon className="h-5 w-5" />
                                        </span>
                                        <div className="min-w-0">
                                            <StatusBadge tone={item.tone}>{item.label}</StatusBadge>
                                            <h3 className="mt-2 break-words text-sm font-semibold text-slate-950">{item.title}</h3>
                                        </div>
                                    </div>
                                    {selected && <StatusBadge tone="success">선택됨</StatusBadge>}
                                </div>
                                <p className="mt-3 break-words text-sm leading-6 text-slate-700">{item.summary}</p>
                                <div className="mt-3 rounded-xl bg-white/80 p-3 text-xs leading-5 text-slate-600">
                                    <p><span className="font-semibold text-slate-800">앱 산출물:</span> {item.appOutput}</p>
                                    <p className="mt-2"><span className="font-semibold text-slate-800">확인할 책임:</span> {item.responsibility}</p>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard
                title="파일 용도 한눈에 보기"
                description="같은 Export 화면에 있어도 쓰임새가 다릅니다. 수입자에게 줄 파일과 회사 내부 보관 파일을 구분해서 사용하세요."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4">
                        <div className="flex items-center gap-2">
                            <PackageCheck className="h-5 w-5 text-teal-700" />
                            <StatusBadge tone="success">수입자 전달용</StatusBadge>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">수입자 전달 패키지</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                            산정근거 요약 보고서, 증빙 체크리스트, Export Excel, 내부 백업을 함께 묶습니다. 실무자가 우선 사용할 기본 Export입니다.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-slate-700" />
                            <StatusBadge tone="neutral">내부 보관용</StatusBadge>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">.cbam 프로젝트 백업</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                            제출 파일이 아니라 현재 브라우저의 입력자료를 되살리기 위한 내부 보관 파일입니다. 작업 전후로 별도 보관하세요.
                        </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-5 w-5 text-slate-700" />
                            <StatusBadge tone="info">전문가 검토용</StatusBadge>
                        </div>
                        <h3 className="mt-3 text-sm font-semibold text-slate-950">EU 템플릿 복사본만 생성</h3>
                        <p className="mt-2 text-sm leading-6 text-slate-700">
                            공식 워크북 구조와 수식 셀을 검토할 때 사용합니다. 수입자 전달 패키지가 필요하면 왼쪽 기본 버튼을 사용하세요.
                        </p>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="제품 수" value={summary.productCount} helper="Export 대상" icon={PackageCheck} tone="pending" />
                <StatCard label="공정 수" value={summary.processCount} helper="A/D/Summary 반영" icon={Workflow} tone="info" />
                <StatCard label="총 생산량" value={formatNumber(summary.totalOutput)} helper="tonne" icon={FileSpreadsheet} tone="success" />
                <StatCard label="검토 경고" value={summary.warningCount + readiness.warningCount} helper="산정 + Export" icon={AlertTriangle} tone="warning" />
            </div>

            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
                {exportWorkflowSteps.map((step, index) => (
                    <ExportStepCard
                        key={step.title}
                        index={index + 1}
                        title={step.title}
                        description={step.description}
                        status={step.status}
                        tone={step.tone}
                    />
                ))}
            </section>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
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

                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-950">복사본 생성</h3>
                                <p className="mt-1 text-xs leading-5 text-slate-600">{downloadStatusMessage}</p>
                            </div>
                            <Button
                                type="button"
                                onClick={handleDownloadCopy}
                                disabled={!validation?.isValid || !readiness.canExportDraft}
                                className="w-full lg:w-auto"
                            >
                                <Download className="mr-2 h-4 w-4" />
                                수입자 전달용 복사본 다운로드
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-teal-950">전달 패키지 생성</h3>
                                <p className="mt-1 text-xs leading-5 text-teal-900">
                                    Export Excel, 국영문 DOCX 산정근거 요약 보고서, 국영문 DOCX 증빙 체크리스트, .cbam 백업,
                                    export 로그를 하나의 ZIP으로 묶습니다. .cbam 백업은 민감한 로컬 데이터가 포함될 수 있으므로 내부 보관 또는 명시 승인된 공유에만 사용하세요.
                                </p>
                            </div>
                            <Button
                                type="button"
                                variant="secondary"
                                onClick={handleDownloadDeliveryPackage}
                                disabled={!validation?.isValid || !readiness.canExportDraft || isPackaging}
                                className="w-full border-teal-200 bg-white text-teal-900 hover:bg-teal-100 lg:w-auto"
                            >
                                <PackageCheck className="mr-2 h-4 w-4" />
                                {isPackaging ? '패키지 생성 중' : 'ZIP 패키지 다운로드'}
                            </Button>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-slate-500">공식 수식 보호</p>
                            <p className="mt-1 text-sm font-semibold text-slate-950">
                                I:J:K 덮어쓰기 {protectedSummaryProductFormulaOverwriteCount}개
                            </p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-slate-500">반영 예정 셀</p>
                            <p className="mt-1 text-sm font-semibold text-slate-950">{plannedCellWrites.length}개</p>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                            <p className="text-xs font-semibold text-slate-500">반영 예정 시트</p>
                            <p className="mt-1 break-words text-sm font-semibold text-slate-950">
                                {writtenSheetNames.length > 0 ? `${writtenSheetNames.length}개` : '아직 없음'}
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-950">검증 로그 기준</h3>
                        <ul className="mt-2 space-y-1 text-xs leading-5 text-slate-600">
                            <li>공식 시트명과 영문 라벨은 원본 구조를 기준으로 검증합니다.</li>
                            <li>반영 예정 시트: {writtenSheetNames.length > 0 ? writtenSheetNames.join(', ') : '아직 없음'}</li>
                            <li>생성 후 파일명, 검증 셀 수, 반영 셀 수를 이 화면에 남깁니다.</li>
                        </ul>
                    </div>

                    {exportError && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{exportError}</span>
                        </div>
                    )}

                    {packageError && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{packageError}</span>
                        </div>
                    )}

                    {lastExportResult && (
                        <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
                            <div className="flex items-start gap-2">
                                <FileCheck2 className="mt-0.5 h-4 w-4 flex-shrink-0 text-emerald-700" />
                                <div>
                                    <p className="text-sm font-semibold text-emerald-900">Communication Template 복사본 생성 및 셀 검증 완료</p>
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
                                        <div>
                                            <dt className="inline font-medium">반영 시트: </dt>
                                            <dd className="inline break-words">{lastExportResult.writtenSheets.join(', ')}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium">보호 수식 셀: </dt>
                                            <dd className="inline">
                                                Summary_Products I:J:K 덮어쓰기 {lastExportResult.protectedFormulaCellsOverwritten ? '발견' : '없음'}
                                            </dd>
                                        </div>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    )}

                    {lastPackageResult && (
                        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3">
                            <div className="flex items-start gap-2">
                                <PackageCheck className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                                <div>
                                    <p className="text-sm font-semibold text-teal-950">CBAM 전달 패키지 생성 완료</p>
                                    <dl className="mt-2 grid gap-1 text-xs leading-5 text-teal-900/90">
                                        <div>
                                            <dt className="inline font-medium">파일명: </dt>
                                            <dd className="inline break-all">{lastPackageResult.filename}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium">생성 시각: </dt>
                                            <dd className="inline">{lastPackageResult.generatedAt}</dd>
                                        </div>
                                        <div>
                                            <dt className="inline font-medium">포함 파일: </dt>
                                            <dd className="mt-1 block">
                                                <ul className="list-disc space-y-1 pl-5">
                                                    {lastPackageResult.files.map((file) => (
                                                        <li key={file} className="break-all">{file}</li>
                                                    ))}
                                                </ul>
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
                                    <h2 className="text-lg font-semibold text-slate-950">전달 전 체크리스트</h2>
                                    <p className="mt-1 text-sm text-slate-600">
                                        EU Communication Template 복사본을 만들기 전에 필요한 준비 상태를 확인합니다.
                                    </p>
                                </div>
                                <StatusBadge tone={exportChecklist.isComplete ? 'success' : 'warning'}>
                                    {exportChecklist.isComplete ? '준비 완료' : `검토 ${exportChecklist.reviewCount}건`}
                                </StatusBadge>
                            </div>

                            <div className="mt-4">
                                <ScenarioAssumptionSummary assumptions={scenarioAssumptions} mode="panel" />
                            </div>

                            <ul className="mt-4 space-y-2">
                                {exportChecklist.items.map((item) => {
                                    const Icon = item.complete ? CheckCircle2 : Circle;

                                    return (
                                        <li key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex min-w-0 gap-2">
                                                    <Icon
                                                        className={
                                                            item.complete
                                                                ? 'mt-0.5 h-4 w-4 flex-none text-emerald-600'
                                                                : item.tone === 'danger'
                                                                  ? 'mt-0.5 h-4 w-4 flex-none text-red-600'
                                                                  : 'mt-0.5 h-4 w-4 flex-none text-amber-600'
                                                        }
                                                    />
                                                    <div className="min-w-0">
                                                        <p className="break-words text-sm font-semibold text-slate-950">{item.label}</p>
                                                        <p className="mt-1 break-words text-xs leading-5 text-slate-500">{item.description}</p>
                                                    </div>
                                                </div>
                                                <StatusBadge tone={item.tone}>{item.status}</StatusBadge>
                                            </div>
                                            {item.actionHref && item.actionLabel && (
                                                <Link
                                                    href={item.actionHref}
                                                    className="mt-3 inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-100"
                                                >
                                                    {item.actionLabel}
                                                </Link>
                                            )}
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
                            다운로드를 막는 오류와 전달 전 확인이 필요한 경고를 구분해서 확인합니다.
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
                    <ul className="mt-4 space-y-3">
                        {sortedReadinessIssues.map((issue, index) => {
                            const issueEditHref = getEuExportIssueEditHref(issue);

                            return (
                                <li key={`${issue.area}-${issue.message}-${index}`}>
                                    <ActionItemCard
                                        title={issue.area}
                                        description={issue.message}
                                        className={issue.severity === 'error' ? 'border-red-100 bg-red-50' : 'border-amber-100 bg-amber-50'}
                                        badge={
                                            <>
                                                <AlertTriangle
                                                    className={issue.severity === 'error' ? 'h-4 w-4 text-red-600' : 'h-4 w-4 text-amber-600'}
                                                />
                                                <StatusBadge tone={issue.severity === 'error' ? 'danger' : 'warning'}>
                                                    {getIssueSeverityLabel(issue.severity)}
                                                </StatusBadge>
                                            </>
                                        }
                                        action={issueEditHref ? (
                                            <Link
                                                href={issueEditHref}
                                                className="inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                            >
                                                해당 화면에서 수정
                                            </Link>
                                        ) : undefined}
                                    />
                                </li>
                            );
                        })}
                    </ul>
                )}
            </SectionCard>

            <SectionCard>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">전달 전 최종 확인</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            Export 복사본은 수입자 전달용 신고 지원자료입니다. 전달 또는 신고 전에는 최신 원본 템플릿, 공식 수식 재계산, 내부 승인, 백업 보관을 한 번 더 확인하세요.
                        </p>
                    </div>
                    <StatusBadge tone={validation?.isValid && readiness.canExportDraft ? 'warning' : 'pending'}>
                        사용자 확인 필요
                    </StatusBadge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex gap-3">
                            <FileCheck2 className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                            <div>
                                <h3 className="text-sm font-semibold text-slate-950">최신 EU 원본 템플릿</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    앱에 템플릿을 내장하지 않습니다. 사용자가 보유한 최신 공식 Communication Template을 업로드한 경우에만 수입자 전달용 복사본을 생성하세요.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex gap-3">
                            <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
                            <div>
                                <h3 className="text-sm font-semibold text-slate-950">Excel 공식 수식 재계산</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    다운로드 후 Microsoft Excel에서 `Summary_Products` I:J:K 열의 공식 수식 결과를 확인하고, 이 화면의 SEE 검토값과 차이를 기록하세요.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex gap-3">
                            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                            <div>
                                <h3 className="text-sm font-semibold text-slate-950">최종 책임과 검증</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    이 앱은 산정과 신고 지원자료 준비를 돕는 도구입니다. 법률 자문, 공식 검증, 회사 내부 승인, 최종 신고 책임을 대체하지 않습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex gap-3">
                            <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
                            <div>
                                <h3 className="text-sm font-semibold text-slate-950">.cbam 백업 보관</h3>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    전달용 Excel과 별도로 같은 시점의 `.cbam` 백업을 내려받아 회사 보안정책에 맞는 위치에 보관하세요.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="CBAM 산정·Export 검토 문의"
                description="EU Communication Template 작성 방향, Excel 재계산 차이, 컨설팅 지원이 필요하면 문의폼을 보내거나 회사 메일 시스템으로 직접 문의하세요."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        <Mail className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
                        <div>
                            <p className="font-semibold text-slate-950">검토 범위만 문의하세요</p>
                            <p className="mt-1">생산량, 배출량, EU 템플릿 작성본, .cbam 백업 파일은 문의폼이나 이메일에 첨부하지 마세요.</p>
                        </div>
                    </div>
                    <ContactDialog
                        triggerLabel="Export 검토 문의"
                        inquiryType="EU Communication Export 검토"
                        subject="[CBAM Local] CBAM Export 검토 문의"
                        triggerIcon={<Mail className="mr-2 h-4 w-4" />}
                        buttonClassName="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-900/20 transition hover:bg-teal-800"
                    />
                </div>
            </SectionCard>

            <SectionCard>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">Summary_Products 반영 검토</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            EU 템플릿에는 생산공정, CN 코드, 제품명만 입력하고 직접, 간접, 총 SEE는 공식 수식 셀이 계산하도록 둡니다. 아래 값은 Excel 재계산 전 앱 내부 검토값입니다.
                        </p>
                    </div>
                    <StatusBadge tone={summaryProductsWriteCount > 0 ? 'success' : 'pending'}>
                        반영 셀 {summaryProductsWriteCount}개
                    </StatusBadge>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <p className="text-xs font-semibold text-slate-500">제품 식별 입력</p>
                        <p className="mt-1 text-sm font-semibold text-slate-950">D/F/H 열 중심</p>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
                        <p className="text-xs font-semibold text-emerald-700">공식 수식 보존</p>
                        <p className="mt-1 text-sm font-semibold text-emerald-900">I:J:K 열 덮어쓰기 없음</p>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3">
                        <p className="text-xs font-semibold text-blue-700">사용자 확인</p>
                        <p className="mt-1 text-sm font-semibold text-blue-900">Excel 재계산 결과 비교</p>
                    </div>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 md:hidden">
                    {summaryProductPreviewRows.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                            Summary_Products에 반영할 제품 산정 결과가 없습니다.
                        </div>
                    ) : (
                        summaryProductPreviewRows.map((row) => (
                            <div key={`${row.rowNumber}-${row.productCode}-${row.productName}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-500">EU 행 {row.rowNumber}</p>
                                        <h3 className="mt-1 break-words text-sm font-semibold text-slate-950">{row.productName}</h3>
                                        <p className="mt-1 break-words text-xs text-slate-600">{row.processName} / CN {row.productCode}</p>
                                    </div>
                                    <StatusBadge tone="pending">검토용</StatusBadge>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <dt className="text-xs text-slate-500">배분율</dt>
                                        <dd className="mt-1 font-semibold text-slate-900">{formatPercent(row.allocationShare)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500">CBAM 산정 기준 SEE</dt>
                                        <dd className="mt-1 font-semibold text-slate-900">{formatNumber(row.cbamBasisSee)}</dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500">직접 SEE(자체)</dt>
                                        <dd className="mt-1 text-slate-700">
                                            {formatNumber(row.directSee)}
                                            <div className="mt-0.5 text-xs text-slate-400">보고용 SEE(직접) {formatNumber(row.reportingDirectSee)} · 전구물질 포함</div>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500">간접 SEE(자체)</dt>
                                        <dd className="mt-1 text-slate-700">
                                            {formatNumber(row.indirectSee)}
                                            <span className={row.isIndirectIncluded ? 'ml-1 text-xs text-slate-400' : 'ml-1 text-xs font-semibold text-amber-700'}>
                                                {row.isIndirectIncluded ? '포함' : '인증서 제외'}
                                            </span>
                                            <div className="mt-0.5 text-xs text-slate-400">보고용 SEE(간접) {formatNumber(row.reportingIndirectSee)} · 전구물질 포함</div>
                                        </dd>
                                    </div>
                                    <div>
                                        <dt className="text-xs text-slate-500">내부 검토용 total SEE</dt>
                                        <dd className="mt-1 text-slate-700">{formatNumber(row.informationalTotalSee)}</dd>
                                    </div>
                                </dl>
                            </div>
                        ))
                    )}
                </div>

                <div className="mt-4 hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
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
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">CBAM 산정 기준 SEE</th>
                                    <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600">내부 검토용 total SEE</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {summaryProductPreviewRows.length === 0 ? (
                                    <tr>
                                        <td colSpan={9} className="px-4 py-6 text-center text-sm text-slate-500">
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
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                                                <div>{formatNumber(row.directSee)}</div>
                                                <div className="text-xs text-slate-400">보고용 {formatNumber(row.reportingDirectSee)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">
                                                <div>{formatNumber(row.indirectSee)}</div>
                                                <div className={row.isIndirectIncluded ? 'text-xs text-slate-400' : 'text-xs font-semibold text-amber-700'}>
                                                    {row.isIndirectIncluded ? '포함' : '인증서 제외'}
                                                </div>
                                                <div className="text-xs text-slate-400">보고용 {formatNumber(row.reportingIndirectSee)}</div>
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm font-semibold text-slate-950">{formatNumber(row.cbamBasisSee)}</td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-700">{formatNumber(row.informationalTotalSee)}</td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                <p className="mt-3 text-xs leading-5 text-slate-500">
                    Export 후 Excel에서 생성된 복사본을 열면 `Summary_Products`의 I:J:K 열 공식 수식 결과를 확인할 수 있습니다.
                    이 화면의 SEE는 앱 계산값이며, 전달 또는 신고 전에는 Excel 수식 결과와 차이를 검토해야 합니다.
                </p>
            </SectionCard>

            <div className="grid grid-cols-1 gap-3 md:hidden">
                {reportableResults.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500">
                        Export 미리보기에 표시할 산정 결과가 없습니다.
                    </div>
                ) : (
                    reportableResults.map((result) => (
                        <div key={`${result.id}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <h3 className="break-words text-sm font-semibold text-slate-950">{result.product_name}</h3>
                                    <p className="mt-1 break-words text-xs text-slate-600">{result.process_name}</p>
                                </div>
                                <StatusBadge tone={result.indirect_emissions_applicable ? 'success' : 'warning'}>
                                    {result.indirect_emissions_applicable ? '간접 포함' : '인증서 산정 제외'}
                                </StatusBadge>
                            </div>
                            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                <div>
                                    <dt className="text-xs text-slate-500">생산량</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(result.output_mass_t)} t</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">CBAM 산정 기준 SEE</dt>
                                    <dd className="mt-1 font-semibold text-slate-900">{formatNumber(result.see_cbam_basis ?? 0)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">직접 SEE</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(result.direct_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">간접 SEE</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(result.indirect_see)}</dd>
                                </div>
                                <div>
                                    <dt className="text-xs text-slate-500">내부 검토용 total SEE</dt>
                                    <dd className="mt-1 text-slate-700">{formatNumber(result.see_informational_total)}</dd>
                                </div>
                            </dl>
                        </div>
                    ))
                )}
            </div>

            <DataTable className="hidden md:block">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">공정</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">생산량(t)</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">직접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">간접 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">CBAM 산정 기준 SEE</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">내부 검토용 total SEE</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                        {reportableResults.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-4 text-center text-sm text-gray-500">
                                    Export 미리보기에 표시할 산정 결과가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            reportableResults.map((result) => (
                                <tr key={result.id}>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{result.process_name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{result.product_name}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">{formatNumber(result.output_mass_t)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">{formatNumber(result.direct_see)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">
                                        {formatNumber(result.indirect_see)}
                                        <div className={result.indirect_emissions_applicable ? 'text-xs text-slate-400' : 'text-xs font-semibold text-amber-700'}>
                                            {result.indirect_emissions_applicable ? '간접 포함' : '인증서 산정 제외'}
                                        </div>
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold text-gray-900">{formatNumber(result.see_cbam_basis ?? 0)}</td>
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm text-gray-500">{formatNumber(result.see_informational_total)}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
