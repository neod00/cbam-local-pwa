'use client';

import { BeginnerStepHeader, InlineNotice, beginnerFieldClass } from '@/components/BeginnerFlow';
import { getCbamCoverage } from '@/lib/cbam-product-rules';
import {
    createLocalItem,
    listLocalItems,
    updateLocalItem,
    type Installation,
    type Product,
    type ProductReportingScope,
} from '@/lib/local-db';
import { PRODUCT_REPORTING_SCOPE_OPTIONS, getProductReportingScope, getProductReportingScopeLabel } from '@/lib/reporting-scope';
import { ArrowRight, Package, Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { type FormEvent, useEffect, useMemo, useState } from 'react';

type ProductDraft = {
    id?: string;
    name: string;
    cnCode: string;
    reportingScope: ProductReportingScope;
};

const EMPTY_DRAFT: ProductDraft = { name: '', cnCode: '', reportingScope: 'CBAM_GOOD' };

function normalizeCnCode(value: string) {
    return value.replace(/\D/g, '').slice(0, 8);
}

function getProductTypeEnum(code: string) {
    if (code.startsWith('73')) return 'HS73_STEEL_ARTICLES';
    if (code.startsWith('72')) return 'HS72_IRON_STEEL';
    return 'UNKNOWN_PRODUCT';
}

export default function BeginnerProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [installation, setInstallation] = useState<Installation>();
    const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    async function load() {
        const [productData, installations] = await Promise.all([
            listLocalItems('products'),
            listLocalItems('installations'),
        ]);
        setProducts([...productData].sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
        setInstallation(installations[0]);
        setLoading(false);
    }

    useEffect(() => {
        void load().catch(() => {
            setError('저장된 품목을 불러오지 못했습니다.');
            setLoading(false);
        });
    }, []);

    const visibleProducts = useMemo(() => {
        const search = query.trim().toLowerCase();
        if (!search) return products;
        return products.filter((product) => product.name.toLowerCase().includes(search) || product.cn_code?.includes(search));
    }, [products, query]);

    const completeCount = products.filter((product) => normalizeCnCode(product.cn_code ?? '').length === 8).length;

    function edit(product: Product) {
        setDraft({
            id: product.id,
            name: product.name,
            cnCode: product.cn_code ?? '',
            reportingScope: getProductReportingScope(product),
        });
        setError('');
        setMessage('');
        window.requestAnimationFrame(() => document.getElementById('beginner-product-form')?.scrollIntoView({ behavior: 'smooth' }));
    }

    async function submit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const name = draft.name.trim();
        const cnCode = normalizeCnCode(draft.cnCode);

        if (!name) {
            setError('품목명을 입력하세요.');
            return;
        }
        if (cnCode.length !== 8) {
            setError('EU 보고서 연결을 위해 CN 코드 8자리를 입력하세요.');
            return;
        }

        setSaving(true);
        setError('');
        try {
            const payload = {
                installation_id: installation?.id,
                name,
                hs_code: cnCode.slice(0, 4),
                cn_code: cnCode,
                hs_group: cnCode.slice(0, 2),
                product_type_enum: getProductTypeEnum(cnCode),
                unit: 'tonne',
                reporting_scope: draft.reportingScope,
            };

            if (draft.id) {
                const existing = products.find((product) => product.id === draft.id);
                if (existing) await updateLocalItem('products', { ...existing, ...payload });
                setMessage('품목을 수정했습니다.');
            } else {
                await createLocalItem('products', payload);
                setMessage('품목을 저장했습니다.');
            }
            setDraft(EMPTY_DRAFT);
            await load();
        } catch {
            setError('품목을 저장하지 못했습니다.');
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="space-y-6">
            <BeginnerStepHeader
                current={2}
                title="품목과 CN 코드"
                description="수출량이 큰 대표 품목 하나부터 등록하세요."
                advancedHref="/products?advanced=1"
            />

            {!installation && (
                <InlineNotice tone="warning">
                    사업장 정보가 먼저 필요합니다. <Link href="/workspace" className="underline">기본 설정으로 이동</Link>
                </InlineNotice>
            )}

            <div className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                <form id="beginner-product-form" onSubmit={submit} className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-xl font-bold text-slate-950">{draft.id ? '품목 수정' : '대표 품목 등록'}</h2>
                            <p className="mt-1 text-sm text-slate-600">이 품목이 CBAM 신고에 포함되는지 먼저 구분합니다.</p>
                        </div>
                        <span className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-50 text-emerald-800"><Package className="h-5 w-5" /></span>
                    </div>

                    <div className="mt-6 space-y-5">
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">품목명 <span className="text-red-600">*</span></span>
                            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="예: 열연강판" className={beginnerFieldClass} />
                        </label>
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">품목 용도 <span className="text-red-600">*</span></span>
                            <select
                                value={draft.reportingScope}
                                onChange={(event) => setDraft((current) => ({ ...current, reportingScope: event.target.value as ProductReportingScope }))}
                                className={beginnerFieldClass}
                            >
                                {PRODUCT_REPORTING_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                            <span className="mt-2 block text-xs leading-5 text-slate-500">{PRODUCT_REPORTING_SCOPE_OPTIONS.find((option) => option.value === draft.reportingScope)?.description}</span>
                        </label>
                        <label className="block">
                            <span className="text-sm font-semibold text-slate-700">CN 코드 8자리 <span className="text-red-600">*</span></span>
                            <input value={draft.cnCode} onChange={(event) => setDraft((current) => ({ ...current, cnCode: normalizeCnCode(event.target.value) }))} placeholder="예: 72083900" inputMode="numeric" className={beginnerFieldClass} />
                            <span className="mt-2 block text-xs leading-5 text-slate-500">수출신고서 또는 관세사 자료에서 확인할 수 있습니다.</span>
                        </label>

                        {error && <InlineNotice tone="danger">{error}</InlineNotice>}
                        {message && <InlineNotice tone="success">{message}</InlineNotice>}

                        <div className="flex gap-2">
                            <button type="submit" disabled={saving || !installation} className="inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-[#123D32] px-4 text-sm font-bold text-white hover:bg-[#195642] disabled:opacity-50">
                                {saving ? '저장 중...' : draft.id ? '수정 저장' : '품목 저장'}
                            </button>
                            {draft.id && <button type="button" onClick={() => setDraft(EMPTY_DRAFT)} className="min-h-11 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-700">취소</button>}
                        </div>
                    </div>
                </form>

                <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <h2 className="text-xl font-bold text-slate-950">등록 품목</h2>
                            <p className="mt-1 text-sm text-slate-600">CN 입력 완료 {completeCount}/{products.length}개</p>
                        </div>
                        <label className="relative block sm:w-64">
                            <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="품목 또는 CN 검색" className={`${beginnerFieldClass} mt-0 pl-9`} />
                        </label>
                    </div>

                    <div className="mt-5 space-y-3">
                        {loading ? (
                            <div className="rounded-md bg-slate-50 p-5 text-sm text-slate-500">품목을 불러오는 중입니다.</div>
                        ) : visibleProducts.length === 0 ? (
                            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
                                <Package className="mx-auto h-8 w-8 text-slate-400" />
                                <p className="mt-3 font-bold text-slate-800">아직 등록된 품목이 없습니다.</p>
                                <p className="mt-1 text-sm text-slate-500">왼쪽에서 대표 품목 하나를 저장하세요.</p>
                            </div>
                        ) : visibleProducts.map((product) => {
                            const ready = normalizeCnCode(product.cn_code ?? '').length === 8;
                            const coverage = getCbamCoverage(product);
                            const reportingScope = getProductReportingScope(product);
                            return (
                                <article key={product.id} className="flex flex-col gap-4 rounded-lg border border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <h3 className="font-bold text-slate-950">{product.name}</h3>
                                            <span className={`inline-flex rounded px-2 py-1 text-xs font-bold ${ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{ready ? 'CN 완료' : '확인 필요'}</span>
                                            <span className="inline-flex rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{getProductReportingScopeLabel(reportingScope)}</span>
                                        </div>
                                        <p className="mt-2 text-sm text-slate-600">CN {product.cn_code || '미입력'} · {reportingScope === 'CBAM_GOOD' ? (coverage.status === 'COVERED' ? 'CBAM 대상 후보' : '대상 여부 확인') : '공정 배분에는 포함, 신고 합계에서는 제외'}</p>
                                    </div>
                                    <button type="button" onClick={() => edit(product)} className="inline-flex min-h-10 items-center justify-center rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                                        <Pencil className="mr-2 h-4 w-4" /> 수정
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    {products.length > 0 && (
                        <div className="mt-6 flex justify-end border-t border-slate-200 pt-5">
                            <Link href="/processes" className="inline-flex min-h-11 items-center rounded-md bg-[#123D32] px-5 text-sm font-bold text-white hover:bg-[#195642]">
                                생산공정으로 <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
