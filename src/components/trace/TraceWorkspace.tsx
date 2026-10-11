'use client';

import type { EmissionTrace, TraceNode } from '@/lib/emission-trace';
import { productWithCn } from '@/lib/product-label';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { loadTraceData, type TraceData } from './trace-data';

const fmt = (value: number, digits = 4) => new Intl.NumberFormat('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(Number.isFinite(value) ? value : 0);

function NodeView({ node, depth }: { node: TraceNode; depth: number }) {
    const children = node.children ?? [];
    return (
        <li className={depth === 0 ? '' : 'border-l-2 border-slate-100 pl-3'} data-testid="trace-node" data-node-id={node.id}>
            <details open={depth < 2} className="group rounded-lg">
                <summary className="cursor-pointer list-none rounded-lg px-2 py-1.5 hover:bg-slate-50">
                    <span className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-900">{node.label}</span>
                        {node.value !== undefined && <span className="text-sm font-bold tabular-nums text-slate-950">{fmt(node.value)} <span className="text-xs font-normal text-slate-500">tCO₂e</span></span>}
                    </span>
                </summary>
                <div className="space-y-1 px-2 pb-2 pt-1">
                    {node.formula && <p className="text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">식</span> {node.formula}</p>}
                    {node.method && <p className="text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">방법</span> {node.method}</p>}
                    {node.anchor && <p className="text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-600">규정 근거</span> {node.anchor}</p>}
                    {node.evidence && <p className="text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">증빙·출처</span> {node.evidence}</p>}
                    {node.note && <p className="text-xs leading-5 text-amber-800">{node.note}</p>}
                    {node.href && <Link href={node.href} className="inline-flex items-center gap-1 text-xs font-bold text-teal-700 hover:underline">원천 자료 열기<ArrowRight className="h-3 w-3" /></Link>}
                    {children.length > 0 && <ul className="mt-2 space-y-1">{children.map((child) => <NodeView key={child.id} node={child} depth={depth + 1} />)}</ul>}
                </div>
            </details>
        </li>
    );
}

export function TraceWorkspace() {
    const [data, setData] = useState<TraceData | null>(null);
    const [selected, setSelected] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        let active = true;
        loadTraceData()
            .then((loaded) => {
                if (active) setData(loaded);
            })
            .catch((error) => {
                console.error('[CBAM] SEE 추적 화면이 저장된 자료를 읽지 못했습니다', error);
                if (active) setMessage('저장된 자료를 읽지 못했습니다. 브라우저를 완전히 닫았다가 다시 열어 보세요. 새로 입력하지 마세요.');
            });
        return () => {
            active = false;
        };
    }, []);

    if (!data) {
        return <p className="rounded-xl bg-white px-4 py-6 text-center text-sm text-slate-500 ring-1 ring-slate-200">{message || '저장된 자료를 읽는 중입니다…'}</p>;
    }
    if (data.traces.length === 0) {
        return (
            <div className="mx-auto max-w-3xl space-y-3 rounded-2xl border border-slate-200 bg-white p-6">
                <h1 className="text-xl font-bold text-slate-950">SEE 추적</h1>
                <p className="text-sm leading-6 text-slate-600">추적할 결과가 아직 없습니다. 제품과 생산량, 연료·전력, 구매 강재를 입력하면 최종 SEE가 어디서 왔는지 여기서 거슬러 볼 수 있습니다.</p>
                <div className="flex gap-3 text-sm font-bold text-teal-700"><Link href="/talk" className="hover:underline">질문으로 입력하기</Link><Link href="/" className="hover:underline">지도 화면으로</Link></div>
            </div>
        );
    }

    const trace: EmissionTrace = data.traces.find((item) => item.resultId === selected) ?? data.traces[0];
    return (
        <div className="mx-auto max-w-4xl space-y-4">
            <header className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-slate-950">SEE 추적</h1>
                <p className="text-sm leading-6 text-slate-600">
                    최종 SEE가 어떤 값들의 합으로 나왔는지, 각 값이 어느 고지서·계수·공급사 자료에서 왔는지 거슬러 올라갑니다. 새로 계산하는 것이 아니라 계산 결과를 풀어서 보여 주는 화면입니다.
                </p>
            </header>

            {data.traces.length > 1 && (
                <label className="block text-sm font-semibold text-slate-700">
                    제품 · 공정
                    <select className="mt-1 block min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm" value={trace.resultId} onChange={(event) => setSelected(event.target.value)}>
                        {data.traces.map((item) => <option key={item.resultId} value={item.resultId}>{productWithCn(item.productName, item.cnCode)} — {item.processName}</option>)}
                    </select>
                </label>
            )}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" aria-label="추적 결과">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <div>
                        <p className="text-xs font-semibold text-slate-500">{productWithCn(trace.productName, trace.cnCode)} · {trace.processName}{data.periodName ? ` · ${data.periodName}` : ''}</p>
                        <p className="mt-1 text-3xl font-bold tabular-nums text-slate-950" data-testid="trace-see">{trace.see === null ? '—' : fmt(trace.see)} <span className="text-sm font-normal text-slate-500">tCO₂e/t (CBAM 산정 기준 SEE)</span></p>
                        <p className="mt-0.5 text-xs text-slate-500">총 SEE(검토용) {fmt(trace.totalSee)} tCO₂e/t · 생산량 {fmt(trace.outputMassT)} t</p>
                    </div>
                    <div data-testid="trace-check" data-ok={trace.check.ok} className={`rounded-xl px-3 py-2 text-xs font-semibold leading-5 ${trace.check.ok ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-900'}`}>
                        {trace.check.ok
                            ? <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-4 w-4" />✓ 원천 합계가 엔진 결과와 일치합니다</span>
                            : <span className="inline-flex items-center gap-1"><AlertTriangle className="h-4 w-4" />✕ 원천 합계와 엔진 결과에 차이가 있습니다 — SEE 차이 {fmt(trace.check.delta, 8)} · 직접배출 차이 {fmt(trace.check.directDelta, 8)} tCO₂e</span>}
                    </div>
                </div>
                <ul className="mt-4 space-y-1" aria-label="SEE 분해">
                    <NodeView node={trace.root} depth={0} />
                </ul>
            </section>

            <p className="text-xs leading-5 text-slate-500">
                방법·규정 근거·증빙은 입력해 둔 값(공용 계량기 기준, 배출원 출처, 구매 강재 출처·검증 상태 등)에서 가져옵니다. 비어 있으면 보이지 않으니 <Link href="/todo" className="font-semibold text-teal-700 hover:underline">할 일</Link>에서 채우세요.
            </p>
        </div>
    );
}
