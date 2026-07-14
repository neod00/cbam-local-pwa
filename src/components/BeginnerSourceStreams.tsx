'use client';

import { BeginnerStepHeader, EntryChoice, InlineNotice, beginnerFieldClass } from '@/components/BeginnerFlow';
import {
    createLocalItem,
    listLocalItems,
    updateLocalItem,
    type ProductionProcess,
    type ReportingPeriod,
    type SourceStream,
} from '@/lib/local-db';
import { calculateSourceStreamEmissions } from '@/lib/source-stream-calculation';
import { ArrowLeft, ArrowRight, Check, Factory, FileText, Flame, Gauge, Zap } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type DataKind = 'ELECTRICITY' | 'CITY_GAS' | 'FUEL' | 'PROCESS';

type UsageDraft = {
    kind: DataKind;
    processId: string;
    periodId: string;
    amount: string;
    unit: string;
    factor: string;
    ncv: string;
    source: string;
};

const PRESETS: Record<DataKind, Pick<UsageDraft, 'unit' | 'factor' | 'ncv' | 'source'>> = {
    ELECTRICITY: { unit: 'kWh', factor: '0.466', ncv: '0', source: '전력 고지서 및 적용 배출계수' },
    CITY_GAS: { unit: 'Nm3', factor: '56.1', ncv: '0.037', source: '도시가스 고지서 및 국가 배출계수' },
    FUEL: { unit: 't', factor: '73', ncv: '48', source: '연료 구매대장 및 적용 배출계수' },
    PROCESS: { unit: 't', factor: '', ncv: '0', source: '원료 투입대장 또는 성분분석표' },
};

const KIND_META: Record<DataKind, { title: string; short: string; description: string }> = {
    ELECTRICITY: { title: '전기 고지서', short: '전기', description: '보고기간 총 전력 사용량을 입력합니다.' },
    CITY_GAS: { title: '도시가스 고지서', short: '도시가스', description: 'Nm3 사용량을 직접배출 자료로 입력합니다.' },
    FUEL: { title: '연료 구매대장', short: '기타 연료', description: 'LNG·LPG·유류 등 t 기준 사용량을 입력합니다.' },
    PROCESS: { title: '원료·공정자료', short: '공정 원료', description: '원료 투입량과 단위당 배출계수를 입력합니다.' },
};

function toNumber(value: string) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function initialDraft(kind: DataKind, processId = '', periodId = ''): UsageDraft {
    return { kind, processId, periodId, amount: '', ...PRESETS[kind] };
}

function calculatePreview(draft: UsageDraft) {
    const amount = toNumber(draft.amount);
    const factor = toNumber(draft.factor);
    if (draft.kind === 'ELECTRICITY') {
        const mwh = draft.unit === 'kWh' ? amount / 1000 : amount;
        return mwh * factor;
    }

    return calculateSourceStreamEmissions({
        stream_type: draft.kind === 'PROCESS' ? 'PROCESS_MATERIAL' : 'FUEL',
        method: draft.kind === 'PROCESS' ? 'Process Emissions' : 'Combustion',
        activity_data: amount,
        ncv_gj_per_unit: toNumber(draft.ncv),
        emission_factor_tco2e_per_unit: factor,
        emission_factor_basis: draft.kind === 'PROCESS' ? 'PER_ACTIVITY_UNIT' : 'PER_TJ',
        oxidation_factor: 1,
        conversion_factor: 1,
        fossil_fraction: 1,
        biomass_fraction: 0,
    });
}

