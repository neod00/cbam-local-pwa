'use client';

import { Button } from '@/components/ui';
import type { LocalCalculationResult } from '@/lib/calculation-engine';
import { updateLocalItem, type OutsourcedBasis, type OutsourcedEquipment, type OutsourcedProcessInfo, type OutsourcedTechnique, type ProductionProcess } from '@/lib/local-db';
import {
    OUTSOURCED_BASIS_ANCHOR,
    OUTSOURCED_BASIS_LABEL,
    OUTSOURCED_TECHNIQUE_LABEL,
    RECONSTRUCTION_TOLERANCE,
    buildOutsourcedElectricityRemoval,
    buildOutsourcedElectricityUpdates,
    checkOutsourcedElectricity,
    computeOutsourcedShare,
    groupOutsourcedElectricity,
    validateOutsourcedInfo,
} from '@/lib/outsourced-process';
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

const TECHNIQUES = Object.keys(OUTSOURCED_TECHNIQUE_LABEL) as OutsourcedTechnique[];
const BASES = Object.keys(OUTSOURCED_BASIS_LABEL) as OutsourcedBasis[];
const BASIS_BODY: Record<OutsourcedBasis, string> = {
    METERED_LINE: '외주처가 그 공정 설비의 전력 계량값을 줄 수 있을 때. 우리만 쓰는 설비면 그 값이 곧 우리 몫입니다.',
    RECONSTRUCTED: '계량기가 없을 때. 설비별 정격 전력 × 가동시간으로 사용량을 재구성하고 고지서 총량에 맞춥니다(보정계수).',
    OUTPUT_MASS: '같은 설비·같은 조건에서 여러 고객 제품을 처리할 때. 설비 전력량을 처리 중량 비율로 나눕니다.',
    CONSERVATIVE_ESTIMATE: '위 자료가 모두 없을 때의 마지막 수단. 설비 정격·가동시간 같은 객관적 근거로 직접 계산한 값을 적고, 항상 「확인 필요」로 남습니다.',
};

interface EquipmentRow { name: string; hours: string; kw: string; ours: boolean }
const emptyEquipment = (ours = false): EquipmentRow => ({ name: '', hours: '', kw: '', ours });

/**
 * 외주처가 우리 부품에 쓴 전기(간접배출)의 우리 몫 (4단계, 외주 임가공 연료 입력 바로 아래).
 * EC CBAM Q&A 2026-05-27 4.31: 외주한 경계 안 공정은 우리 사업장에서 한 것으로 센다 — 연료뿐 아니라 전기도 같다.
 * 합계는 공정의 전력 사용량(electricity_mwh)에 더해 두고 외주 몫은 따로 기록한다 → 엔진·EU 엑셀은 그대로, 다시 나눠도 지워지지 않는다.
 * 계산·저장 규칙은 outsourced-process.ts(순수). 설계: docs/harness/outsourced-electricity-design.md
 */
