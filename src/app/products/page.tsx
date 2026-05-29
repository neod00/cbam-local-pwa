'use client';

import { useState, useEffect } from 'react';
import { createLocalItem, listLocalItems, Product, seedLocalData } from '@/lib/local-db';
import { CN_CODE_OPTIONS } from '@/lib/cn-code-options';
import { Plus } from 'lucide-react';

type HsGroup = Product['hs_group'];
type ProductDraft = Pick<Product, 'name' | 'hs_code' | 'cn_code' | 'hs_group' | 'product_type_enum' | 'unit'>;

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [cnSearch, setCnSearch] = useState('');

    // Form State
    const [newItem, setNewItem] = useState<ProductDraft>({
        name: '',
        hs_code: '',
        cn_code: '',
        hs_group: '72',
        product_type_enum: 'HS72_PLATE_SHEET',
        unit: 'tonne',
    });

    useEffect(() => {
        async function fetchProducts() {
            setLoading(true);
            await seedLocalData();
            const data = await listLocalItems('products');
            setProducts(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
            setLoading(false);
        }

        fetchProducts();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const product = await createLocalItem('products', newItem);
        setProducts([product, ...products]);
        setNewItem({
            name: '',
            hs_code: '',
            cn_code: '',
            hs_group: '72',
            product_type_enum: 'HS72_PLATE_SHEET',
            unit: 'tonne',
        });
        setShowForm(false);
    }

    const filteredCnOptions = CN_CODE_OPTIONS.filter((option) => {
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
    }).slice(0, 8);

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">제품 등록(CN/HS 72·73)</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    제품 추가
                </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
                제품과 생산 관련 데이터는 이 브라우저에만 저장됩니다. EU Export 정확도를 위해 CN 8자리 코드를 우선 입력하세요.
            </p>

            {/* Add Form */}
            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium">신규 제품 등록</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">제품명</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS 코드</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.hs_code}
                                onChange={(e) => setNewItem({ ...newItem, hs_code: e.target.value })}
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
                                value={newItem.cn_code}
                                onChange={(e) =>
                                    setNewItem({
                                        ...newItem,
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
                                            setNewItem({
                                                ...newItem,
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
                                이 목록은 입력 보조용 대표 코드입니다. 최종 Export 검증은 사용자가 업로드한 최신 EU 템플릿의 Parameters_CNCodes를 기준으로 합니다.
                            </p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS 그룹</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.hs_group}
                                onChange={(e) => setNewItem({ ...newItem, hs_group: e.target.value as HsGroup })}
                            >
                                <option value="72">HS 72 (철강)</option>
                                <option value="73">HS 73 (철강 제품)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">제품군 템플릿</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.product_type_enum}
                                onChange={(e) => setNewItem({ ...newItem, product_type_enum: e.target.value })}
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
                                제품 저장
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
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {loading ? (
                                        <tr><td colSpan={6} className="p-4 text-center">불러오는 중...</td></tr>
                                    ) : products.length === 0 ? (
                                        <tr><td colSpan={6} className="p-4 text-center text-gray-500">등록된 제품이 없습니다.</td></tr>
                                    ) : (
                                        products.map((product) => (
                                            <tr key={product.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.hs_code}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.cn_code || '미입력'}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">HS {product.hs_group}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.product_type_enum}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.unit}</td>
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
