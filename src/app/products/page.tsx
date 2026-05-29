'use client';

import { useState, useEffect } from 'react';
import {
    createLocalItem,
    getLocalSetting,
    listLocalItems,
    Product,
    seedLocalData,
    setLocalSetting,
    updateLocalItem,
} from '@/lib/local-db';
import { CN_CODE_OPTIONS, type CnCodeOption } from '@/lib/cn-code-options';
import { parseEuTemplateCnCodeOptions } from '@/lib/eu-template-export';
import { FileSpreadsheet, Pencil, Plus, X } from 'lucide-react';

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

    const filteredCnOptions = cnOptions.filter((option) => {
        const query = cnSearch.trim().toLowerCase();

        if (!query) {
            return true;
        }

        return (
            option.code.includes(query) ||
            option.labelKo.toLowerCase().includes(query) ||
            option.description.toLowerCase().includes(query) ||
            option.goodsCategory.toLowerCase().includes(query)
        );
    }).slice(0, 12);

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">제품 등록(CN/HS 72·73)</h1>
                <button
                    onClick={startNewProduct}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    제품 추가
                </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
                제품과 생산 관련 데이터는 이 브라우저에만 저장됩니다. EU Export 정확도를 위해 CN 8자리 코드를 우선 입력하세요.
            </p>

            <div className="mt-6 rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <h2 className="text-base font-semibold text-gray-900">EU 템플릿 CN 코드 목록</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            최신 EU 템플릿을 선택하면 `Parameters_CNCodes`의 전체 CN 코드 목록을 로컬에 저장해 제품 등록 검색에 사용합니다.
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                            현재 검색 목록: {cnOptions.length}개 {cnOptions === CN_CODE_OPTIONS ? '(대표 코드)' : '(EU 템플릿에서 가져옴)'}
                        </p>
                    </div>
                    <label className="inline-flex cursor-pointer items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                        <FileSpreadsheet className="mr-2 h-4 w-4 text-gray-500" />
                        EU 템플릿에서 가져오기
                        <input
                            type="file"
                            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                            className="sr-only"
                            onChange={(event) => handleCnTemplateImport(event.target.files?.[0])}
                        />
                    </label>
                </div>
                {cnImportMessage && (
                    <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
                        {cnImportMessage}
                    </div>
                )}
                {cnImportError && (
                    <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800">
                        {cnImportError}
                    </div>
                )}
            </div>

            {/* Add Form */}
            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <h2 className="text-lg font-medium">{editingProductId ? '제품 정보 수정' : '신규 제품 등록'}</h2>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="inline-flex items-center rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <X className="mr-2 h-4 w-4" />
                            취소
                        </button>
                    </div>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">제품명</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.name}
                                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS 코드</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.hs_code}
                                onChange={(e) => setDraft({ ...draft, hs_code: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">CN 8자리 코드</label>
                            <input
                                type="text"
                                inputMode="numeric"
                                pattern="[0-9]{8}"
                                maxLength={8}
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.cn_code}
                                onChange={(e) =>
                                    setDraft({
                                        ...draft,
                                        cn_code: e.target.value.replace(/\D/g, '').slice(0, 8),
                                    })
                                }
                                placeholder="예: 72083900"
                            />
                            <p className="mt-1 text-xs text-gray-500">EU 템플릿 제출 검증은 CN 8자리 기준으로 수행합니다.</p>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700">CN 코드 검색</label>
                            <input
                                type="search"
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={cnSearch}
                                onChange={(event) => setCnSearch(event.target.value)}
                                placeholder="예: 열연, 강관, 볼트, 7208, 7318"
                            />
                            <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
                                {filteredCnOptions.map((option) => (
                                    <button
                                        key={option.code}
                                        type="button"
                                        onClick={() =>
                                            setDraft({
                                                ...draft,
                                                cn_code: option.code,
                                                hs_code: option.code.slice(0, 4),
                                                hs_group: option.code.startsWith('73') ? '73' : '72',
                                                product_type_enum: option.goodsCategory,
                                            })
                                        }
                                        className="rounded-md border border-gray-200 bg-gray-50 p-3 text-left hover:border-blue-300 hover:bg-blue-50"
                                    >
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="text-sm font-semibold text-gray-900">{option.code}</span>
                                            <span className="text-xs text-gray-500">{option.goodsCategory}</span>
                                        </div>
                                        <div className="mt-1 text-sm text-gray-700">{option.labelKo}</div>
                                        <div className="mt-1 line-clamp-1 text-xs text-gray-500">{option.description}</div>
                                    </button>
                                ))}
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                EU 템플릿에서 가져온 목록이 있으면 전체 목록을 검색합니다. 최종 Export 검증도 업로드한 최신 EU 템플릿의 Parameters_CNCodes를 기준으로 합니다.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS 그룹</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={draft.hs_group}
                                onChange={(e) => setDraft({ ...draft, hs_group: e.target.value as HsGroup })}
                            >
                                <option value="72">HS 72 (철강)</option>
                                <option value="73">HS 73 (철강 제품)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">제품군 템플릿</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
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
                            <button
                                type="submit"
                                className="items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                {editingProductId ? '수정 저장' : '제품 저장'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* List */}
            <div className="mt-6 flow-root">
                <div className="-mx-4 -my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
                    <div className="inline-block min-w-full py-2 align-middle sm:px-6 lg:px-8">
                        <div className="overflow-hidden shadow ring-1 ring-black ring-opacity-5 sm:rounded-lg">
                            <table className="min-w-full divide-y divide-gray-300">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품명</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">HS 코드</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">CN 8자리</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">그룹</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">제품군</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">단위</th>
                                        <th className="px-3 py-3.5 text-right text-sm font-semibold text-gray-900">관리</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {loading ? (
                                        <tr><td colSpan={7} className="p-4 text-center">불러오는 중...</td></tr>
                                    ) : products.length === 0 ? (
                                        <tr><td colSpan={7} className="p-4 text-center text-gray-500">등록된 제품이 없습니다.</td></tr>
                                    ) : (
                                        products.map((product) => (
                                            <tr key={product.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.hs_code}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.cn_code || '미입력'}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">HS {product.hs_group}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.product_type_enum}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.unit}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-right text-sm">
                                                    <button
                                                        type="button"
                                                        onClick={() => startEditProduct(product)}
                                                        className="inline-flex items-center rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                                                    >
                                                        <Pencil className="mr-1.5 h-4 w-4" />
                                                        수정
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
