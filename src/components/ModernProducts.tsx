'use client';

import { getCbamCoverage, getIndirectEmissionsApplicability } from '@/lib/cbam-product-rules';
import { CN_CODE_OPTIONS } from '@/lib/cn-code-options';
import {
    createLocalItem,
    deleteLocalItem,
    listLocalItems,
    updateLocalItem,
    type Product,
    type ProductReportingScope,
    type ProductionProcess,
    type PurchasedPrecursor,
} from '@/lib/local-db';
import { PRODUCT_REPORTING_SCOPE_OPTIONS, getProductReportingScope, getProductReportingScopeLabel } from '@/lib/reporting-scope';
import {
    AlertTriangle,
    ArrowRight,
    Factory,
    Package,
    Pencil,
    Plus,
    Search,
    ShieldCheck,
    Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

type ProductDraft = {
    id?: string;
    name: string;
    cn_code: string;
    hs_group: string;
    reporting_scope: ProductReportingScope;
    unit: string;
};

type ProductStats = {
    total: number;
    cnReady: number;
    covered: number;
    directOnly: number;
    linkedProcesses: number;
    linkedPrecursors: number;
};

const EMPTY_DRAFT: ProductDraft = {
    name: '',
    cn_code: '',
    hs_group: '72',
    unit: 'tonne',
    reporting_scope: 'CBAM_GOOD',
};

async function fetchProductWorkspace() {
    const [productData, processData, precursorData] = await Promise.all([
        listLocalItems('products'),
        listLocalItems('processes'),
        listLocalItems('precursors'),
    ]);

    return {
        products: [...productData].sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
        processes: processData,
        precursors: precursorData,
    };
}

function normalizeCnCode(value: string) {
    return value.replace(/\D/g, '').slice(0, 8);
}

function inferHsGroup(cnCode: string) {
    return cnCode.slice(0, 2) || '72';
}

function getProductTypeLabel(product: Product) {
    const coverage = getCbamCoverage(product);

    if (coverage.status === 'COVERED') {
        return 'CBAM 대상';
    }

    if (coverage.status === 'NOT_COVERED') {
        return '대상 아님';
    }

    return '확인 필요';
}

function getProductTypeEnum(cnCode: string) {
    if (cnCode.startsWith('73')) {
        return 'HS73_STEEL_ARTICLES';
    }

    if (cnCode.startsWith('72')) {
        return 'HS72_IRON_STEEL';
    }

    return 'UNKNOWN_PRODUCT';
}

function StatTile({ label, value, caption }: { label: string; value: string; caption: string }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="text-sm font-bold text-slate-600">{label}</div>
            <div className="mt-3 text-3xl font-bold text-slate-950">{value}</div>
            <div className="mt-1 text-xs font-semibold text-slate-500">{caption}</div>
        </div>
    );
}

