'use client';

import { Button } from '@/components/ui';
import {
    ELECTRICITY_SPLIT_BASIS_ANCHOR,
    ELECTRICITY_SPLIT_BASIS_LABEL,
    checkElectricitySharedMeters,
    type ElectricityMeterGroup,
    type ElectricitySplitBasis,
} from '@/lib/allocation-rules';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import {
    buildElectricitySplitRelease,
    buildElectricitySplitUpdates,
    computeElectricitySplit,
    describeElectricitySplit,
    validateElectricitySplitDraft,
    type ElectricitySplitDraft,
} from '@/lib/electricity-allocation';
import { updateLocalItem, type ProductionProcess } from '@/lib/local-db';
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

const BASIS_OPTIONS: Array<{ value: ElectricitySplitBasis; title: string; body: string }> = [
    { value: 'SUB_METER', title: '공정별 계량기 값이 있어요', body: '계량기 값을 적으면 합계를 고지서 값에 맞춰 드립니다.' },
    { value: 'OUTPUT_MASS', title: '생산량 비율로 나누기', body: '공정별 계량기가 없을 때 규정이 정한 방법입니다. 앱이 계산하고, 확인만 하면 됩니다.' },
    { value: 'INDIRECT_ESTIMATE', title: '설비용량 × 가동시간으로 추정', body: '공정마다 전기를 쓰는 정도가 크게 다를 때 씁니다. 추정 근거를 적어야 합니다.' },
];

const DEFAULT_GROUP = '한전 계량기';

/**
 * 공용 전력 계량기 나누기(5단계 위쪽). 사업장 전체 값과 기준을 받아 앱이 공정별 몫을 계산하고,
 * 나눈 값·기준·근거 문장을 같이 쓰는 공정 전부에 한꺼번에 적는다(CBAM-ALLOC-ELEC-01).
 *
 * 초깃값을 useState에 굳히지 않는다 — 폼을 열 때마다 지금 저장된 값에서 다시 채운다. 굳혀 두면 다른 곳에서
 * 전력을 고친 뒤에도 옛 값으로 나누게 된다(ElectricityForm에 key를 단 것과 같은 이유).
 */
