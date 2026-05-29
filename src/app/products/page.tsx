'use client';

import { Button, DataTable, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { CN_CODE_OPTIONS, type CnCodeOption } from '@/lib/cn-code-options';
import { parseEuTemplateCnCodeOptions } from '@/lib/eu-template-export';
import {
    createLocalItem,
    getLocalSetting,
    listLocalItems,
    Product,
    seedLocalData,
    setLocalSetting,
    updateLocalItem,
} from '@/lib/local-db';
import { FileSpreadsheet, Pencil, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type HsGroup = Product['hs_group'];
type ProductDraft = Pick<Product, 'name' | 'hs_code' | 'cn_code' | 'hs_group' | 'product_type_enum' | 'unit'>;

const EMPTY_PRODUCT_DRAFT: ProductDraft = {
    name: '',
    hs_code: '',
    cn_code: '',
    hs_group: '72',
    product_type_enum: 'HS72_PLATE_SHEET',
    unit: 'tonne',
};

const fieldClass =
    'mt-1 block h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-teal-600 focus:ring-4 focus:ring-teal-100';

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingProductId, setEditingProductId] = useState<string | null>(null);
    const [cnSearch, setCnSearch] = useState('');
    const [cnOptions, setCnOptions] = useState<CnCodeOption[]>(CN_CODE_OPTIONS);
    const [cnImportMessage, setCnImportMessage] = useState('');
    const [cnImportError, setCnImportError] = useState('');
    const [draft, setDraft] = useState<ProductDraft>(EMPTY_PRODUCT_DRAFT);

    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            await seedLocalData();
            const [data, storedCnOptions] = await Promise.all([
                listLocalItems('products'),
                getLocalSetting<CnCodeOption[]>('cn-code-options'),
            ]);
            setProducts(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
            if (storedCnOptions?.length) {
                setCnOptions(storedCnOptions);
            }
            setLoading(false);
        }

        fetchProducts();
    }, []);

    const filteredCnOptions = useMemo(() => {
        const query = cnSearch.trim().toLowerCase();

        return cnOptions
            .filter((option) => {
                if (!query) {
                    return true;
                }

                return (
                    option.code.includes(query) ||
                    option.labelKo.toLowerCase().includes(query) ||
                    option.description.toLowerCase().includes(query) ||
                    option.goodsCategory.toLowerCase().includes(query)
                );
            })
            .slice(0, 12);
    }, [cnOptions, cnSearch]);

    function resetForm() {
        setDraft(EMPTY_PRODUCT_DRAFT);
        setEditingProductId(null);
        setCnSearch('');
        setShowForm(false);
    }

    function startNewProduct() {
        if (showForm && !editingProductId) {
            resetForm();
            return;
        }

        setDraft(EMPTY_PRODUCT_DRAFT);
        setEditingProductId(null);
        setCnSearch('');
        setShowForm(true);
    }

    function startEditProduct(product: Product) {
        setDraft({
            name: product.name,
            hs_code: product.hs_code,
            cn_code: product.cn_code ?? '',
            hs_group: product.hs_group,
            product_type_enum: product.product_type_enum,
            unit: product.unit,
        });
        setEditingProductId(product.id);
        setCnSearch(product.cn_code ?? product.hs_code);
        setShowForm(true);
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();

        if (editingProductId) {
            const existingProduct = products.find((product) => product.id === editingProductId);

            if (!existingProduct) {
                return;
            }

            const updatedProduct = await updateLocalItem('products', {
                ...existingProduct,
                ...draft,
            });
            setProducts(products.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)));
            resetForm();
            return;
        }

        const product = await createLocalItem('products', draft);
        setProducts([product, ...products]);
        resetForm();
    }

    async function handleCnTemplateImport(file: File | undefined) {
        setCnImportMessage('');
        setCnImportError('');

        if (!file) {
            return;
        }

        try {
            const importedOptions = await parseEuTemplateCnCodeOptions(file);
            await setLocalSetting('cn-code-options', importedOptions);
            setCnOptions(importedOptions);
            setCnImportMessage(`EU 템플릿에서 CN 코드 ${importedOptions.length}개를 가져왔습니다.`);
        } catch (error) {
            setCnImportError(error instanceof Error ? error.message : 'CN 코드 목록을 가져오지 못했습니다.');
        }
    }

    function applyCnOption(option: CnCodeOption) {
        setDraft({
            ...draft,
            cn_code: option.code,
            hs_code: option.code.slice(0, 4),
            hs_group: option.code.startsWith('73') ? '73' : '72',
            product_type_enum: option.goodsCategory,
        });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="품목 기준 데이터"
                title="CBAM 대상 품목 관리"
                description="CN 코드 기준으로 대상 여부와 산정 상태를 관리합니다. 제품 데이터는 이 브라우저에만 저장됩니다."
                actions={
                    <Button type="button" onClick={startNewProduct}>
                        <Plus className="mr-2 h-4 w-4" />
                        품목 추가
                    </Button>
                }
            />

            <SectionCard
                title="EU 템플릿 CN 코드 목록"
                description="최신 EU 템플릿을 선택하면 Parameters_CNCodes의 전체 CN 코드 목록을 로컬에 저장해 제품 검색에 사용합니다."
                actions={
                    <label className="inline-flex min-h-10 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-teal-700" />
                        EU 템플릿에서 가져오기
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            onChange={(event) => handleCnTemplateImport(event.target.files?.[0])}
                        />
                    </label>
                }
            >
                <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <StatusBadge tone={cnOptions === CN_CODE_OPTIONS ? 'neutral' : 'success'}>
                        {cnOptions === CN_CODE_OPTIONS ? '대표 코드 목록' : 'EU 템플릿 기준'}
                    </StatusBadge>
                    <span>현재 검색 목록: {cnOptions.length}개</span>
                </div>
                {cnImportMessage && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                        {cnImportMessage}
                    </div>
                )}
                {cnImportError && (
                    <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                        {cnImportError}
                    </div>
                )}
            </SectionCard>

            {showForm && (
                <SectionCard
                    title={editingProductId ? '제품 정보 수정' : '신규 제품 등록'}
                    description="EU Export 정확도를 위해 CN 8자리 코드를 우선 입력하세요."
                    actions={
                        <Button type="button" variant="secondary" onClick={resetForm}>
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </Button>
                    }
                >
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-semibold text-slate-700">제품명</label>
                            <input
                                type="text"
                                required
                                className={fieldClass}
                                value={draft.name}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">HS 코드</label>
                            <input
                                type="text"
                                required
                                className={fieldClass}
                                value={draft.hs_code}
                                onChange={(e) => setDraft({ ...draft, hs_code: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">CN 8자리 코드</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{8}"
                                maxLength={8}
                                className={fieldClass}
                                value={draft.cn_code}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        cn_code: e.target.value.replace(/\D/g, '').slice(0, 8),
                                    })
                                }
                                placeholder="예: 72083900"
                            />
                            <p className="mt-1 text-xs text-slate-500">EU 템플릿 제출 검증은 CN 8자리 기준으로 수행합니다.</p>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">CN 코드 검색</label>
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                                <input
                                    type="search"
                                    className={`${fieldClass} pl-9`}
                                    value={cnSearch}
                                    onChange={(event) => setCnSearch(event.target.value)}
                                    placeholder="예: 열연, 강관, 볼트, 7208, 7318"
                                />
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {filteredCnOptions.map((option) => (
                                    <button
                                        key={option.code}
                                        type="button"
                                        onClick={() => applyCnOption(option)}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-teal-300 hover:bg-teal-50"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold text-slate-950">{option.code}</span>
                                            <span className="text-xs text-slate-500">{option.goodsCategory}</span>
                                        </div>
                                        <div className="mt-1 text-sm text-slate-700">{option.labelKo}</div>
                                        <div className="mt-1 line-clamp-1 text-xs text-slate-500">{option.description}</div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="text-sm font-semibold text-slate-700">HS 그룹</label>
                            <select
                                className={fieldClass}
                                value={draft.hs_group}
                                onChange={(e) => setDraft({ ...draft, hs_group: e.target.value as HsGroup })}
                            >
                                <option value="72">HS 72 (철강)</option>
                                <option value="73">HS 73 (철강 제품)</option>
                            </select>
                        </div>
                        <div>
                            <label className="text-sm font-semibold text-slate-700">제품군 템플릿</label>
                            <select
                                className={fieldClass}
                                value={draft.product_type_enum}
                                onChange={(e) => setDraft({ ...draft, product_type_enum: e.target.value })}
                            >
                                <option value="HS72_PLATE_SHEET">HS72_PLATE_SHEET</option>
                                <option value="HS72_BAR_SECTION">HS72_BAR_SECTION</option>
                                <option value="HS72_WIRE">HS72_WIRE</option>
                                <option value="HS73_PIPE_TUBE">HS73_PIPE_TUBE</option>
                                <option value="HS73_STRUCTURE">HS73_STRUCTURE</option>
                                <option value="HS73_TANK">HS73_TANK</option>
                                <option value="HS73_FASTENER">HS73_FASTENER</option>
                                <option value="HS73_OTHER">HS73_OTHER</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <Button type="submit">{editingProductId ? '수정 저장' : '제품 저장'}</Button>
                        </div>
                    </form>
                </SectionCard>
            )}

            <DataTable>
                <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                        <tr>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">CN 코드</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">제품명</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">품목군</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">HS 코드</th>
                            <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">단위</th>
                            <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                        {loading ? (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-sm text-slate-500">
                                    불러오는 중...
                                </td>
                            </tr>
                        ) : products.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-6 text-center text-sm text-slate-500">
                                    등록된 제품이 없습니다.
                                </td>
                            </tr>
                        ) : (
                            products.map((product) => (
                                <tr key={product.id} className="transition hover:bg-slate-50">
                                    <td className="whitespace-nowrap px-4 py-4 text-sm">
                                        <StatusBadge tone={product.cn_code?.length === 8 ? 'success' : 'warning'}>
                                            {product.cn_code?.length === 8 ? '산정 준비' : 'CN 확인 필요'}
                                        </StatusBadge>
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm font-semibold text-slate-950">
                                        {product.cn_code || '미입력'}
                                    </td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">{product.name}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.product_type_enum}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.hs_code}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{product.unit}</td>
                                    <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                        <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" onClick={() => startEditProduct(product)}>
                                            <Pencil className="mr-1.5 h-4 w-4" />
                                            수정
                                        </Button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </DataTable>
        </div>
    );
}
