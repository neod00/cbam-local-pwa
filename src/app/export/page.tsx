'use client';

import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    createEuExportFilename,
    createEuTemplateExportCopy,
    downloadBlob,
    evaluateEuExportReadiness,
    REQUIRED_EU_TEMPLATE_SHEETS,
    validateEuTemplateFile,
    type EuTemplateValidationResult,
} from '@/lib/eu-template-export';
import { listLocalItems, seedLocalData, type Product, type ProductionProcess, type PurchasedPrecursor } from '@/lib/local-db';
import { AlertTriangle, Download, FileCheck2, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function formatNumber(value: number) {
    return new Intl.NumberFormat(undefined, {
        maximumFractionDigits: 4,
    }).format(value);
}

export default function ExportPage() {
    const [templateFile, setTemplateFile] = useState<File | undefined>();
    const [validation, setValidation] = useState<EuTemplateValidationResult | undefined>();
    const [validationError, setValidationError] = useState('');
    const [isValidating, setIsValidating] = useState(false);
    const [results, setResults] = useState<LocalCalculationResult[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [products, setProducts] = useState<Product[]>([]);
    const [exportError, setExportError] = useState('');

    useEffect(() => {
        async function loadPreviewData() {
            await seedLocalData();
            const [processes, precursors, products, periods] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
            ]);

            setProcesses(processes);
            setPrecursors(precursors);
            setProducts(products);
            setResults(calculateLocalResults({ processes, precursors, products, periods }));
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
        () => evaluateEuExportReadiness({ processes, precursors, products }),
        [processes, precursors, products]
    );

    async function handleTemplateFileChange(file: File | undefined) {
        setTemplateFile(file);
        setValidation(undefined);
        setValidationError('');

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

        try {
            const copy = await createEuTemplateExportCopy(templateFile, {
                processes,
                precursors,
                products,
            });
            downloadBlob(copy, createEuExportFilename(templateFile.name));
        } catch (error) {
            setExportError(error instanceof Error ? error.message : 'EU 템플릿 Export 중 오류가 발생했습니다.');
        }
    }

    return (
        <div>
            <div>
                <h1 className="text-2xl font-bold text-gray-900">EU 템플릿 Export</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    사용자가 보유한 EU 원본 Communication template을 브라우저에서만 검증하고, 원본 구조를
                    유지한 복사본을 생성합니다. 공식 시트명과 수식은 한국어로 바꾸지 않습니다.
                </p>
            </div>

            <dl className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">제품 수</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">{summary.productCount}</dd>
                </div>
                <div className="overflow-hidden rounded-lg bg-white px-4 py-5 shadow sm:p-6">
                    <dt className="truncate text-sm font-medium text-gray-500">공정 수</dt>
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
                    <dt className="truncate text-sm font-medium text-gray-500">검토 경고</dt>
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">
                        {summary.warningCount + readiness.warningCount}
                    </dd>
                    <dd className="text-xs text-gray-400">산정 + Export</dd>
                </div>
            </dl>

            <div className="mt-8 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start gap-3">
                        <FileSpreadsheet className="mt-1 h-5 w-5 text-blue-600" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">EU 원본 템플릿 선택</h2>
                            <p className="mt-1 text-sm text-gray-600">
                                `CBAM Communication template for installations_en_20241213.xlsx` 같은 EU 원본
                                `.xlsx` 파일을 선택합니다. 파일은 서버로 전송되지 않습니다.
                            </p>
                        </div>
                    </div>

                    <label className="mt-5 flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 px-6 py-8 text-center hover:bg-gray-100">
                        <FileSpreadsheet className="h-10 w-10 text-gray-400" />
                        <span className="mt-3 text-sm font-medium text-blue-700">
                            EU 원본 템플릿 파일 선택
                        </span>
                        <span className="mt-1 text-xs text-gray-500">XLSX 파일만 지원</span>
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            onChange={(event) => handleTemplateFileChange(event.target.files?.[0])}
                        />
                    </label>

                    {templateFile && (
                        <div className="mt-4 rounded-md bg-gray-50 px-4 py-3 text-sm text-gray-700">
                            선택된 파일: <span className="font-medium">{templateFile.name}</span>
                        </div>
                    )}

                    {isValidating && (
                        <div className="mt-4 rounded-md bg-blue-50 px-4 py-3 text-sm text-blue-800">
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
                                    ? 'mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3'
                                    : 'mt-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3'
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

                    <button
                        type="button"
                        onClick={handleDownloadCopy}
                        disabled={!validation?.isValid || !readiness.canExportDraft}
                        className="mt-5 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        산정 데이터가 반영된 복사본 다운로드
                    </button>

                    {exportError && (
                        <div className="mt-4 flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                            <span>{exportError}</span>
                        </div>
                    )}
                </section>

                <aside className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 text-emerald-600" />
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900">Export 원칙</h2>
                            <ul className="mt-3 space-y-3 text-sm text-gray-600">
                                <li>원본 EU 템플릿 파일은 앱에 내장하지 않습니다.</li>
                                <li>업로드된 파일은 브라우저 메모리에서만 처리합니다.</li>
                                <li>공식 시트명, 수식, 영문 라벨은 유지합니다.</li>
                                <li>D_Processes와 E_PurchPrec 입력 셀에 현재 로컬 데이터를 반영합니다.</li>
                            </ul>
                        </div>
                    </div>
                </aside>
            </div>

            <section className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">EU 코드 매핑 검토</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            제품군, CN/HS 코드, 생산공정/전구물질 연결 상태를 Export 전에 확인합니다.
                        </p>
                    </div>
                    <div className="flex gap-2">
                        <span className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                            오류 {readiness.errorCount}
                        </span>
                        <span className="inline-flex rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700 ring-1 ring-inset ring-amber-600/20">
                            경고 {readiness.warningCount}
                        </span>
                    </div>
                </div>

                {readiness.issues.length === 0 ? (
                    <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        현재 로컬 데이터는 Export 매핑 검토를 통과했습니다.
                    </div>
                ) : (
                    <ul className="mt-4 divide-y divide-gray-100 rounded-md border border-gray-200">
                        {readiness.issues.map((issue, index) => (
                            <li key={`${issue.area}-${issue.message}-${index}`} className="flex gap-3 px-4 py-3 text-sm">
                                <AlertTriangle
                                    className={
                                        issue.severity === 'error'
                                            ? 'mt-0.5 h-4 w-4 flex-shrink-0 text-red-600'
                                            : 'mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600'
                                    }
                                />
                                <div>
                                    <span className="font-medium text-gray-900">[{issue.area}]</span>{' '}
                                    <span className="text-gray-700">{issue.message}</span>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            <div className="mt-8 overflow-hidden rounded-lg bg-white shadow ring-1 ring-black ring-opacity-5">
                <table className="min-w-full divide-y divide-gray-300">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">공정</th>
                            <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">생산량(t)</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">직접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">간접 SEE</th>
                            <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">총 SEE</th>
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
            </div>
        </div>
    );
}
