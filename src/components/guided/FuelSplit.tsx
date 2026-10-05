'use client';

import { Button } from '@/components/ui';
import { reconcileSourceStreams, sumReconciledSourceStreamEmissions } from '@/lib/allocation-rules';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import {
    FUEL_SPLIT_BASIS_ANCHOR,
    FUEL_SPLIT_BASIS_LABEL,
    buildFuelSplitRelease,
    buildFuelSplitStreams,
    computeFuelSplit,
    describeFuelSplit,
    litresToTonnes,
    tonnesToLitres,
    validateFuelSplitDraft,
    type FuelSplitBasis,
    type FuelSplitDraft,
    type FuelSplitTemplate,
} from '@/lib/fuel-allocation';
import { createLocalItem, updateLocalItem, type ProductionProcess, type SourceStream } from '@/lib/local-db';
import {
    GUIDED_STREAM_KINDS,
    FACTOR_SOURCE_TYPE_OPTIONS,
    createSourceStreamValidationErrors,
    firstSourceStreamError,
    matchGuidedStreamKind,
    type GuidedStreamKind,
} from '@/lib/source-stream-input';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useMemo, useState } from 'react';

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

const num = (value: string) => {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
};
const fmt = (value: number, digits = 4) =>
    new Intl.NumberFormat('ko-KR', { maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

const FUEL_KINDS = GUIDED_STREAM_KINDS.filter((kind) => kind.defaults.stream_type === 'FUEL');
const BASES: FuelSplitBasis[] = ['OUTPUT_MASS', 'SUB_METER', 'ESTIMATE'];
const BASIS_BODY: Record<FuelSplitBasis, string> = {
    OUTPUT_MASS: '공정별 계량기가 없을 때 규정이 정한 방법입니다. 앱이 계산하고, 확인만 하면 됩니다.',
    SUB_METER: '공정별 계량기 값을 적으면 합계를 고지서 값에 맞춰 드립니다(엔진이 정합계수를 적용).',
    ESTIMATE: '공정마다 연료를 쓰는 정도가 크게 다를 때 씁니다. 추정 근거를 적어야 합니다.',
};

/** 화면 기준 ← 저장된 shared_meter.basis. 규정에 열거되지 않은 옛 값은 추정으로 보고 근거를 다시 받는다. */
const basisFromStored = (basis: NonNullable<SourceStream['shared_meter']>['basis']): FuelSplitBasis =>
    basis === 'SUB_METER' ? 'SUB_METER' : basis === 'OUTPUT_MASS' ? 'OUTPUT_MASS' : 'ESTIMATE';

const unitOf = (kind: GuidedStreamKind) => (kind.litres ? 'L' : kind.defaults.activity_unit);

/**
 * 변경을 저장한다. 연료 행을 만들거나 고치면 그 공정에 캐시된 직접배출(D_Processes에 쓰이는 값)을 다시 맞춘다 —
 * 안 맞추면 EU 문서가 옛 합계를 쓴다. 배출원 합계 방식으로 맞춘다(지도의 다른 경로와 같다).
 */
async function persistFuelChanges(
    processes: ProductionProcess[],
    streams: SourceStream[],
    changes: { create: Array<Omit<SourceStream, 'id' | 'created_at' | 'updated_at'>>; update: SourceStream[] }
) {
    const updatedById = new Map<string, SourceStream>();
    for (const stream of changes.update) {
        updatedById.set(stream.id, await updateLocalItem('source_streams', stream));
    }
    const created: SourceStream[] = [];
    for (const draft of changes.create) {
        created.push(await createLocalItem('source_streams', draft));
    }
    const nextStreams = [...streams.map((stream) => updatedById.get(stream.id) ?? stream), ...created];
    const touched = new Set(
        [...changes.update, ...created].flatMap((stream) => [stream.process_id, streams.find((item) => item.id === stream.id)?.process_id])
            .filter((id): id is string => Boolean(id))
    );
    for (const process of processes) {
        if (!touched.has(process.id)) continue;
        await updateLocalItem('processes', {
            ...process,
            direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions(process.id, nextStreams),
            direct_emissions_input_mode: 'SOURCE_STREAM_SUM',
        });
    }
}

/**
 * 공용 연료 나누기(4단계 위쪽). 한 고지서·전표의 연료를 여러 공정이 같이 쓰면, 사업장 전체 값과 기준을 받아 앱이 공정별 몫을 계산하고
 * 공정마다 연료 행을 한꺼번에 만든다(CBAM-ALLOC-RECF-01·02·03). 보일러·스팀처럼 열을 만드는 연료는 아래 「열 공급원」으로 다룬다.
 *
 * 폼 초깃값은 열 때마다 저장된 값에서 채운다(useState에 굳히지 않는다).
 */
export function FuelSplit({
    processes,
    sourceStreams,
    results,
    onApplied,
}: {
    processes: ProductionProcess[];
    sourceStreams: SourceStream[];
    results: LocalCalculationResult[];
    onApplied: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState('');
    const [kindKey, setKindKey] = useState(FUEL_KINDS[0].key);
    const [group, setGroup] = useState('');
    const [total, setTotal] = useState('');
    const [basis, setBasis] = useState<FuelSplitBasis>('OUTPUT_MASS');
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [values, setValues] = useState<Record<string, string>>({});
    const [note, setNote] = useState('');
    const [factor, setFactor] = useState('');
    const [ncv, setNcv] = useState('');
    const [factorSource, setFactorSource] = useState<SourceStream['factor_source_type']>('UNCLASSIFIED');
    const [source, setSource] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const kind = FUEL_KINDS.find((item) => item.key === kindKey) ?? FUEL_KINDS[0];
    const periodId = processes[0]?.period_id;
    const toStorage = (amount: number) => (kind.litres ? litresToTonnes(amount, kind.litres.densityKgPerL) : amount);
    const meterRows = sourceStreams.filter((stream) => stream.shared_meter?.group?.trim() && !stream.heat_system?.name?.trim());
    const groups = useMemo(
        () => reconcileSourceStreams(meterRows).groups,
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sourceStreams]
    );
    const activityLevelOf = (process: ProductionProcess) =>
        results.find((result) => result.process_id === process.id)?.activity_level_t ?? process.output_mass_t;

    const applyKind = (next: GuidedStreamKind) => {
        setKindKey(next.key);
        setFactor(String(next.defaults.emission_factor_tco2e_per_unit));
        setNcv(String(next.defaults.ncv_gj_per_unit));
        setFactorSource(next.defaults.factor_source_type);
    };

    const openForm = (existingGroup?: string) => {
        if (existingGroup) {
            const members = meterRows.filter((stream) => stream.shared_meter?.group?.trim() === existingGroup);
            const first = members[0];
            const matched = FUEL_KINDS.find((item) => item.key === matchGuidedStreamKind(first).key)
                ?? FUEL_KINDS.find((item) => !item.litres && item.defaults.activity_unit === first.activity_unit) ?? FUEL_KINDS[0];
            const storedBasis = basisFromStored(first.shared_meter?.basis ?? 'OUTPUT_MASS');
            const toInput = (stored: number) => (matched.litres ? tonnesToLitres(stored, matched.litres.densityKgPerL) : stored);
            setEditingGroup(existingGroup);
            setKindKey(matched.key);
            setGroup(existingGroup);
            setTotal(String(toInput(first.shared_meter?.installation_total_activity_data ?? 0)));
            setBasis(storedBasis);
            setSelected(Object.fromEntries(members.map((stream) => [stream.process_id ?? '', true])));
            setValues(Object.fromEntries(members.map((stream) => [stream.process_id ?? '', storedBasis === 'OUTPUT_MASS' ? '' : String(toInput(stream.activity_data))])));
            setNote(storedBasis === 'ESTIMATE' ? '' : '');
            setFactor(String(first.emission_factor_tco2e_per_unit));
            setNcv(String(first.ncv_gj_per_unit));
            setFactorSource(first.factor_source_type ?? 'UNCLASSIFIED');
            setSource(first.source.split(' · 공용 계량기')[0]);
        } else {
            setEditingGroup('');
            applyKind(FUEL_KINDS[0]);
            setGroup('');
            setTotal('');
            setBasis('OUTPUT_MASS');
            setSelected(Object.fromEntries(processes.map((process) => [process.id, true])));
            setValues({});
            setNote('');
            setSource('');
        }
        setMessage('');
        setOpen(true);
    };

    const draft: FuelSplitDraft = {
        group,
        total: num(total),
        basis,
        rows: processes
            .filter((process) => selected[process.id])
            .map((process) => ({
                processId: process.id,
                processName: process.name,
                value: basis === 'OUTPUT_MASS' ? activityLevelOf(process) : num(values[process.id] ?? ''),
            })),
        note,
    };
    const existingOtherGroups = groups.filter((item) => item.group !== editingGroup && (item.period_id ?? '') === (periodId ?? '')).map((item) => item.group);
    const draftError = validateFuelSplitDraft(draft, existingOtherGroups);
    const plan = draftError ? null : computeFuelSplit(draft, toStorage);
    const template: FuelSplitTemplate = {
        ...kind.defaults,
        ncv_gj_per_unit: kind.needsNcv ? num(ncv) : kind.defaults.ncv_gj_per_unit,
        emission_factor_tco2e_per_unit: num(factor),
        factor_source_type: factorSource,
    };

    const apply = async () => {
        if (draftError || !plan) {
            setMessage(draftError ?? '');
            return;
        }
        if (!source.trim()) {
            setMessage('활동자료 출처를 적으세요. 예: 삼천리 고지서 2025, 주유 전표.');
            return;
        }
        const changes = buildFuelSplitStreams({
            streams: sourceStreams,
            processes,
            plan,
            template,
            fuelName: kind.label.split(' — ')[1]?.split(' (')[0] ?? kind.label,
            inputUnit: kind.litres ? 'L' : undefined,
            source,
            storedTotal: toStorage(plan.total),
        });
        // 저장하는 행마다 상세 화면과 같은 검증을 거친다 — 순발열량·계수·출처 유형이 비면 막는다.
        for (const row of [...changes.create, ...changes.update]) {
            const error = firstSourceStreamError(createSourceStreamValidationErrors(row));
            if (error) {
                setMessage(`${row.name}: ${error}`);
                return;
            }
        }
        setBusy(true);
        try {
            await persistFuelChanges(processes, sourceStreams, changes);
            setMessage('');
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const release = async (name: string) => {
        if (!window.confirm(`공용 계량기 「${name}」 나누기를 해제할까요?\n연료 행과 공정별 사용량은 그대로 두고, 공용 계량기 기록(합계 검사)만 지웁니다.`)) {
            return;
        }
        setBusy(true);
        try {
            await persistFuelChanges(processes, sourceStreams, { create: [], update: buildFuelSplitRelease(sourceStreams, name, periodId) });
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const unit = unitOf(kind);

    return (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">고지서 하나의 연료를 여러 공정이 같이 쓰나요?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        지게차 경유나 공용 가열로처럼 한 고지서·전표의 연료를 여러 공정이 나눠 쓰면, 공장 전체 사용량을 넣고 나누는 방법을 고르세요.
                        앱이 공정별 몫을 계산해 연료 행을 만들고, 합계가 고지서와 맞는지 계속 검사합니다. 보일러·스팀처럼 열을 만드는 연료는 아래 「보일러·스팀」으로 넣으세요.
                    </p>
                </div>
                {!open && (
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => openForm()}>
                        {groups.length > 0 ? '연료 나누기 추가' : '연료 나누기'}
                    </Button>
                )}
            </div>

            {groups.filter((item) => (item.period_id ?? '') === (periodId ?? '')).map((item) => (
                <div key={`${item.period_id ?? ''}|${item.group}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-slate-800">
                            <span className="font-semibold">「{item.group}」</span> 전체 {fmt(item.installation_total)} {item.unit} ·{' '}
                            {item.mode === 'SUB_METER' ? '계량기 값' : item.mode === 'MIXED' ? '기준 혼재' : '계량 없이 나눔'} · 행 {item.stream_ids.length}개
                        </p>
                        <span className="flex flex-none gap-2">
                            <button type="button" disabled={busy} onClick={() => openForm(item.group)} className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50">다시 나누기</button>
                            <button type="button" disabled={busy} onClick={() => void release(item.group)} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">해제</button>
                        </span>
                    </div>
                    {item.reason ? (
                        <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                            {item.reason}
                        </p>
                    ) : (
                        <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-800">
                            <CheckCircle2 className="h-3.5 w-3.5 flex-none" />
                            {item.applied ? `정합계수 RecF ${item.factor.toFixed(4)} 적용 — 합계가 고지서 값과 같아집니다` : `공정별 합계 ${fmt(item.sub_total)} ${item.unit} — 고지서 값과 같습니다`}
                        </p>
                    )}
                </div>
            ))}

            {open && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">연료 종류</span>
                            <select className={fieldClass} value={kindKey} disabled={Boolean(editingGroup)} onChange={(event) => applyKind(FUEL_KINDS.find((item) => item.key === event.target.value) ?? FUEL_KINDS[0])}>
                                {FUEL_KINDS.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
                            </select>
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">계량기 이름</span>
                            <input className={fieldClass} value={group} disabled={Boolean(editingGroup)} onChange={(event) => setGroup(event.target.value)} placeholder="예: 공용 경유 지게차" />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">공장 전체 사용량 ({unit})</span>
                            <input className={fieldClass} inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} />
                            <span className="mt-1 block text-xs leading-5 text-slate-500">{kind.activityHint}</span>
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">활동자료 출처</span>
                            <input className={fieldClass} value={source} onChange={(event) => setSource(event.target.value)} placeholder="예: 삼천리 고지서 2025, 주유 전표" />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">{kind.factorLabel}</span>
                            <input className={fieldClass} inputMode="decimal" value={factor} onChange={(event) => setFactor(event.target.value)} />
                        </label>
                        {kind.needsNcv && (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">순발열량 (GJ/{kind.litres ? 't' : kind.defaults.activity_unit})</span>
                                <input className={fieldClass} inputMode="decimal" value={ncv} onChange={(event) => setNcv(event.target.value)} />
                            </label>
                        )}
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">계수 출처 유형</span>
                            <select className={fieldClass} value={factorSource ?? 'UNCLASSIFIED'} onChange={(event) => setFactorSource(event.target.value as SourceStream['factor_source_type'])}>
                                {FACTOR_SOURCE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">{kind.factorHint}{kind.needsNcv && kind.ncvHint ? ` ${kind.ncvHint}` : ''}</p>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">같이 쓰는 공정</legend>
                        <div className="mt-1 space-y-1">
                            {processes.map((process) => (
                                <label key={process.id} className="flex items-start gap-2 text-sm text-slate-700">
                                    <input type="checkbox" className="mt-1" checked={Boolean(selected[process.id])} onChange={(event) => setSelected((current) => ({ ...current, [process.id]: event.target.checked }))} />
                                    <span className="min-w-0">{process.name}</span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">어떻게 나눌까요?</legend>
                        <div className="mt-1 space-y-2">
                            {BASES.map((option) => (
                                <label key={option} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${basis === option ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                                    <input type="radio" name="fuel-split-basis" className="mt-1" checked={basis === option} onChange={() => setBasis(option)} />
                                    <span>
                                        <span className="font-semibold text-slate-900">{FUEL_SPLIT_BASIS_LABEL[option]}</span>
                                        <span className="block text-xs leading-5 text-slate-600">{BASIS_BODY[option]}</span>
                                        <span className="block text-[11px] leading-4 text-slate-500">근거: {FUEL_SPLIT_BASIS_ANCHOR[option]}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {basis !== 'OUTPUT_MASS' && (
                        <div className="space-y-2">
                            {draft.rows.map((row) => (
                                <label key={row.processId} className="block text-sm">
                                    <span className="font-semibold text-slate-800">{row.processName} — {basis === 'SUB_METER' ? '계량기 값' : '추정 사용량'} ({unit})</span>
                                    <input className={fieldClass} inputMode="decimal" value={values[row.processId] ?? ''} onChange={(event) => setValues((current) => ({ ...current, [row.processId]: event.target.value }))} />
                                </label>
                            ))}
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">{basis === 'ESTIMATE' ? '계량기가 없는 이유와 추정 근거 (필수)' : '계량기 위치·검침 기록 (선택)'}</span>
                                <input className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={basis === 'ESTIMATE' ? '예: 라인별 계량기 없음. 설비 명판 정격 × 2025 가동일지' : '예: 라인별 서브미터, 월별 검침대장'} />
                            </label>
                        </div>
                    )}

                    {plan && (
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">공정</th>
                                        <th className="px-3 py-2 text-right font-semibold">{basis === 'OUTPUT_MASS' ? '생산량 (t)' : '입력값'}</th>
                                        <th className="px-3 py-2 text-right font-semibold">비율</th>
                                        <th className="px-3 py-2 text-right font-semibold">몫 ({unit})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plan.shares.map((share) => (
                                        <tr key={share.processId} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-800">{share.processName}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(share.value)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{(share.share * 100).toFixed(2)}%</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{fmt(share.corrected)}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                                        <td className="px-3 py-2 text-slate-800">합계</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(plan.valueSum)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">100%</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmt(plan.shares.reduce((sum, share) => sum + share.corrected, 0))}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                    {plan?.caution && (
                        <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                            {plan.caution}
                        </p>
                    )}
                    {plan && (
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
                            <p className="font-semibold text-slate-800">보고서에 이렇게 적힙니다 ({plan.shares[0].processName})</p>
                            <p className="mt-1">{describeFuelSplit(plan, plan.shares[0].processId, unit)}</p>
                        </div>
                    )}

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    {!message && draftError && <p className="text-xs leading-5 text-slate-500">{draftError}</p>}

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void apply()} disabled={busy}>이대로 나누기</Button>
                        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setMessage(''); }} disabled={busy}>취소</Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                        나누면 공정마다 연료 행이 만들어지고(또는 갱신되고), 공정의 직접배출이 다시 계산됩니다. 같은 공정의 다른 연료 행은 건드리지 않습니다.
                    </p>
                </div>
            )}
        </div>
    );
}
