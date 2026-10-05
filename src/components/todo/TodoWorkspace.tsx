'use client';

import { confirmNoImportedHeat } from '@/components/talk/talk-writes';
import { Button } from '@/components/ui';
import type { TodoItem, TodoOwner } from '@/lib/todo-items';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { loadTodoData, type TodoData } from './todo-data';

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

const fmt = (value: number) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(value);

export function TodoWorkspace() {
    const [data, setData] = useState<TodoData | null>(null);
    const [view, setView] = useState<'owner' | 'area'>('owner');
    const [busy, setBusy] = useState('');
    const [message, setMessage] = useState('');

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
            {item.action?.kind === 'heat-none' && (
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" disabled={busy === item.id} onClick={() => void answerHeatNone(item)}>{busy === item.id ? '저장 중…' : '안 씁니다'}</Button>
                    <Link href="/" className="inline-flex"><Button type="button" variant="secondary">씁니다 — 지도 4단계에서 입력</Button></Link>
                </div>
            )}
            {item.href && item.action?.kind !== 'heat-none' && (
                <Link href={item.href} className="inline-flex items-center gap-1 text-sm font-bold text-teal-700 hover:underline">
                    {item.hrefLabel ?? '열기'}
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
        </div>
    );
}