export function OutsourcedElectricity({
    processes,
    results,
    onApplied,
}: {
    processes: ProductionProcess[];
    results: LocalCalculationResult[];
    onApplied: () => Promise<void> | void;
}) {
    const [open, setOpen] = useState(false);
    const [editingKey, setEditingKey] = useState('');
    const [subcontractor, setSubcontractor] = useState('');
    const [technique, setTechnique] = useState<OutsourcedTechnique>('HEAT_TREATMENT');
    const [techniqueEvidence, setTechniqueEvidence] = useState('');
    const [basis, setBasis] = useState<OutsourcedBasis>('METERED_LINE');
    const [companyTotal, setCompanyTotal] = useState('');
    const [lineQuantity, setLineQuantity] = useState('');
    const [ourT, setOurT] = useState('');
    const [lineT, setLineT] = useState('');
    const [estimate, setEstimate] = useState('');
    const [equipment, setEquipment] = useState<EquipmentRow[]>([emptyEquipment(true), emptyEquipment(false)]);
    const [note, setNote] = useState('');
    const [evidence, setEvidence] = useState('');
    const [sameGrid, setSameGrid] = useState(false);
    const [selected, setSelected] = useState<Record<string, boolean>>({});
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const groups = groupOutsourcedElectricity(processes);
    const issues = checkOutsourcedElectricity(processes);
    const activityLevelOf = (process: ProductionProcess) => results.find((result) => result.process_id === process.id)?.activity_level_t ?? process.output_mass_t;

    const openForm = (key?: string) => {
        const group = key ? groups.find((item) => item.key === key) : undefined;
        if (group) {
            const info = group.first;
            setEditingKey(group.key);
            setSubcontractor(info.subcontractor);
            setTechnique(info.technique);
            setTechniqueEvidence(info.technique_evidence ?? '');
            setBasis(info.basis);
            setCompanyTotal(info.company_total !== undefined ? String(info.company_total) : '');
            setLineQuantity(info.line_quantity !== undefined ? String(info.line_quantity) : '');
            setOurT(info.our_throughput_t !== undefined ? String(info.our_throughput_t) : '');
            setLineT(info.line_throughput_t !== undefined ? String(info.line_throughput_t) : '');
            setEstimate(info.estimate_quantity !== undefined ? String(info.estimate_quantity) : '');
            setEquipment(info.equipment?.length ? info.equipment.map((item) => ({ name: item.name, hours: String(item.hours), kw: String(Math.round(item.rate_per_h * 1e6) / 1e3), ours: Boolean(item.ours) })) : [emptyEquipment(true), emptyEquipment(false)]);
            setNote(info.note);
            setEvidence(info.evidence ?? '');
            setSameGrid(info.same_grid === true);
            setSelected(Object.fromEntries(group.members.map((member) => [member.process.id, true])));
        } else {
            setEditingKey('');
            setSubcontractor('');
            setTechnique('HEAT_TREATMENT');
            setTechniqueEvidence('');
            setBasis('METERED_LINE');
            setCompanyTotal(''); setLineQuantity(''); setOurT(''); setLineT(''); setEstimate('');
            setEquipment([emptyEquipment(true), emptyEquipment(false)]);
            setNote(''); setEvidence(''); setSameGrid(false);
            setSelected(Object.fromEntries(processes.map((process) => [process.id, false])));
        }
        setMessage('');
        setOpen(true);
    };

    // 정격은 kW로 받고 MWh/h로 바꿔 저장한다(kW ÷ 1,000) — 고지서는 MWh, 설비 명판은 kW다.
    const equipmentList: OutsourcedEquipment[] = equipment
        .filter((row) => row.name.trim() || row.hours.trim() || row.kw.trim())
        .map((row) => ({ name: row.name.trim() || '(이름 없음)', hours: num(row.hours), rate_per_h: num(row.kw) / 1000, ours: row.ours }));
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
    const shareResult = computeOutsourcedShare(info, 'electricity');
    const validation = validateOutsourcedInfo(info);
    const chosen = processes.filter((process) => selected[process.id]);
    const weights = chosen.map((process) => Math.max(activityLevelOf(process), 0));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    const fractions = chosen.map((_, index) => (weightSum > 0 ? weights[index] / weightSum : 1 / chosen.length));
    const noFactor = chosen.filter((process) => !(process.electricity_ef_tco2e_per_mwh > 0));

    const apply = async () => {
        if (validation.errors.length > 0) { setMessage(validation.errors[0]); return; }
        if (!sameGrid) { setMessage('외주처가 같은 나라의 계통 전력을 쓰는지 확인(체크)해 주세요 — 전력 배출계수가 하나라서 다른 나라 외주처의 전력은 아직 받지 않습니다. 해당하면 검증인과 처리 방식을 따로 정하세요.'); return; }
        if (!shareResult.ok) { setMessage(shareResult.reason); return; }
        if (chosen.length === 0) { setMessage('외주 공정에서 처리한 제품이 속한 공정을 하나 이상 고르세요.'); return; }
        const built = buildOutsourcedElectricityUpdates(processes, {
            editKey: editingKey || undefined,
            info,
            sameGrid,
            total: shareResult.share,
            targets: chosen.map((process, index) => ({ processId: process.id, fraction: fractions[index] })),
        });
        if (!built.ok) { setMessage(built.reason); return; }
        setBusy(true);
        try {
            for (const process of built.updates) await updateLocalItem('processes', process);
            setMessage('');
            setOpen(false);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const remove = async (key: string) => {
        const group = groups.find((item) => item.key === key);
        if (!group || !window.confirm(`외주처 전기 「${group.first.subcontractor}」(${fmt(group.total)} MWh)을(를) 지울까요?\n공정의 전력 사용량에서 그 몫이 빠지고, 자체 전력은 그대로입니다.`)) return;
        setBusy(true);
        try {
            for (const process of buildOutsourcedElectricityRemoval(processes, key)) await updateLocalItem('processes', process);
            await onApplied();
        } finally {
            setBusy(false);
        }
    };

    const needsEquipment = basis === 'RECONSTRUCTED';
    const needsLine = basis === 'METERED_LINE' || basis === 'OUTPUT_MASS';

    return (
        <div className="space-y-3 rounded-xl border border-teal-200 bg-teal-50/40 p-4" data-testid="outsourced-electricity">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">외주사가 우리 부품에 쓴 전기도 있나요?</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                        위의 외주 공정은 가스뿐 아니라 <span className="font-semibold">전기</span>도 씁니다(건조로·송풍기·컨베이어, 전기로 열처리 등). 그 우리 몫도 우리 공정의 전력 사용량에 더해 간접배출로 셉니다(EU Q&amp;A 4.31).
                        합계는 5단계 전력 사용량에 들어가고, 외주 몫은 따로 기록되어 전력을 다시 나눠도 지워지지 않습니다.
                        외주사가 <span className="font-semibold">같은 나라의 전력망</span> 전기를 쓸 때만 받습니다(전력 배출계수가 하나라서).
                    </p>
                </div>
                {!open && (
                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => openForm()} disabled={processes.length === 0}>
                        {groups.length > 0 ? '외주처 전기 추가' : '외주처 전기 입력'}
                    </Button>
                )}
            </div>

            {groups.map((group) => {
                const memberIds = group.members.map((member) => member.process.id);
                const mine = issues.filter((issue) => memberIds.includes(issue.processId));
                return (
                    <div key={group.key} className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm" data-testid="outsourced-electricity-group">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="min-w-0 text-slate-800">
                                <span className="font-semibold">「{group.first.subcontractor}」</span> {OUTSOURCED_TECHNIQUE_LABEL[group.first.technique]} · 우리 몫 {fmt(group.total)} MWh · 공정 {group.members.length}개
                            </p>
                            <span className="flex flex-none gap-2">
                                <button type="button" disabled={busy} onClick={() => openForm(group.key)} className="text-xs font-semibold text-teal-700 hover:underline disabled:opacity-50">고치기</button>
                                <button type="button" disabled={busy} onClick={() => void remove(group.key)} className="text-xs font-semibold text-slate-500 hover:underline disabled:opacity-50">지우기</button>
                            </span>
                        </div>
                        <p className="mt-1 text-xs leading-5 text-slate-500">{OUTSOURCED_BASIS_LABEL[group.first.basis]} · {OUTSOURCED_BASIS_ANCHOR[group.first.basis]}</p>
                        {mine.length === 0 ? (
                            <p className="mt-1 flex items-center gap-1.5 text-xs text-emerald-800"><CheckCircle2 className="h-3.5 w-3.5 flex-none" />방법·근거가 갖춰졌습니다.</p>
                        ) : mine.map((issue, index) => (
                            <p key={`${issue.code}-${issue.processId}-${index}`} className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-amber-800">
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
                            <input className={fieldClass} value={subcontractor} onChange={(event) => setSubcontractor(event.target.value)} placeholder="예: ○○열처리, ○○코팅 (가스를 입력한 외주처와 같게)" />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">어떤 공정인가요?</span>
                            <select className={fieldClass} value={technique} onChange={(event) => setTechnique(event.target.value as OutsourcedTechnique)}>
                                {TECHNIQUES.map((item) => <option key={item} value={item}>{OUTSOURCED_TECHNIQUE_LABEL[item]}</option>)}
                            </select>
                        </label>
                    </div>
                    {technique === 'ELECTROPLATING' && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 ring-1 ring-amber-200" data-testid="outsourced-electricity-plating-warning">
                            {validation.errors.find((text) => text.startsWith('전기도금')) ?? ''}
                        </p>
                    )}
                    {(technique === 'ZINC_FLAKE_COATING' || technique === 'OTHER_COATING') && (
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">분류 근거 (전류를 쓰지 않는 코팅이라는 근거)</span>
                            <input className={fieldClass} value={techniqueEvidence} onChange={(event) => setTechniqueEvidence(event.target.value)} placeholder="예: 정류기·도금조 없음, 아연 플레이크 도포 후 소성(ISO 10683)" />
                        </label>
                    )}

                    <label className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                        <input type="checkbox" className="mt-1" checked={sameGrid} onChange={(event) => setSameGrid(event.target.checked)} />
                        <span>
                            <span className="font-semibold">외주처가 우리 공정과 같은 나라(국내)의 전력망 전기를 씁니다</span>
                            <span className="block text-xs leading-5 text-slate-500">우리 공정의 전력 배출계수 하나로 계산합니다. 외주처가 해외에 있어 계수가 다르면 체크하지 말고 검증인과 처리 방식을 정하세요.</span>
                        </span>
                    </label>

                    <fieldset>
                        <legend className="text-sm font-semibold text-slate-800">우리 몫을 어떻게 정하나요?</legend>
                        <div className="mt-1 space-y-2">
                            {BASES.map((option) => (
                                <label key={option} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${basis === option ? 'border-teal-600 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                                    <input type="radio" name="outsourced-electricity-basis" className="mt-1" checked={basis === option} onChange={() => setBasis(option)} />
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
                                <span className="font-semibold text-slate-800">그 공정 설비의 전력량 (MWh)</span>
                                <input className={fieldClass} inputMode="decimal" value={lineQuantity} onChange={(event) => setLineQuantity(event.target.value)} />
                            </label>
                        )}
                        {needsLine && (
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
                                <span className="font-semibold text-slate-800">외주처 전체 전력량 — 고지서 총량 (MWh)</span>
                                <input className={fieldClass} inputMode="decimal" value={companyTotal} onChange={(event) => setCompanyTotal(event.target.value)} />
                            </label>
                        )}
                        {basis === 'CONSERVATIVE_ESTIMATE' && (
                            <label className="block text-sm">
                                <span className="font-semibold text-slate-800">추정한 우리 몫 (MWh)</span>
                                <input className={fieldClass} inputMode="decimal" value={estimate} onChange={(event) => setEstimate(event.target.value)} />
                            </label>
                        )}
                    </div>

                    {needsEquipment && (
                        <div className="space-y-2">
                            <p className="text-sm font-semibold text-slate-800">외주처의 전기 사용 설비 (우리 부품을 처리하는 설비에 체크)</p>
                            {equipment.map((row, index) => (
                                <div key={index} className="grid grid-cols-12 items-end gap-2">
                                    <input className={`${fieldClass} col-span-5`} placeholder="설비 이름" value={row.name} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, name: event.target.value } : item)))} />
                                    <input className={`${fieldClass} col-span-3`} inputMode="decimal" placeholder="가동시간 (h)" value={row.hours} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, hours: event.target.value } : item)))} />
                                    <input className={`${fieldClass} col-span-3`} inputMode="decimal" placeholder="정격 전력 (kW)" value={row.kw} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, kw: event.target.value } : item)))} />
                                    <label className="col-span-1 flex h-11 items-center justify-center text-xs text-slate-600" title="우리 부품을 처리하는 설비">
                                        <input type="checkbox" checked={row.ours} onChange={(event) => setEquipment((current) => current.map((item, i) => (i === index ? { ...item, ours: event.target.checked } : item)))} />
                                    </label>
                                </div>
                            ))}
                            <button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={() => setEquipment((current) => [...current, emptyEquipment()])}>설비 줄 추가</button>
                            <p className="text-xs leading-5 text-slate-500">정격은 kW로 적으면 앱이 MWh로 바꿉니다(kW × 시간 ÷ 1,000). 재구성한 합계가 고지서 총량과 {Math.round(RECONSTRUCTION_TOLERANCE * 100)}% 넘게 다르면 설비 목록에 빠진 설비가 없는지 알려 드립니다.</p>
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
                            <span className="font-semibold text-slate-800">증빙 (전력 고지서·설비 명판·가동기록)</span>
                            <input className={fieldClass} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="예: 외주처 한전 고지서 12장, 설비 명판 사진" />
                        </label>
                        <label className="block text-sm">
                            <span className="font-semibold text-slate-800">{basis === 'CONSERVATIVE_ESTIMATE' ? '추정 근거 (필수)' : '근거·가정 (선택)'}</span>
                            <input className={fieldClass} value={note} onChange={(event) => setNote(event.target.value)} placeholder={basis === 'CONSERVATIVE_ESTIMATE' ? '예: 정격 20 kW × 600 h × 부하율 70%' : '예: 외주처 설비 계량기 값을 받음'} />
                        </label>
                    </div>

                    {shareResult.ok ? (
                        <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700" data-testid="outsourced-electricity-result">
                            <p className="font-semibold text-slate-900">우리 몫: {fmt(shareResult.share)} MWh</p>
                            <p className="mt-1">{shareResult.formula}</p>
                            {shareResult.warnings.map((text) => (
                                <p key={text} className="mt-1 flex items-start gap-1.5 text-amber-800"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />{text}</p>
                            ))}
                            {chosen.length > 1 && (
                                <p className="mt-1">공정별: {chosen.map((process, index) => `${process.name} ${fmt(shareResult.share * fractions[index])}`).join(' · ')}</p>
                            )}
                            {noFactor.length > 0 && (
                                <p className="mt-1 flex items-start gap-1.5 text-amber-800" data-testid="outsourced-electricity-no-factor">
                                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                                    {noFactor.map((process) => process.name).join('·')}의 전력 배출계수가 비어 있습니다 — 5단계에서 계수를 넣어야 외주처 전력이 배출로 계산됩니다.
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-xs leading-5 text-slate-500">{shareResult.reason}</p>
                    )}
                    {validation.reviews.length > 0 && technique !== 'ELECTROPLATING' && (
                        <ul className="list-disc space-y-0.5 pl-5 text-xs leading-5 text-amber-800">
                            {validation.reviews.map((text) => <li key={text}>{text}</li>)}
                        </ul>
                    )}

                    {message && <p className="text-sm text-amber-700">{message}</p>}
                    <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void apply()} disabled={busy || technique === 'ELECTROPLATING'}>저장</Button>
                        <Button type="button" variant="secondary" onClick={() => { setOpen(false); setMessage(''); }} disabled={busy}>취소</Button>
                    </div>
                    <p className="text-xs leading-5 text-slate-500">
                        저장하면 고른 공정의 전력 사용량(5단계)에 이 몫이 더해지고 간접배출이 다시 계산됩니다. 외주처 이름·방법·근거는 확인 점검(V10)에 남습니다.
                    </p>
                </div>
            )}
        </div>
    );
}
