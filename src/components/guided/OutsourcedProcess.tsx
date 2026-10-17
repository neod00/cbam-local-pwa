'use client';

import { Button } from '@/components/ui';
import { sumReconciledSourceStreamEmissions } from '@/lib/allocation-rules';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { createLocalItem, deleteLocalItem, updateLocalItem, type OutsourcedBasis, type OutsourcedEquipment, type OutsourcedProcessInfo, type OutsourcedTechnique, type ProductionProcess, type PurchasedPrecursor, type SourceStream } from '@/lib/local-db';
import {
    OUTSOURCED_BASIS_ANCHOR,
    OUTSOURCED_BASIS_LABEL,
    OUTSOURCED_TECHNIQUE_LABEL,
    RECONSTRUCTION_TOLERANCE,
    buildOutsourcedStreamDrafts,
    checkOutsourcedStreams,
    computeOutsourcedShare,
    validateOutsourcedInfo,
} from '@/lib/outsourced-process';
import {
    FACTOR_SOURCE_TYPE_OPTIONS,
    GUIDED_STREAM_KINDS,
    createSourceStreamValidationErrors,
    firstSourceStreamError,
    matchGuidedStreamKind,
    type GuidedStreamKind,
} from '@/lib/source-stream-input';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

const opt = (value: string): number | undefined => {
    const text = value.replace(/,/g, '').trim();
    if (text === '') return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
};
const num = (value: string) => opt(value) ?? 0;
const fmt = (value: number, digits = 3) => new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

// 리터 유형은 이 화면에서 다루지 않는다 — 외주처 고지서는 대부분 Nm³·t 단위다.
const FUEL_KINDS = GUIDED_STREAM_KINDS.filter((kind) => kind.defaults.stream_type === 'FUEL' && !kind.litres);
const TECHNIQUES = Object.keys(OUTSOURCED_TECHNIQUE_LABEL) as OutsourcedTechnique[];
const BASES = Object.keys(OUTSOURCED_BASIS_LABEL) as OutsourcedBasis[];
const BASIS_BODY: Record<OutsourcedBasis, string> = {
    METERED_LINE: '외주처가 그 공정 설비의 가스 계량값을 줄 수 있을 때. 우리만 쓰는 설비면 그 값이 곧 우리 몫입니다.',
    RECONSTRUCTED: '계량기가 없을 때. 설비별 소비율 × 가동시간으로 사용량을 재구성하고 고지서 총량에 맞춥니다(보정계수).',
    OUTPUT_MASS: '같은 설비·같은 조건에서 여러 고객 제품을 처리할 때. 설비 연료량을 처리 중량 비율로 나눕니다.',
    CONSERVATIVE_ESTIMATE: '위 자료가 모두 없을 때의 마지막 수단. 설비 정격·가동시간 같은 객관적 근거로 직접 계산한 값을 적고, 항상 「확인 필요」로 남습니다.',
};
const TECHNIQUE_BODY: Partial<Record<OutsourcedTechnique, string>> = {
    ZINC_FLAKE_COATING: '전류 없이 아연·알루미늄 플레이크를 입히고 굽는 방식(ISO 10683) — 코팅(coating)이라 경계 안입니다.',
    ELECTROPLATING: '전류로 피막을 입히는 전해 방식(ISO 4042) — 도금(plating)이라 경계 밖이라 넣지 않습니다.',
    HOT_DIP_GALVANIZING: '녹인 아연에 담그는 방식 — 용융아연도금(galvanizing)이라 경계 안입니다.',
};

interface EquipmentRow { name: string; hours: string; rate: string; ours: boolean }
const emptyEquipment = (ours = false): EquipmentRow => ({ name: '', hours: '', rate: '', ours });

/** 외주 몫 행들을 한 건으로 묶는 열쇠 — 같은 외주처·공정 종류·방법·총 몫·기간. */
const groupKeyOf = (stream: SourceStream) => {
    const info = stream.outsourced!;
    return [info.subcontractor.trim(), info.technique, info.basis, info.total_share ?? '', stream.period_id ?? ''].join('|');
};

