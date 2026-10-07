'use client';

import { confirmNoImportedHeat } from '@/components/talk/talk-writes';
import { Button } from '@/components/ui';
import { FACTOR_SOURCE_CHOICES, INSTALLATION_FIELD_SPECS, type FactorSourceType } from '@/lib/todo-edits';
import type { AttributionStatus } from '@/lib/attribution-status';
import type { TodoItem, TodoOwner } from '@/lib/todo-items';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { loadTodoData, type TodoData } from './todo-data';
import { saveInstallationFields, savePrecursorTexts, saveStreamFactorSource } from './todo-writes';

const OWNER_TITLE: Record<TodoOwner, string> = {
    company: '우리 회사가 답할 것',
    supplier: '공급사에게 받을 것',
    regulation: '규정상 확인 필요',
};
const OWNER_HINT: Record<TodoOwner, string> = {
    company: '값을 직접 아는 사람이 답하면 되는 것',
    supplier: '공급사가 줘야 채워지는 것',
    regulation: '값은 있는데 규정이 더 요구하는 것',
};
const AREA_ORDER = ['사업장', '보고기간', '제품', '생산공정', '배출원 자료', '구매 전구물질', '템플릿 한계'];

const inputClass = 'mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-200';
const PRECURSOR_TEXT_SPEC = {
    source: { label: '값의 출처', placeholder: '예: 공급사 회신 메일 2025-03-10, EU 기본값 파일' },
    justification: { label: '기본값을 쓰는 사유', placeholder: '예: 공급사 실측자료 미입수 — EU 기본값(2026) 적용' },
} as const;

const STATUS_LABEL: Record<Exclude<AttributionStatus, 'na'>, string> = { ok: '✓ 규정 충족', review: '⚠ 확인 필요', fix: '✕ 수정 필요' };
const STATUS_CLASS: Record<Exclude<AttributionStatus, 'na'>, string> = {
    ok: 'bg-emerald-50 text-emerald-900',
    review: 'bg-amber-50 text-amber-900',
    fix: 'bg-red-50 text-red-900',
};

const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);

