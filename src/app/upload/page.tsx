'use client';

import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { getLocalSetting, setLocalSetting } from '@/lib/local-db';
import {
    parseBenchmarkWorkbook,
    parseDefaultValueWorkbook,
    type ImportedBenchmarkReference,
    type ImportedDefaultValueReference,
    type ReferenceWorkbookSummary,
} from '@/lib/reference-workbooks';
import { Database, FileSpreadsheet, FileText, Upload as UploadIcon } from 'lucide-react';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

const uploadSteps = [
    { name: '내부 활동자료 정리', status: '준비 중', tone: 'pending' as const },
    { name: '파일 구조 확인', status: '미연결', tone: 'neutral' as const },
    { name: '로컬 DB 반영', status: '향후 기능', tone: 'info' as const },
];

function formatDateTime(value?: string) {
    if (!value) {
        return '미가져옴';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function ReferenceSummaryCard({ summary }: { summary?: ReferenceWorkbookSummary }) {
    if (!summary) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                아직 가져온 기준자료가 없습니다.
            </div>
        );
    }

    return (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h3 className="text-sm font-semibold text-slate-950">{summary.filename}</h3>
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(summary.imported_at)}에 로컬 저장</p>
                </div>
                <StatusBadge tone="success">가져오기 완료</StatusBadge>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm lg:grid-cols-4">
                <div>
                    <dt className="text-xs text-slate-500">데이터 행</dt>
                    <dd className="font-semibold text-slate-900">{summary.row_count.toLocaleString('ko-KR')}</dd>
                </div>
                <div>
                    <dt className="text-xs text-slate-500">CN 코드</dt>
                    <dd className="font-semibold text-slate-900">{summary.cn_code_count.toLocaleString('ko-KR')}</dd>
                </div>
                <div>
                    <dt className="text-xs text-slate-500">시트 수</dt>
                    <dd className="font-semibold text-slate-900">{summary.sheet_names.length.toLocaleString('ko-KR')}</dd>
                </div>
                <div>
                    <dt className="text-xs text-slate-500">국가 수</dt>
                    <dd className="font-semibold text-slate-900">{summary.country_count?.toLocaleString('ko-KR') ?? '-'}</dd>
                </div>
            </dl>
            {summary.sample_rows.length > 0 && (
                <div className="mt-4 space-y-2">
                    {summary.sample_rows.map((row) => (
                        <div key={`${row.cn_code}-${row.detail}`} className="rounded-xl bg-white px-3 py-2 text-xs text-slate-600 ring-1 ring-slate-200">
                            <span className="font-semibold text-slate-900">{row.cn_code}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span>{row.description}</span>
                            <span className="mx-2 text-slate-300">/</span>
                            <span>{row.detail}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function UploadPage() {
    const [benchmarkSummary, setBenchmarkSummary] = useState<ReferenceWorkbookSummary | undefined>();
    const [defaultValueSummary, setDefaultValueSummary] = useState<ReferenceWorkbookSummary | undefined>();
    const [referenceMessage, setReferenceMessage] = useState('');
    const [referenceError, setReferenceError] = useState('');
    const [isImporting, setIsImporting] = useState(false);

    useEffect(() => {
        async function loadReferenceSummaries() {
            const [benchmarkReference, defaultValueReference] = await Promise.all([
                getLocalSetting<ImportedBenchmarkReference>('reference:benchmarks'),
                getLocalSetting<ImportedDefaultValueReference>('reference:default-values'),
            ]);

            setBenchmarkSummary(benchmarkReference?.summary);
            setDefaultValueSummary(defaultValueReference?.summary);
        }

        loadReferenceSummaries();
    }, []);

    const referenceStats = useMemo(() => {
        const importedCount = Number(Boolean(benchmarkSummary)) + Number(Boolean(defaultValueSummary));
        const rowCount = (benchmarkSummary?.row_count ?? 0) + (defaultValueSummary?.row_count ?? 0);

        return { importedCount, rowCount };
    }, [benchmarkSummary, defaultValueSummary]);

    async function handleBenchmarkImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setReferenceMessage('');
        setReferenceError('');
        setIsImporting(true);

        try {
            const imported = await parseBenchmarkWorkbook(file);
            await setLocalSetting('reference:benchmarks', imported);
            setBenchmarkSummary(imported.summary);
            setReferenceMessage(`벤치마크 기준값 ${imported.summary.row_count.toLocaleString('ko-KR')}행을 로컬에 저장했습니다.`);
        } catch (error) {
            setReferenceError(error instanceof Error ? error.message : '벤치마크 기준값을 가져오지 못했습니다.');
        } finally {
            setIsImporting(false);
        }
    }

    async function handleDefaultValueImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setReferenceMessage('');
        setReferenceError('');
        setIsImporting(true);

        try {
            const imported = await parseDefaultValueWorkbook(file);
            await setLocalSetting('reference:default-values', imported);
            setDefaultValueSummary(imported.summary);
            setReferenceMessage(`국가/CN 기본값 ${imported.summary.row_count.toLocaleString('ko-KR')}행을 로컬에 저장했습니다.`);
        } catch (error) {
            setReferenceError(error instanceof Error ? error.message : '국가/CN 기본값을 가져오지 못했습니다.');
        } finally {
            setIsImporting(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="자료 수집"
                title="자료 업로드"
                description="활동자료와 공식 기준값 파일을 서버 전송 없이 브라우저에서 읽어 로컬 데이터로 저장합니다. EU 제출용 원본 템플릿은 Export 단계에서 별도로 업로드합니다."
            />

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label="기준자료 세트" value={`${referenceStats.importedCount}/2`} helper="벤치마크, 기본값" icon={Database} tone={referenceStats.importedCount === 2 ? 'success' : 'pending'} />
                <StatCard label="저장된 기준행" value={referenceStats.rowCount.toLocaleString('ko-KR')} helper="브라우저 로컬 DB" icon={FileSpreadsheet} tone="info" />
                <StatCard label="서버 전송" value="없음" helper="파일은 이 기기에서만 처리" icon={UploadIcon} tone="success" />
            </section>

            {referenceMessage && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    {referenceMessage}
                </div>
            )}
            {referenceError && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                    {referenceError}
                </div>
            )}

            <SectionCard
                title="공식 기준값 가져오기"
                description="SEFA와 기본값 시나리오 계산을 위해 EU가 제공하는 최신 벤치마크 및 국가/CN 기본값 엑셀을 로컬 기준자료로 저장합니다."
            >
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="font-semibold text-slate-950">CBAM 벤치마크</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    `CBAMBenchmarks_*.xlsx` 파일을 가져와 Column A/B 기준값과 생산경로 지표를 저장합니다.
                                </p>
                            </div>
                            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-600">
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                파일 선택
                                <input
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="sr-only"
                                    disabled={isImporting}
                                    onChange={handleBenchmarkImport}
                                />
                            </label>
                        </div>
                        <ReferenceSummaryCard summary={benchmarkSummary} />
                    </div>

                    <div className="space-y-4">
                        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h2 className="font-semibold text-slate-950">국가/CN 기본값</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    `DVsasadopted_*.xlsx` 파일을 가져와 국가, CN 코드, 직접/간접/총 기본값과 연도별 마크업 값을 저장합니다.
                                </p>
                            </div>
                            <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-600">
                                <FileSpreadsheet className="mr-2 h-4 w-4" />
                                파일 선택
                                <input
                                    type="file"
                                    accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                    className="sr-only"
                                    disabled={isImporting}
                                    onChange={handleDefaultValueImport}
                                />
                            </label>
                        </div>
                        <ReferenceSummaryCard summary={defaultValueSummary} />
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <SectionCard title="1. 내부 템플릿 다운로드" description="사내 담당자에게 받을 생산량, 연료, 전력, 전구물질 자료를 정리하기 위한 내부 수집용 템플릿입니다.">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-white p-3 text-teal-700 ring-1 ring-slate-200">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div>
                                <h2 className="font-semibold text-slate-950">활동자료 수집 템플릿</h2>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    현재는 화면 구조만 준비되어 있습니다. 실제 다운로드 파일 생성은 이후 단계에서 연결합니다.
                                </p>
                                <Button type="button" variant="secondary" className="mt-4">
                                    <FileText className="mr-2 h-4 w-4" />
                                    엑셀 템플릿 다운로드
                                </Button>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="업로드 상태" description="파일 업로드 기능은 로컬 파싱 방식으로 확장할 예정입니다.">
                    <div className="space-y-3">
                        {uploadSteps.map((step) => (
                            <div key={step.name} className="flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                                <span className="text-sm font-semibold text-slate-800">{step.name}</span>
                                <StatusBadge tone={step.tone}>{step.status}</StatusBadge>
                            </div>
                        ))}
                    </div>
                </SectionCard>
            </div>

            <SectionCard title="2. 활동자료 업로드" description="파일은 서버로 전송하지 않고 브라우저에서 읽어 로컬 데이터로 변환하는 방향으로 구현합니다.">
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-10 text-center transition hover:bg-teal-50">
                    <UploadIcon className="h-12 w-12 text-teal-700" />
                    <span className="mt-4 text-sm font-semibold text-teal-800">파일 선택</span>
                    <span className="mt-1 text-sm text-slate-600">또는 이 영역으로 끌어다 놓기</span>
                    <span className="mt-2 text-xs text-slate-500">XLSX, CSV 최대 10MB</span>
                    <input id="file-upload" name="file-upload" type="file" className="sr-only" />
                </label>
            </SectionCard>
        </div>
    );
}
