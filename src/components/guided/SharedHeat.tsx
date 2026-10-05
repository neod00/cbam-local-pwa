'use client';

import { Button } from '@/components/ui';
import { reconcileSourceStreams, sumReconciledSourceStreamEmissions } from '@/lib/allocation-rules';
import {
    HEAT_QUANTITY_BASIS_LABEL,
    HEAT_REFERENCE_EFFICIENCY,
    HEAT_UNIT_TO_TJ,
    SHARED_HEAT_RULE,
    buildSharedHeatRelease,
    buildProvisionalHeatQuantities,
    buildSharedHeatUpdates,
    resolveSharedHeatSystems,
    validateSharedHeatDraft,
    type SharedHeatDraft,
    type SharedHeatSystem,
} from '@/lib/measurable-heat';
import { updateLocalItem, type HeatConsumption, type HeatQuantityBasis, type ProductionProcess, type SourceStream } from '@/lib/local-db';
import { calculateSourceStreamEmissions, calculateSourceStreamEnergyBreakdown } from '@/lib/source-stream-calculation';
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

const UNITS = Object.keys(HEAT_UNIT_TO_TJ) as Array<HeatConsumption['unit']>;
const BASES = Object.keys(HEAT_QUANTITY_BASIS_LABEL) as HeatQuantityBasis[];
const DEFAULT_NAME = '온수 보일러';

interface ConsumerForm {
    on: boolean;
    quantity: string;
    unit: HeatConsumption['unit'];
    basis: HeatQuantityBasis;
    note: string;
}

const emptyConsumer = (): ConsumerForm => ({ on: false, quantity: '', unit: 'Gcal', basis: 'METERED', note: '' });

/**
 * 변경을 저장한다. 연료가 공정에서 떨어지면 그 공정에 캐시된 직접배출(D_Processes에 쓰이는 값)에 옛 보일러 몫이 남는다 —
 * 그대로 두면 EU 문서가 그 몫을 공정의 직접배출에 한 번, 열 사용으로 또 한 번 센다. 떨어진 공정의 캐시를 다시 맞춘다
 * (배출원 합계 방식인 공정만 — 수기 값은 앱이 임의로 고치지 않고 엔진의 대조 경고가 알린다).
 */
async function persistHeatChanges(
    processes: ProductionProcess[],
    sourceStreams: SourceStream[],
    updates: { processes: ProductionProcess[]; sourceStreams: SourceStream[] }
) {
    const nextStreams = sourceStreams.map((stream) => updates.sourceStreams.find((item) => item.id === stream.id) ?? stream);
    const releasedFrom = new Set(
        updates.sourceStreams.map((stream) => sourceStreams.find((item) => item.id === stream.id)?.process_id).filter((id): id is string => Boolean(id))
    );
    for (const stream of updates.sourceStreams) {
        await updateLocalItem('source_streams', stream);
    }
    for (const process of processes) {
        let next = updates.processes.find((item) => item.id === process.id) ?? process;
        if (releasedFrom.has(process.id) && next.direct_emissions_input_mode === 'SOURCE_STREAM_SUM') {
            next = { ...next, direct_attributable_emissions_tco2e: sumReconciledSourceStreamEmissions(process.id, nextStreams) };
        }
        if (next !== process) {
            await updateLocalItem('processes', next);
        }
    }
}

/**
 * 공장 안 열 공급원(보일러·스팀 헤더) 귀속(4단계 위쪽). 한 보일러의 연료를 여러 공정이 같이 쓰면 연료 배출은 어느 한 공정의
 * 것이 아니다 — 2025/2547 부속서 III A.3은 그 연료 배출을 공정의 직접배출에 넣지 말고 **쓴 열량 비율**로 귀속하라고 한다
 * (CBAM-ALLOC-HEAT-02). 앱이 비율을 계산하고, 엔진이 그 값을 직접배출에 더한다.
 *
 * 폼 초깃값은 열 때마다 저장된 값에서 채운다(useState에 굳히지 않는다) — 굳히면 다른 곳에서 고친 뒤에도 옛 값으로 저장한다.
 */