function StatusBadge({ children, tone }: { children: string; tone: 'success' | 'warning' | 'neutral' | 'info' }) {
    const toneClass = {
        success: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
        warning: 'bg-amber-50 text-amber-800 ring-amber-200',
        neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
        info: 'bg-blue-50 text-blue-800 ring-blue-200',
    }[tone];

    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${toneClass}`}>{children}</span>;
}

function getNextAction(stats: ProductStats) {
    if (stats.total === 0) {
        return {
            title: '대표 품목 1개부터 등록하세요',
            description: '처음에는 모든 SKU를 넣지 말고, 수출량이 큰 대표 품목 하나만 등록하는 것이 좋습니다.',
            href: '#product-form',
            label: '품목 등록',
            tone: 'warning' as const,
        };
    }

    if (stats.cnReady < stats.total) {
        return {
            title: 'CN 코드가 빠진 품목을 먼저 확인하세요',
            description: `${stats.total - stats.cnReady}개 품목의 CN 8자리 코드가 비어 있습니다.`,
            href: '#product-list',
            label: '누락 품목 확인',
            tone: 'warning' as const,
        };
    }

    if (stats.linkedProcesses === 0) {
        return {
            title: '생산공정으로 넘어가세요',
            description: '품목 준비가 끝났습니다. 이제 생산량과 공정 경계를 연결해야 합니다.',
            href: '/processes',
            label: '공정 등록',
            tone: 'info' as const,
        };
    }

    return {
        title: '배출원 자료를 입력하세요',
        description: '품목과 공정이 준비됐습니다. 전기, 연료, 원료 사용량을 연결하세요.',
        href: '/source-streams',
        label: '배출원 입력',
        tone: 'success' as const,
    };
}

export function ModernProducts() {
    const [products, setProducts] = useState<Product[]>([]);
    const [processes, setProcesses] = useState<ProductionProcess[]>([]);
    const [precursors, setPrecursors] = useState<PurchasedPrecursor[]>([]);
    const [draft, setDraft] = useState<ProductDraft>(EMPTY_DRAFT);
    const [query, setQuery] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    async function refreshProducts() {
        setLoading(true);
        try {
            const workspace = await fetchProductWorkspace();
            setProducts(workspace.products);
            setProcesses(workspace.processes);
            setPrecursors(workspace.precursors);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        let active = true;

        async function loadInitialWorkspace() {
            try {
                const workspace = await fetchProductWorkspace();

                if (!active) {
                    return;
                }

                setProducts(workspace.products);
                setProcesses(workspace.processes);
                setPrecursors(workspace.precursors);
            } finally {
                if (active) {
                    setLoading(false);
                }
            }
        }

        void loadInitialWorkspace();

        return () => {
            active = false;
        };
    }, []);

    const stats = useMemo<ProductStats>(() => {
        const cnReady = products.filter((product) => normalizeCnCode(product.cn_code ?? '').length === 8).length;
        const covered = products.filter((product) => getCbamCoverage(product).status === 'COVERED').length;
        const directOnly = products.filter((product) => getIndirectEmissionsApplicability(product).relevance === 'NOT_RELEVANT').length;

        return {
            total: products.length,
            cnReady,
            covered,
            directOnly,
            linkedProcesses: processes.filter((process) => process.product_id).length,
            linkedPrecursors: precursors.filter((precursor) => precursor.product_id).length,
        };
    }, [precursors, processes, products]);

    const nextAction = useMemo(() => getNextAction(stats), [stats]);
    const cnCandidates = useMemo(() => {
        const search = query.trim().toLowerCase();

        if (!search) {
            return CN_CODE_OPTIONS.slice(0, 8);
        }

        return CN_CODE_OPTIONS
            .filter((option) =>
                option.code.includes(search) ||
                option.goodsCategory.toLowerCase().includes(search) ||
                option.description.toLowerCase().includes(search)
            )
            .slice(0, 8);
    }, [query]);

    const visibleProducts = useMemo(() => {
        const search = query.trim().toLowerCase();

        if (!search) {
            return products;
        }

        return products.filter((product) =>
            product.name.toLowerCase().includes(search) ||
            product.cn_code?.includes(search) ||
            product.hs_code.includes(search)
        );
    }, [products, query]);

    function updateDraft(partial: Partial<ProductDraft>) {
        setDraft((current) => {
            const next = { ...current, ...partial };
            const cnCode = partial.cn_code !== undefined ? normalizeCnCode(partial.cn_code) : normalizeCnCode(next.cn_code);

            return {
                ...next,
                cn_code: cnCode,
                hs_group: partial.cn_code !== undefined ? inferHsGroup(cnCode) : next.hs_group,
            };
        });
    }

    function startEdit(product: Product) {
        setDraft({
            id: product.id,
            name: product.name,
            cn_code: product.cn_code ?? '',
            hs_group: product.hs_group,
            unit: product.unit || 'tonne',
            reporting_scope: getProductReportingScope(product),
        });
        setMessage('');
        setError('');
        window.requestAnimationFrame(() => {
            document.getElementById('product-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    }

    function resetDraft() {
        setDraft(EMPTY_DRAFT);
        setError('');
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setMessage('');
        setError('');

        const name = draft.name.trim();
        const cnCode = normalizeCnCode(draft.cn_code);

        if (!name) {
            setError('품목명을 입력하세요.');
            return;
        }

        if (cnCode.length > 0 && cnCode.length !== 8) {
            setError('CN 코드는 비워두거나 8자리 숫자로 입력하세요.');
            return;
        }

        const payload = {
            name,
            hs_code: cnCode.slice(0, 4) || draft.hs_group,
            cn_code: cnCode || undefined,
            hs_group: draft.hs_group,
            product_type_enum: getProductTypeEnum(cnCode || draft.hs_group),
            unit: draft.unit.trim() || 'tonne',
            reporting_scope: draft.reporting_scope,
        };

        if (draft.id) {
            const existing = products.find((product) => product.id === draft.id);

            if (!existing) {
                setError('수정할 품목을 찾을 수 없습니다.');
                return;
            }

            await updateLocalItem('products', {
                ...existing,
                ...payload,
            });
            setMessage('품목을 수정했습니다.');
        } else {
            await createLocalItem('products', payload);
            setMessage('품목을 등록했습니다.');
        }

        resetDraft();
        await refreshProducts();
    }

    async function handleDelete(product: Product) {
        const linkedProcessCount = processes.filter((process) => process.product_id === product.id).length;

        if (linkedProcessCount > 0) {
            setError('생산공정에 연결된 품목은 먼저 공정 연결을 해제한 뒤 삭제하세요.');
            return;
        }

        await deleteLocalItem('products', product.id);
        setMessage('품목을 삭제했습니다.');
        await refreshProducts();
    }

    return (
        <div className="mx-auto max-w-[1480px] space-y-5">
            <section className={`rounded-3xl border p-5 shadow-sm ${nextAction.tone === 'success' ? 'border-emerald-200 bg-emerald-50' : nextAction.tone === 'info' ? 'border-blue-200 bg-blue-50' : 'border-amber-200 bg-amber-50'}`}>
                <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_260px]">
                    <div>
                        <div className="inline-flex rounded-full bg-white/70 px-3 py-1 text-xs font-bold text-slate-700 ring-1 ring-slate-200">
                            지금 할 일
                        </div>
                        <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950">{nextAction.title}</h2>
                        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{nextAction.description}</p>
                        <div className="mt-5 flex flex-wrap gap-2">
                            <Link href={nextAction.href} className="inline-flex min-h-11 items-center rounded-xl bg-[#0F3D2E] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#15533F]">
                                {nextAction.label}
                                <ArrowRight className="ml-2 h-4 w-4" />
                            </Link>
                            <button type="button" onClick={resetDraft} className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                                새 품목 입력
                                <Plus className="ml-2 h-4 w-4" />
                            </button>
                        </div>
                    </div>
                    <div className="rounded-2xl bg-white/75 p-4 ring-1 ring-slate-200">
                        <div className="text-sm font-bold text-slate-700">CN 준비율</div>
                        <div className="mt-2 text-3xl font-bold text-slate-950">{stats.total === 0 ? '0%' : `${Math.round((stats.cnReady / stats.total) * 100)}%`}</div>
                        <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-700" style={{ width: `${stats.total === 0 ? 0 : (stats.cnReady / stats.total) * 100}%` }} />
                        </div>
                        <div className="mt-3 text-xs font-semibold text-slate-500">{stats.cnReady}/{stats.total}개 완료</div>
                    </div>
                </div>
            </section>

            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <StatTile label="등록 품목" value={`${stats.total}개`} caption="로컬 저장 기준" />
                <StatTile label="CN 8자리" value={`${stats.cnReady}개`} caption="EU 보고서 매핑 준비" />
                <StatTile label="CBAM 후보" value={`${stats.covered}개`} caption="현재 규칙상 대상 후보" />
                <StatTile label="직접배출 중심" value={`${stats.directOnly}개`} caption="Annex II direct-only 후보" />
            </section>

            <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
                <form id="product-form" onSubmit={handleSubmit} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">{draft.id ? '품목 수정' : '품목 등록'}</h2>
                            <p className="mt-1 text-sm text-slate-500">처음에는 품목명과 CN 코드만 정확히 입력하세요.</p>
                        </div>
                        <Package className="h-5 w-5 text-emerald-800" />
                    </div>

                    <div className="space-y-4">
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">품목명</span>
                            <input
                                value={draft.name}
                                onChange={(event) => updateDraft({ name: event.target.value })}
                                placeholder="예: Hot Rolled Coil"
                                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                            />
                        </label>
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">CN 코드</span>
                            <input
                                value={draft.cn_code}
                                onChange={(event) => updateDraft({ cn_code: event.target.value })}
                                placeholder="예: 72083900"
                                inputMode="numeric"
                                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                            />
                            <p className="mt-1 text-xs font-semibold text-slate-500">모르면 비워두고 나중에 확인할 수 있습니다.</p>
                        </label>
                        <label className="block">
                            <span className="text-sm font-bold text-slate-700">품목 용도</span>
                            <select
                                value={draft.reporting_scope}
                                onChange={(event) => updateDraft({ reporting_scope: event.target.value as ProductReportingScope })}
                                className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                            >
                                {PRODUCT_REPORTING_SCOPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                            </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="block">
                                <span className="text-sm font-bold text-slate-700">HS 그룹</span>
                                <select
                                    value={draft.hs_group}
                                    onChange={(event) => updateDraft({ hs_group: event.target.value })}
                                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                                >
                                    {!['72', '73'].includes(draft.hs_group) && <option value={draft.hs_group}>{draft.hs_group} 기타</option>}
                                    <option value="72">72 철강</option>
                                    <option value="73">73 철강제품</option>
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-sm font-bold text-slate-700">단위</span>
                                <input
                                    value={draft.unit}
                                    onChange={(event) => updateDraft({ unit: event.target.value })}
                                    className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                                />
                            </label>
                        </div>

                        {error && (
                            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
                                {error}
                            </div>
                        )}
                        {message && (
                            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800">
                                {message}
                            </div>
                        )}

                        <div className="flex gap-2">
                            <button type="submit" className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-[#0F3D2E] px-4 text-sm font-bold text-white shadow-sm hover:bg-[#15533F]">
                                {draft.id ? '수정 저장' : '품목 저장'}
                            </button>
                            {draft.id && (
                                <button type="button" onClick={resetDraft} className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                                    취소
                                </button>
                            )}
                        </div>
                    </div>
                </form>

                <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">품목 목록</h2>
                            <p className="mt-1 text-sm text-slate-500">품목명, CN 코드, CBAM 대상 여부만 먼저 확인합니다.</p>
                        </div>
                        <label className="relative block md:w-72">
                            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="품목명 또는 CN 검색"
                                className="min-h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none ring-emerald-100 transition focus:border-emerald-500 focus:ring-4"
                            />
                        </label>
                    </div>

                    <div id="product-list" className="space-y-3">
                        {loading ? (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm font-semibold text-slate-500">
                                품목을 불러오는 중입니다.
                            </div>
                        ) : visibleProducts.length === 0 ? (
                            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                                <Package className="mx-auto h-8 w-8 text-slate-400" />
                                <p className="mt-3 text-sm font-bold text-slate-700">등록된 품목이 없습니다.</p>
                                <p className="mt-1 text-xs font-semibold text-slate-500">왼쪽에서 대표 품목 1개부터 저장하세요.</p>
                            </div>
                        ) : (
                            visibleProducts.map((product) => {
                                const cnReady = normalizeCnCode(product.cn_code ?? '').length === 8;
                                const coverage = getCbamCoverage(product);
                                const indirect = getIndirectEmissionsApplicability(product);
                                const linkedProcessCount = processes.filter((process) => process.product_id === product.id).length;
                                const reportingScope = getProductReportingScope(product);

                                return (
                                    <article key={product.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                                            <div className="min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="truncate text-base font-bold text-slate-950">{product.name}</h3>
                                                    <StatusBadge tone={cnReady ? 'success' : 'warning'}>{cnReady ? 'CN 완료' : 'CN 확인'}</StatusBadge>
                                                    <StatusBadge tone="neutral">{getProductReportingScopeLabel(reportingScope)}</StatusBadge>
                                                    <StatusBadge tone={coverage.status === 'COVERED' ? 'success' : coverage.status === 'NOT_COVERED' ? 'neutral' : 'warning'}>
                                                        {getProductTypeLabel(product)}
                                                    </StatusBadge>
                                                </div>
                                                <div className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-slate-500">
                                                    <span>CN {product.cn_code || '-'}</span>
                                                    <span>HS {product.hs_code || product.hs_group}</span>
                                                    <span>{product.unit}</span>
                                                    <span>공정 {linkedProcessCount}개</span>
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    <StatusBadge tone={indirect.relevance === 'INCLUDED' ? 'info' : 'warning'}>
                                                        {indirect.label}
                                                    </StatusBadge>
                                                    {linkedProcessCount > 0 ? (
                                                        <StatusBadge tone="success">공정 연결됨</StatusBadge>
                                                    ) : (
                                                        <StatusBadge tone="neutral">공정 연결 전</StatusBadge>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                <button type="button" onClick={() => startEdit(product)} className="inline-flex min-h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                                                    <Pencil className="mr-2 h-4 w-4" />
                                                    수정
                                                </button>
                                                <button type="button" onClick={() => handleDelete(product)} className="inline-flex min-h-10 items-center rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 shadow-sm hover:bg-red-50">
                                                    <Trash2 className="mr-2 h-4 w-4" />
                                                    삭제
                                                </button>
                                            </div>
                                        </div>
                                    </article>
                                );
                            })
                        )}
                    </div>
                </section>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-start justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">CN 코드 후보</h2>
                            <p className="mt-1 text-sm text-slate-500">검색 후 후보를 누르면 입력 폼에 반영됩니다.</p>
                        </div>
                        <ShieldCheck className="h-5 w-5 text-emerald-800" />
                    </div>
                    <div className="grid gap-2 md:grid-cols-2">
                        {cnCandidates.map((option) => (
                            <button
                                key={option.code}
                                type="button"
                                onClick={() => updateDraft({ cn_code: option.code })}
                                className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                            >
                                <div className="font-bold text-slate-950">{option.code}</div>
                                <div className="mt-1 text-xs font-semibold text-slate-500">{option.goodsCategory}</div>
                                <div className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{option.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="mb-4 flex items-start gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-800">
                            <Factory className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-950">다음 단계</h2>
                            <p className="mt-1 text-sm text-slate-500">품목 준비 후 바로 이어지는 작업입니다.</p>
                        </div>
                    </div>
                    <div className="space-y-3">
                        <Link href="/processes" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white">
                            생산공정 연결
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link href="/source-streams" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white">
                            배출원 입력
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                        <Link href="/results" className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-white">
                            산정 결과 확인
                            <ArrowRight className="h-4 w-4" />
                        </Link>
                    </div>
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                        <AlertTriangle className="mb-2 h-4 w-4" />
                        대량 붙여넣기, EU 템플릿 CN 목록 가져오기 같은 고급 기능은 복구용 기존 UI에 남아 있습니다.
                    </div>
                </aside>
            </section>
        </div>
    );
}
