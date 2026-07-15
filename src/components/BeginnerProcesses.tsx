'use client';

import { BeginnerStepHeader, InlineNotice, beginnerFieldClass } from '@/components/BeginnerFlow';
import {
    createLocalItem,
    listLocalItems,
    updateLocalItem,
    type Product,
    type ProductionProcess,
    type ReportingPeriod,
} from '@/lib/local-db';
import { getProductReportingScope } from '@/lib/reporting-scope';
import { ArrowRight, Factory, Pencil, Scale } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

type ProcessDraft = {
    id?: string;
    productId: string;
    periodId: string;
    name: string;
    route: string;
    outputMass: string;
};

const EMPTY_DRAFT: ProcessDraft = {
    productId: '',
    periodId: '',
    name: '',
    route: 'Rolling and forming',
    outputMass: '',
};

const ROUTES = [
    { value: 'Integrated steelmaking', label: '고로·전로 생산' },
    { value: 'Electric arc furnace', label: '전기로 생산' },
    { value: 'Rolling and forming', label: '압연·성형' },
    { value: 'Other steel process', label: '기타 철강 공정' },
];

function numberValue(value: string) {
    const parsed = Number(value.replace(/,/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

export default function BeginnerProcesses() {
    const [products, setProducts] = useState<Product[]>([]);
    const [periods, setPeriods] = useState<ReportingPeriod[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [draft, setDraft] = useState<ProcessDraft>(EMPTY_DRAFT);
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function load() {
        const [productData, periodData, processData] = await Promise.all([
            listLocalItems('products'),
            listLocalItems('periods'),
            listLocalItems('processes'),
        ]);
        setProducts(productData);
        setPeriods(periodData);
        setProcesses([...processData].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
        setDraft((current) => ({
            ...current,
            productId: current.productId || productData[0]?.id || '',
            periodId: current.periodId || periodData[0]?.id || '',
        }));
        setLoading(false);
    }

    useEffect(() => {
        void load().catch(() => {
            setError('생산공정 정보를 불러오지 못했습니다.');
            setLoading(false);
        });
    }, []);

    function edit(process: ProductionProcess) {
        setDraft({
            id: process.id,
            productId: process.product_id ?? '',
            periodId: process.period_id ?? '',
            name: process.name,
            route: process.production_route,
            outputMass: String(process.output_mass_t),
        });
        setMessage('');
        setError('');
        window.requestAnimationFrame(() => document.getElementById('beginner-process-form')?.scrollIntoView({ behavior: 'smooth' }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const outputMass = numberValue(draft.outputMass);
        if (!draft.productId || !draft.periodId) {
            setError('품목과 보고기간을 먼저 선택하세요.');
            return;
        }
        if (!draft.name.trim()) {
            setError('공정명을 입력하세요.');
            return;
        }
        if (outputMass <= 0) {
            setError('보고기간 생산량은 0보다 커야 합니다.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const existing = draft.id ? processes.find((process) => process.id === draft.id) : undefined;
            const selectedProduct = products.find((product) => product.id === draft.productId);
            const payload = {
                period_id: draft.periodId,
                product_id: draft.productId,
                name: draft.name.trim(),
                production_route: draft.route,
                output_mass_t: outputMass,
                market_output_mass_t: existing?.market_output_mass_t ?? outputMass,
                internal_consumption_mass_t: existing?.internal_consumption_mass_t ?? 0,
                direct_attributable_emissions_tco2e: existing?.direct_attributable_emissions_tco2e ?? 0,
                electricity_mwh: existing?.electricity_mwh ?? 0,
                electricity_ef_tco2e_per_mwh: existing?.electricity_ef_tco2e_per_mwh ?? 0,
                electricity_ef_source: existing?.electricity_ef_source ?? '',
            };

            if (existing) {
                await updateLocalItem('processes', { ...existing, ...payload });
                const lines = await listLocalItems('product_output_lines');
                const existingLine = lines.find((line) => line.process_id === existing.id);
                if (existingLine) {
                    await updateLocalItem('product_output_lines', {
                        ...existingLine,
                        product_id: draft.productId,
                        name: selectedProduct?.name || draft.name.trim(),
                        output_mass_t: outputMass,
                        reporting_scope: getProductReportingScope(selectedProduct),
                    });
                } else {
                    await createLocalItem('product_output_lines', {
                        process_id: existing.id,
                        product_id: draft.productId,
                        name: selectedProduct?.name || draft.name.trim(),
                        output_mass_t: outputMass,
                        reporting_scope: getProductReportingScope(selectedProduct),
                        allocation_basis: 'MASS',
                        manual_allocation_percent: 0,
                        note: '초보자 화면에서 자동 생성',
                    });
                }
                setMessage('생산공정을 수정했습니다.');
            } else {
                const saved = await createLocalItem('processes', payload);
                await createLocalItem('product_output_lines', {
                    process_id: saved.id,
                    product_id: draft.productId,
                    name: selectedProduct?.name || draft.name.trim(),
                    output_mass_t: outputMass,
                    reporting_scope: getProductReportingScope(selectedProduct),
                    allocation_basis: 'MASS',
                    manual_allocation_percent: 0,
                    note: '초보자 화면에서 자동 생성',
                });
                setMessage('생산공정을 저장했습니다.');
            }

            setDraft({ ...EMPTY_DRAFT, productId: draft.productId, periodId: draft.periodId });
            await load();
        } catch {
            setError('생산공정을 저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    const ready = products.length > 0 && periods.length > 0;

    return (
        <div className="space-y-6">
            <BeginnerStepHeader current={3} title="생산공정" description="품목이 어디에서 얼마나 생산됐는지만 먼저 연결하세요." advancedHref="/processes?advanced=1" />

            {!ready && (
                <InlineNotice tone="warning">
                    품목과 보고기간이 필요합니다. <Link href={products.length === 0 ? '/products' : '/workspace'} className="underline">이전 단계 확인</Link>
                </InlineNotice>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
                <form id="beginner-process-form" onSubmit={submit} className="rounded-lg border border-slate-200 bg-white shadow-sm">
                    <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                        <div>
                            <h2 className="text-xl font-bold text-slate-950">{draft.id ? '공정 수정' : '공정 1개 등록'}</h2>
                            <p className="mt-1 text-sm text-slate-600">전기·연료 정보는 다음 단계에서 입력합니다.</p>
                        </div>
                        <span className="grid h-11 w-11 place-items-center rounded-lg bg-blue-50 text-blue-700"><Factory className="h-5 w-5" /></span>
                    </div>

                    <div className="grid gap-5 border-t border-slate-200 p-5 sm:grid-cols-2 sm:p-6">
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">연결 품목 <span className="text-red-600">*</span></span>
                            <select value={draft.productId} onChange={(event) => setDraft((current) => ({ ...current, productId: event.target.value }))} className={beginnerFieldClass} disabled={!ready || loading}>
                                <option value="">선택하세요</option>
                                {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">보고기간 <span className="text-red-600">*</span></span>
                            <select value={draft.periodId} onChange={(event) => setDraft((current) => ({ ...current, periodId: event.target.value }))} className={beginnerFieldClass} disabled={!ready || loading}>
                                <option value="">선택하세요</option>
                                {periods.map((period) => <option key={period.id} value={period.id}>{period.name}</option>)}
                            </select>
                        </label>
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">공정명 <span className="text-red-600">*</span></span>
                            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 열연 압연 공정" className={beginnerFieldClass} />
                        </label>
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">생산 방식 <span className="text-red-600">*</span></span>
                            <select value={draft.route} onChange={(event) => setDraft((current) => ({ ...current, route: event.target.value }))} className={beginnerFieldClass}>
                                {ROUTES.map((route) => <option key={route.value} value={route.value}>{route.label}</option>)}
                            </select>
                        </label>
                        <label className="block sm:col-span-2">
                            <span className="text-sm font-semibold text-slate-700">보고기간 생산량 <span className="text-red-600">*</span></span>
                            <div className="relative">
                                <input value={draft.outputMass} onChange={(event) => setDraft((current) => ({ ...current, outputMass: event.target.value }))} inputMode="decimal" placeholder="예: 1200" className={`${beginnerFieldClass} pr-20`} />
                                <span className="absolute right-3 top-5 text-sm font-semibold text-slate-500">tonne</span>
                            </div>
                        </label>
                    </div>

                    <div className="space-y-3 border-t border-slate-200 p-5 sm:p-6">
                        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
                        {message && <InlineNotice tone="success">{message}</InlineNotice>}
                        <div className="flex justify-end gap-2">
                            {draft.id && <button type="button" onClick={() => setDraft({ ...EMPTY_DRAFT, productId: products[0]?.id || '', periodId: periods[0]?.id || '' })} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">취소</button>}
                            <button type="submit" disabled={!ready || saving} className="min-h-11 rounded-md bg-[#123D32] px-5 text-sm font-bold text-white hover:bg-[#195642] disabled:opacity-50">{saving ? '저장 중...' : '공정 저장'}</button>
                        </div>
                    </div>
                </form>

                <aside className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-24">
                    <div className="flex items-center justify-between">
                        <h2 className="text-lg font-bold text-slate-950">등록 공정</h2>
                        <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{processes.length}개</span>
                    </div>
                    <div className="mt-4 space-y-3">
                        {processes.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">첫 공정을 등록하세요.</div>
                        ) : processes.map((process) => (
                            <article key={process.id} className="rounded-lg border border-slate-200 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <h3 className="font-bold text-slate-950">{process.name}</h3>
                                        <p className="mt-1 text-sm text-slate-500">{products.find((product) => product.id === process.product_id)?.name || '품목 미연결'}</p>
                                    </div>
                                    <button type="button" onClick={() => edit(process)} aria-label={`${process.name} 수정`} className="grid h-9 w-9 place-items-center rounded-md text-slate-500 hover:bg-slate-100"><Pencil className="h-4 w-4" /></button>
                                </div>
                                <div className="mt-4 flex items-center gap-2 text-sm font-semibold text-slate-700"><Scale className="h-4 w-4 text-emerald-800" /> {process.output_mass_t.toLocaleString('ko-KR')} tonne</div>
                            </article>
                        ))}
                    </div>
                    {processes.length > 0 && (
                        <Link href="/source-streams" className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white hover:bg-[#195642]">사용자료 입력 <ArrowRight className="ml-2 h-4 w-4" /></Link>
                    )}
                </aside>
            </div>
        </div>
    );
}