export function SharedHeat({
    processes,
    sourceStreams,
    onApplied,
}: {
    /** 지금 보고 있는 보고기간의 공정 */
    processes: ProductionProcess[];
    sourceStreams: SourceStream[];
    onApplied: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [editingName, setEditingName] = useState('');
    const [name, setName] = useState(DEFAULT_NAME);
    const [picked, setPicked] = useState<Record<string, boolean>>({});
    const [consumers, setConsumers] = useState<Record<string, ConsumerForm>>({});
    const [outsideQuantity, setOutsideQuantity] = useState('');
    const [outsideUnit, setOutsideUnit] = useState<HeatConsumption['unit']>('Gcal');
    const [outsideNote, setOutsideNote] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const reconciled = useMemo(() => reconcileSourceStreams(sourceStreams).streams, [sourceStreams]);
    const systems = useMemo(
        () => resolveSharedHeatSystems({ processes, sourceStreams: reconciled, emissionsOf: calculateSourceStreamEmissions }),
        [processes, reconciled]
    );
    const fuelStreams = sourceStreams.filter((stream) => stream.stream_type === 'FUEL');
    const processName = (id: string) => processes.find((process) => process.id === id)?.name ?? '삭제된 공정';

    const openForm = (existing?: SharedHeatSystem) => {
        if (existing) {
            const first = sourceStreams.find((stream) => stream.id === existing.streamIds[0]);
            setEditingName(existing.name);
            setName(existing.name);
            setPicked(Object.fromEntries(existing.streamIds.map((id) => [id, true])));
            setConsumers(Object.fromEntries(existing.consumers.map((consumer) => [
                consumer.processId,
                { on: true, quantity: String(consumer.quantity), unit: consumer.unit, basis: consumer.basis, note: consumer.note ?? '' },
            ])));
            setOutsideQuantity(first?.heat_system?.outside_quantity ? String(first.heat_system.outside_quantity) : '');
            setOutsideUnit(first?.heat_system?.outside_unit ?? 'Gcal');
            setOutsideNote(first?.heat_system?.outside_note ?? '');
        } else {
            setEditingName('');
            setName(systems.some((system) => system.name === DEFAULT_NAME) ? '' : DEFAULT_NAME);
            setPicked({});
            setConsumers({});
            setOutsideQuantity('');
            setOutsideUnit('Gcal');
            setOutsideNote('');
        }
        setMessage('');
        setOpen(true);
    };

    const consumerOf = (processId: string) => consumers[processId] ?? emptyConsumer();
    const patchConsumer = (processId: string, patch: Partial<ConsumerForm>) =>
        setConsumers((current) => ({ ...current, [processId]: { ...(current[processId] ?? emptyConsumer()), ...patch } }));

    /** 「열 사용량을 모르겠어요」 — 연료 투입 에너지 × 기준효율 70%를 생산량 비율로 나눠 임시로 채운다. [임시] 표시가 남아 계속 확인을 요구한다. */
    const fillProvisional = () => {
        const pickedStreams = fuelStreams.filter((stream) => picked[stream.id]);
        const rows = processes.filter((process) => consumerOf(process.id).on).map((process) => ({ processId: process.id, weight: process.output_mass_t }));
        if (pickedStreams.length === 0 || rows.length === 0) {
            setMessage('열을 만드는 연료와 열을 받는 공정을 먼저 고르세요.');
            return;
        }
        const fuelEnergyTj = pickedStreams.reduce((sum, stream) => sum + calculateSourceStreamEnergyBreakdown(stream).total, 0);
        const filled = buildProvisionalHeatQuantities({ fuelEnergyTj, rows });
        if (filled.length === 0) {
            setMessage('임시로 채우려면 공정의 생산량(3단계)과 연료 사용량이 필요합니다.');
            return;
        }
        setConsumers((current) => ({
            ...current,
            ...Object.fromEntries(filled.map((item) => [item.processId, { on: true, quantity: String(item.quantityTj), unit: 'TJ' as const, basis: 'EFFICIENCY_PROXY' as const, note: item.note }])),
        }));
        setMessage('');
    };

    const draft: SharedHeatDraft = {
        name,
        streamIds: Object.keys(picked).filter((id) => picked[id]),
        consumers: processes
            .filter((process) => consumerOf(process.id).on)
            .map((process) => {
                const form = consumerOf(process.id);
                return { processId: process.id, quantity: num(form.quantity), unit: form.unit, basis: form.basis, note: form.note };
            }),
        outsideQuantity: num(outsideQuantity),
        outsideUnit,
        outsideNote,
    };
    const draftError = validateSharedHeatDraft(draft, { processes, sourceStreams });

    // 미리보기 — 저장하기 전에 같은 함수로 계산한다(엔진과 같은 입력·같은 규칙).
    const preview = useMemo(() => {
        if (draftError) return null;
        const updates = buildSharedHeatUpdates(processes, sourceStreams, draft);
        const mergedProcesses = processes.map((process) => updates.processes.find((item) => item.id === process.id) ?? process);
        const mergedStreams = reconcileSourceStreams(sourceStreams.map((stream) => updates.sourceStreams.find((item) => item.id === stream.id) ?? stream)).streams;
        return resolveSharedHeatSystems({ processes: mergedProcesses, sourceStreams: mergedStreams, emissionsOf: calculateSourceStreamEmissions })
            .find((system) => system.name === name.trim()) ?? null;
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftError, processes, sourceStreams, name, picked, consumers, outsideQuantity, outsideUnit, outsideNote]);

    const apply = async () => {
        if (draftError) {
            setMessage(draftError);
            return;
        }
        if (!editingName && systems.some((system) => system.name === name.trim())) {
            setMessage(`「${name.trim()}」라는 열 공급원이 이미 있습니다. 다른 이름을 쓰거나 아래에서 그 공급원을 수정하세요.`);
            return;
        }
        setBusy(true);
        try {
            await persistHeatChanges(processes, sourceStreams, buildSharedHeatUpdates(processes, sourceStreams, draft));
            setMessage('');
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const release = async (system: SharedHeatSystem) => {
        if (!window.confirm(`열 공급원 「${system.name}」를 해제할까요?\n연료의 열 공급원 표시와 공정별 열 사용량을 지웁니다. 연료는 어느 공정에도 속하지 않은 채 남으므로, 다시 공정에 연결하지 않으면 그 배출이 계산에서 빠집니다(EU 문서 준비도가 막습니다).`)) {
            return;
        }
        setBusy(true);
        try {
            await persistHeatChanges(processes, sourceStreams, buildSharedHeatRelease(processes, sourceStreams, system.name, system.periodId));
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">보일러·스팀을 여러 공정이 같이 쓰나요?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        한 보일러가 여러 공정(또는 사무동)에 열을 보내면, 그 연료 배출은 어느 한 공정의 것이 아닙니다. 규정은 각 공정이 쓴 열의 양 비율로 나누라고 합니다.
                        열을 받는 공정과 열 사용량을 넣으면 앱이 나눕니다. 한 공정만 쓰는 전용 보일러는 해당하지 않습니다 — 그 연료는 아래에서 그 공정의 연료로 넣으세요.
                    </p>
                </div>
                {!open && (
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => openForm()}>
                        {systems.length > 0 ? '열 공급원 추가' : '열 공급원 만들기'}
                    </Button>
                )}
            </div>

            {systems.map((system) => (
                <div key={system.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-slate-800">
                            <span className="font-semibold">「{system.name}」</span> 연료 배출 {fmt(system.fuelEmissionsTco2e)} tCO₂e · 열 {fmt(system.totalTj, 6)} TJ · 공정 {system.consumers.length}개
                        </p>
                        <span className="flex flex-none gap-2">
                            <button type="button" disabled={busy} onClick={() => openForm(system)} className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50">수정</button>
                            <button type="button" disabled={busy} onClick={() => void release(system)} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">해제</button>
                        </span>
                    </div>
                    {system.problem ? (
                        <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                            {system.problem} 이대로면 이 연료 배출이 계산에서 빠집니다.
                        </p>
                    ) : (
                        <ul className="mt-1 space-y-0.5 text-xs leading-5 text-slate-600">
                            {system.consumers.map((consumer) => (
                                <li key={consumer.processId}>
                                    {processName(consumer.processId)} — {(consumer.share * 100).toFixed(2)}% · <span className="font-semibold tabular-nums text-slate-800">{fmt(consumer.emissionsTco2e)} tCO₂e</span>
                                </li>
                            ))}
                            {system.outsideTj > 0 && (
                                <li>공정 밖 사용(CBAM 계산에서 제외) — {(system.outsideShare * 100).toFixed(2)}% · {fmt(system.outsideEmissionsTco2e)} tCO₂e</li>
                            )}
                            <li className="flex items-center gap-1.5 text-emerald-800">
                                <CheckCircle2 className="h-3.5 w-3.5 flex-none" />
                                나눈 합계가 연료 배출 전체와 같습니다
                            </li>
                        </ul>
                    )}
                </div>
            ))}

            {open && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <label className="block text-sm">
                        <span className="font-semibold text-slate-800">열 공급원 이름</span>
                        <input className={fieldClass} value={name} disabled={Boolean(editingName)} onChange={(event) => setName(event.target.value)} placeholder={DEFAULT_NAME} />
                    </label>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">이 열을 만드는 연료</legend>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            4단계에 넣은 연료 중 이 보일러가 태우는 것을 고르세요. 공정에 매여 있던 연료를 고르면 그 공정에서 떼어 열 공급원으로 옮깁니다 —
                            보일러 연료를 공정별로 나눠 넣어 두었다면 그 행들을 모두 고르세요(합쳐서 한 공급원이 됩니다).
                        </p>
                        <div className="mt-1 space-y-1">
                            {fuelStreams.length === 0 && <p className="text-xs text-amber-800">아직 연료가 없습니다. 아래 「연료 입력」에서 보일러 연료를 먼저 넣으세요.</p>}
                            {fuelStreams.map((stream) => {
                                const owner = stream.heat_system?.name?.trim();
                                const lockedElsewhere = Boolean(owner && owner !== name.trim() && owner !== editingName);
                                return (
                                    <label key={stream.id} className="flex items-start gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            disabled={lockedElsewhere}
                                            checked={Boolean(picked[stream.id]) && !lockedElsewhere}
                                            onChange={(event) => setPicked((current) => ({ ...current, [stream.id]: event.target.checked }))}
                                        />
                                        <span className="min-w-0">
                                            {stream.name}
                                            <span className="ml-1 text-xs text-slate-500">
                                                {fmt(stream.activity_data, 3)} {stream.activity_unit} · {fmt(calculateSourceStreamEmissions(stream))} tCO₂e
                                                {stream.process_id ? ` · 지금 ${processName(stream.process_id)}에 연결됨` : ''}
                                                {lockedElsewhere ? ` · 「${owner}」에서 사용 중` : ''}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">열을 받는 공정과 열 사용량</legend>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">
                            열량계 값이 있으면 그 값을, 없으면 보일러 연료투입 × 효율을 공정별로 나눈 값이나 설비 정격 × 가동시간으로 추정한 값을 넣으세요. 단위는 공정마다 달라도 됩니다.
                        </p>
                        <button
                            type="button"
                            onClick={fillProvisional}
                            className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100"
                        >
                            열 사용량을 모르겠어요 — 임시로 채우기
                        </button>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            연료 투입 에너지 × 기준효율 {HEAT_REFERENCE_EFFICIENCY * 100}%(부속서 II C.1.2.3)를 생산량 비율로 나눠 넣습니다. 계산은 되지만 규정이 정한 열량 기준 귀속이 아니라서 「임시」 표시가 남고 계속 확인을 요구합니다.
                        </p>
                        <div className="mt-2 space-y-3">
                            {processes.map((process) => {
                                const form = consumerOf(process.id);
                                return (
                                    <div key={process.id} className="rounded-lg border border-slate-200 p-2.5">
                                        <label className="flex items-start gap-2 text-sm font-semibold text-slate-800">
                                            <input type="checkbox" className="mt-1" checked={form.on} onChange={(event) => patchConsumer(process.id, { on: event.target.checked })} />
                                            <span className="min-w-0">{process.name}</span>
                                        </label>
                                        {form.on && (
                                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                <label className="block text-xs font-semibold text-slate-600">
                                                    열 사용량
                                                    <input className={fieldClass} inputMode="decimal" value={form.quantity} onChange={(event) => patchConsumer(process.id, { quantity: event.target.value })} />
                                                </label>
                                                <label className="block text-xs font-semibold text-slate-600">
                                                    단위
                                                    <select className={fieldClass} value={form.unit} onChange={(event) => patchConsumer(process.id, { unit: event.target.value as HeatConsumption['unit'] })}>
                                                        {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                                                    </select>
                                                </label>
                                                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                                                    열 사용량을 어떻게 정했나요?
                                                    <select className={fieldClass} value={form.basis} onChange={(event) => patchConsumer(process.id, { basis: event.target.value as HeatQuantityBasis })}>
                                                        {BASES.map((basis) => <option key={basis} value={basis}>{HEAT_QUANTITY_BASIS_LABEL[basis]}</option>)}
                                                    </select>
                                                </label>
                                                <label className="block text-xs font-semibold text-slate-600 sm:col-span-2">
                                                    {form.basis === 'INDIRECT_ESTIMATE' ? '계량이 불가능한 이유와 추정 근거 (필수)' : '근거 메모 (선택)'}
                                                    <input
                                                        className={fieldClass}
                                                        value={form.note}
                                                        onChange={(event) => patchConsumer(process.id, { note: event.target.value })}
                                                        placeholder={form.basis === 'INDIRECT_ESTIMATE' ? '예: 공정별 열량계 없음. 세척조 용량 × 가열시간(가동일지)으로 추정' : '예: 열량계 HM-01 검침대장 2025'}
                                                    />
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">공정 밖에서 쓴 열 (선택)</legend>
                        <p className="mt-0.5 text-xs leading-5 text-slate-500">사무동 난방처럼 CBAM 생산공정이 아닌 곳에서 쓴 열입니다. 전체 열량에 넣어 그 몫의 배출을 CBAM 계산에서 뺍니다.</p>
                        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                            <label className="block text-xs font-semibold text-slate-600">
                                사용량
                                <input className={fieldClass} inputMode="decimal" value={outsideQuantity} onChange={(event) => setOutsideQuantity(event.target.value)} />
                            </label>
                            <label className="block text-xs font-semibold text-slate-600">
                                단위
                                <select className={fieldClass} value={outsideUnit} onChange={(event) => setOutsideUnit(event.target.value as HeatConsumption['unit'])}>
                                    {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                                </select>
                            </label>
                            <label className="block text-xs font-semibold text-slate-600">
                                어디서 썼나요
                                <input className={fieldClass} value={outsideNote} onChange={(event) => setOutsideNote(event.target.value)} placeholder="예: 사무동 난방" />
                            </label>
                        </div>
                    </fieldset>

                    {preview && (
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">공정</th>
                                        <th className="px-3 py-2 text-right font-semibold">열 (TJ)</th>
                                        <th className="px-3 py-2 text-right font-semibold">비율</th>
                                        <th className="px-3 py-2 text-right font-semibold">배출 (tCO₂e)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {preview.consumers.map((consumer) => (
                                        <tr key={consumer.processId} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-800">{consumer.processName}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(consumer.tj, 6)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{(consumer.share * 100).toFixed(2)}%</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{fmt(consumer.emissionsTco2e)}</td>
                                        </tr>
                                    ))}
                                    {preview.outsideTj > 0 && (
                                        <tr className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-600">공정 밖 사용 (제외)</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(preview.outsideTj, 6)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{(preview.outsideShare * 100).toFixed(2)}%</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(preview.outsideEmissionsTco2e)}</td>
                                        </tr>
                                    )}
                                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                                        <td className="px-3 py-2 text-slate-800">합계 = 연료 배출 전체</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(preview.totalTj, 6)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">100%</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmt(preview.consumers.reduce((sum, consumer) => sum + consumer.emissionsTco2e, 0) + preview.outsideEmissionsTco2e)}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    {!message && draftError && <p className="text-xs leading-5 text-slate-500">{draftError}</p>}

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void apply()} disabled={busy}>이대로 적용</Button>
                        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setMessage(''); }} disabled={busy}>취소</Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                        적용하면 고른 연료는 공정에서 떼어 열 공급원으로 옮겨지고, 각 공정의 직접배출에는 위 표의 몫이 더해집니다.
                        근거: {SHARED_HEAT_RULE.anchor}
                    </p>
                </div>
            )}
        </div>
    );
}