export default function BeginnerSourceStreams() {
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [sourceStreams, setSourceStreams] = useState<SourceStream[]>([]);
    const [step, setStep] = useState(1);
    const [draft, setDraft] = useState<UsageDraft>(initialDraft('ELECTRICITY'));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    async function load() {
        const [processData, periodData, sourceData] = await Promise.all([
            listLocalItems('processes'),
            listLocalItems('periods'),
            listLocalItems('source_streams'),
        ]);
        setProcesses(processData);
        setPeriods(periodData);
        setSourceStreams(sourceData);
        setDraft((current) => ({
            ...current,
            processId: current.processId || processData[0]?.id || '',
            periodId: current.periodId || periodData[0]?.id || '',
        }));
    }

    useEffect(() => {
        void load().catch(() => setError('사용자료를 불러오지 못했습니다.'));
    }, []);

    const preview = useMemo(() => calculatePreview(draft), [draft]);
    const selectedProcess = processes.find((process) => process.id === draft.processId);
    const electricityProcessCount = processes.filter((process) => process.electricity_mwh > 0).length;

    function chooseKind(kind: DataKind) {
        setDraft(initialDraft(kind, draft.processId, draft.periodId));
        setError('');
        setMessage('');
    }

    function next() {
        setError('');
        if (step === 2 && (!draft.processId || !draft.periodId)) {
            setError('연결할 생산공정과 보고기간을 선택하세요.');
            return;
        }
        if (step === 3 && (toNumber(draft.amount) <= 0 || toNumber(draft.factor) <= 0)) {
            setError('사용량과 배출계수는 0보다 커야 합니다.');
            return;
        }
        setStep((current) => Math.min(4, current + 1));
    }

    async function save() {
        if (!selectedProcess) {
            setError('연결할 생산공정을 선택하세요.');
            return;
        }
        if (toNumber(draft.amount) <= 0 || toNumber(draft.factor) <= 0) {
            setError('사용량과 배출계수를 확인하세요.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            if (draft.kind === 'ELECTRICITY') {
                const mwh = draft.unit === 'kWh' ? toNumber(draft.amount) / 1000 : toNumber(draft.amount);
                await updateLocalItem('processes', {
                    ...selectedProcess,
                    electricity_mwh: mwh,
                    electricity_ef_tco2e_per_mwh: toNumber(draft.factor),
                    electricity_ef_source: draft.source.trim(),
                });
            } else {
                const sourceStream = await createLocalItem('source_streams', {
                    period_id: draft.periodId || selectedProcess.period_id,
                    process_id: selectedProcess.id,
                    name: KIND_META[draft.kind].short,
                    stream_type: draft.kind === 'PROCESS' ? 'PROCESS_MATERIAL' : 'FUEL',
                    method: draft.kind === 'PROCESS' ? 'Process Emissions' : 'Combustion',
                    activity_data: toNumber(draft.amount),
                    activity_unit: draft.unit,
                    ncv_gj_per_unit: toNumber(draft.ncv),
                    emission_factor_tco2e_per_unit: toNumber(draft.factor),
                    emission_factor_basis: draft.kind === 'PROCESS' ? 'PER_ACTIVITY_UNIT' : 'PER_TJ',
                    oxidation_factor: 1,
                    conversion_factor: 1,
                    fossil_fraction: 1,
                    biomass_fraction: 0,
                    factor_source_type: draft.kind === 'PROCESS' ? 'SUPPLIER_OR_LAB' : 'NATIONAL_INVENTORY',
                    source: draft.source.trim(),
                });
                const linkedStreams = [...sourceStreams.filter((item) => item.process_id === selectedProcess.id), sourceStream];
                const directEmissions = linkedStreams.reduce((sum, item) => sum + calculateSourceStreamEmissions(item), 0);
                await updateLocalItem('processes', { ...selectedProcess, direct_attributable_emissions_tco2e: directEmissions });
            }

            await load();
            setMessage(`${KIND_META[draft.kind].short} 자료를 로컬에 저장했습니다.`);
            setStep(1);
            setDraft(initialDraft('ELECTRICITY', draft.processId, draft.periodId));
        } catch {
            setError('사용자료를 저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <BeginnerStepHeader current={4} title="전기·연료 사용자료" description="고지서를 보면서 네 단계로 입력하세요." advancedHref="/source-streams?advanced=1" />

            {processes.length === 0 && <InlineNotice tone="warning">생산공정이 먼저 필요합니다. <Link href="/processes" className="underline">생산공정 등록</Link></InlineNotice>}
            {message && <InlineNotice tone="success">{message}</InlineNotice>}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
                <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-200 px-5 py-5 sm:px-6">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs font-bold text-emerald-800">자료 입력 {step}/4</p>
                                <h2 className="mt-1 text-xl font-bold text-slate-950">{['자료 종류 선택', '연결 대상 선택', '사용량 확인', '계산 미리보기'][step - 1]}</h2>
                            </div>
                            <span className="text-sm font-bold text-slate-500">{step * 25}%</span>
                        </div>
                        <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-700 transition-all" style={{ width: `${step * 25}%` }} /></div>
                    </div>

                    <div className="min-h-[360px] p-5 sm:p-6">
                        {step === 1 && (
                            <div className="grid gap-3 md:grid-cols-2">
                                <EntryChoice icon={Zap} title="전기 고지서" description="kWh 또는 MWh 합계를 입력" selected={draft.kind === 'ELECTRICITY'} onClick={() => chooseKind('ELECTRICITY')} />
                                <EntryChoice icon={Flame} title="도시가스 고지서" description="Nm3 사용량을 입력" selected={draft.kind === 'CITY_GAS'} onClick={() => chooseKind('CITY_GAS')} />
                                <EntryChoice icon={Gauge} title="기타 연료" description="LNG·LPG·유류 구매량을 입력" selected={draft.kind === 'FUEL'} onClick={() => chooseKind('FUEL')} />
                                <EntryChoice icon={Factory} title="원료·공정자료" description="투입량과 단위당 배출계수를 입력" selected={draft.kind === 'PROCESS'} onClick={() => chooseKind('PROCESS')} />
                            </div>
                        )}

                        {step === 2 && (
                            <div className="mx-auto max-w-2xl space-y-5">
                                <InlineNotice>{KIND_META[draft.kind].description}</InlineNotice>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">연결 생산공정 <span className="text-red-600">*</span></span>
                                    <select value={draft.processId} onChange={(event) => {
                                        const process = processes.find((item) => item.id === event.target.value);
                                        setDraft((current) => ({ ...current, processId: event.target.value, periodId: process?.period_id || current.periodId }));
                                    }} className={beginnerFieldClass}>
                                        <option value="">선택하세요</option>
                                        {processes.map((process) => <option key={process.id} value={process.id}>{process.name}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">보고기간 <span className="text-red-600">*</span></span>
                                    <select value={draft.periodId} onChange={(event) => setDraft((current) => ({ ...current, periodId: event.target.value }))} className={beginnerFieldClass}>
                                        <option value="">선택하세요</option>
                                        {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                                    </select>
                                </label>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">근거 자료명</span>
                                    <input value={draft.source} onChange={(event) => setDraft((current) => ({ ...current, source: event.target.value }))} className={beginnerFieldClass} />
                                </label>
                            </div>
                        )}

                        {step === 3 && (
                            <div className="mx-auto max-w-2xl space-y-5">
                                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_150px]">
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700">보고기간 사용량 <span className="text-red-600">*</span></span>
                                        <input value={draft.amount} onChange={(event) => setDraft((current) => ({ ...current, amount: event.target.value }))} inputMode="decimal" placeholder="고지서 합계" className={beginnerFieldClass} />
                                    </label>
                                    <label className="block">
                                        <span className="text-sm font-semibold text-slate-700">단위</span>
                                        {draft.kind === 'ELECTRICITY' ? (
                                            <select value={draft.unit} onChange={(event) => setDraft((current) => ({ ...current, unit: event.target.value }))} className={beginnerFieldClass}><option value="kWh">kWh</option><option value="MWh">MWh</option></select>
                                        ) : <input value={draft.unit} readOnly className={beginnerFieldClass} />}
                                    </label>
                                </div>
                                <label className="block">
                                    <span className="text-sm font-semibold text-slate-700">배출계수 <span className="text-red-600">*</span></span>
                                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_210px]">
                                        <input value={draft.factor} onChange={(event) => setDraft((current) => ({ ...current, factor: event.target.value }))} inputMode="decimal" className={beginnerFieldClass} />
                                        <div className={`${beginnerFieldClass} flex items-center bg-slate-50 text-slate-600`}>{draft.kind === 'ELECTRICITY' ? 'tCO2e/MWh' : draft.kind === 'PROCESS' ? 'tCO2e/t' : 'tCO2e/TJ'}</div>
                                    </div>
                                    <span className="mt-2 block text-xs leading-5 text-amber-800">자동 입력값은 예시입니다. 회사가 적용하는 공식 출처와 일치하는지 확인하세요.</span>
                                </label>
                                {(draft.kind === 'CITY_GAS' || draft.kind === 'FUEL') && (
                                    <details className="rounded-md border border-slate-200 bg-slate-50 p-4">
                                        <summary className="cursor-pointer text-sm font-semibold text-slate-700">발열량 확인</summary>
                                        <label className="mt-4 block text-sm text-slate-600">순발열량 (GJ/{draft.unit})<input value={draft.ncv} onChange={(event) => setDraft((current) => ({ ...current, ncv: event.target.value }))} className={beginnerFieldClass} /></label>
                                    </details>
                                )}
                            </div>
                        )}

                        {step === 4 && (
                            <div className="mx-auto max-w-2xl">
                                <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
                                    <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-white text-emerald-800"><Check className="h-6 w-6" /></span>
                                    <p className="mt-4 text-sm font-semibold text-emerald-900">예상 배출량</p>
                                    <p className="mt-2 text-4xl font-bold text-[#123D32]">{preview.toLocaleString('ko-KR', { maximumFractionDigits: 3 })}</p>
                                    <p className="mt-1 text-sm font-semibold text-emerald-900">tCO2e</p>
                                </div>
                                <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200 text-sm">
                                    <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">자료</dt><dd className="font-semibold text-slate-900">{KIND_META[draft.kind].title}</dd></div>
                                    <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">연결 공정</dt><dd className="font-semibold text-slate-900">{selectedProcess?.name || '-'}</dd></div>
                                    <div className="flex justify-between gap-4 py-3"><dt className="text-slate-500">사용량</dt><dd className="font-semibold text-slate-900">{toNumber(draft.amount).toLocaleString('ko-KR')} {draft.unit}</dd></div>
                                </dl>
                            </div>
                        )}

                        {error && <div className="mt-5"><InlineNotice tone="danger">{error}</InlineNotice></div>}
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 sm:px-6">
                        <button type="button" onClick={() => setStep((current) => Math.max(1, current - 1))} disabled={step === 1} className="inline-flex min-h-11 items-center rounded-md px-4 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:invisible"><ArrowLeft className="mr-2 h-4 w-4" /> 이전</button>
                        {step < 4 ? (
                            <button type="button" onClick={next} disabled={processes.length === 0} className="inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white hover:bg-[#195642] disabled:opacity-50">다음 <ArrowRight className="ml-2 h-4 w-4" /></button>
                        ) : (
                            <button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white hover:bg-[#195642] disabled:opacity-50">{saving ? '저장 중...' : '로컬 저장'}</button>
                        )}
                    </div>
                </section>

                <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-950">입력 현황</h2>
                        <FileText className="h-5 w-5 text-emerald-800" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3">
                        <div className="rounded-md bg-blue-50 p-4"><p className="text-xs font-semibold text-blue-700">전기 연결 공정</p><p className="mt-2 text-2xl font-bold text-blue-950">{electricityProcessCount}</p></div>
                        <div className="rounded-md bg-emerald-50 p-4"><p className="text-xs font-semibold text-emerald-700">직접배출 자료</p><p className="mt-2 text-2xl font-bold text-emerald-950">{sourceStreams.length}</p></div>
                    </div>
                    <div className="mt-5 space-y-2">
                        {sourceStreams.slice(0, 4).map((stream) => (
                            <div key={stream.id} className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-3 text-sm"><span className="truncate font-semibold text-slate-700">{stream.name}</span><span className="whitespace-nowrap text-slate-500">{stream.activity_data.toLocaleString('ko-KR')} {stream.activity_unit}</span></div>
                        ))}
                    </div>
                    {(sourceStreams.length > 0 || electricityProcessCount > 0) && <Link href="/precursors" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white hover:bg-[#195642]">전구물질 확인 <ArrowRight className="ml-2 h-4 w-4" /></Link>}
                </aside>
            </div>
        </div>
    );
}
