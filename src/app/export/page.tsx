'use client';

import { calculateLocalResults, type LocalCalculationResult } from '@/lib/calculation-engine';
import {
    createEuExportFilename,
    createEuTemplateCopy,
    downloadBlob,
    REQUIRED_EU_TEMPLATE_SHEETS,
    validateEuTemplateFile,
    type EuTemplateValidationResult,
} from '@/lib/eu-template-export';
import { listLocalItems, seedLocalData } from '@/lib/local-db';
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

    useEffect(() => {
        async function loadPreviewData() {
            await seedLocalData();
            const [processes, precursors, products, periods] = await Promise.all([
                listLocalItems('processes'),
                listLocalItems('precursors'),
                listLocalItems('products'),
                listLocalItems('periods'),
            ]);

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

        const copy = await createEuTemplateCopy(templateFile);
        downloadBlob(copy, createEuExportFilename(templateFile.name));
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
                    <dd className="mt-1 text-3xl font-semibold text-gray-900">{summary.warningCount}</dd>
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
                        disabled={!validation?.isValid}
                        className="mt-5 inline-flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-gray-300"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        검증된 템플릿 복사본 다운로드
                    </button>
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
                                <li>데이터 주입은 검증된 입력 시트부터 단계적으로 확장합니다.</li>
                            </ul>
                        </div>
                    </div>
                </aside>
            </div>

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
