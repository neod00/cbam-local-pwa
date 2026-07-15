'use client';

import { Button, StatusBadge } from '@/components/ui';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { getCbamCoverage } from '@/lib/cbam-product-rules';
import { CN_CODE_OPTIONS } from '@/lib/cn-code-options';
import {
    createEuExportFilename,
    createEuTemplateExportCopyResult,
    DEFAULT_EU_TEMPLATE_VERSION,
    downloadBlob,
    getEuExportIssueEditHref,
    loadDefaultEuTemplateFile,
    validateEuTemplateFile,
    type EuExportReadinessIssue,
} from '@/lib/eu-template-export';
import type { GuidedStepId, GuidedStepState } from '@/lib/guided-map';
import {
    createLocalItem,
    deleteLocalItem,
    getLocalSetting,
    updateLocalItem,
    type Installation,
    type Product,
    type ProductionProcess,
    type ProductOutputLine,
    type PurchasedPrecursor,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import {
    findDefaultValueReference,
    getDefaultValueTotalForYear,
    type ImportedDefaultValueReference,
} from '@/lib/reference-workbooks';
import { getProductReportingScope, isCbamReportingScope } from '@/lib/reporting-scope';
import type { SeeFlowBinding } from '@/lib/see-flow';
import { calculateSourceStreamEmissions } from '@/lib/source-stream-calculation';
import { AlertTriangle, ArrowRight, CheckCircle2, ChevronDown, ExternalLink, Lock, Pencil, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

export interface GuidedData {
    loaded: boolean;
    installations: Installation[];
    periods: ReportingPeriod[];
    products: Product[];
    processes: ProductionProcess[];
    productOutputLines: ProductOutputLine[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    results: LocalCalculationResult[];
    exportIssues: EuExportReadinessIssue[];
    exportErrorCount: number;
    exportWarningCount: number;
}

interface PanelProps {
    data: GuidedData;
    steps: GuidedStepState[];
    selectedProcessId: string;
    binding: SeeFlowBinding;
    onSaved: () => Promise<void> | void;
    onSelectStep: (id: GuidedStepId) => void;
}

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

const num = (value: string) => {
    const parsed = Number(String(value).replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};

const fmt = (value: number, digits = 2) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

function nextStepId(steps: GuidedStepState[], current: GuidedStepId): GuidedStepId | null {
    const ordered = [...steps].sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((step) => step.id === current);
    for (let i = index + 1; i < ordered.length; i++) {
        if (ordered[i].status !== 'done') {
            return ordered[i].id;
        }
    }
    return null;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
    return (
        <label className="block text-sm">
            <span className="font-semibold text-slate-800">{label}</span>
            {children}
            {hint && <span className="mt-1 block text-xs leading-5 text-slate-500">{hint}</span>}
        </label>
    );
}

function PanelShell({
    step,
    description,
    backstage,
    children,
}: {
    step: GuidedStepState;
    description: string;
    backstage?: { href: string; label: string };
    children: ReactNode;
}) {
    return (
        <section className="rounded-2xl border border-teal-200 bg-white p-5 shadow-sm" aria-label={`${step.order}단계 ${step.title} 입력 패널`}>
            <div className="flex items-start justify-between gap-3">
                <div>
                    <span className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-bold text-teal-800">
                        {step.order}단계 · {step.title}
                    </span>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
                </div>
                {backstage && (
                    <Link
                        href={backstage.href}
                        className="inline-flex flex-none items-center gap-1 whitespace-nowrap text-xs font-semibold text-slate-500 transition hover:text-teal-700"
                    >
                        {backstage.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>
            <div className="mt-4 space-y-4">{children}</div>
        </section>
    );
}

function SavedNotice({
    message,
    next,
    onSelectStep,
}: {
    message: string;
    next: GuidedStepId | null;
    onSelectStep: (id: GuidedStepId) => void;
}) {
    return (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            <span className="inline-flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 flex-none" />
                {message}
            </span>
            {next && (
                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => onSelectStep(next)}>
                    다음 단계로
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
            )}
        </div>
    );
}

function pickProcess(data: GuidedData, selectedProcessId: string): ProductionProcess | undefined {
    if (selectedProcessId !== 'ALL') {
        return data.processes.find((process) => process.id === selectedProcessId) ?? data.processes[0];
    }
    return data.processes[0];
}

function ProcessSelect({
    data,
    value,
    onChange,
}: {
    data: GuidedData;
    value: string;
    onChange: (id: string) => void;
}) {
    if (data.processes.length <= 1) {
        return null;
    }
    return (
        <Field label="어느 공정에 넣을까요?">
            <select className={fieldClass} value={value} onChange={(event) => onChange(event.target.value)}>
                {data.processes.map((process) => (
                    <option key={process.id} value={process.id}>{process.name}</option>
                ))}
            </select>
        </Field>
    );
}

// ── 1단계: 사업장·보고기간 ─────────────────────────────────────────────
function SetupPanel({ data, steps, onSaved, onSelectStep }: PanelProps) {
    const installation = data.installations[0];
    const period = data.periods[0];
    const [instName, setInstName] = useState('');
    const [country, setCountry] = useState('KR');
    const [periodName, setPeriodName] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);
    const year = new Date().getFullYear();

    const applyPreset = (name: string, start: string, end: string) => {
        setPeriodName(name);
        setStartDate(start);
        setEndDate(end);
    };

    const saveInstallation = async () => {
        if (!instName.trim()) {
            setMessage('회사·공장 이름을 입력하세요.');
            return;
        }
        if (!/^[A-Za-z]{2}$/.test(country.trim())) {
            setMessage('국가는 2자리 코드로 입력하세요 (예: KR).');
            return;
        }
        await createLocalItem('installations', { name: instName.trim(), country: country.trim().toUpperCase() });
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    const savePeriod = async () => {
        if (!periodName.trim() || !startDate || !endDate) {
            setMessage('보고기간 이름과 시작·종료일을 입력하세요.');
            return;
        }
        if (endDate < startDate) {
            setMessage('종료일이 시작일보다 빠릅니다.');
            return;
        }
        await createLocalItem('periods', { name: periodName.trim(), start_date: startDate, end_date: endDate, status: 'DRAFT' });
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    return (
        <>
            {installation ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
                    <span className="font-semibold">사업장:</span> {installation.local_name || installation.name} ({installation.country})
                </div>
            ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">우리 공장 정보</p>
                    <Field label="회사·공장 이름" hint="예: 한국강선 김포공장">
                        <input className={fieldClass} value={instName} onChange={(event) => setInstName(event.target.value)} placeholder="한국강선 김포공장" />
                    </Field>
                    <Field label="국가 (2자리)">
                        <input className={fieldClass} value={country} onChange={(event) => setCountry(event.target.value)} maxLength={2} />
                    </Field>
                    <Button type="button" onClick={saveInstallation}>사업장 저장</Button>
                </div>
            )}

            {period ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3 text-sm text-emerald-900">
                    <span className="font-semibold">보고기간:</span> {period.name} ({period.start_date} ~ {period.end_date})
                </div>
            ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">보고기간</p>
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => applyPreset(`${year}년 연간`, `${year}-01-01`, `${year}-12-31`)}>
                            {year}년 연간
                        </Button>
                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => applyPreset(`${year}년 상반기`, `${year}-01-01`, `${year}-06-30`)}>
                            상반기
                        </Button>
                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => applyPreset(`${year}년 하반기`, `${year}-07-01`, `${year}-12-31`)}>
                            하반기
                        </Button>
                    </div>
                    <Field label="기간 이름">
                        <input className={fieldClass} value={periodName} onChange={(event) => setPeriodName(event.target.value)} placeholder={`${year}년 연간`} />
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label="시작일">
                            <input type="date" className={fieldClass} value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                        </Field>
                        <Field label="종료일">
                            <input type="date" className={fieldClass} value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                        </Field>
                    </div>
                    <Button type="button" onClick={savePeriod}>보고기간 저장</Button>
                </div>
            )}

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && installation && period && (
                <SavedNotice message="기본 설정이 끝났습니다." next={nextStepId(steps, 'setup')} onSelectStep={onSelectStep} />
            )}
        </>
    );
}

// ── 2단계: 제품·CN ────────────────────────────────────────────────────
function ProductsPanel({ data, steps, onSaved, onSelectStep }: PanelProps) {
    const [name, setName] = useState('');
    const [cn, setCn] = useState('');
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);
    const reportingProducts = data.products.filter((product) => isCbamReportingScope(getProductReportingScope(product)));
    const cnDigits = cn.replace(/\D/g, '');
    const coverage = cnDigits.length >= 4 ? getCbamCoverage({ cn_code: cnDigits, hs_code: cnDigits.slice(0, 4) }) : null;

    const addProduct = async () => {
        if (!name.trim()) {
            setMessage('제품 이름을 입력하세요.');
            return;
        }
        if (cnDigits.length !== 8) {
            setMessage('CN 코드는 8자리 숫자입니다. 목록에서 골라도 됩니다.');
            return;
        }
        await createLocalItem('products', {
            installation_id: data.installations[0]?.id,
            name: name.trim(),
            hs_code: cnDigits.slice(0, 4),
            cn_code: cnDigits,
            hs_group: cnDigits.slice(0, 2),
            product_type_enum: `HS${cnDigits.slice(0, 2)}_OTHER`,
            unit: 'tonne',
            reporting_scope: 'CBAM_GOOD',
        });
        setName('');
        setCn('');
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    return (
        <>
            {reportingProducts.length > 0 && (
                <ul className="space-y-2">
                    {reportingProducts.map((product) => {
                        const productCoverage = getCbamCoverage(product);
                        const tone = productCoverage.status === 'COVERED' ? 'success' : productCoverage.status === 'NOT_COVERED' ? 'danger' : 'warning';
                        return (
                            <li key={product.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                                <span className="min-w-0 truncate font-semibold text-slate-900">
                                    {product.name}
                                    <span className="ml-2 font-normal text-slate-500">CN {product.cn_code || '미입력'}</span>
                                </span>
                                <StatusBadge tone={tone}>{productCoverage.label}</StatusBadge>
                            </li>
                        );
                    })}
                </ul>
            )}

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                    <Plus className="mr-1 inline h-4 w-4" />
                    수출 제품 추가
                </p>
                <Field label="제품 이름" hint="예: 아연도금 강선">
                    <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="아연도금 강선" />
                </Field>
                <Field label="CN 코드 (8자리)" hint="수출 신고필증·인보이스의 HS 코드 8자리와 같습니다.">
                    <input className={fieldClass} value={cn} onChange={(event) => setCn(event.target.value)} list="guided-cn-options" placeholder="72172010" />
                    <datalist id="guided-cn-options">
                        {CN_CODE_OPTIONS.map((option) => (
                            <option key={option.code} value={option.code}>{option.labelKo}</option>
                        ))}
                    </datalist>
                </Field>
                {coverage && (
                    <div className={`rounded-lg px-3 py-2 text-xs leading-5 ${
                        coverage.status === 'COVERED'
                            ? 'bg-emerald-50 text-emerald-900'
                            : coverage.status === 'NOT_COVERED'
                                ? 'bg-red-50 text-red-900'
                                : 'bg-amber-50 text-amber-900'
                    }`}>
                        {coverage.label} — {coverage.reason}
                    </div>
                )}
                <Button type="button" onClick={addProduct}>제품 추가</Button>
            </div>

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="제품을 추가했습니다. 더 추가하거나 다음으로 이동하세요." next={nextStepId(steps, 'products')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 3단계: 생산공정 (다제품 = 제품별 생산량 → 질량 기준 배분) ─────────
function ProcessPanel({ data, steps, onSaved, onSelectStep }: PanelProps) {
    const reportingProducts = data.products.filter((product) => isCbamReportingScope(getProductReportingScope(product)));
    const [editingProcessId, setEditingProcessId] = useState('');
    const [name, setName] = useState('');
    const [route, setRoute] = useState('');
    const [periodId, setPeriodId] = useState(data.periods[0]?.id ?? '');
    const [masses, setMasses] = useState<Record<string, string>>({});
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);

    const totalMass = reportingProducts.reduce((sum, product) => sum + num(masses[product.id] ?? ''), 0);

    const resetForm = () => {
        setEditingProcessId('');
        setName('');
        setRoute('');
        setMasses({});
        setMessage('');
    };

    // 목록의 공정을 클릭하면 값을 폼에 다시 로드해 그 자리에서 수정한다(지도 안에서 편집).
    const startEdit = (process: ProductionProcess) => {
        const massMap: Record<string, string> = {};
        data.productOutputLines
            .filter((line) => line.process_id === process.id)
            .forEach((line) => {
                if (line.product_id) massMap[line.product_id] = String(line.output_mass_t);
            });
        setEditingProcessId(process.id);
        setName(process.name);
        setRoute(process.production_route);
        setPeriodId(process.period_id ?? data.periods[0]?.id ?? '');
        setMasses(massMap);
        setMessage('');
        setSaved(false);
    };

    // 삭제는 백스테이지와 동일하게 하위 데이터(전구물질·배출원)가 연결돼 있으면 막는다.
    const removeProcess = async (process: ProductionProcess) => {
        const linkedPrecursors = data.precursors.filter((precursor) => precursor.process_id === process.id);
        const linkedSourceStreams = data.sourceStreams.filter((stream) => stream.process_id === process.id);
        if (linkedPrecursors.length > 0 || linkedSourceStreams.length > 0) {
            window.alert(
                `이 공정은 하위 데이터에 연결돼 있어 삭제할 수 없습니다.\n연결된 전구물질 ${linkedPrecursors.length}건 · 배출원 ${linkedSourceStreams.length}건\n먼저 ①연료·②전력·③전구물질에서 해당 자료를 지운 뒤 다시 시도하세요.`
            );
            return;
        }
        if (!window.confirm(`'${process.name}' 공정을 삭제할까요? 산정결과·EU 문서에서도 제외됩니다.`)) {
            return;
        }
        await Promise.all(
            data.productOutputLines
                .filter((line) => line.process_id === process.id)
                .map((line) => deleteLocalItem('product_output_lines', line.id))
        );
        await deleteLocalItem('processes', process.id);
        if (editingProcessId === process.id) resetForm();
        await onSaved();
    };

    const saveProcess = async () => {
        const activePeriodId = periodId || data.periods[0]?.id;
        if (!name.trim()) {
            setMessage('공정 이름을 입력하세요. 예: 신선·소둔 라인');
            return;
        }
        if (!activePeriodId) {
            setMessage('먼저 1단계에서 보고기간을 등록하세요.');
            return;
        }
        const lines = reportingProducts
            .map((product) => ({ product, mass: num(masses[product.id] ?? '') }))
            .filter((line) => line.mass > 0);
        if (lines.length === 0) {
            setMessage('이 공정에서 만든 제품의 생산량을 1개 이상 입력하세요.');
            return;
        }
        const primary = lines.reduce((best, line) => (line.mass > best.mass ? line : best), lines[0]);

        if (editingProcessId) {
            const existingProcess = data.processes.find((process) => process.id === editingProcessId);
            if (!existingProcess) {
                setMessage('수정할 공정을 찾지 못했습니다.');
                return;
            }
            const existingLines = data.productOutputLines.filter((line) => line.process_id === editingProcessId);
            const reportingIds = new Set(reportingProducts.map((product) => product.id));
            // 보고범위 밖(비CBAM 부산물 등) 라인은 폼에 없으므로 보존하고, 공정 총량에도 포함한다.
            const preservedOutsideMass = existingLines
                .filter((line) => !reportingIds.has(line.product_id ?? ''))
                .reduce((sum, line) => sum + line.output_mass_t, 0);
            // 보고범위 제품: 생산량>0이면 기존 라인 갱신 또는 신규, 0/공란이면 기존 라인 삭제(배분·비고는 보존).
            await Promise.all(
                reportingProducts.map((product) => {
                    const mass = num(masses[product.id] ?? '');
                    const existing = existingLines.find((line) => line.product_id === product.id);
                    if (mass > 0) {
                        if (existing) {
                            return updateLocalItem('product_output_lines', {
                                ...existing,
                                name: product.name,
                                output_mass_t: mass,
                                reporting_scope: getProductReportingScope(product),
                            });
                        }
                        return createLocalItem('product_output_lines', {
                            process_id: editingProcessId,
                            product_id: product.id,
                            name: product.name,
                            output_mass_t: mass,
                            allocation_basis: 'MASS' as const,
                            manual_allocation_percent: 100,
                            note: '',
                            reporting_scope: getProductReportingScope(product),
                        });
                    }
                    return existing ? deleteLocalItem('product_output_lines', existing.id) : Promise.resolve();
                })
            );
            await updateLocalItem('processes', {
                ...existingProcess,
                period_id: activePeriodId,
                product_id: primary.product.id,
                name: name.trim(),
                production_route: route.trim() || existingProcess.production_route || '가공(압연·신선·열처리)',
                output_mass_t: totalMass + preservedOutsideMass,
            });
        } else {
            const process = await createLocalItem('processes', {
                period_id: activePeriodId,
                product_id: primary.product.id,
                name: name.trim(),
                production_route: route.trim() || '가공(압연·신선·열처리)',
                output_mass_t: totalMass,
                market_output_mass_t: 0,
                internal_consumption_mass_t: 0,
                direct_attributable_emissions_tco2e: 0,
                electricity_mwh: 0,
                electricity_ef_tco2e_per_mwh: 0.47,
                electricity_ef_source: undefined,
            });
            await Promise.all(lines.map((line) => createLocalItem('product_output_lines', {
                process_id: process.id,
                product_id: line.product.id,
                name: line.product.name,
                output_mass_t: line.mass,
                allocation_basis: 'MASS' as const,
                manual_allocation_percent: 100,
                note: '',
                reporting_scope: getProductReportingScope(line.product),
            })));
        }
        resetForm();
        setSaved(true);
        await onSaved();
    };

    return (
        <>
            {data.processes.length > 0 && (
                <ul className="space-y-2">
                    {data.processes.map((process) => {
                        const lines = data.productOutputLines.filter((line) => line.process_id === process.id);
                        const isEditing = editingProcessId === process.id;
                        return (
                            <li
                                key={process.id}
                                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-sm ${isEditing ? 'border-teal-400 bg-teal-50' : 'border-slate-200 bg-white'}`}
                            >
                                <span className="min-w-0 truncate">
                                    <span className="font-semibold text-slate-900">{process.name}</span>
                                    <span className="ml-2 text-slate-500">
                                        {fmt(process.output_mass_t, 1)} t · 제품 {lines.length > 0 ? lines.length : 1}개
                                    </span>
                                </span>
                                <span className="flex flex-none items-center gap-1">
                                    <button type="button" aria-label={`${process.name} 수정`} onClick={() => startEdit(process)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-teal-700">
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button type="button" aria-label={`${process.name} 삭제`} onClick={() => removeProcess(process)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-red-600">
                                        <Trash2 className="h-4 w-4" />
                                    </button>
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}

            {reportingProducts.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    먼저 2단계에서 제품을 등록하세요.
                    <Button type="button" variant="secondary" className="ml-3 min-h-9 px-3 py-1.5" onClick={() => onSelectStep('products')}>
                        2단계로
                    </Button>
                </div>
            ) : (
                <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-800">
                        {editingProcessId ? <Pencil className="mr-1 inline h-4 w-4" /> : <Plus className="mr-1 inline h-4 w-4" />}
                        {editingProcessId ? '공정 수정' : '공정 추가'}
                    </p>
                    <Field label="공정 이름" hint="설비 묶음 하나면 충분합니다. 예: 신선·소둔 라인">
                        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="신선·소둔 라인" />
                    </Field>
                    <Field label="생산 방식 (선택)">
                        <input className={fieldClass} value={route} onChange={(event) => setRoute(event.target.value)} placeholder="가공(압연·신선·열처리)" />
                    </Field>
                    {data.periods.length > 1 && (
                        <Field label="보고기간">
                            <select className={fieldClass} value={periodId} onChange={(event) => setPeriodId(event.target.value)}>
                                {data.periods.map((period) => (
                                    <option key={period.id} value={period.id}>{period.name}</option>
                                ))}
                            </select>
                        </Field>
                    )}
                    <div className="space-y-2">
                        <p className="text-sm font-semibold text-slate-800">이 공정에서 만든 제품별 생산량 (t)</p>
                        <p className="text-xs leading-5 text-slate-500">여러 제품을 같은 라인에서 만들면 각각 적으세요 — 배출량이 생산량 비율로 자동 배분됩니다.</p>
                        {reportingProducts.map((product) => (
                            <div key={product.id} className="flex items-center gap-3">
                                <span className="w-40 flex-none truncate text-sm text-slate-700">{product.name}</span>
                                <input
                                    className={fieldClass}
                                    inputMode="decimal"
                                    value={masses[product.id] ?? ''}
                                    onChange={(event) => setMasses((current) => ({ ...current, [product.id]: event.target.value }))}
                                    placeholder="0"
                                />
                            </div>
                        ))}
                        {totalMass > 0 && <p className="text-xs font-semibold text-slate-600">합계 {fmt(totalMass, 1)} t</p>}
                    </div>
                    <div className="flex gap-2">
                        <Button type="button" onClick={saveProcess}>{editingProcessId ? '수정 저장' : '공정 저장'}</Button>
                        {editingProcessId && (
                            <Button type="button" variant="secondary" onClick={resetForm}>취소</Button>
                        )}
                    </div>
                </div>
            )}

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="공정을 저장했습니다." next={nextStepId(steps, 'process')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 4단계: ① 연료 연소 (배출원) ──────────────────────────────────────
const FUEL_PRESETS = [
    {
        key: 'city-gas',
        label: '도시가스 (LNG)',
        activity_unit: 'Nm3',
        ncv_gj_per_unit: 0.037,
        emission_factor_tco2e_per_unit: 56.1,
        factor_source_type: 'NATIONAL_INVENTORY' as const,
        source: '도시가스 고지서 사용량 합계',
    },
    {
        key: 'fuel-generic',
        label: '기타 연료 (경유 등, t)',
        activity_unit: 't',
        ncv_gj_per_unit: 48,
        emission_factor_tco2e_per_unit: 73,
        factor_source_type: 'EU_OR_IPCC_DEFAULT' as const,
        source: '연료 구매대장 사용량 합계',
    },
];

async function syncProcessDirectEmissions(process: ProductionProcess, streams: SourceStream[]) {
    const total = streams
        .filter((stream) => stream.process_id === process.id)
        .reduce((sum, stream) => sum + calculateSourceStreamEmissions(stream), 0);
    await updateLocalItem('processes', { ...process, direct_attributable_emissions_tco2e: total });
}

function FuelPanel({ data, steps, selectedProcessId, onSaved, onSelectStep }: PanelProps) {
    const [processId, setProcessId] = useState(pickProcess(data, selectedProcessId)?.id ?? '');
    const process = data.processes.find((item) => item.id === processId) ?? pickProcess(data, selectedProcessId);
    const [presetKey, setPresetKey] = useState(FUEL_PRESETS[0].key);
    const [amount, setAmount] = useState('');
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);
    const preset = FUEL_PRESETS.find((item) => item.key === presetKey) ?? FUEL_PRESETS[0];
    const processStreams = useMemo(
        () => data.sourceStreams.filter((stream) => stream.process_id === process?.id),
        [data.sourceStreams, process?.id]
    );

    if (!process) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                먼저 3단계에서 생산공정을 등록하세요.
                <Button type="button" variant="secondary" className="ml-3 min-h-9 px-3 py-1.5" onClick={() => onSelectStep('process')}>
                    3단계로
                </Button>
            </div>
        );
    }

    const addFuel = async () => {
        const activityData = num(amount);
        if (activityData <= 0) {
            setMessage('사용량을 입력하세요. 고지서의 연간 합계를 그대로 적으면 됩니다.');
            return;
        }
        const created = await createLocalItem('source_streams', {
            period_id: process.period_id,
            process_id: process.id,
            name: preset.label,
            stream_type: 'FUEL' as const,
            method: 'Combustion',
            activity_data: activityData,
            activity_unit: preset.activity_unit,
            ncv_gj_per_unit: preset.ncv_gj_per_unit,
            emission_factor_tco2e_per_unit: preset.emission_factor_tco2e_per_unit,
            emission_factor_basis: 'PER_TJ' as const,
            oxidation_factor: 1,
            conversion_factor: 1,
            fossil_fraction: 1,
            biomass_fraction: 0,
            factor_source_type: preset.factor_source_type,
            source: preset.source,
        });
        await syncProcessDirectEmissions(process, [...data.sourceStreams, created]);
        setAmount('');
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    const removeStream = async (stream: SourceStream) => {
        if (!window.confirm(`${stream.name} 배출원을 삭제할까요?`)) {
            return;
        }
        await deleteLocalItem('source_streams', stream.id);
        await syncProcessDirectEmissions(process, data.sourceStreams.filter((item) => item.id !== stream.id));
        await onSaved();
    };

    return (
        <>
            <ProcessSelect data={data} value={process.id} onChange={setProcessId} />

            {processStreams.length > 0 && (
                <ul className="space-y-2">
                    {processStreams.map((stream) => (
                        <li key={stream.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                            <span className="min-w-0 truncate">
                                <span className="font-semibold text-slate-900">{stream.name}</span>
                                <span className="ml-2 text-slate-500">
                                    {fmt(stream.activity_data, 1)} {stream.activity_unit} → {fmt(calculateSourceStreamEmissions(stream))} tCO₂e
                                </span>
                            </span>
                            <button type="button" aria-label={`${stream.name} 삭제`} onClick={() => removeStream(stream)} className="flex-none text-slate-400 transition hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                    <Plus className="mr-1 inline h-4 w-4" />
                    고지서에서 옮겨 적기
                </p>
                <Field label="연료 종류">
                    <select className={fieldClass} value={presetKey} onChange={(event) => setPresetKey(event.target.value)}>
                        {FUEL_PRESETS.map((item) => (
                            <option key={item.key} value={item.key}>{item.label}</option>
                        ))}
                    </select>
                </Field>
                <Field
                    label={`연간 사용량 (${preset.activity_unit})`}
                    hint={preset.key === 'city-gas' ? '도시가스 고지서의 사용량(Nm³) 12개월 합계' : '연료 구매대장의 연간 사용량(t)'}
                >
                    <input className={fieldClass} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="128400" />
                </Field>
                <p className="text-xs leading-5 text-slate-500">
                    발열량·배출계수는 표준값이 자동 적용됩니다. 자가 측정값이 있거나 공정 원료·물질수지가 필요하면 상세 입력을 이용하세요.
                </p>
                <Button type="button" onClick={addFuel}>배출원 저장</Button>
            </div>

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="저장했습니다. 지도의 ① 상자에 반영됩니다." next={nextStepId(steps, 'fuel')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 5단계: ② 전력 ────────────────────────────────────────────────────
const ELECTRICITY_EF_SOURCES = [
    { value: 'COUNTRY_GRID_DEFAULT', label: '국가/지역 계통 평균 기본값 (Commission/IEA)' },
    { value: 'DIRECT_TECHNICAL_LINK', label: '발전설비 직접 기술적 연결 (실측)' },
    { value: 'PPA', label: '전력구매계약(PPA) (실측)' },
    { value: 'INSTALLATION_OWN', label: '설비 내 자가발전' },
    { value: 'MIX', label: '혼합(Mix)' },
];

function ElectricityPanel({ data, steps, selectedProcessId, onSaved, onSelectStep }: PanelProps) {
    const initial = pickProcess(data, selectedProcessId);
    const [processId, setProcessId] = useState(initial?.id ?? '');
    const process = data.processes.find((item) => item.id === processId) ?? initial;
    const [mwh, setMwh] = useState(process && process.electricity_mwh > 0 ? String(process.electricity_mwh) : '');
    const [ef, setEf] = useState(process ? String(process.electricity_ef_tco2e_per_mwh || 0.47) : '0.47');
    const [efSource, setEfSource] = useState(process?.electricity_ef_source ?? 'COUNTRY_GRID_DEFAULT');
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);

    if (!process) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                먼저 3단계에서 생산공정을 등록하세요.
                <Button type="button" variant="secondary" className="ml-3 min-h-9 px-3 py-1.5" onClick={() => onSelectStep('process')}>
                    3단계로
                </Button>
            </div>
        );
    }

    const saveElectricity = async () => {
        const electricityMwh = num(mwh);
        const electricityEf = num(ef);
        if (electricityMwh <= 0) {
            setMessage('전력 사용량(MWh)을 입력하세요. 전기요금 고지서의 연간 kWh ÷ 1,000 입니다.');
            return;
        }
        if (electricityEf <= 0) {
            setMessage('전력 배출계수를 입력하세요. 모르면 국가 기본계수를 쓰되 출처·연도를 확인하세요(임의로 낮추지 마세요).');
            return;
        }
        await updateLocalItem('processes', {
            ...process,
            electricity_mwh: electricityMwh,
            electricity_ef_tco2e_per_mwh: electricityEf,
            electricity_ef_source: efSource || undefined,
        });
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    return (
        <>
            <ProcessSelect data={data} value={process.id} onChange={setProcessId} />

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <Field label="연간 전력 사용량 (MWh)" hint="전기요금 고지서의 12개월 사용량(kWh) 합계 ÷ 1,000">
                    <input className={fieldClass} inputMode="decimal" value={mwh} onChange={(event) => setMwh(event.target.value)} placeholder="500" />
                </Field>
                <Field label="전력 배출계수 (tCO₂e/MWh)" hint="국가 기본계수 또는 PPA·직접연결 실측만 인정됩니다. 녹색프리미엄으로 낮출 수 없습니다.">
                    <input className={fieldClass} inputMode="decimal" value={ef} onChange={(event) => setEf(event.target.value)} />
                </Field>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                    미리 채워진 0.47은 임시 국가계수 자리값입니다. 실제 적용할 계수의 공식 출처·연도(국가 기본계수 워크북 또는 PPA·직접연결 실측)를 확인해 입력하세요.
                </p>
                <Field label="계수 출처">
                    <select className={fieldClass} value={efSource} onChange={(event) => setEfSource(event.target.value)}>
                        {ELECTRICITY_EF_SOURCES.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                    </select>
                </Field>
                <Button type="button" onClick={saveElectricity}>전력 저장</Button>
            </div>

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="저장했습니다. 철강은 이 값이 인증서 계산에서 빠지지만 보고에는 꼭 들어갑니다." next={nextStepId(steps, 'electricity')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 6단계: ③ 전구물질 ────────────────────────────────────────────────
function PrecursorPanel({ data, steps, selectedProcessId, onSaved, onSelectStep }: PanelProps) {
    const initial = pickProcess(data, selectedProcessId);
    const [processId, setProcessId] = useState(initial?.id ?? '');
    const process = data.processes.find((item) => item.id === processId) ?? initial;
    const [name, setName] = useState('');
    const [cn, setCn] = useState('');
    const [consumed, setConsumed] = useState('');
    const [purchased, setPurchased] = useState('');
    const [directSee, setDirectSee] = useState('');
    const [indirectSee, setIndirectSee] = useState('');
    const [bridgeOpen, setBridgeOpen] = useState(false);
    const [indirectMwh, setIndirectMwh] = useState('');
    const [indirectFactor, setIndirectFactor] = useState('');
    const [source, setSource] = useState('');
    const [dataMode, setDataMode] = useState<PurchasedPrecursor['data_mode']>('ACTUAL');
    const [justification, setJustification] = useState('');
    const [allocMode, setAllocMode] = useState<'auto' | 'manual'>('auto');
    const [allocMasses, setAllocMasses] = useState<Record<string, string>>({});
    const [mixOpen, setMixOpen] = useState(false);
    const [mixRows, setMixRows] = useState<Array<{ supplier: string; mass: string; direct: string; indirect: string }>>([
        { supplier: '', mass: '', direct: '', indirect: '' },
        { supplier: '', mass: '', direct: '', indirect: '' },
    ]);
    const [detailOpen, setDetailOpen] = useState(false);
    const [supplierInstallation, setSupplierInstallation] = useState('');
    const [supplierRoute, setSupplierRoute] = useState('');
    const [supplierPeriod, setSupplierPeriod] = useState('');
    // ③ SAD 비교: 지금 입력한 실측값이 EU 공식 기본값보다 유리한지(=CBAM 비용이 낮은지) 판단.
    const [compareOpen, setCompareOpen] = useState(false);
    const [compareResult, setCompareResult] = useState<
        null | { defaultDirect: number; defaultIndirect: number; hasIndirect: boolean; matchLabel: string }
    >(null);
    const [compareMessage, setCompareMessage] = useState('');
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);
    const processPrecursors = useMemo(
        () => data.precursors.filter((precursor) => precursor.process_id === process?.id),
        [data.precursors, process?.id]
    );

    if (!process) {
        return (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                먼저 3단계에서 생산공정을 등록하세요.
                <Button type="button" variant="secondary" className="ml-3 min-h-9 px-3 py-1.5" onClick={() => onSelectStep('process')}>
                    3단계로
                </Button>
            </div>
        );
    }

    // 원료 CN이 스크랩·비대상이면 경고한다(고철 CN 7204 등은 전구물질이 아님).
    const precursorCnDigits = cn.replace(/\D/g, '');
    const precursorCoverage = precursorCnDigits.length >= 4
        ? getCbamCoverage({ cn_code: precursorCnDigits, hs_code: precursorCnDigits.slice(0, 4) })
        : null;

    // ④ 다수 공급사 믹스: 같은 원료를 여러 공급사에서 구매한 경우, 소비량 가중평균 SEE를 한 줄에 채운다
    // (E_PurchPrec는 원료 1개당 한 블록에 SEE 하나를 기대하므로 가중평균이 올바른 형태).
    const mixTotalMass = mixRows.reduce((sum, row) => sum + num(row.mass), 0);
    const mixWeightedDirect = mixTotalMass > 0
        ? mixRows.reduce((sum, row) => sum + num(row.mass) * num(row.direct), 0) / mixTotalMass
        : 0;
    const mixWeightedIndirect = mixTotalMass > 0
        ? mixRows.reduce((sum, row) => sum + num(row.mass) * num(row.indirect), 0) / mixTotalMass
        : 0;
    const updateMixRow = (index: number, key: 'supplier' | 'mass' | 'direct' | 'indirect', value: string) =>
        setMixRows((rows) => rows.map((row, idx) => (idx === index ? { ...row, [key]: value } : row)));
    const applyMix = () => {
        if (mixTotalMass <= 0) {
            setMessage('공급사별 소비량을 입력하세요.');
            return;
        }
        // 설비별 추적성 보존: 각 공급사의 소비량·직접/간접 SEE를 출처에 함께 남긴다(Guidance는 설비별 상세 요구).
        const breakdown = mixRows
            .filter((row) => num(row.mass) > 0)
            .map((row) => `${row.supplier.trim() || '공급사'} ${fmt(num(row.mass), 1)}t(직접 ${row.direct || 0}·간접 ${row.indirect || 0})`)
            .join('; ');
        setConsumed(String(Math.round(mixTotalMass * 1000) / 1000));
        setDirectSee(String(Math.round(mixWeightedDirect * 1e6) / 1e6));
        setIndirectSee(String(Math.round(mixWeightedIndirect * 1e6) / 1e6));
        // 가중평균 간접값은 단일 SEE라 전력 분해가 무의미 — bridge 분해값을 비운다(export는 synthetic fallback).
        setIndirectMwh('');
        setIndirectFactor('');
        setSource(`공급사 믹스(소비량 가중평균) — ${breakdown}`);
        setMixOpen(false);
        setMessage('공급사 믹스를 소비량 가중평균해 위 칸에 채웠습니다. 값을 확인하고 저장하세요.');
    };

    // bridge: 간접 SEE를 전력사용량(MWh/t)×전력계수(tCO₂e/MWh)로 입력.
    // 공급사가 두 값을 따로 주면 실제 분해를 보존해 EU E_PurchPrec에 그대로 기재한다(검증 추적성).
    const bridgeUsage = num(indirectMwh);
    const bridgeFactor = num(indirectFactor);
    const bridgeIndirect = bridgeUsage * bridgeFactor;
    const applyBridge = () => {
        if (bridgeUsage <= 0 || bridgeFactor <= 0) {
            setMessage('전력사용량과 전력계수를 모두 입력하세요.');
            return;
        }
        setIndirectSee(String(Math.round(bridgeIndirect * 1e6) / 1e6));
        setBridgeOpen(false);
        setMessage('전력사용량×계수로 간접 SEE를 채웠습니다. EU 문서에 두 값이 그대로 기재됩니다.');
    };

    // ③ SAD 비교: 현재 CN의 EU 공식 기본값을 조회해 지금 실측값과 나란히 보여준다(비용 판단 보조).
    const runCompare = async () => {
        const cnDigits = cn.replace(/\D/g, '');
        if (cnDigits.length < 4) {
            setCompareMessage('먼저 원료 CN 코드(4자리 이상)를 입력하세요.');
            setCompareResult(null);
            return;
        }
        const reference = await getLocalSetting<ImportedDefaultValueReference>('reference:default-values');
        if (!reference) {
            setCompareMessage('공식 기본값 파일이 없습니다. 자료 업로드에서 EU 기본값(DVs)을 가져오면 비교할 수 있습니다.');
            setCompareResult(null);
            return;
        }
        const match = findDefaultValueReference(reference, 'South Korea', cnDigits, '2026');
        if (!match) {
            setCompareMessage(`CN ${cnDigits}에 맞는 공식 기본값을 찾지 못했습니다. CN을 확인하세요.`);
            setCompareResult(null);
            return;
        }
        const hasIndirect = match.indirect_default != null;
        const markedUpTotal = getDefaultValueTotalForYear(match, '2026') ?? match.total_default ?? match.direct_default ?? 0;
        setCompareResult({
            defaultDirect: hasIndirect ? (match.direct_default ?? 0) : markedUpTotal,
            defaultIndirect: match.indirect_default ?? 0,
            hasIndirect,
            matchLabel: `${match.country} / ${match.cn_code}`,
        });
        setCompareMessage('');
    };

    // 이 공정이 만드는 제품(생산라인). 2개 이상이면 전구물질을 제품별로 배분할 수 있다(E_PurchPrec (b) 구조).
    const outputLines = data.productOutputLines.filter(
        (line) => line.process_id === process.id && line.output_mass_t > 0
    );
    const hasMultipleProducts = outputLines.length > 1;
    const outputTotal = outputLines.reduce((sum, line) => sum + line.output_mass_t, 0);
    const allocSum = outputLines.reduce((sum, line) => sum + num(allocMasses[line.id] ?? ''), 0);
    const pillClass = (active: boolean) =>
        `min-h-8 rounded-full border px-3 text-xs font-bold transition ${
            active ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-teal-200'
        }`;

    // '제품별 직접 입력'으로 전환 시, 소비량을 생산량 비율로 미리 나눠 채워준다(사용자가 조정).
    const enableManualAllocation = () => {
        const consumedMass = num(consumed);
        const prefill: Record<string, string> = {};
        outputLines.forEach((line) => {
            const share = outputTotal > 0 ? line.output_mass_t / outputTotal : 0;
            prefill[line.id] = consumedMass > 0 ? String(Math.round(consumedMass * share * 1000) / 1000) : '';
        });
        setAllocMasses(prefill);
        setAllocMode('manual');
    };

    const applyDefaultValues = async () => {
        const cnDigits = cn.replace(/\D/g, '');
        const reference = await getLocalSetting<ImportedDefaultValueReference>('reference:default-values');
        if (!reference) {
            setDataMode('DEFAULT');
            setJustification('공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026) 적용 예정');
            setMessage('공식 기본값 파일이 아직 없습니다. 자료 업로드 화면에서 EU 기본값(DVs) 파일을 가져오면 자동으로 채워집니다.');
            return;
        }
        const match = findDefaultValueReference(reference, 'South Korea', cnDigits, '2026');
        if (!match) {
            setMessage(`CN ${cnDigits || '미입력'}에 맞는 기본값을 찾지 못했습니다. CN 코드를 확인하세요.`);
            return;
        }
        // 공식 DV의 간접값이 없으면(철강 DV는 대개 null) 없는 값을 markup 총액 − raw 직접으로
        // 만들어내지 않는다(허위 간접 방지). null이면 간접 0으로 두고 그 사실을 명시한다.
        const hasIndirect = match.indirect_default != null;
        const markedUpTotal = getDefaultValueTotalForYear(match, '2026') ?? match.total_default ?? match.direct_default ?? 0;
        const direct = hasIndirect ? (match.direct_default ?? 0) : markedUpTotal;
        const indirect = match.indirect_default ?? 0;
        setDirectSee(String(direct));
        setIndirectSee(String(indirect));
        setIndirectMwh('');
        setIndirectFactor('');
        setDataMode('DEFAULT');
        setJustification(
            `공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026, markup 포함) 적용. 직접 ${direct}`
            + (hasIndirect ? ` · 간접 ${indirect}` : ' · 이 CN의 공식 DV는 간접값 미제공(간접 0)')
        );
        setSource(`${reference.summary.filename} / ${match.country} / ${match.cn_code}`);
        setMessage(
            hasIndirect
                ? 'EU 기본값을 채웠습니다. 공급사 실측자료를 받으면 교체하세요.'
                : '이 CN의 공식 DV는 간접값을 제공하지 않아 간접을 0으로 두었습니다(직접값은 2026 markup 포함). 공급사 실측자료를 받으면 교체하세요.'
        );
    };

    const addPrecursor = async () => {
        const cnDigits = cn.replace(/\D/g, '');
        const consumedMass = num(consumed);
        if (!name.trim()) {
            setMessage('원료 이름을 입력하세요. 예: 선재(와이어로드)');
            return;
        }
        if (cnDigits.length < 4) {
            setMessage('원료의 CN 코드(4자리 이상)를 입력하세요.');
            return;
        }
        if (consumedMass <= 0) {
            setMessage('소비량(t)을 입력하세요. 만든 양이 아니라 이 공정에 투입한 양입니다.');
            return;
        }
        if (!source.trim()) {
            setMessage('SEE 값의 출처를 적어주세요. 예: 공급사 회신 메일, EU 기본값 파일');
            return;
        }
        if (dataMode === 'DEFAULT' && !justification.trim()) {
            setMessage('기본값 사용 사유를 적어주세요.');
            return;
        }
        // 제품별 직접 배분을 골랐으면 합계가 소비량과 맞아야 한다(엔진도 불일치 시 경고).
        let outputAllocations: PurchasedPrecursor['output_allocations'];
        if (hasMultipleProducts && allocMode === 'manual') {
            const tolerance = Math.max(0.01, consumedMass * 0.01);
            if (Math.abs(allocSum - consumedMass) > tolerance) {
                setMessage(`제품별 배분 합계(${fmt(allocSum, 1)} t)가 소비량(${fmt(consumedMass, 1)} t)과 다릅니다. 합계를 맞춰주세요.`);
                return;
            }
            outputAllocations = outputLines
                .map((line) => ({ product_output_line_id: line.id, allocated_mass_t: num(allocMasses[line.id] ?? '') }))
                .filter((allocation) => allocation.allocated_mass_t > 0);
        }
        await createLocalItem('precursors', {
            period_id: process.period_id,
            process_id: process.id,
            product_id: process.product_id,
            name: name.trim(),
            precursor_cn_code: cnDigits,
            aggregated_goods_category: 'Iron or steel products',
            production_route: supplierRoute.trim(),
            supplier_country: 'South Korea',
            supplier_installation: supplierInstallation.trim(),
            supplier_reporting_period: supplierPeriod.trim() || undefined,
            data_mode: dataMode,
            verification_status: 'UNVERIFIED' as const,
            default_value_year: '2026' as const,
            purchased_mass_t: num(purchased),
            consumed_mass_t: consumedMass,
            consumed_for_non_cbam_mass_t: 0,
            direct_see_tco2e_per_t: num(directSee),
            indirect_see_tco2e_per_t: num(indirectSee),
            indirect_electricity_mwh_per_t: bridgeUsage > 0 && bridgeFactor > 0 ? bridgeUsage : undefined,
            indirect_electricity_factor_tco2e_per_mwh: bridgeUsage > 0 && bridgeFactor > 0 ? bridgeFactor : undefined,
            source: source.trim(),
            default_value_justification: justification.trim(),
            output_allocations: outputAllocations,
        });
        setName('');
        setCn('');
        setConsumed('');
        setPurchased('');
        setDirectSee('');
        setIndirectSee('');
        setBridgeOpen(false);
        setIndirectMwh('');
        setIndirectFactor('');
        setSource('');
        setJustification('');
        setDataMode('ACTUAL');
        setAllocMode('auto');
        setAllocMasses({});
        setMixOpen(false);
        setMixRows([{ supplier: '', mass: '', direct: '', indirect: '' }, { supplier: '', mass: '', direct: '', indirect: '' }]);
        setDetailOpen(false);
        setSupplierInstallation('');
        setSupplierRoute('');
        setSupplierPeriod('');
        setCompareOpen(false);
        setCompareResult(null);
        setCompareMessage('');
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    const removePrecursor = async (precursor: PurchasedPrecursor) => {
        if (!window.confirm(`${precursor.name} 전구물질을 삭제할까요?`)) {
            return;
        }
        await deleteLocalItem('precursors', precursor.id);
        await onSaved();
    };

    // ③ SAD 비교 파생값(compareResult 있을 때만 의미): 실측 총 vs 기본값 총, t당·소비량 기준 차이.
    const compareActualTotal = num(directSee) + num(indirectSee);
    const compareDefaultTotal = compareResult ? compareResult.defaultDirect + compareResult.defaultIndirect : 0;
    const comparePerT = compareActualTotal - compareDefaultTotal; // 음수 = 입력값이 낮음 = 유리
    const compareTotalDelta = comparePerT * num(consumed);
    const compareFavorable = comparePerT < -1e-9;
    const compareWorse = comparePerT > 1e-9;
    // P3-run07-01: 라벨 중립화 — 실측 모드일 때만 "실측", 그 외(혼합·기본값)엔 "입력값"으로 표기.
    const compareEntryNoun = dataMode === 'ACTUAL' ? '실측' : '입력값';

    return (
        <>
            <ProcessSelect data={data} value={process.id} onChange={setProcessId} />

            {processPrecursors.length > 0 && (
                <ul className="space-y-2">
                    {processPrecursors.map((precursor) => (
                        <li key={precursor.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                            <span className="min-w-0 truncate">
                                <span className="font-semibold text-slate-900">{precursor.name}</span>
                                <span className="ml-2 text-slate-500">
                                    {fmt(precursor.consumed_mass_t, 1)} t · SEE {fmt(precursor.direct_see_tco2e_per_t)}+{fmt(precursor.indirect_see_tco2e_per_t)}
                                </span>
                            </span>
                            <button type="button" aria-label={`${precursor.name} 삭제`} onClick={() => removePrecursor(precursor)} className="flex-none text-slate-400 transition hover:text-red-600">
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                    <Plus className="mr-1 inline h-4 w-4" />
                    구매한 CBAM 원료 추가
                </p>
                <p className="text-xs leading-5 text-slate-500">
                    선재·빌릿처럼 CBAM 대상인 강재 원료만 해당합니다. 고철·스크랩(CN 7204)·윤활유·소모품 같은 비대상·부자재는 넣지 않습니다(내재배출 0).
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="원료 이름">
                        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="선재(와이어로드)" />
                    </Field>
                    <Field label="원료 CN 코드">
                        <input
                            className={fieldClass}
                            value={cn}
                            onChange={(event) => {
                                setCn(event.target.value);
                                setCompareResult(null);
                            }}
                            placeholder="72131000"
                        />
                    </Field>
                    {precursorCoverage?.status === 'NOT_COVERED' && (
                        <p className="col-span-2 rounded-lg bg-red-50 px-3 py-2 text-xs leading-5 text-red-900">
                            {precursorCoverage.reason}
                        </p>
                    )}
                    <Field label="소비량 (t)" hint="이 공정에 투입한 양">
                        <input className={fieldClass} inputMode="decimal" value={consumed} onChange={(event) => setConsumed(event.target.value)} placeholder="1050" />
                    </Field>
                    <Field label="구매량 (t, 선택)">
                        <input className={fieldClass} inputMode="decimal" value={purchased} onChange={(event) => setPurchased(event.target.value)} placeholder="1100" />
                    </Field>
                    <Field label="원료 SEE 직접분 (tCO₂e/t)">
                        <input className={fieldClass} inputMode="decimal" value={directSee} onChange={(event) => setDirectSee(event.target.value)} placeholder="1.80" />
                    </Field>
                    <Field label="원료 SEE 간접분 (tCO₂e/t)">
                        <input
                            className={fieldClass}
                            inputMode="decimal"
                            value={indirectSee}
                            onChange={(event) => {
                                // 수동 편집은 전력 분해를 무효화 — export는 synthetic fallback으로.
                                setIndirectSee(event.target.value);
                                setIndirectMwh('');
                                setIndirectFactor('');
                            }}
                            placeholder="0.30"
                        />
                    </Field>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <button
                        type="button"
                        onClick={() => setBridgeOpen((open) => !open)}
                        aria-expanded={bridgeOpen}
                        className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
                    >
                        간접분을 전력사용량×계수로 입력 (선택)
                        <ChevronDown className={`h-4 w-4 flex-none text-slate-400 transition ${bridgeOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {bridgeOpen && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs leading-5 text-slate-500">
                                공급사가 간접분을 전력사용량과 계수로 따로 줬다면 여기에 넣으세요. 곱해서 위 간접분 칸에 채우고, EU 문서에도 두 값이 그대로 기재됩니다(검증 대비). 한국 철강 기본값은 간접이 0이라 대개 비워둡니다.
                            </p>
                            <div className="grid grid-cols-2 gap-2">
                                <Field label="전력사용량 (MWh/t)">
                                    <input className={fieldClass} inputMode="decimal" value={indirectMwh} onChange={(event) => setIndirectMwh(event.target.value)} placeholder="0.346" />
                                </Field>
                                <Field label="전력계수 (tCO₂e/MWh)">
                                    <input className={fieldClass} inputMode="decimal" value={indirectFactor} onChange={(event) => setIndirectFactor(event.target.value)} placeholder="0.590" />
                                </Field>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-xs font-semibold text-slate-600">= 간접 SEE {fmt(bridgeIndirect, 4)} tCO₂e/t</span>
                                <Button type="button" variant="secondary" onClick={applyBridge}>간접분 칸에 채우기</Button>
                            </div>
                        </div>
                    )}
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <button
                        type="button"
                        onClick={() => setMixOpen((open) => !open)}
                        aria-expanded={mixOpen}
                        className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
                    >
                        여러 공급사에서 구매했어요 (가중 계산)
                        <ChevronDown className={`h-4 w-4 flex-none text-slate-400 transition ${mixOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {mixOpen && (
                        <div className="mt-3 space-y-2">
                            <p className="text-xs leading-5 text-slate-500">
                                같은 원료를 여러 공급사에서 구매했다면 각 공급사의 소비량·SEE를 넣으세요. 소비량 가중평균 SEE로 위 칸에 한 줄로 채워집니다.
                            </p>
                            {mixRows.map((row, index) => (
                                <div key={index} className="space-y-2 rounded-lg border border-slate-200 p-2">
                                    <div className="flex items-center gap-2">
                                        <input className={fieldClass} value={row.supplier} onChange={(event) => updateMixRow(index, 'supplier', event.target.value)} placeholder={`공급사 ${index + 1}`} />
                                        {mixRows.length > 1 && (
                                            <button type="button" aria-label="공급사 삭제" onClick={() => setMixRows((rows) => rows.filter((_, idx) => idx !== index))} className="flex-none text-slate-400 transition hover:text-red-600">
                                                <Trash2 className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                        <input className={fieldClass} inputMode="decimal" value={row.mass} onChange={(event) => updateMixRow(index, 'mass', event.target.value)} placeholder="소비량 t" />
                                        <input className={fieldClass} inputMode="decimal" value={row.direct} onChange={(event) => updateMixRow(index, 'direct', event.target.value)} placeholder="직접 SEE" />
                                        <input className={fieldClass} inputMode="decimal" value={row.indirect} onChange={(event) => updateMixRow(index, 'indirect', event.target.value)} placeholder="간접 SEE" />
                                    </div>
                                </div>
                            ))}
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <button type="button" onClick={() => setMixRows((rows) => [...rows, { supplier: '', mass: '', direct: '', indirect: '' }])} className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700">
                                    <Plus className="h-3.5 w-3.5" /> 공급사 추가
                                </button>
                                <span className="text-xs font-semibold text-slate-600">
                                    가중 직접 {fmt(mixWeightedDirect, 3)} · 간접 {fmt(mixWeightedIndirect, 3)} · 총 {fmt(mixTotalMass, 1)} t
                                </span>
                            </div>
                            <Button type="button" variant="secondary" onClick={applyMix}>가중값으로 위 칸에 채우기</Button>
                        </div>
                    )}
                </div>
                {hasMultipleProducts && (
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <p className="text-sm font-semibold text-slate-800">이 원료를 제품별로 어떻게 나눌까요?</p>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            이 공정은 제품이 {outputLines.length}개입니다. 원료가 제품마다 다르게 쓰이면 직접 나누세요(예: STS 선재는 STS 제품에만).
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            <button type="button" onClick={() => setAllocMode('auto')} className={pillClass(allocMode === 'auto')}>
                                생산량 비율로 자동
                            </button>
                            <button type="button" onClick={enableManualAllocation} className={pillClass(allocMode === 'manual')}>
                                제품별 직접 입력
                            </button>
                        </div>
                        {allocMode === 'manual' && (
                            <div className="mt-3 space-y-2">
                                {outputLines.map((line) => (
                                    <div key={line.id} className="flex items-center gap-3">
                                        <span className="w-40 flex-none truncate text-sm text-slate-700">{line.name}</span>
                                        <input
                                            className={fieldClass}
                                            inputMode="decimal"
                                            value={allocMasses[line.id] ?? ''}
                                            onChange={(event) => setAllocMasses((current) => ({ ...current, [line.id]: event.target.value }))}
                                            placeholder="0"
                                        />
                                        <span className="flex-none text-xs text-slate-500">t</span>
                                    </div>
                                ))}
                                <p className={`text-xs font-semibold ${Math.abs(allocSum - num(consumed)) > Math.max(0.01, num(consumed) * 0.01) ? 'text-amber-700' : 'text-emerald-700'}`}>
                                    배분 합계 {fmt(allocSum, 1)} t / 소비량 {fmt(num(consumed), 1)} t
                                </p>
                            </div>
                        )}
                    </div>
                )}
                <Button type="button" variant="secondary" onClick={applyDefaultValues}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    공급사 자료 없음 — EU 기본값 채우기
                </Button>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <button
                        type="button"
                        onClick={() => setCompareOpen((open) => !open)}
                        aria-expanded={compareOpen}
                        className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
                    >
                        실측 vs 기본값 비교 (비용 판단, 선택)
                        <ChevronDown className={`h-4 w-4 flex-none text-slate-400 transition ${compareOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {compareOpen && (
                        <div className="mt-3 space-y-3">
                            <p className="text-xs leading-5 text-slate-500">
                                지금 입력한 값이 EU 공식 기본값보다 유리한지(내재배출=CBAM 비용이 낮은지) 비교합니다. 기본값은 보수적으로 높게 잡히므로 실측이 유리한 경우가 많습니다.
                            </p>
                            <Button type="button" variant="secondary" onClick={runCompare}>기본값과 비교</Button>
                            {compareMessage && <p className="text-xs text-amber-700">{compareMessage}</p>}
                            {compareResult && (
                                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5">
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="rounded-md bg-white p-2">
                                            <p className="font-semibold text-slate-700">지금 {compareEntryNoun}</p>
                                            <p className="text-slate-500">직접 {fmt(num(directSee), 3)} · 간접 {fmt(num(indirectSee), 3)}</p>
                                            <p className="font-bold text-slate-900">총 {fmt(compareActualTotal, 3)}</p>
                                        </div>
                                        <div className="rounded-md bg-white p-2">
                                            <p className="font-semibold text-slate-700">EU 기본값</p>
                                            <p className="text-slate-500">
                                                직접 {fmt(compareResult.defaultDirect, 3)}
                                                {compareResult.hasIndirect ? ` · 간접 ${fmt(compareResult.defaultIndirect, 3)}` : ' · 간접 미제공(0)'}
                                            </p>
                                            <p className="font-bold text-slate-900">총 {fmt(compareDefaultTotal, 3)}</p>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-400">기본값 출처: {compareResult.matchLabel} (2026, markup 포함)</p>
                                    <p className={`rounded-md px-2 py-1.5 font-semibold ${compareFavorable ? 'bg-emerald-50 text-emerald-800' : compareWorse ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                                        {compareFavorable
                                            ? `${compareEntryNoun}이 t당 ${fmt(Math.abs(comparePerT), 3)} 낮습니다 — 유리. 실측 자료를 확보·유지하세요`
                                                + (num(consumed) > 0 ? ` (소비량 ${fmt(num(consumed), 1)}t 기준 총 ${fmt(Math.abs(compareTotalDelta), 2)} tCO₂e 절감).` : '.')
                                            : compareWorse
                                            ? `${compareEntryNoun}이 t당 ${fmt(comparePerT, 3)} 높습니다 — 기본값이 유리. 기본값 사용을 고려하세요`
                                                + (num(consumed) > 0 ? ` (총 ${fmt(Math.abs(compareTotalDelta), 2)} tCO₂e 차이).` : '.')
                                            : `${compareEntryNoun}과 기본값 차이가 거의 없습니다.`}
                                    </p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
                <Field label="자료 종류 (data mode)" hint="입력한 SEE가 실측인지 기본값인지 명시합니다 — 추적성에 중요합니다.">
                    <select className={fieldClass} value={dataMode} onChange={(event) => setDataMode(event.target.value as PurchasedPrecursor['data_mode'])}>
                        <option value="ACTUAL">공급사 실측 (actual)</option>
                        <option value="SEMI_ACTUAL">혼합 (semi-actual)</option>
                        <option value="DEFAULT">공식 기본값 (default)</option>
                    </select>
                </Field>
                {dataMode === 'ACTUAL' && (
                    <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                        실측(actual)으로 저장됩니다 — 공급사 회신 자료의 출처·날짜를 아래 &lsquo;SEE 출처&rsquo;에 꼭 남기세요.
                    </p>
                )}
                <Field label="SEE 출처" hint="예: 공급사 회신 메일(날짜), EU 기본값 파일">
                    <input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} placeholder="공급사 회신 메일 2026-05-02" />
                </Field>
                {dataMode === 'DEFAULT' && (
                    <Field label="기본값 사용 사유">
                        <input className={fieldClass} value={justification} onChange={(event) => setJustification(event.target.value)} />
                    </Field>
                )}
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <button
                        type="button"
                        onClick={() => setDetailOpen((open) => !open)}
                        aria-expanded={detailOpen}
                        className="flex w-full items-center justify-between text-sm font-semibold text-slate-800"
                    >
                        공급사 상세 (검증·제출용, 선택)
                        <ChevronDown className={`h-4 w-4 flex-none text-slate-400 transition ${detailOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {detailOpen && (
                        <div className="mt-3 space-y-3">
                            <p className="text-xs leading-5 text-slate-500">
                                제3자 검증·수입자 통신 단계에서 EU는 전구물질을 공급사(설비)별로 상세히 요구합니다. 초기 산정엔 선택이지만 채워두면 추적성이 강해집니다.
                            </p>
                            <Field label="공급사 설비명·식별정보">
                                <input className={fieldClass} value={supplierInstallation} onChange={(event) => setSupplierInstallation(event.target.value)} placeholder="예: OO제철 △△공장" />
                            </Field>
                            <Field label="공급사 생산경로">
                                <input className={fieldClass} value={supplierRoute} onChange={(event) => setSupplierRoute(event.target.value)} placeholder="예: BF-BOF / EAF / (C)" />
                            </Field>
                            <Field label="공급사 보고기간" hint="기본은 유럽 역년(2026-01-01~12-31). 공급사 기간이 다르면 적으세요.">
                                <input className={fieldClass} value={supplierPeriod} onChange={(event) => setSupplierPeriod(event.target.value)} placeholder="2026-01-01 ~ 2026-12-31" />
                            </Field>
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500">
                                지불 탄소가격은 EU 수입자(신고인)가 정산 단계에서 반영합니다 — 이 앱(가공사)의 범위 밖이라 여기서 입력하지 않습니다.
                            </p>
                        </div>
                    )}
                </div>
                <Button type="button" onClick={addPrecursor}>원료 저장</Button>
            </div>

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="저장했습니다. 원료가 지니고 온 배출이 지도에 더해집니다." next={nextStepId(steps, 'precursors')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 7단계: 검증·결과 ─────────────────────────────────────────────────
function ResultsPanel({ data, binding, selectedProcessId, onSelectStep }: PanelProps) {
    // 실데이터가 없으면 예시 수치를 결과처럼 보여주지 않고 빈 상태를 렌더한다.
    if (binding.isExample) {
        return (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
                아직 계산할 데이터가 없습니다. ①②③ 단계를 입력하면 여기에 우리 회사 결과가 표시됩니다.
            </div>
        );
    }

    const scopedResults = selectedProcessId === 'ALL'
        ? data.results
        : data.results.filter((result) => result.process_id === selectedProcessId);
    const warningMessages = Array.from(new Set(scopedResults.flatMap((result) => result.warnings))).slice(0, 5);
    const issues = data.exportIssues.slice(0, 5);

    return (
        <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-emerald-50 p-3 text-center">
                    <p className="text-xs font-semibold text-emerald-800">CBAM 산정 기준</p>
                    <p className="mt-1 text-xl font-bold text-emerald-900">
                        {binding.seeCbamBasis === null ? '—' : fmt(binding.seeCbamBasis, 3)}
                    </p>
                    <p className="text-[11px] text-emerald-700">tCO₂e/t</p>
                </div>
                <div className="rounded-xl bg-indigo-50 p-3 text-center">
                    <p className="text-xs font-semibold text-indigo-800">간접 (보고용)</p>
                    <p className="mt-1 text-xl font-bold text-indigo-900">{fmt(binding.seeIndirect, 3)}</p>
                    <p className="text-[11px] text-indigo-700">tCO₂e/t</p>
                </div>
                <div className="rounded-xl bg-slate-100 p-3 text-center">
                    <p className="text-xs font-semibold text-slate-600">총 SEE (검토용)</p>
                    <p className="mt-1 text-xl font-bold text-slate-900">{fmt(binding.seeTotal, 3)}</p>
                    <p className="text-[11px] text-slate-500">tCO₂e/t</p>
                </div>
            </div>

            {(warningMessages.length > 0 || issues.length > 0) ? (
                <div className="space-y-2">
                    <p className="text-sm font-semibold text-slate-800">해결하면 좋은 항목</p>
                    {issues.map((issue, index) => {
                        const href = getEuExportIssueEditHref(issue);
                        const body = (
                            <span className="flex items-start gap-2 text-sm leading-5">
                                <AlertTriangle className={`mt-0.5 h-4 w-4 flex-none ${issue.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`} />
                                <span>
                                    <StatusBadge tone={issue.severity === 'error' ? 'danger' : 'warning'}>{issue.area}</StatusBadge>
                                    <span className="ml-2 text-slate-700">{issue.message}</span>
                                </span>
                            </span>
                        );
                        return href ? (
                            <Link key={index} href={href} className="block rounded-xl border border-slate-200 bg-white px-4 py-2.5 transition hover:border-teal-300">
                                {body}
                            </Link>
                        ) : (
                            <div key={index} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5">{body}</div>
                        );
                    })}
                    {warningMessages.map((warning) => (
                        <div key={warning} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm leading-5 text-slate-700">
                            <AlertTriangle className="mr-2 inline h-4 w-4 text-amber-600" />
                            {warning}
                        </div>
                    ))}
                </div>
            ) : (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    <CheckCircle2 className="mr-2 inline h-4 w-4" />
                    막는 항목이 없습니다. 8단계에서 EU 문서를 만들 수 있습니다.
                </div>
            )}

            <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => onSelectStep('export')}>
                    8단계 — EU 문서 만들기
                    <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
                <Link href="/results">
                    <Button type="button" variant="secondary">상세 결과 보기</Button>
                </Link>
            </div>
        </>
    );
}

// ── 8단계: EU 문서 생성 ──────────────────────────────────────────────
function ExportPanel({ data }: PanelProps) {
    const [templateFile, setTemplateFile] = useState<File | null>(null);
    const [validation, setValidation] = useState<Awaited<ReturnType<typeof validateEuTemplateFile>> | null>(null);
    const [usingDefault, setUsingDefault] = useState(false);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [done, setDone] = useState(false);

    // 내장 기본 템플릿을 자동으로 불러온다 — 사용자가 직접 업로드하면 덮어쓴다.
    useEffect(() => {
        let active = true;
        loadDefaultEuTemplateFile()
            .then(async (file) => {
                const result = await validateEuTemplateFile(file);
                if (!active) return;
                setTemplateFile(file);
                setValidation(result);
                setUsingDefault(true);
            })
            .catch(() => {
                // 내장 로드 실패 시엔 수동 업로드 안내가 상시 노출되므로 조용히 무시한다.
            });
        return () => {
            active = false;
        };
    }, []);

    const handleFile = async (file: File | null) => {
        setTemplateFile(file);
        setValidation(null);
        setMessage('');
        setDone(false);
        setUsingDefault(false);
        if (!file) {
            return;
        }
        try {
            const result = await validateEuTemplateFile(file);
            setValidation(result);
            if (!result.isValid) {
                setMessage('이 파일은 EU 원본 템플릿이 아닌 것 같습니다. 공식 Communication Template(.xlsx)을 선택하세요.');
            }
        } catch {
            setMessage('파일을 읽지 못했습니다. .xlsx 파일인지 확인하세요.');
        }
    };

    const generate = async () => {
        if (!templateFile || !validation?.isValid) {
            setMessage('먼저 EU 원본 템플릿(.xlsx)을 선택하세요.');
            return;
        }
        setBusy(true);
        setMessage('');
        try {
            const result = await createEuTemplateExportCopyResult(templateFile, {
                installations: data.installations,
                periods: data.periods,
                processes: data.processes,
                productOutputLines: data.productOutputLines,
                sourceStreams: data.sourceStreams,
                precursors: data.precursors,
                products: data.products,
            });
            downloadBlob(result.blob, createEuExportFilename(templateFile.name));
            setDone(true);
            setMessage(`완성! 입력 셀 ${result.writtenCellCount}개를 반영한 사본이 다운로드되었습니다. Excel에서 열어 공식 수식 계산 결과를 확인하세요.`);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '문서 생성에 실패했습니다. 7단계의 확인 항목을 먼저 해결하세요.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            {data.exportErrorCount > 0 && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
                    <AlertTriangle className="mr-2 inline h-4 w-4" />
                    해결해야 할 오류가 {data.exportErrorCount}건 있습니다. 7단계에서 먼저 해결하세요.
                </div>
            )}

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">
                    <Upload className="mr-1 inline h-4 w-4" />
                    1) EU 원본 템플릿
                </p>
                {usingDefault && validation?.isValid ? (
                    <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold leading-5 text-emerald-800">
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                        내장 템플릿을 사용 중입니다 (버전 {DEFAULT_EU_TEMPLATE_VERSION}). 앱은 입력 셀에만 값을 넣고 공식 수식은 건드리지 않습니다.
                    </p>
                ) : (
                    <p className="text-xs leading-5 text-slate-500">
                        EU가 배포한 Communication Template 원본(.xlsx)이 필요합니다. 앱은 입력 셀에만 값을 넣고 공식 수식은 건드리지 않습니다.
                    </p>
                )}
                <div>
                    <p className="mb-1.5 text-xs font-semibold text-slate-600">
                        {usingDefault ? '최신 공식본이 있으면 직접 업로드해 덮어쓰세요:' : '공식 Communication Template(.xlsx)을 선택하세요:'}
                    </p>
                    <input
                        type="file"
                        accept=".xlsx"
                        onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
                    />
                </div>
                {templateFile && validation?.isValid && !usingDefault && (
                    <p className="text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                        {templateFile.name} — 원본 템플릿 확인됨
                    </p>
                )}
                <p className="text-[11px] leading-4 text-slate-400">
                    내장본은 편의를 위한 사본이며 최신 공식본이 아닐 수 있습니다. 제출 전 EU 최신 템플릿 여부를 확인하세요.
                </p>
            </div>

            <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-800">2) 수입자 전달용 사본 만들기</p>
                <Button type="button" onClick={generate} disabled={busy || !validation?.isValid || data.exportErrorCount > 0}>
                    {busy ? '생성 중…' : 'EU Communication 사본 다운로드'}
                </Button>
                <p className="text-xs leading-5 text-slate-500">
                    백업(.cbam)과 증빙 체크리스트가 함께 담긴 전달 패키지(.zip)는{' '}
                    <Link href="/export" className="font-semibold text-teal-700 underline">상세 Export 화면</Link>에서 만들 수 있습니다.
                </p>
            </div>

            {message && (
                <p className={`text-sm leading-6 ${done ? 'text-emerald-800' : 'text-amber-700'}`}>{message}</p>
            )}
        </>
    );
}

const PANEL_META: Record<GuidedStepId, { description: string; backstage?: { href: string; label: string } }> = {
    setup: { description: '회사·공장과 보고 범위를 등록합니다. 한 번만 하면 됩니다.', backstage: { href: '/installations', label: '상세 입력' } },
    products: { description: 'EU로 수출하는 제품과 CN 코드를 연결합니다. CN이 대상 여부를 결정합니다.', backstage: { href: '/products', label: '상세 입력' } },
    process: { description: '제품을 만드는 설비 묶음과 생산량을 등록합니다. 여러 제품이면 각각의 생산량으로 자동 배분됩니다.', backstage: { href: '/processes', label: '상세 입력' } },
    fuel: { description: '공장 안에서 태운 연료를 입력합니다 — 지도의 ① 직접배출이 됩니다.', backstage: { href: '/source-streams', label: '상세 입력' } },
    electricity: { description: '구매해 쓴 전기를 입력합니다 — 지도의 ② 간접배출이 됩니다.', backstage: { href: '/processes', label: '상세 입력' } },
    precursors: { description: '구매한 CBAM 강재(전구물질)가 지니고 온 배출을 더합니다 — 지도의 ③입니다.', backstage: { href: '/precursors', label: '상세 입력' } },
    results: { description: '계산 결과와 막는 항목을 확인합니다.', backstage: { href: '/results', label: '상세 결과' } },
    export: { description: 'EU 원본 템플릿에 우리 데이터를 채워 수입자 전달용 사본을 만듭니다.', backstage: { href: '/export', label: '상세 Export' } },
};

// 선택한 단계에 맞는 입력 패널을 렌더링한다. 지도(GuidedMap)와 쌍으로 쓰인다.
export function GuidedStepPanel({
    step,
    steps,
    data,
    selectedProcessId,
    binding,
    onSaved,
    onSelectStep,
}: {
    step: GuidedStepId | null;
    steps: GuidedStepState[];
    data: GuidedData;
    selectedProcessId: string;
    binding: SeeFlowBinding;
    onSaved: () => Promise<void> | void;
    onSelectStep: (id: GuidedStepId) => void;
}) {
    if (!step) {
        return (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
                지도에서 상자를 누르면 여기에 입력 패널이 열립니다.
            </section>
        );
    }

    const stepState = steps.find((item) => item.id === step);
    if (!stepState) {
        return null;
    }

    const meta = PANEL_META[step];

    // 잠긴 단계는 패널을 열지 않고 안내만 표시한다(예시 수치를 결과처럼 보여주는 오인 방지).
    if (stepState.status === 'locked') {
        const goTo = steps.find((item) => item.status === 'current')?.id ?? 'setup';
        return (
            <PanelShell step={stepState} description={meta.description} backstage={meta.backstage}>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-6 text-slate-600">
                    <p className="flex items-center gap-2 font-semibold text-slate-700">
                        <Lock className="h-4 w-4 text-slate-400" /> 아직 잠긴 단계입니다
                    </p>
                    <p className="mt-2">{stepState.summary.replace(/^잠김 — /, '')}. 앞 단계를 먼저 채우면 여기에 우리 회사 값이 표시됩니다.</p>
                    <Button type="button" variant="secondary" className="mt-3 min-h-9 px-3 py-1.5" onClick={() => onSelectStep(goTo)}>
                        지금 할 단계로 이동
                        <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </div>
            </PanelShell>
        );
    }

    const props: PanelProps = { data, steps, selectedProcessId, binding, onSaved, onSelectStep };
    const panel = step === 'setup'
        ? <SetupPanel {...props} />
        : step === 'products'
            ? <ProductsPanel {...props} />
            : step === 'process'
                ? <ProcessPanel {...props} />
                : step === 'fuel'
                    ? <FuelPanel {...props} />
                    : step === 'electricity'
                        ? <ElectricityPanel {...props} />
                        : step === 'precursors'
                            ? <PrecursorPanel {...props} />
                            : step === 'results'
                                ? <ResultsPanel {...props} />
                                : <ExportPanel {...props} />;

    return (
        <PanelShell step={stepState} description={meta.description} backstage={meta.backstage}>
            {panel}
        </PanelShell>
    );
}