export function TodoWorkspace() {
    const [data, setData] = useState<TodoData | null>(null);
    const [view, setView] = useState<'owner' | 'area'>('owner');
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');
    // 카드 안 입력칸: 카드(항목 id)마다 값과 오류를 따로 둔다.
    const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const setDraft = (itemId: string, key: string, value: string) => setDrafts((current) => ({ ...current, [itemId]: { ...current[itemId], [key]: value } }));

    const reload = useCallback(async () => {
        setData(await loadTodoData());
    }, []);

    useEffect(() => {
        let active = true;
        loadTodoData()
            .then((loaded) => {
                if (active) setData(loaded);
            })
            .catch((error) => {
                console.error('[CBAM] 할 일 화면이 저장된 자료를 읽지 못했습니다', error);
                if (active) setMessage('저장된 자료를 읽지 못했습니다. 브라우저를 완전히 닫았다가 다시 열어 보세요. 새로 입력하지 마세요.');
            });
        return () => {
            active = false;
        };
    }, []);

    // 이 자리에서 바로 답하는 것(밖에서 산 열 「안 씁니다」)은 질문 화면과 같은 저장 함수를 쓴다 — 저장 코드를 새로 두지 않는다.
    async function answerHeatNone(item: TodoItem) {
        const process = data?.processes.find((candidate) => candidate.id === item.action?.processId);
        if (!process) return;
        setBusy(item.id);
        setMessage('');
        try {
            const error = await confirmNoImportedHeat(process);
            if (error) {
                setMessage(error);
                return;
            }
            await reload();
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '저장하지 못했습니다.');
        } finally {
            setBusy('');
        }
    }

    // 입력칸 저장 — 쓰기는 todo-writes.ts 한 곳(규칙은 todo-edits.ts, 구매 강재는 질문 화면 고치기와 같다).
    async function saveInputs(item: TodoItem) {
        const inputs = item.inputs;
        if (!data || !inputs) return;
        const draft = drafts[item.id] ?? {};
        setBusy(item.id);
        setErrors((current) => ({ ...current, [item.id]: '' }));
        try {
            let error: string | null = '저장할 대상을 찾지 못했습니다. 화면을 새로 고쳐 보세요.';
            if (inputs.kind === 'installation') {
                const installation = data.installations.find((candidate) => candidate.id === inputs.installationId);
                if (installation) error = await saveInstallationFields(installation, inputs.fields, draft);
            } else if (inputs.kind === 'stream-factor-source') {
                const stream = data.sourceStreams.find((candidate) => candidate.id === inputs.streamId);
                if (stream) error = await saveStreamFactorSource(stream, (draft.type ?? '') as FactorSourceType | '');
            } else {
                const precursor = data.precursors.find((candidate) => candidate.id === inputs.precursorId);
                if (precursor) error = await savePrecursorTexts(precursor, draft);
            }
            if (error) {
                setErrors((current) => ({ ...current, [item.id]: error }));
                return;
            }
            await reload();
        } catch (error) {
            setErrors((current) => ({ ...current, [item.id]: error instanceof Error ? error.message : '저장하지 못했습니다.' }));
        } finally {
            setBusy('');
        }
    }

    if (!data) {
        return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">{message || '저장된 자료를 읽는 중입니다…'}</p>;
    }

    const { result } = data;
    const subtitle = !result.hasData && result.counts.total > 0
        ? '아직 계산할 자료가 없습니다. 질문에 답하면 여기에 남은 일이 정리됩니다.'
        : result.counts.errors > 0
            ? `EU 문서를 만들기 전에 해결할 것이 ${result.counts.errors}건 있습니다 — 아래 빨간 표시입니다.`
            : result.counts.total > 0
                ? '막는 것은 없습니다 — 지금도 파일을 만들 수 있습니다. 정리할수록 서류가 탄탄해집니다.'
                : result.hasData
                    ? '남은 할 일이 없습니다. 제출 전에 EU 문서를 만들어 엑셀에서 한 번 열어 보세요.'
                    : '아직 입력한 자료가 없습니다. 질문에 답하면 여기에 남은 일이 정리됩니다.';

    const card = (item: TodoItem, showOwner: boolean) => (
        <li
            key={item.id}
            data-testid="todo-card"
            data-owner={item.owner}
            data-severity={item.severity}
            className={`space-y-2.5 rounded-2xl border bg-white p-4 shadow-sm ${item.severity === 'error' ? 'border-red-300' : item.owner === 'regulation' ? 'border-amber-300' : 'border-slate-200'}`}
        >
            {(item.supplier || showOwner || item.severity === 'error') && (
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    {item.severity === 'error' && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-red-800"><AlertTriangle className="h-3 w-3" />먼저 해결</span>}
                    {showOwner && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{OWNER_TITLE[item.owner]}</span>}
                    {item.supplier && <span className="text-amber-800">{item.supplier.name || item.supplier.country || '공급사 미입력'}</span>}
                </div>
            )}
            <h3 className="text-base font-bold leading-6 text-slate-950">{item.title}</h3>
            {item.detail && <p className="text-sm leading-6 text-slate-600">{item.detail}</p>}
            {item.supplier && item.supplier.items.length > 0 && (
                <ul className="space-y-0.5 text-xs leading-5 text-slate-600">
                    {item.supplier.items.map((entry) => (
                        <li key={`${entry.name}-${entry.cnCode}`}>{entry.name}{entry.cnCode ? ` · CN ${entry.cnCode}` : ''}{entry.massT > 0 ? ` · ${new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 1 }).format(entry.massT)} t` : ''}</li>
                    ))}
                </ul>
            )}
            {item.impact && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-700" data-testid="todo-impact">
                    {item.impact.fromSee !== null && item.impact.toSee !== null
                        ? <>기본값으로 바꾸면 1톤당 <b className="tabular-nums">{fmt(item.impact.fromSee)} → {fmt(item.impact.toSee)}</b> tCO₂e (CBAM 산정 기준 SEE). 저장하지 않은 모의 계산입니다.</>
                        : <>기본값으로 바꿨을 때의 숫자는 계산하지 못했습니다{item.impact.reason ? ` — ${item.impact.reason}` : ''}.</>}
                </p>
            )}
            {item.inputs && (
                <form
                    className="space-y-2.5"
                    data-testid="todo-inputs"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void saveInputs(item);
                    }}
                >
                    {item.inputs.kind === 'installation' && item.inputs.fields.map((field) => (
                        <label key={field} className="block text-sm font-semibold text-slate-700">
                            {INSTALLATION_FIELD_SPECS[field].label}
                            <input className={inputClass} value={drafts[item.id]?.[field] ?? ''} onChange={(event) => setDraft(item.id, field, event.target.value)} placeholder={INSTALLATION_FIELD_SPECS[field].placeholder} autoComplete="off" />
                            {INSTALLATION_FIELD_SPECS[field].hint && <span className="mt-1 block text-xs font-normal leading-5 text-slate-500">{INSTALLATION_FIELD_SPECS[field].hint}</span>}
                        </label>
                    ))}
                    {item.inputs.kind === 'stream-factor-source' && (
                        <label className="block text-sm font-semibold text-slate-700">
                            배출계수의 근거 유형
                            <select className={inputClass} value={drafts[item.id]?.type ?? ''} onChange={(event) => setDraft(item.id, 'type', event.target.value)}>
                                <option value="">— 고르세요 —</option>
                                {FACTOR_SOURCE_CHOICES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                    )}
                    {item.inputs.kind === 'precursor-text' && item.inputs.fields.map((field) => (
                        <label key={field} className="block text-sm font-semibold text-slate-700">
                            {PRECURSOR_TEXT_SPEC[field].label}
                            <input className={inputClass} value={drafts[item.id]?.[field] ?? ''} onChange={(event) => setDraft(item.id, field, event.target.value)} placeholder={PRECURSOR_TEXT_SPEC[field].placeholder} autoComplete="off" />
                        </label>
                    ))}
                    <div className="flex flex-wrap items-center gap-3">
                        <Button type="submit" disabled={busy === item.id}>{busy === item.id ? '저장 중…' : '저장'}</Button>
                        {errors[item.id] && <span className="text-sm text-amber-800" role="alert">{errors[item.id]}</span>}
                    </div>
                </form>
            )}
            {item.action?.kind === 'heat-none' && (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={busy === item.id} onClick={() => void answerHeatNone(item)}>{busy === item.id ? '저장 중…' : '안 씁니다'}</Button>
                    <Link href="/" className="inline-flex"><Button type="button" variant="secondary">씁니다 — 지도 4단계에서 입력</Button></Link>
                </div>
            )}
            {item.href && item.action?.kind !== 'heat-none' && (
                <Link href={item.href} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">
                    {item.inputs ? '전체 화면에서 열기' : (item.hrefLabel ?? '열기')}
                    <ArrowRight className="h-3.5 w-3.5" />
                </Link>
            )}
            {item.evidence && (
                <details className="text-xs text-slate-500">
                    <summary className="cursor-pointer font-semibold">근거 보기</summary>
                    <p className="mt-1 leading-5">{item.evidence}</p>
                </details>
            )}
        </li>
    );

    const areas = Array.from(new Set(result.items.map((item) => item.area))).sort((a, b) => {
        const rank = (name: string) => (AREA_ORDER.indexOf(name) === -1 ? AREA_ORDER.length : AREA_ORDER.indexOf(name));
        return rank(a) - rank(b);
    });

    return (
        <div className="mx-auto max-w-6xl space-y-4">
            <header className="flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-950" data-testid="todo-title">할 일 {result.counts.total}</h1>
                    <p className="mt-1 text-sm leading-6 text-slate-600" data-testid="todo-subtitle">{subtitle}</p>
                </div>
                <Link href="/submit" className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">제출 화면으로<ArrowRight className="h-3.5 w-3.5" /></Link>
                <div className="flex gap-2 text-xs font-semibold" role="group" aria-label="보기 방식">
                    <button type="button" aria-pressed={view === 'owner'} onClick={() => setView('owner')} className={`rounded-full border px-3 py-1.5 ${view === 'owner' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>누가 할 일인지로 보기</button>
                    <button type="button" aria-pressed={view === 'area'} onClick={() => setView('area')} className={`rounded-full border px-3 py-1.5 ${view === 'area' ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white text-slate-700'}`}>화면별로 보기</button>
                </div>
            </header>

            {message && <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900" role="alert">{message}</p>}

            {result.counts.total === 0 && (
                <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                    <div className="space-y-2 text-sm leading-6 text-emerald-900">
                        <p>{result.hasData ? '지금 정리할 것이 없습니다.' : '아직 계산할 자료가 없습니다.'}</p>
                        <div className="flex flex-wrap gap-2">
                            <Link href="/talk" className="inline-flex"><Button type="button">질문으로 입력하기</Button></Link>
                            <Link href="/" className="inline-flex"><Button type="button" variant="secondary">지도 화면으로</Button></Link>
                        </div>
                    </div>
                </section>
            )}

            {result.counts.total > 0 && view === 'owner' && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {(['company', 'supplier', 'regulation'] as TodoOwner[]).map((owner) => {
                        const list = result.items.filter((item) => item.owner === owner);
                        return (
                            <section key={owner} aria-label={OWNER_TITLE[owner]} data-testid={`todo-col-${owner}`} className="space-y-3">
                                <div>
                                    <h2 className="text-sm font-bold text-slate-800">{OWNER_TITLE[owner]} · {list.length}</h2>
                                    <p className="text-xs text-slate-500">{OWNER_HINT[owner]}</p>
                                </div>
                                {list.length === 0 ? <p className="rounded-xl bg-white px-4 py-3 text-xs text-slate-500 ring-1 ring-slate-200">지금 없습니다.</p> : <ul className="space-y-3">{list.map((item) => card(item, false))}</ul>}
                            </section>
                        );
                    })}
                </div>
            )}

            {result.counts.total > 0 && view === 'area' && (
                <div className="space-y-5">
                    {areas.map((area) => (
                        <section key={area} aria-label={area} data-testid="todo-area" className="space-y-3">
                            <h2 className="text-sm font-bold text-slate-800">{area} · {result.items.filter((item) => item.area === area).length}</h2>
                            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">{result.items.filter((item) => item.area === area).map((item) => card(item, true))}</ul>
                        </section>
                    ))}
                </div>
            )}
            {data.attribution.rows.length > 0 && (
                <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="귀속·할당 점검" data-testid="attribution-status">
                    <div>
                        <h2 className="text-base font-bold text-slate-950">귀속·할당 점검</h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                            공장 전체의 배출·에너지가 공정과 상품까지 빠짐없이, 겹치지 않게 연결됐는지 봅니다. 새로 계산하지 않고 위 항목들과 같은 점검 결과를 한 표로 모은 것이며, 통과한 것도 보여 줍니다.
                            ✓ {data.attribution.counts.ok} · ⚠ {data.attribution.counts.review} · ✕ {data.attribution.counts.fix}
                        </p>
                    </div>
                    <ul className="divide-y divide-slate-100">
                        {data.attribution.rows.map((row) => (
                            <li key={row.id} className="flex flex-wrap items-start gap-3 py-3" data-testid="attribution-row" data-status={row.status}>
                                <span className={`inline-flex min-w-28 justify-center rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_CLASS[row.status as Exclude<AttributionStatus, 'na'>]}`}>{STATUS_LABEL[row.status as Exclude<AttributionStatus, 'na'>]}</span>
                                <div className="min-w-0 flex-1 space-y-1">
                                    <p className="text-sm font-semibold text-slate-900"><span className="mr-1.5 text-xs font-bold text-slate-400">{row.code}</span>{row.title}</p>
                                    <p className="text-xs leading-5 text-slate-600">{row.detail}</p>
                                    {row.items.length > 0 && <ul className="list-disc space-y-0.5 pl-4 text-xs leading-5 text-slate-600">{row.items.map((item) => <li key={item}>{item}</li>)}</ul>}
                                </div>
                                {row.href && row.status !== 'ok' && <Link href={row.href} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">고치러 가기<ArrowRight className="h-3.5 w-3.5" /></Link>}
                            </li>
                        ))}
                    </ul>
                    <Link href="/trace" className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">최종 SEE가 어디서 왔는지 거슬러 보기 (SEE 추적)<ArrowRight className="h-3.5 w-3.5" /></Link>
                    {data.attribution.notApplicable.length > 0 && (
                        <p className="text-xs leading-5 text-slate-500" data-testid="attribution-na">이 프로젝트에 해당하지 않는 점검 {data.attribution.notApplicable.length}건: {data.attribution.notApplicable.join(' · ')}</p>
                    )}
                </section>
            )}
        </div>
    );
}