export function ElectricitySplit({
    processes,
    results,
    onApplied,
}: {
    /** 지금 보고 있는 보고기간의 공정 */
    processes: ProductionProcess[];
    results: LocalCalculationResult[];
    onApplied: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    /** 다시 나누는 중인 그룹 이름. 빈 문자열이면 새 계량기다. */
    const [editingGroup, setEditingGroup] = useState('');
    const [group, setGroup] = useState(DEFAULT_GROUP);
    const [total, setTotal] = useState('');
    const [basis, setBasis] = useState<ElectricitySplitBasis>('OUTPUT_MASS');
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [values, setValues] = useState<Record<string, string>>({});
    const [note, setNote] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const groups = useMemo(() => checkElectricitySharedMeters(processes), [processes]);
    const activityLevelOf = (process: ProductionProcess) =>
        results.find((result) => result.process_id === process.id)?.activity_level_t ?? process.output_mass_t;
    /** 다른 계량기 그룹에 이미 속한 공정은 이 폼에서 고를 수 없다 — 한 공정의 전력량 칸은 하나다. */
    const otherGroupOf = (process: ProductionProcess) => {
        const name = process.electricity_shared_meter?.group?.trim();
        return name && name !== editingGroup ? name : '';
    };

    const openForm = (existing?: ElectricityMeterGroup) => {
        if (existing) {
            const members = processes.filter((process) => existing.process_ids.includes(process.id));
            const existingBasis = existing.basis === 'MIXED' ? 'OUTPUT_MASS' : existing.basis;
            setEditingGroup(existing.group);
            setGroup(existing.group);
            setTotal(String(existing.installation_total_mwh));
            setBasis(existingBasis);
            setSelected(Object.fromEntries(members.map((process) => [process.id, true])));
            setValues(Object.fromEntries(members.map((process) => [
                process.id,
                existingBasis === 'OUTPUT_MASS' ? '' : String(process.electricity_shared_meter?.basis_value ?? ''),
            ])));
            setNote(members[0]?.electricity_shared_meter?.note ?? '');
        } else {
            const free = processes.filter((process) => !process.electricity_shared_meter?.group?.trim());
            const currentSum = free.reduce((sum, process) => sum + process.electricity_mwh, 0);
            setEditingGroup('');
            setGroup(groups.some((item) => item.group === DEFAULT_GROUP) ? '' : DEFAULT_GROUP);
            // 이미 공정별로 적어 둔 값이 있으면 그 합계를 미리 넣는다 — 손으로 나눠 적은 사업장은 합계가 곧 고지서 값이다.
            setTotal(currentSum > 0 ? String(Math.round(currentSum * 1e4) / 1e4) : '');
            setBasis('OUTPUT_MASS');
            setSelected(Object.fromEntries(free.map((process) => [process.id, true])));
            setValues({});
            setNote('');
        }
        setMessage('');
        setOpen(true);
    };

    const draft: ElectricitySplitDraft = {
        group,
        totalMwh: num(total),
        basis,
        rows: processes
            .filter((process) => selected[process.id] && !otherGroupOf(process))
            .map((process) => ({
                processId: process.id,
                processName: process.name,
                value: basis === 'OUTPUT_MASS' ? activityLevelOf(process) : num(values[process.id] ?? ''),
            })),
        note,
    };
    const draftError = validateElectricitySplitDraft(draft);
    const plan = draftError ? null : computeElectricitySplit(draft);

    const apply = async () => {
        if (draftError || !plan) {
            setMessage(draftError ?? '');
            return;
        }
        if (!editingGroup && groups.some((item) => item.group === plan.group)) {
            setMessage(`「${plan.group}」라는 계량기가 이미 있습니다. 다른 이름을 쓰거나 아래에서 그 계량기를 다시 나누세요.`);
            return;
        }
        setBusy(true);
        try {
            const splitUpdates = buildElectricitySplitUpdates(processes, plan);
            for (const updatedProcess of splitUpdates) {
                await updateLocalItem('processes', updatedProcess);
            }
            setMessage('');
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const release = async (target: ElectricityMeterGroup) => {
        if (!window.confirm(`「${target.group}」 나누기를 해제할까요?\n공정별 전력량은 그대로 두고, 나눈 기록과 배분 근거 문장만 지웁니다. 합계 검사도 멈춥니다.`)) {
            return;
        }
        setBusy(true);
        try {
            const releaseUpdates = buildElectricitySplitRelease(processes, target.group, target.period_id);
            for (const releasedProcess of releaseUpdates) {
                await updateLocalItem('processes', releasedProcess);
            }
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const valueLabel = basis === 'SUB_METER' ? '계량기 값 (MWh)' : '추정 사용량 (MWh)';

    return (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">계량기 하나를 여러 공정이 같이 쓰나요?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        고지서의 공장 전체 사용량을 넣으면 앱이 공정별 몫으로 나누고, 합계가 고지서와 맞는지 계속 검사합니다.
                    </p>
                </div>
                {!open && (
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => openForm()}>
                        {groups.length > 0 ? '다른 계량기 나누기' : '전력 나누기'}
                    </Button>
                )}
            </div>

            {groups.map((item) => (
                <div key={`${item.period_id ?? ''}|${item.group}`} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 text-slate-800">
                            <span className="font-semibold">「{item.group}」</span> {fmt(item.installation_total_mwh)} MWh ·{' '}
                            {item.basis === 'MIXED' ? '기준 혼재' : ELECTRICITY_SPLIT_BASIS_LABEL[item.basis]} · 공정 {item.process_ids.length}개
                        </p>
                        <span className="flex flex-none gap-2">
                            <button type="button" disabled={busy} onClick={() => openForm(item)} className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50">다시 나누기</button>
                            <button type="button" disabled={busy} onClick={() => void release(item)} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">해제</button>
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
                            공정별 합계 {fmt(item.sum_mwh)} MWh — 고지서 값과 같습니다
                        </p>
                    )}
                </div>
            ))}

            {open && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">계량기 이름</span>
                            <input className={fieldClass} value={group} disabled={Boolean(editingGroup)} onChange={(event) => setGroup(event.target.value)} placeholder={DEFAULT_GROUP} />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">공장 전체 사용량 (MWh)</span>
                            <input className={fieldClass} inputMode="decimal" value={total} onChange={(event) => setTotal(event.target.value)} placeholder="5412" />
                            <span className="mt-1 block text-xs leading-5 text-slate-500">고지서 12개월 합계(kWh) ÷ 1,000. 미리 채워진 값은 지금 공정별로 적힌 값의 합계입니다 — 고지서와 같은지 확인하세요.</span>
                        </label>
                    </div>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">같이 쓰는 공정</legend>
                        <div className="mt-1 space-y-1">
                            {processes.map((process) => {
                                const other = otherGroupOf(process);
                                return (
                                    <label key={process.id} className="flex items-start gap-2 text-sm text-slate-700">
                                        <input
                                            type="checkbox"
                                            className="mt-1"
                                            disabled={Boolean(other)}
                                            checked={Boolean(selected[process.id]) && !other}
                                            onChange={(event) => setSelected((current) => ({ ...current, [process.id]: event.target.checked }))}
                                        />
                                        <span className="min-w-0">
                                            {process.name}
                                            {other && <span className="ml-1 text-xs text-slate-500">— 「{other}」에서 이미 나눔</span>}
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">어떻게 나눌까요?</legend>
                        <div className="mt-1 space-y-2">
                            {BASIS_OPTIONS.map((option) => (
                                <label
                                    key={option.value}
                                    className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${basis === option.value ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'}`}
                                >
                                    <input type="radio" name="electricity-split-basis" className="mt-1" checked={basis === option.value} onChange={() => setBasis(option.value)} />
                                    <span>
                                        <span className="font-semibold text-slate-900">{option.title}</span>
                                        <span className="block text-xs leading-5 text-slate-600">{option.body}</span>
                                        <span className="block text-[11px] leading-4 text-slate-500">근거: {ELECTRICITY_SPLIT_BASIS_ANCHOR[option.value]}</span>
                                    </span>
                                </label>
                            ))}
                        </div>
                    </fieldset>

                    {basis !== 'OUTPUT_MASS' && (
                        <div className="space-y-2">
                            {draft.rows.map((row) => (
                                <label key={row.processId} className="block text-sm">
                                    <span className="font-semibold text-slate-800">{row.processName} — {valueLabel}</span>
                                    <input
                                        className={fieldClass}
                                        inputMode="decimal"
                                        value={values[row.processId] ?? ''}
                                        onChange={(event) => setValues((current) => ({ ...current, [row.processId]: event.target.value }))}
                                    />
                                </label>
                            ))}
                            {basis === 'INDIRECT_ESTIMATE' && (
                                <p className="text-xs leading-5 text-slate-500">추정 사용량 = 설비 정격용량(kW) × 가동시간(h) ÷ 1,000. 부하율을 알면 곱하세요.</p>
                            )}
                        </div>
                    )}

                    {basis !== 'OUTPUT_MASS' && (
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">
                                {basis === 'INDIRECT_ESTIMATE' ? '계량기가 없는 이유와 추정 근거 (필수)' : '계량기 위치·검침 기록 (선택)'}
                            </span>
                            <input className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={basis === 'INDIRECT_ESTIMATE' ? '예: 라인별 계량기 없음. 설비 명판 정격 × 2025 가동일지 시간' : '예: 라인별 분전반 적산전력계, 월별 검침대장'} />
                        </label>
                    )}

                    {plan && (
                        <div className="overflow-hidden rounded-lg border border-slate-200">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-xs text-slate-600">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">공정</th>
                                        <th className="px-3 py-2 text-right font-semibold">{basis === 'OUTPUT_MASS' ? '생산량 (t)' : valueLabel}</th>
                                        <th className="px-3 py-2 text-right font-semibold">비율</th>
                                        <th className="px-3 py-2 text-right font-semibold">몫 (MWh)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {plan.shares.map((share) => (
                                        <tr key={share.processId} className="border-t border-slate-100">
                                            <td className="px-3 py-2 text-slate-800">{share.processName}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(share.value)}</td>
                                            <td className="px-3 py-2 text-right tabular-nums text-slate-700">{(share.share * 100).toFixed(2)}%</td>
                                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-900">{fmt(share.mwh)}</td>
                                        </tr>
                                    ))}
                                    <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                                        <td className="px-3 py-2 text-slate-800">합계</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(plan.valueSum)}</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">100%</td>
                                        <td className="px-3 py-2 text-right tabular-nums text-emerald-800">{fmt(plan.shares.reduce((sum, share) => sum + share.mwh, 0))}</td>
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
                            <p className="mt-1">{describeElectricitySplit(plan, plan.shares[0].processId)}</p>
                        </div>
                    )}

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    {!message && draftError && <p className="text-xs leading-5 text-slate-500">{draftError}</p>}

                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void apply()} disabled={busy}>이대로 나누기</Button>
                        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setMessage(''); }} disabled={busy}>취소</Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                        나눈 값은 각 공정의 전력 사용량에 들어갑니다. 배출계수는 아래에서 공정별로 넣습니다.
                    </p>
                </div>
            )}
        </div>
    );
}
