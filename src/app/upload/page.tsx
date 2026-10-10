'use client';

import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import {
    createLocalItem,
    getLocalSetting,
    listLocalItems,
    setLocalSetting,
    updateLocalItem,
    type Product,
    type ProductionProcess,
} from '@/lib/local-db';
import {
    parseActivityDataTemplate,
    type ActivityTemplateImportPlan,
    type ActivityTemplateImportSummary,
} from '@/lib/activity-data-template';
import { describeActivityImportIssues, importActivityWorkbook, ISSUE_LEVEL_LABEL, type ActivityImportIssue } from '@/lib/activity-import';
import {
    ACTIVITY_WORKBOOK_FILENAME,
    ACTIVITY_WORKBOOK_SAMPLE,
    ACTIVITY_WORKBOOK_SAMPLE_FILENAME,
    createActivityWorkbook,
    isActivityWorkbookV2,
    parseActivityWorkbook,
    readActivityWorkbookSheetNames,
} from '@/lib/activity-workbook';
import { ensureBundledReferences } from '@/lib/bundled-references';
import { downloadBlob } from '@/lib/eu-template-export';
import {
    displayReferenceCountry,
    findDefaultValueReference,
    parseBenchmarkWorkbook,
    parseDefaultValueWorkbook,
    type ImportedBenchmarkReference,
    type ImportedDefaultValueReference,
    type ReferenceWorkbookSummary,
} from '@/lib/reference-workbooks';
import {
    AlertTriangle,
    CheckCircle2,
    Database,
    Download,
    FileSpreadsheet,
    FileText,
    Upload as UploadIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useState } from 'react';

const uploadSteps = [
    { name: '공식 기준값 업로드', status: '사용 가능', tone: 'success' as const },
    { name: '활동자료 서식 (엑셀)', status: '사용 가능', tone: 'success' as const },
    { name: '활동자료 올리기', status: '사용 가능', tone: 'success' as const },
];

const emptyImportSummary: ActivityTemplateImportSummary = {
    products: 0,
    processes: 0,
    sourceStreams: 0,
    precursors: 0,
    skipped: 0,
};

