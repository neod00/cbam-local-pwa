'use client';

import { Button, StatusBadge } from '@/components/ui';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { getCbamCoverage } from '@/lib/cbam-product-rules';
import { CN_CODE_OPTIONS } from '@/lib/cn-code-options';
import {
    createEuExportFilename,
    createEuTemplateExportCopyResult,
    downloadBlob,
    getEuExportIssueEditHref,
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
import { AlertTriangle, ArrowRight, CheckCircle2, ExternalLink, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';

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
    const [name, setName] = useState('');
    const [route, setRoute] = useState('');
    const [periodId, setPeriodId] = useState(data.periods[0]?.id ?? '');
    const [masses, setMasses] = useState<Record<string, string>>({});
    const [message, setMessage] = useState('');
    const [saved, setSaved] = useState(false);

    const totalMass = reportingProducts.reduce((sum, product) => sum + num(masses[product.id] ?? ''), 0);

    const addProcess = async () => {
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
        setName('');
        setRoute('');
        setMasses({});
        setMessage('');
        setSaved(true);
        await onSaved();
    };

    return (
        <>
            {data.processes.length > 0 && (
                <ul className="space-y-2">
                    {data.processes.map((process) => {
                        const lines = data.productOutputLines.filter((line) => line.process_id === process.id);
                        return (
                            <li key={process.id} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm">
                                <span className="font-semibold text-slate-900">{process.name}</span>
                                <span className="ml-2 text-slate-500">
                                    {fmt(process.output_mass_t, 1)} t · 제품 {lines.length > 0 ? lines.length : 1}개
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
                        <Plus className="mr-1 inline h-4 w-4" />
                        공정 추가
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
                    <Button type="button" onClick={addProcess}>공정 저장</Button>
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
            setMessage('전력 배출계수를 입력하세요. 잘 모르면 0.47을 그대로 두세요.');
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
    const [source, setSource] = useState('');
    const [dataMode, setDataMode] = useState<PurchasedPrecursor['data_mode']>('ACTUAL');
    const [justification, setJustification] = useState('');
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
        const direct = match.direct_default ?? 0;
        const total = getDefaultValueTotalForYear(match, '2026') ?? match.total_default ?? 0;
        setDirectSee(String(direct));
        setIndirectSee(String(Math.max(0, total - direct)));
        setDataMode('DEFAULT');
        setJustification('공급사 measured SEE 미입수 — EU 국가/CN 기본값(2026) 적용');
        setSource(`${reference.summary.filename} / ${match.country} / ${match.cn_code}`);
        setMessage('EU 기본값을 채웠습니다. 공급사 실측자료를 받으면 교체하세요.');
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
        await createLocalItem('precursors', {
            period_id: process.period_id,
            process_id: process.id,
            product_id: process.product_id,
            name: name.trim(),
            precursor_cn_code: cnDigits,
            aggregated_goods_category: 'Iron or steel products',
            production_route: '',
            supplier_country: 'South Korea',
            supplier_installation: '',
            data_mode: dataMode,
            verification_status: 'UNVERIFIED' as const,
            default_value_year: '2026' as const,
            purchased_mass_t: num(purchased),
            consumed_mass_t: consumedMass,
            consumed_for_non_cbam_mass_t: 0,
            direct_see_tco2e_per_t: num(directSee),
            indirect_see_tco2e_per_t: num(indirectSee),
            source: source.trim(),
            default_value_justification: justification.trim(),
        });
        setName('');
        setCn('');
        setConsumed('');
        setPurchased('');
        setDirectSee('');
        setIndirectSee('');
        setSource('');
        setJustification('');
        setDataMode('ACTUAL');
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
                    사온 CBAM 원료 추가
                </p>
                <p className="text-xs leading-5 text-slate-500">
                    선재·빌릿처럼 CBAM 대상인 강재 원료만 해당합니다. 윤활유·소모품 같은 일반 부자재는 넣지 않습니다.
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="원료 이름">
                        <input className={fieldClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="선재(와이어로드)" />
                    </Field>
                    <Field label="원료 CN 코드">
                        <input className={fieldClass} value={cn} onChange={(event) => setCn(event.target.value)} placeholder="72131000" />
                    </Field>
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
                        <input className={fieldClass} inputMode="decimal" value={indirectSee} onChange={(event) => setIndirectSee(event.target.value)} placeholder="0.30" />
                    </Field>
                </div>
                <Button type="button" variant="secondary" onClick={applyDefaultValues}>
                    <Sparkles className="mr-2 h-4 w-4" />
                    공급사 자료 없음 — EU 기본값 채우기
                </Button>
                <Field label="SEE 출처" hint="예: 공급사 회신 메일(날짜), EU 기본값 파일">
                    <input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} placeholder="공급사 회신 메일 2026-05-02" />
                </Field>
                {dataMode === 'DEFAULT' && (
                    <Field label="기본값 사용 사유">
                        <input className={fieldClass} value={justification} onChange={(event) => setJustification(event.target.value)} />
                    </Field>
                )}
                <Button type="button" onClick={addPrecursor}>원료 저장</Button>
            </div>

            {message && <p className="text-sm text-amber-700">{message}</p>}
            {saved && <SavedNotice message="저장했습니다. 원료가 지니고 온 배출이 지도에 더해집니다." next={nextStepId(steps, 'precursors')} onSelectStep={onSelectStep} />}
        </>
    );
}

// ── 7단계: 검증·결과 ─────────────────────────────────────────────────
function ResultsPanel({ data, binding, selectedProcessId, onSelectStep }: PanelProps) {
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
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');
    const [done, setDone] = useState(false);

    const handleFile = async (file: File | null) => {
        setTemplateFile(file);
        setValidation(null);
        setMessage('');
        setDone(false);
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
                    1) EU 원본 템플릿 선택
                </p>
                <p className="text-xs leading-5 text-slate-500">
                    EU가 배포한 Communication Template 원본(.xlsx)이 필요합니다. 앱은 입력 셀에만 값을 넣고 공식 수식은 건드리지 않습니다.
                </p>
                <input
                    type="file"
                    accept=".xlsx"
                    onChange={(event) => handleFile(event.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-700 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-teal-800"
                />
                {templateFile && validation?.isValid && (
                    <p className="text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />
                        {templateFile.name} — 원본 템플릿 확인됨
                    </p>
                )}
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
    electricity: { description: '사서 쓴 전기를 입력합니다 — 지도의 ② 간접배출이 됩니다.', backstage: { href: '/processes', label: '상세 입력' } },
    precursors: { description: '사온 CBAM 강재(전구물질)가 지니고 온 배출을 더합니다 — 지도의 ③입니다.', backstage: { href: '/precursors', label: '상세 입력' } },
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