/**
 * 외주 임가공 공정(4단계 위쪽). EC CBAM Q&A 2026-05-27 4.31: 철강제품 경계 안의 공정(열처리·코팅·용융아연도금)을 외주사에서 하고 물건이 돌아오면
 * 우리 사업장에서 일어난 것처럼 다룬다 — 외주처가 우리 부품에 쓴 연료의 몫을 우리 공정의 연료로 더한다. 돌아온 부품은 구매 강재가 아니다.
 * 계산·검사는 outsourced-process.ts(순수). 이 화면은 입력을 모아 보여 주고 저장한다.
 */
export function OutsourcedProcess({
    processes,
    sourceStreams,
    precursors,
    results,
    onApplied,
}: {
    processes: ProductionProcess[];
    sourceStreams: SourceStream[];
    precursors: PurchasedPrecursor[];
    results: LocalCalculationResult[];
    onApplied: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [editingKey, setEditingKey] = useState('');
    const [subcontractor, setSubcontractor] = useState('');
    const [technique, setTechnique] = useState<OutsourcedTechnique>('HEAT_TREATMENT');
    const [techniqueEvidence, setTechniqueEvidence] = useState('');
    const [kindKey, setKindKey] = useState(FUEL_KINDS[0].key);
    const [factor, setFactor] = useState(String(FUEL_KINDS[0].defaults.emission_factor_tco2e_per_unit));
    const [ncv, setNcv] = useState(String(FUEL_KINDS[0].defaults.ncv_gj_per_unit));
    const [factorSource, setFactorSource] = useState<SourceStream['factor_source_type']>(FUEL_KINDS[0].defaults.factor_source_type);
    const [basis, setBasis] = useState<OutsourcedBasis>('METERED_LINE');
    const [companyTotal, setCompanyTotal] = useState('');
    const [lineQuantity, setLineQuantity] = useState('');
    const [ourT, setOurT] = useState('');
    const [lineT, setLineT] = useState('');
    const [estimate, setEstimate] = useState('');
    const [equipment, setEquipment] = useState<EquipmentRow[]>([emptyEquipment(true), emptyEquipment(false)]);
    const [note, setNote] = useState('');
    const [evidence, setEvidence] = useState('');
    const [source, setSource] = useState('');
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const kind = FUEL_KINDS.find((item) => item.key === kindKey) ?? FUEL_KINDS[0];
    const rows = sourceStreams.filter((stream) => stream.outsourced);
    const issues = checkOutsourcedStreams(sourceStreams, precursors);
    const activityLevelOf = (process: ProductionProcess) => results.find((result) => result.process_id === process.id)?.activity_level_t ?? process.output_mass_t;

    const groups = new Map<string, SourceStream[]>();
    for (const stream of rows) groups.set(groupKeyOf(stream), [...(groups.get(groupKeyOf(stream)) ?? []), stream]);

    const applyKind = (next: GuidedStreamKind) => {
        setKindKey(next.key);
        setFactor(String(next.defaults.emission_factor_tco2e_per_unit));
        setNcv(String(next.defaults.ncv_gj_per_unit));
        setFactorSource(next.defaults.factor_source_type);
    };

    const openForm = (key?: string) => {
        const members = key ? groups.get(key) : undefined;
        if (members && members.length > 0) {
            const first = members[0];
            const info = first.outsourced!;
            const matched = FUEL_KINDS.find((item) => item.key === matchGuidedStreamKind(first).key) ?? FUEL_KINDS[0];
            setEditingKey(key!);
            setSubcontractor(info.subcontractor);
            setTechnique(info.technique);
            setTechniqueEvidence(info.technique_evidence ?? '');
            setKindKey(matched.key);
            setFactor(String(first.emission_factor_tco2e_per_unit));
            setNcv(String(first.ncv_gj_per_unit));
            setFactorSource(first.factor_source_type ?? 'UNCLASSIFIED');
            setBasis(info.basis);
            setCompanyTotal(info.company_total !== undefined ? String(info.company_total) : '');
            setLineQuantity(info.line_quantity !== undefined ? String(info.line_quantity) : '');
            setOurT(info.our_throughput_t !== undefined ? String(info.our_throughput_t) : '');
            setLineT(info.line_throughput_t !== undefined ? String(info.line_throughput_t) : '');
            setEstimate(info.estimate_quantity !== undefined ? String(info.estimate_quantity) : '');
            setEquipment(info.equipment?.length ? info.equipment.map((item) => ({ name: item.name, hours: String(item.hours), rate: String(item.rate_per_h), ours: Boolean(item.ours) })) : [emptyEquipment(true), emptyEquipment(false)]);
            setNote(info.note);
            setEvidence(info.evidence ?? '');
            setSource(first.source.split(' · 외주 공정 몫')[0]);
            setSelected(Object.fromEntries(members.map((stream) => [stream.process_id ?? '', true])));
        } else {
            setEditingKey('');
            setSubcontractor('');
            setTechnique('HEAT_TREATMENT');
            setTechniqueEvidence('');
            applyKind(FUEL_KINDS[0]);
            setBasis('METERED_LINE');
            setCompanyTotal(''); setLineQuantity(''); setOurT(''); setLineT(''); setEstimate('');
            setEquipment([emptyEquipment(true), emptyEquipment(false)]);
            setNote(''); setEvidence(''); setSource('');
            setSelected(Object.fromEntries(processes.map((process) => [process.id, false])));
        }
        setMessage('');
        setOpen(true);
    };

    const equipmentList: OutsourcedEquipment[] = equipment
        .filter((row) => row.name.trim() || row.hours.trim() || row.rate.trim())
        .map((row) => ({ name: row.name.trim() || '(이름 없음)', hours: num(row.hours), rate_per_h: num(row.rate), ours: row.ours }));
    const info: OutsourcedProcessInfo = {
        subcontractor,
        technique,
        technique_evidence: techniqueEvidence.trim() || undefined,
        basis,
        company_total: opt(companyTotal),
        line_quantity: opt(lineQuantity),
        our_throughput_t: opt(ourT),
        line_throughput_t: opt(lineT),
        equipment: basis === 'RECONSTRUCTED' ? equipmentList : undefined,
        estimate_quantity: opt(estimate),
        note: note.trim(),
        evidence: evidence.trim() || undefined,
    };
    const shareResult = computeOutsourcedShare(info);
    const validation = validateOutsourcedInfo(info);
    const chosen = processes.filter((process) => selected[process.id]);
    const weights = chosen.map((process) => Math.max(activityLevelOf(process), 0));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    const fractions = chosen.map((_, index) => (weightSum > 0 ? weights[index] / weightSum : 1 / chosen.length));
    const unit = kind.defaults.activity_unit;
    const template = {
        ...kind.defaults,
        ncv_gj_per_unit: kind.needsNcv ? num(ncv) : kind.defaults.ncv_gj_per_unit,
        emission_factor_tco2e_per_unit: num(factor),
        factor_source_type: factorSource,
    };

    const apply = async () => {
        if (validation.errors.length > 0) { setMessage(validation.errors[0]); return; }
        if (!shareResult.ok) { setMessage(shareResult.reason); return; }
        if (chosen.length === 0) { setMessage('외주 공정에서 처리한 제품이 속한 공정을 하나 이상 고르세요.'); return; }
        if (!source.trim()) { setMessage('활동자료 출처를 적으세요. 예: 외주처 가스 고지서 2025, 외주처 가동기록.'); return; }
        const built = buildOutsourcedStreamDrafts({
            info,
            total: shareResult.share,
            processes: chosen.map((process, index) => ({ id: process.id, name: process.name, period_id: process.period_id, fraction: fractions[index] })),
            template,
            fuelName: kind.label.split(' — ')[1]?.split(' (')[0] ?? kind.label,
            source,
        });
        if (!built.ok) { setMessage(built.reason); return; }
        for (const draft of built.drafts) {
            const error = firstSourceStreamError(createSourceStreamValidationErrors(draft));
            if (error) { setMessage(`${draft.name}: ${error}`); return; }
        }
        setBusy(true);
        try {
            const oldRows = editingKey ? groups.get(editingKey) ?? [] : [];
            for (const stream of oldRows) await deleteLocalItem('source_streams', stream.id);
            const created: SourceStream[] = [];
            for (const draft of built.drafts) created.push(await createLocalItem('source_streams', draft));
            const remaining = sourceStreams.filter((stream) => !oldRows.some((old) => old.id === stream.id));
            await recomputeDirect(processes, [...remaining, ...created], [...oldRows, ...created].map((stream) => stream.process_id));
            setMessage('');
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (key: string) => {
        const members = groups.get(key) ?? [];
        if (!window.confirm(`외주 몫 「${members[0]?.outsourced?.subcontractor ?? ''}」을(를) 지울까요?\n그 연료 행(${members.length}개)이 사라지고 공정의 직접배출이 다시 계산됩니다.`)) return;
        setBusy(true);
        try {
            for (const stream of members) await deleteLocalItem('source_streams', stream.id);
            const remaining = sourceStreams.filter((stream) => !members.some((old) => old.id === stream.id));
            await recomputeDirect(processes, remaining, members.map((stream) => stream.process_id));
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const needsEquipment = basis === 'RECONSTRUCTED';
    const needsLine = basis === 'METERED_LINE' || basis === 'OUTPUT_MASS';
    const needsThroughput = basis === 'OUTPUT_MASS' || basis === 'METERED_LINE';

    return (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4" data-testid="outsourced-process">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">열처리·코팅 같은 공정을 외주사에서 하나요?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        외주사에 맡겼다가 돌려받는 열처리·코팅·용융아연도금은 <span className="font-semibold">우리 공장에서 한 것처럼</span> 셉니다(EU Q&amp;A 4.31).
                        외주사가 우리 부품에 쓴 연료의 몫을 우리 공정의 연료로 더합니다. 돌아온 부품은 「구매 강재」에 적지 마세요 — 이중으로 셉니다.
                        전기도금·절단·용접·마무리는 외주여도 경계 밖이라 넣지 않습니다.
                    </p>
                    <p className="mt-1 text-xs leading-5 text-amber-900" data-testid="outsourced-electricity-notice">이 연료 입력에는 외주처가 쓴 전기(간접배출)가 들어가지 않습니다 — 바로 아래 「외주사가 우리 부품에 쓴 전기」에서 따로 입력하세요.</p>
                </div>
                {!open && (
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => openForm()} disabled={processes.length === 0}>
                        {groups.size > 0 ? '외주 공정 추가' : '외주 공정 입력'}
                    </Button>
                )}
            </div>

            {[...groups.entries()].map(([key, members]) => {
                const first = members[0];
                const total = members.reduce((sum, stream) => sum + stream.activity_data, 0);
                const mine = issues.filter((issue) => members.some((stream) => stream.id === issue.streamId));
                return (
                    <div key={key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" data-testid="outsourced-group">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 text-slate-800">
                                <span className="font-semibold">「{first.outsourced!.subcontractor}」</span> {OUTSOURCED_TECHNIQUE_LABEL[first.outsourced!.technique]} · 우리 몫 {fmt(total)} {first.activity_unit} · 공정 {members.length}개
                            </p>
                            <span className="flex flex-none gap-2">
                                <button type="button" disabled={busy} onClick={() => openForm(key)} className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50">고치기</button>
                                <button type="button" disabled={busy} onClick={() => void remove(key)} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">지우기</button>
                            </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{OUTSOURCED_BASIS_LABEL[first.outsourced!.basis]} · {OUTSOURCED_BASIS_ANCHOR[first.outsourced!.basis]}</p>
                        {mine.length === 0 ? (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5 flex-none" />방법·근거가 갖춰졌습니다.</p>
                        ) : mine.map((issue) => (
                            <p key={`${issue.code}-${issue.streamId}`} className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />{issue.message}
                            </p>
                        ))}
                    </div>
                );
            })}

            {open && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">외주처 이름</span>
                            <input className={fieldClass} value={subcontractor} onChange={(event) => setSubcontractor(event.target.value)} placeholder="예: ○○열처리, ○○코팅" />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">어떤 공정인가요?</span>
                            <select className={fieldClass} value={technique} onChange={(event) => setTechnique(event.target.value as OutsourcedTechnique)}>
                                {TECHNIQUES.map((item) => <option key={item} value={item}>{OUTSOURCED_TECHNIQUE_LABEL[item]}</option>)}
                            </select>
                            {TECHNIQUE_BODY[technique] && <span className="mt-1 block text-xs leading-5 text-slate-500">{TECHNIQUE_BODY[technique]}</span>}
                        </label>
                    </div>
                    {technique === 'ELECTROPLATING' && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-amber-200" data-testid="outsourced-plating-warning">
                            {validation.errors.find((text) => text.startsWith('전기도금')) ?? ''}
                        </p>
                    )}
                    {(technique === 'ZINC_FLAKE_COATING' || technique === 'OTHER_COATING') && (
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">분류 근거 (전류를 쓰지 않는 코팅이라는 근거)</span>
                            <input className={fieldClass} value={techniqueEvidence} onChange={(event) => setTechniqueEvidence(event.target.value)} placeholder="예: 정류기·도금조 없음, 아연 플레이크 도포 후 소성(ISO 10683), 공정 설명서 No.12" />
                        </label>
                    )}

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">연료 종류</span>
                            <select className={fieldClass} value={kindKey} onChange={(event) => applyKind(FUEL_KINDS.find((item) => item.key === event.target.value) ?? FUEL_KINDS[0])}>
                                {FUEL_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">{kind.factorLabel}</span>
                            <input className={fieldClass} inputMode="decimal" value={factor} onChange={(event) => setFactor(event.target.value)} />
                        </label>
                        {kind.needsNcv ? (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">순발열량 (GJ/{kind.defaults.activity_unit})</span>
                                <input className={fieldClass} inputMode="decimal" value={ncv} onChange={(event) => setNcv(event.target.value)} />
                            </label>
                        ) : (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">계수 출처 유형</span>
                                <select className={fieldClass} value={factorSource ?? 'UNCLASSIFIED'} onChange={(event) => setFactorSource(event.target.value as SourceStream['factor_source_type'])}>
                                    {FACTOR_SOURCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                        )}
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{kind.factorHint}{kind.needsNcv && kind.ncvHint ? ` ${kind.ncvHint}` : ''}</p>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">우리 몫을 어떻게 정하나요?</legend>
                        <div className="mt-1 space-y-2">
                            {BASES.map((option) => (
                                <label key={option} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${basis === option ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                                    <input type="radio" name="outsourced-basis" className="mt-1" checked={basis === option} onChange={() => setBasis(option)} />
                                    <span>
                                        <span className="font-semibold text-slate-900">{OUTSOURCED_BASIS_LABEL[option]}</span>
                                        <span className="block text-xs leading-5 text-slate-600">{BASIS_BODY[option]}</span>
                                        <span className="block text-[11px] leading-4 text-slate-500">근거: {OUTSOURCED_BASIS_ANCHOR[option]}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {needsLine && (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">그 공정 설비의 연료량 ({unit})</span>
                                <input className={fieldClass} inputMode="decimal" value={lineQuantity} onChange={(event) => setLineQuantity(event.target.value)} />
                            </label>
                        )}
                        {needsThroughput && (
                            <>
                                <label className="block text-sm">
                                    <span className="font-semibold text-slate-800">우리 부품 처리량 (t){basis === 'METERED_LINE' ? ' — 우리 전용 설비면 비워 두세요' : ''}</span>
                                    <input className={fieldClass} inputMode="decimal" value={ourT} onChange={(event) => setOurT(event.target.value)} />
                                </label>
                                <label className="block text-sm">
                                    <span className="font-semibold text-slate-800">그 설비 전체 처리량 (t)</span>
                                    <input className={fieldClass} inputMode="decimal" value={lineT} onChange={(event) => setLineT(event.target.value)} />
                                </label>
                            </>
                        )}
                        {needsEquipment && (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">외주처 전체 연료량 — 고지서 총량 ({unit})</span>
                                <input className={fieldClass} inputMode="decimal" value={companyTotal} onChange={(event) => setCompanyTotal(event.target.value)} />
                            </label>
                        )}
                        {basis === 'CONSERVATIVE_ESTIMATE' && (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">추정한 우리 몫 ({unit})</span>
                                <input className={fieldClass} inputMode="decimal" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
                            </label>
                        )}
                    </div>

                    {needsEquipment && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-800">외주처의 가스 사용 설비 (우리 부품을 처리하는 설비에 체크)</p>
                            {equipment.map((row, index) => (
                                <div key={index} className="grid grid-cols-12 items-end gap-2">
                                    <input className={`${fieldClass} col-span-5`} placeholder="설비 이름" value={row.name} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
                                    <input className={`${fieldClass} col-span-3`} inputMode="decimal" placeholder="가동시간 (h)" value={row.hours} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, hours: event.target.value } : item)))} />
                                    <input className={`${fieldClass} col-span-3`} inputMode="decimal" placeholder={`소비율 (${unit}/h)`} value={row.rate} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, rate: event.target.value } : item)))} />
                                    <label className="col-span-1 flex h-11 items-center justify-center text-xs text-slate-600" title="우리 부품을 처리하는 설비">
                                        <input type="checkbox" checked={row.ours} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, ours: event.target.checked } : item)))} />
                                    </label>
                                </div>
                            ))}
                            <button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={() => setEquipment((current) => [...current, emptyEquipment()])}>설비 줄 추가</button>
                            <p className="text-xs leading-5 text-slate-500">재구성한 합계가 고지서 총량과 {Math.round(RECONSTRUCTION_TOLERANCE * 100)}% 넘게 다르면 설비 목록에 빠진 가스 사용처가 없는지 알려 드립니다.</p>
                        </div>
                    )}

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">이 외주 공정을 거친 제품이 속한 공정</legend>
                        <div className="mt-1 space-y-1">
                            {processes.map((process) => (
                                <label key={process.id} className="flex items-start gap-2 text-sm text-slate-700">
                                    <input type="checkbox" className="mt-1" checked={Boolean(selected[process.id])} onChange={(event) => setSelected((current) => ({ ...current, [process.id]: event.target.checked }))} />
                                    <span className="min-w-0">{process.name}</span>
                                </label>
                            ))}
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">고른 공정이 둘 이상이면 우리 몫을 그 공정들의 생산량 비율로 나눕니다.</p>
                    </fieldset>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">활동자료 출처</span>
                            <input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} placeholder="예: ○○열처리 가스 고지서 2025" />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">증빙 (계약서·고지서·가동기록)</span>
                            <input className={fieldClass} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="예: 임가공 계약서, 월별 고지서 12장" />
                        </label>
                    </div>
                    <label className="block text-sm">
                        <span className="font-semibold text-slate-800">{basis === 'CONSERVATIVE_ESTIMATE' ? '추정 근거 (필수)' : '근거·가정 (선택)'}</span>
                        <input className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={basis === 'CONSERVATIVE_ESTIMATE' ? '예: 정격 400 kW × 1,000 h × 부하율 70%' : '예: 외주처 설비 계량기 값을 받음'} />
                    </label>

                    {shareResult.ok ? (
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700" data-testid="outsourced-result">
                            <p className="font-semibold text-slate-900">우리 몫: {fmt(shareResult.share)} {unit}</p>
                            <p className="mt-1">{shareResult.formula}</p>
                            {shareResult.warnings.map((text) => (
                                <p key={text} className="mt-1 flex items-start gap-1.5 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />{text}</p>
                            ))}
                            {chosen.length > 1 && (
                                <p className="mt-1">공정별: {chosen.map((process, index) => `${process.name} ${fmt(shareResult.share * fractions[index])}`).join(' · ')}</p>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs leading-5 text-slate-500">{shareResult.reason}</p>
                    )}
                    {validation.reviews.length > 0 && technique !== 'ELECTROPLATING' && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-amber-800" data-testid="outsourced-reviews">
                            {validation.reviews.map((text) => <li key={text}>{text}</li>)}
                        </ul>
                    )}

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void apply()} disabled={busy || technique === 'ELECTROPLATING'}>저장</Button>
                        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setMessage(''); }} disabled={busy}>취소</Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                        저장하면 고른 공정마다 연료 행 「(외주) …」이 만들어지고 공정의 직접배출이 다시 계산됩니다. 외주처 이름·방법·근거는 산정보고서와 확인 점검(V10)에 남습니다.
                    </p>
                </div>
            )}
        </div>
    );
}

/** 연료 행이 바뀐 공정의 직접배출(EU 문서가 읽는 값)을 배출원 합계로 다시 맞춘다. */
async function recomputeDirect(processes: ProductionProcess[], streams: SourceStream[], processIds: Array<string | undefined>) {
    const touched = new Set(processIds.filter((id): id is string => Boolean(id)));
    for (const process of processes) {
        if (!touched.has(process.id)) continue;
        await updateLocalItem('processes', {
            ...process,
            direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions(process.id, streams),
            direct_emissions_input_mode: 'SOURCE_STREAM_SUM',
        });
    }
}