function formatDateTime(value?: string) {
    if (!value) {
        return '미가져옴';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function normalizeKey(value?: string) {
    return (value ?? '').trim().toLowerCase();
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
                    <p className="mt-1 text-xs text-slate-500">{formatDateTime(summary.imported_at)}에 로컬 {summary.origin === 'bundled' ? '준비' : '저장'}</p>
                </div>
                <StatusBadge tone="success">{summary.origin === 'bundled' ? '앱 내장 EU 공표본' : '가져오기 완료'}</StatusBadge>
            </div>
            {summary.origin === 'bundled' && (
                <p className="mt-3 rounded-lg bg-white px-3 py-2 text-xs leading-5 text-slate-600 ring-1 ring-slate-200">
                    EU가 공표한 이 파일은 앱에 들어 있어 따로 가져오지 않아도 됩니다. 더 새 판이 나왔다면 위에서 직접 가져오세요 — 가져온 파일이 언제나 우선합니다.
                </p>
            )}
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

/**
 * 가져온 기본값 파일을 **앱 안에서** 조회한다. 종전에는 미리보기가 시멘트 5행뿐이라, 앱이 채운 기본값이
 * 파일 원본과 같은지 확인하려면 엑셀을 직접 열어야 했다(씨밤이 run11 P2-33).
 */
function DefaultValueLookup() {
    const [reference, setReference] = useState<ImportedDefaultValueReference>();
    const [country, setCountry] = useState('');
    const [cn, setCn] = useState('');

    useEffect(() => {
        getLocalSetting<ImportedDefaultValueReference>('reference:default-values').then(setReference);
    }, []);

    if (!reference) {
        return null;
    }

    const countries = Array.from(new Set(reference.rows.map((row) => row.country))).filter((name) => !name.startsWith('_')).sort((a, b) => a.localeCompare(b));
    const cnDigits = cn.replace(/\D/g, '');
    const match = country && cnDigits.length >= 4 ? findDefaultValueReference(reference, country, cnDigits, '2026') : undefined;
    // 워크북의 mark-up 값은 곱셈 결과라 꼬리가 붙는다(4.015000000000001). 6자리에서 끊어 보여준다.
    const show = (value?: number | null) => (value === undefined || value === null ? 'N/A' : String(Math.round(value * 1e6) / 1e6));

    return (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-sm font-semibold text-slate-900">기본값 조회 — 파일 원본 값 확인</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">전구물질 화면의 「기본값 채우기」가 넣는 값의 원본 행입니다. 국가와 CN(4자리 이상)을 넣으세요.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                <select aria-label="기본값 조회 국가" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" value={country} onChange={(event) => setCountry(event.target.value)}>
                    <option value="">— 국가 —</option>
                    {countries.map((name) => <option key={name} value={name}>{displayReferenceCountry(name)}</option>)}
                </select>
                <input aria-label="기본값 조회 CN 코드" className="h-11 rounded-xl border border-slate-200 px-3 text-sm" inputMode="numeric" value={cn} onChange={(event) => setCn(event.target.value)} placeholder="CN 코드 예: 72230019" />
            </div>
            {country && cnDigits.length >= 4 && !match && (
                <p className="mt-3 text-sm text-amber-700">{country} · CN {cnDigits}에 맞는 행이 없습니다. 파일은 4·6자리 행으로 묶여 있는 경우가 많습니다.</p>
            )}
            {match && (
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
                    <div><dt className="text-xs text-slate-500">매칭 행</dt><dd className="font-semibold text-slate-900">CN {match.cn_code}</dd></div>
                    <div><dt className="text-xs text-slate-500">직접</dt><dd className="font-semibold text-slate-900">{show(match.direct_default)}</dd></div>
                    <div><dt className="text-xs text-slate-500">간접</dt><dd className="font-semibold text-slate-900">{show(match.indirect_default)}</dd></div>
                    <div><dt className="text-xs text-slate-500">2026 (mark-up 포함)</dt><dd className="font-semibold text-slate-900">{show(match.markup_2026)}</dd></div>
                    <div><dt className="text-xs text-slate-500">2027</dt><dd className="font-semibold text-slate-900">{show(match.markup_2027)}</dd></div>
                    <div><dt className="text-xs text-slate-500">2028~</dt><dd className="font-semibold text-slate-900">{show(match.markup_2028_onwards)}</dd></div>
                </dl>
            )}
        </div>
    );
}

function ImportSummaryCard({ summary }: { summary: ActivityTemplateImportSummary }) {
    const total = summary.products + summary.processes + summary.sourceStreams + summary.precursors;

    if (total === 0 && summary.skipped === 0) {
        return null;
    }

    return (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">품목</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{summary.products}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">공정</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{summary.processes}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">배출원</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{summary.sourceStreams}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">전구물질</p>
                <p className="mt-1 text-xl font-semibold text-slate-950">{summary.precursors}</p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-xs text-amber-700">중복 재사용</p>
                <p className="mt-1 text-xl font-semibold text-amber-900">{summary.skipped}</p>
            </div>
        </div>
    );
}

async function applyActivityImportPlan(plan: ActivityTemplateImportPlan): Promise<ActivityTemplateImportSummary> {
    const summary = { ...emptyImportSummary };
    const [existingProducts, existingProcesses, existingSourceStreams, existingPrecursors] = await Promise.all([
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('source_streams'),
        listLocalItems('precursors'),
    ]);

    const productByName = new Map<string, Product>();
    const processByName = new Map<string, ProductionProcess>();
    const sourceStreamKeys = new Set<string>();
    const precursorKeys = new Set<string>();

    existingProducts.forEach((product) => productByName.set(normalizeKey(product.name), product));
    existingProcesses.forEach((process) => processByName.set(normalizeKey(process.name), process));
    existingSourceStreams.forEach((stream) => sourceStreamKeys.add(`${normalizeKey(stream.name)}::${stream.process_id ?? ''}`));
    existingPrecursors.forEach((precursor) => precursorKeys.add(`${normalizeKey(precursor.name)}::${precursor.product_id ?? ''}::${precursor.process_id ?? ''}`));

    for (const row of plan.products) {
        const key = normalizeKey(row.product_name);

        if (productByName.has(key)) {
            summary.skipped += 1;
            continue;
        }

        const product = await createLocalItem('products', {
            name: row.product_name,
            hs_code: row.hs_code,
            cn_code: row.cn_code,
            hs_group: row.hs_group,
            product_type_enum: row.product_type_enum,
            unit: row.unit,
            reporting_scope: row.reporting_scope ?? 'CBAM_GOOD',
        });

        productByName.set(key, product);
        summary.products += 1;
    }

    for (const row of plan.processes) {
        const key = normalizeKey(row.process_name);

        if (processByName.has(key)) {
            summary.skipped += 1;
            continue;
        }

        const process = await createLocalItem('processes', {
            product_id: productByName.get(normalizeKey(row.product_name))?.id,
            name: row.process_name,
            production_route: row.production_route,
            output_mass_t: row.output_mass_t,
            market_output_mass_t: row.market_output_mass_t,
            internal_consumption_mass_t: row.internal_consumption_mass_t,
            direct_attributable_emissions_tco2e: row.direct_attributable_emissions_tco2e,
            // 값의 출처를 남긴다 — 엔진은 수기 값과 같이 다루고, 보고서는 「템플릿 업로드」로 인쇄한다.
            direct_emissions_input_mode: 'TEMPLATE_UPLOAD',
            electricity_mwh: row.electricity_mwh,
            electricity_ef_tco2e_per_mwh: row.electricity_ef_tco2e_per_mwh,
            electricity_ef_source: row.electricity_ef_source,
        });

        processByName.set(key, process);
        summary.processes += 1;
    }

    for (const row of plan.sourceStreams) {
        const process = processByName.get(normalizeKey(row.process_name));
        const key = `${normalizeKey(row.source_stream_name)}::${process?.id ?? ''}`;

        if (sourceStreamKeys.has(key)) {
            summary.skipped += 1;
            continue;
        }

        await createLocalItem('source_streams', {
            process_id: process?.id,
            name: row.source_stream_name,
            stream_type: row.stream_type,
            method: row.method,
            activity_data: row.activity_data,
            activity_unit: row.activity_unit,
            ncv_gj_per_unit: row.ncv_gj_per_unit,
            emission_factor_tco2e_per_unit: row.emission_factor_tco2e_per_unit,
            emission_factor_basis: row.emission_factor_basis,
            oxidation_factor: row.oxidation_factor,
            conversion_factor: row.conversion_factor,
            fossil_fraction: row.fossil_fraction,
            biomass_fraction: row.biomass_fraction,
            factor_source_type: row.factor_source_type,
            source: row.source,
        });

        sourceStreamKeys.add(key);
        summary.sourceStreams += 1;
    }

    for (const row of plan.precursors) {
        const product = productByName.get(normalizeKey(row.product_name));
        const process = processByName.get(normalizeKey(row.process_name));
        const key = `${normalizeKey(row.precursor_name)}::${product?.id ?? ''}::${process?.id ?? ''}`;

        if (precursorKeys.has(key)) {
            summary.skipped += 1;
            continue;
        }

        await createLocalItem('precursors', {
            product_id: product?.id,
            process_id: process?.id,
            name: row.precursor_name,
            precursor_cn_code: row.precursor_cn_code,
            aggregated_goods_category: row.aggregated_goods_category,
            production_route: row.production_route,
            supplier_country: row.supplier_country,
            supplier_installation: row.supplier_installation,
            data_mode: row.data_mode,
            verification_status: row.verification_status,
            default_value_year: row.default_value_year,
            purchased_mass_t: row.purchased_mass_t,
            consumed_mass_t: row.consumed_mass_t,
            consumed_for_non_cbam_mass_t: row.consumed_for_non_cbam_mass_t,
            direct_see_tco2e_per_t: row.direct_see_tco2e_per_t,
            indirect_see_tco2e_per_t: row.indirect_see_tco2e_per_t,
            source: row.source,
            default_value_justification: row.default_value_justification,
        });

        precursorKeys.add(key);
        summary.precursors += 1;
    }

    return summary;
}

export default function UploadPage() {
    const [benchmarkSummary, setBenchmarkSummary] = useState<ReferenceWorkbookSummary | undefined>();
    const [defaultValueSummary, setDefaultValueSummary] = useState<ReferenceWorkbookSummary | undefined>();
    const [referenceMessage, setReferenceMessage] = useState('');
    const [referenceError, setReferenceError] = useState('');
    const [activityMessage, setActivityMessage] = useState('');
    const [activityError, setActivityError] = useState('');
    const [activityWarnings, setActivityWarnings] = useState<string[]>([]);
    const [activitySummary, setActivitySummary] = useState<ActivityTemplateImportSummary>(emptyImportSummary);
    const [activityIssues, setActivityIssues] = useState<ActivityImportIssue[] | null>(null);
    const [issuesCopied, setIssuesCopied] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [isActivityImporting, setIsActivityImporting] = useState(false);

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

    /** 서식의 「원료를 만든 나라」 목록과 EU 기본값 채우기에 쓰는 기본값표. 아직 없으면 앱 내장본을 먼저 넣는다. */
    async function loadDefaultValues() {
        const saved = await getLocalSetting<ImportedDefaultValueReference>('reference:default-values');
        if (saved) return saved;
        await ensureBundledReferences().catch(() => undefined);
        return getLocalSetting<ImportedDefaultValueReference>('reference:default-values');
    }

    async function handleDownloadActivityTemplate(sample: boolean) {
        const reference = await loadDefaultValues();
        const countries = Array.from(new Set((reference?.rows ?? []).map((row) => row.country)));
        downloadBlob(
            createActivityWorkbook({ countries, fill: sample ? ACTIVITY_WORKBOOK_SAMPLE : undefined }),
            sample ? ACTIVITY_WORKBOOK_SAMPLE_FILENAME : ACTIVITY_WORKBOOK_FILENAME
        );
        setActivityMessage(sample
            ? '작성 예시를 만들었습니다. 가상의 나사 공장 자료가 채워져 있으니 서식과 함께 보내 주세요.'
            : '활동자료 서식을 만들었습니다. 파일은 브라우저에서만 만들어지며 서버로 전송되지 않습니다.');
        setActivityError('');
    }

    async function handleCopyIssues() {
        if (!activityIssues) return;
        try {
            await navigator.clipboard.writeText(describeActivityImportIssues(activityIssues));
            setIssuesCopied(true);
        } catch {
            setIssuesCopied(false);
        }
    }

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

    async function handleActivityTemplateImport(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = '';

        if (!file) {
            return;
        }

        setActivityMessage('');
        setActivityError('');
        setActivityWarnings([]);
        setActivitySummary(emptyImportSummary);
        setActivityIssues(null);
        setIssuesCopied(false);
        setIsActivityImporting(true);

        try {
            // 새 서식(한글 7시트)과 종전 서식(영문 4시트)을 시트 이름으로 가린다. 종전 서식은 종전 경로 그대로다.
            const bytes = file.name.toLowerCase().endsWith('.xlsx') ? new Uint8Array(await file.arrayBuffer()) : undefined;
            if (bytes && isActivityWorkbookV2(readActivityWorkbookSheetNames(bytes))) {
                const result = await importActivityWorkbook(parseActivityWorkbook(bytes), {
                    store: { list: listLocalItems, create: createLocalItem, update: updateLocalItem },
                    defaultValues: await loadDefaultValues(),
                });
                const { created } = result;
                setActivitySummary({ products: created.products, processes: created.processes, sourceStreams: created.fuels, precursors: created.precursors, skipped: 0 });
                setActivityIssues(result.issues);
                setActivityMessage(`서식을 넣었습니다 — 사업장 ${created.installation} · 보고기간 ${created.period} · 제품 ${created.products} · 공정 ${created.processes} · 연료 ${created.fuels} · 구매 강재 ${created.precursors}건.`);
                return;
            }
            const plan = await parseActivityDataTemplate(file);
            const summary = await applyActivityImportPlan(plan);
            const total = summary.products + summary.processes + summary.sourceStreams + summary.precursors;

            setActivitySummary(summary);
            setActivityWarnings(plan.warnings);
            setActivityMessage(`활동자료 ${total.toLocaleString('ko-KR')}건을 로컬 DB에 추가했습니다. 같은 이름의 기존 품목/공정은 재사용했습니다.`);
        } catch (error) {
            setActivityError(error instanceof Error ? error.message : '활동자료 템플릿을 가져오지 못했습니다.');
        } finally {
            setIsActivityImporting(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="자료 수집"
                title="자료 업로드"
                description="활동자료와 공식 기준값 파일을 서버 전송 없이 브라우저에서 읽어 로컬 데이터로 저장합니다. EU Communication Template 원본은 Export 단계에서 별도로 업로드합니다."
            />

            <section className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <StatCard label="기준자료 세트" value={`${referenceStats.importedCount}/2`} helper="벤치마크, 기본값" icon={Database} tone={referenceStats.importedCount === 2 ? 'success' : 'pending'} />
                <StatCard label="저장된 기준자료" value={referenceStats.rowCount.toLocaleString('ko-KR')} helper="브라우저 로컬 DB" icon={FileSpreadsheet} tone="info" />
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
                        <DefaultValueLookup key={defaultValueSummary?.imported_at ?? 'none'} />
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <SectionCard
                    title="활동자료 서식 내려받기"
                    description="업체의 한 해 자료를 한 파일에 받아 오는 엑셀 서식입니다. 채운 파일을 아래에 올리면 지도 1~6단계가 한 번에 채워집니다."
                >
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <div className="flex items-start gap-3">
                            <div className="rounded-xl bg-white p-3 text-teal-700 ring-1 ring-slate-200">
                                <FileText className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="font-semibold text-slate-950">활동자료 서식 (엑셀)</h2>
                                    <StatusBadge tone="success">사용 가능</StatusBadge>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    사업장·보고기간, 제품, 공정, 연료, 구매 강재 시트가 있습니다. 칸마다 무엇을 어디서 보고 적는지 설명과 예시가 있고,
                                    연료 종류·공정 이름 등은 목록에서 고릅니다. 한 고지서를 여러 공정이 같이 쓰면 공장 전체 값만 적으면 됩니다 — 앱이 나눕니다.
                                </p>
                                <div className="mt-4 flex flex-wrap gap-2">
                                    <Button type="button" variant="secondary" onClick={() => void handleDownloadActivityTemplate(false)}>
                                        <Download className="mr-2 h-4 w-4" />
                                        빈 서식 내려받기
                                    </Button>
                                    <Button type="button" variant="secondary" onClick={() => void handleDownloadActivityTemplate(true)}>
                                        <Download className="mr-2 h-4 w-4" />
                                        작성 예시 내려받기
                                    </Button>
                                </div>
                                <p className="mt-3 text-xs leading-5 text-slate-500">
                                    파일은 브라우저에서 만들어지며 회사 자료는 서버로 전송되지 않습니다. 예전 서식(영문 4시트)으로 받은 파일도 그대로 올릴 수 있습니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="업로드 상태" description="현재 화면에서 동작하는 업로드와 이후 단계 기능을 구분합니다.">
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

            <SectionCard
                title="활동자료 업로드"
                description="채운 서식을 올리면 사업장·보고기간·제품·공정·연료·구매 강재가 한 번에 들어갑니다. 한 업체의 자료를 처음 넣을 때는 지도의 「새 프로젝트」에서 시작하세요."
                actions={
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-teal-600">
                        <UploadIcon className="mr-2 h-4 w-4" />
                        파일 선택
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            disabled={isActivityImporting}
                            onChange={handleActivityTemplateImport}
                        />
                    </label>
                }
            >
                <div className="rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-6 py-8">
                    <div className="mx-auto flex max-w-3xl flex-col items-center text-center">
                        <UploadIcon className="h-12 w-12 text-slate-400" />
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <span className="text-sm font-semibold text-slate-800">
                                {isActivityImporting ? '활동자료를 가져오는 중' : '채운 활동자료 서식 올리기'}
                            </span>
                            <StatusBadge tone="success">로컬 파싱</StatusBadge>
                        </div>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
                            올린 파일은 서버로 전송하지 않습니다. 빠지거나 틀린 칸은 넣지 않고 아래 「확인할 것」에 시트와 줄 번호로 알려 드립니다 — 그대로 복사해 서식을 채운 분께 보낼 수 있습니다.
                        </p>
                    </div>

                    {(activityMessage || activityError || activityWarnings.length > 0 || activityIssues) && (
                        <div className="mt-6 space-y-3">
                            {activityMessage && (
                                <div className="flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                                    <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" />
                                    <span>{activityMessage}</span>
                                </div>
                            )}
                            {activityError && (
                                <div className="flex gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                                    <span>{activityError}</span>
                                </div>
                            )}
                            {activityWarnings.length > 0 && (
                                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    <div className="flex gap-2 font-semibold">
                                        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                                        확인이 필요한 행
                                    </div>
                                    <ul className="mt-2 list-disc space-y-1 pl-6">
                                        {activityWarnings.slice(0, 6).map((warning) => (
                                            <li key={warning}>{warning}</li>
                                        ))}
                                    </ul>
                                    {activityWarnings.length > 6 && (
                                        <p className="mt-2">외 {activityWarnings.length - 6}건의 경고가 더 있습니다.</p>
                                    )}
                                </div>
                            )}
                            <ImportSummaryCard summary={activitySummary} />
                            {activityIssues && (
                                <div className="rounded-2xl border border-slate-200 bg-white p-4 text-left" data-testid="activity-issues">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-sm font-semibold text-slate-900">
                                            확인할 것 {activityIssues.length}건
                                            {activityIssues.length > 0 && (
                                                <span className="ml-2 font-normal text-slate-500">
                                                    넣지 못함 {activityIssues.filter((issue) => issue.level === 'error').length} · 확인 필요 {activityIssues.filter((issue) => issue.level === 'warning').length} · 참고 {activityIssues.filter((issue) => issue.level === 'info').length}
                                                </span>
                                            )}
                                        </p>
                                        {activityIssues.length > 0 && (
                                            <Button type="button" variant="secondary" onClick={() => void handleCopyIssues()}>
                                                {issuesCopied ? '복사했습니다' : '목록 복사 (채운 분께 보내기)'}
                                            </Button>
                                        )}
                                    </div>
                                    {activityIssues.some((issue) => issue.level === 'error') && (
                                        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-900" data-testid="activity-issues-alert">
                                            넣지 못한 줄이 있습니다. 그 자료가 빠진 채로 계산되므로 결과가 실제와 다를 수 있습니다 — 아래 항목을 고쳐 다시 올리거나 지도에서 직접 입력하세요.
                                        </p>
                                    )}
                                    {activityIssues.length === 0 ? (
                                        <p className="mt-2 text-sm text-slate-600">서식에서 빠지거나 틀린 칸을 찾지 못했습니다.</p>
                                    ) : (
                                        <ul className="mt-3 space-y-2">
                                            {activityIssues.map((issue, index) => (
                                                <li key={index} className="flex items-start gap-2 text-sm leading-6 text-slate-700" data-testid="activity-issue" data-level={issue.level}>
                                                    <span className={`mt-0.5 flex-none rounded-full px-2 py-0.5 text-xs font-bold ${issue.level === 'error' ? 'bg-red-100 text-red-800' : issue.level === 'warning' ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-600'}`}>
                                                        {ISSUE_LEVEL_LABEL[issue.level]}
                                                    </span>
                                                    <span className="min-w-0">
                                                        <b className="text-slate-900">{issue.sheet}{issue.row ? ` ${issue.row}번째 줄` : ''}</b> — {issue.message}
                                                    </span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                    <p className="mt-3 text-sm text-slate-600">
                                        넣은 자료는 <Link href="/" className="font-bold text-teal-700 hover:underline">지도</Link>에서 확인하고, 남은 일은 <Link href="/todo" className="font-bold text-teal-700 hover:underline">할 일</Link>과 <Link href="/submit" className="font-bold text-teal-700 hover:underline">제출</Link> 화면에서 이어 가세요.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </SectionCard>
        </div>
    );
}
