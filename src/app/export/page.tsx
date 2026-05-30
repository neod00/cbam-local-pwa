'use client';

import { Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    createEuExportFilename,
    createEuTemplateExportCellWrites,
    createEuTemplateExportCopyResult,
    downloadBlob,
    evaluateEuExportReadiness,
    REQUIRED_EU_TEMPLATE_SHEETS,
    validateEuTemplateFile,
    type EuExportReadinessIssue,
    type EuTemplateValidationResult,
} from '@/lib/eu-template-export';
import {
    listLocalItems,
    seedLocalData,
    type Installation,
    type Product,
    type ProductionProcess,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import { AlertTriangle, CheckCircle2, Circle, Download, FileCheck2, FileSpreadsheet, PackageCheck, ShieldCheck, Workflow } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type ExportChecklistItem = {
    label: string;
    description: string;
    status: string;
    tone: 'success' | 'warning' | 'danger' | 'pending';
    complete: boolean;
};

type LastExportResult = {
    filename: string;
    generatedAt: string;
    checkedCellCount: number;
    writtenCellCount: number;
};

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 4,
    }).format(value);
}

function getIssueEditHref(issue: EuExportReadinessIssue) {
    if (!issue.target) {
        return undefined;
    }

    const encodedId = encodeURIComponent(issue.target.id);

    if (issue.target.type === 'product') {
        return `/products?edit=${encodedId}`;
    }

    if (issue.target.type === 'process') {
        return `/processes?edit=${encodedId}`;
    }

    if (issue.target.type === 'sourceStream') {
        return `/source-streams?edit=${encodedId}`;
    }

    return `/precursors?edit=${encodedId}`;
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
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [exportError, setExportError] = useState('');
    const [lastExportResult, setLastExportResult] = useState<LastExportResult | undefined>();

    useEffect(() => {
        async function loadPreviewData() {
            await seedLocalData();
            const [installations, periods, processes, sourceStreams, precursors, products] = await Promise.all([
                listLocalItems('installations'),
                listLocalItems('periods'),
                listLocalItems('processes'),
                listLocalItems('source_streams'),
                listLocalItems('precursors'),
                listLocalItems('products'),
            ]);

            setInstallations(installations);
            setPeriods(periods);
            setProcesses(processes);
            setSourceStreams(sourceStreams);
            setPrecursors(precursors);
            setProducts(products);
            setResults(calculateLocalResults({ processes, precursors, products, periods, sourceStreams }));
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
        () => evaluateEuExportReadiness({ processes, sourceStreams, precursors, products }, validation?.cnCodeMap),
        [processes, sourceStreams, precursors, products, validation?.cnCodeMap]
    );

    const plannedCellWrites = useMemo(
        () => createEuTemplateExportCellWrites({ installations, periods, processes, sourceStreams, precursors, products }, validation?.cnCodeMap),
        [installations, periods, processes, sourceStreams, precursors, products, validation?.cnCodeMap]
    );

    const exportChecklist = useMemo<ExportChecklistItem[]>(
        () => [
            {
                label: '산정 데이터 준비',
                description:
                    results.length > 0
                        ? `${results.length}개 공정의 산정 미리보기를 확인했습니다.`
                        : '제품과 생산공정 데이터를 입력하면 산정 미리보기가 생성됩니다.',
                status: results.length > 0 ? '완료' : '확인 필요',
                tone: results.length > 0 ? 'success' : 'warning',
                complete: results.length > 0,
            },
            {
                label: 'EU 원본 템플릿 선택',
                description: templateFile ? templateFile.name : '최신 EU Communication template 파일을 선택하세요.',
                status: templateFile ? '완료' : '대기',
                tone: templateFile ? 'success' : 'pending',
                complete: Boolean(templateFile),
            },
            {
                label: '템플릿 구조 검증',
                description: validation?.isValid
                    ? `필수 시트 ${REQUIRED_EU_TEMPLATE_SHEETS.length}개와 CN 코드 ${validation.cnCodeCount}개를 확인했습니다.`
                    : validation
                      ? `${validation.missingSheets.length}개 필수 시트가 누락되었습니다.`
                      : '템플릿을 선택하면 공식 시트와 CN 코드 목록을 확인합니다.',
                status: validation?.isValid ? '완료' : validation ? '오류' : '대기',
                tone: validation?.isValid ? 'success' : validation ? 'danger' : 'pending',
                complete: Boolean(validation?.isValid),
            },
            {
                label: 'Export 오류 해결',
                description:
                    readiness.errorCount === 0
                        ? '다운로드를 막는 오류 항목이 없습니다.'
                        : `${readiness.errorCount}개 오류를 먼저 수정해야 합니다.`,
                status: readiness.errorCount === 0 ? '완료' : '오류',
                tone: readiness.errorCount === 0 ? 'success' : 'danger',
                complete: readiness.errorCount === 0,
            },
            {
                label: '경고 항목 검토',
                description:
                    readiness.warningCount === 0
                        ? '추가 검토 경고가 없습니다.'
                        : `${readiness.warningCount}개 경고가 있습니다. 제출 전 검토가 필요합니다.`,
                status: readiness.warningCount === 0 ? '완료' : '확인 필요',
                tone: readiness.warningCount === 0 ? 'success' : 'warning',
                complete: readiness.warningCount === 0,
            },
            {
                label: '반영 셀 검증',
                description: lastExportResult
                    ? `복사본 생성 중 ${lastExportResult.checkedCellCount}개 셀을 검증했습니다.`
                    : plannedCellWrites.length > 0
                      ? `D_Processes와 E_PurchPrec에 반영할 셀 ${plannedCellWrites.length}개를 생성 후 검증합니다.`
                      : '반영할 공정 또는 전구물질 데이터가 없습니다.',
                status: lastExportResult ? '완료' : plannedCellWrites.length > 0 ? '대기' : '확인 필요',
                tone: lastExportResult ? 'success' : plannedCellWrites.length > 0 ? 'pending' : 'warning',
                complete: Boolean(lastExportResult),
            },
        ],
        [lastExportResult, plannedCellWrites.length, readiness.errorCount, readiness.warningCount, results.length, templateFile, validation]
    );

    const downloadStatusMessage = useMemo(() => {
        if (!templateFile) {
            return 'EU 원본 템플릿을 먼저 선택하세요.';
        }

        if (!validation?.isValid) {
            return '선택한 템플릿의 공식 시트 구조를 확인해야 합니다.';
        }

        if (!readiness.canExportDraft) {
            return '오류 항목을 수정해야 복사본을 다운로드할 수 있습니다.';
        }

        if (!readiness.isSubmissionReady) {
            return '다운로드는 가능하지만 경고 항목은 제출 전 검토하세요.';
        }

        return '제출용 복사본을 생성할 수 있습니다.';
    }, [readiness.canExportDraft, readiness.isSubmissionReady, templateFile, validation?.isValid]);

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
                description="사용자가 보유한 EU 원본 Communication template을 브라우저에서만 검증하고, 원본 구조를 유지한 복사본을 생성합니다."
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="제품 수" value={summary.productCount} helper="Export 대상" icon={PackageCheck} tone="pending" />
                <StatCard label="공정 수" value={summary.processCount} helper="D_Processes 반영" icon={Workflow} tone="info" />
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
                                `CBAM Communication template for installations_en_20241213.xlsx` 같은 EU 원본
                                `.xlsx` 파일을 선택합니다. 파일은 서버로 전송되지 않습니다.
                            </p>
                        </div>
                    </div>

                    <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8 text-center hover:bg-teal-50">
                        <FileSpreadsheet className="h-10 w-10 text-teal-700" />
                        <span className="mt-3 text-sm font-semibold text-teal-800">
                            EU 원본 템플릿 파일 선택
                        </span>
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
                            선택된 파일: <span className="font-medium">{templateFile.name}</span>
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
                                            ? '필수 EU 시트가 모두 확인되었습니다.'
                                            : '필수 EU 시트 일부가 없습니다.'}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        확인된 시트 {validation.sheetNames.length}개 / 필수 시트{' '}
                                        {REQUIRED_EU_TEMPLATE_SHEETS.length}개
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
                                <StatusBadge tone={readiness.isSubmissionReady && validation?.isValid ? 'success' : 'warning'}>
                                    {readiness.isSubmissionReady && validation?.isValid ? '준비 완료' : '검토 필요'}
                                </StatusBadge>
                            </div>

                            <ul className="mt-4 space-y-3">
                                {exportChecklist.map((item) => {
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
                                    <li>업로드된 파일은 브라우저 메모리에서만 처리합니다.</li>
                                    <li>공식 시트명, 수식, 영문 라벨은 유지합니다.</li>
                                    <li>D_Processes와 E_PurchPrec 입력 셀에 현재 로컬 데이터를 반영합니다.</li>
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
                            제품군, CN/HS 코드, 생산공정/전구물질 연결 상태와 배출량 일관성을 Export 전에 확인합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <StatusBadge tone="danger">오류 {readiness.errorCount}</StatusBadge>
                        <StatusBadge tone="warning">경고 {readiness.warningCount}</StatusBadge>
                    </div>
                </div>

                {readiness.issues.length === 0 ? (
                    <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        현재 로컬 데이터는 Export 매핑 검토를 통과했습니다.
                    </div>
                ) : (
                    <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
                        {readiness.issues.map((issue, index) => {
                            const issueEditHref = getIssueEditHref(issue);

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
                                            <span className="font-medium text-gray-900">[{issue.area}]</span>{' '}
                                            <span className="text-gray-700">{issue.message}</span>
                                        </div>
                                        {issueEditHref && (
                                            <Link
                                                href={issueEditHref}
                                                className="mt-2 inline-flex min-h-9 items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                            >
                                                수정하기
                                            </Link>
                                        )}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
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
                                    Export 미리보기에 표시할 산정결과가 없습니다.
                                </td>
                            </tr>
                        ) : (
                            results.map((result) => (
                                <tr key={result.id}>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">
                                        {result.process_name}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">
                                        {result.product_name}
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
                                    <td className="whitespace-nowrap px-3 py-4 text-right text-sm font-semibold text-gray-900">
                                        {formatNumber(result.total_see)}
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
