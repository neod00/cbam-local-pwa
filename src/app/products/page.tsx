'use client';

import { useState, useEffect } from 'react';
import { createLocalItem, listLocalItems, Product, seedLocalData } from '@/lib/local-db';
import { Plus } from 'lucide-react';

type HsGroup = Product['hs_group'];
type ProductDraft = Pick<Product, 'name' | 'hs_code' | 'hs_group' | 'product_type_enum' | 'unit'>;

export default function ProductsPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);

    // Form State
    const [newItem, setNewItem] = useState<ProductDraft>({
        name: '',
        hs_code: '',
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
            hs_group: '72',
            product_type_enum: 'HS72_PLATE_SHEET',
            unit: 'tonne',
        });
        setShowForm(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Products (HS72/73)</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Product
                </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
                Saved locally in this browser. No product or production data is sent to a server.
            </p>

            {/* Add Form */}
            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium">New Product Registration</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS Code</label>
                            <input
                                type="text"
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.hs_code}
                                onChange={(e) => setNewItem({ ...newItem, hs_code: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">HS Group</label>
                            <select
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                                value={newItem.hs_group}
                                onChange={(e) => setNewItem({ ...newItem, hs_group: e.target.value as HsGroup })}
                            >
                                <option value="72">HS 72 (Iron & Steel)</option>
                                <option value="73">HS 73 (Articles of Iron & Steel)</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Type Enum</label>
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
                                Save Product
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
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Name</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">HS Code</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Group</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Type</th>
                                        <th className="px-3 py-3.5 text-left text-sm font-semibold text-gray-900">Unit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white">
                                    {loading ? (
                                        <tr><td colSpan={5} className="p-4 text-center">Loading...</td></tr>
                                    ) : products.length === 0 ? (
                                        <tr><td colSpan={5} className="p-4 text-center text-gray-500">No products found.</td></tr>
                                    ) : (
                                        products.map((product) => (
                                            <tr key={product.id}>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm font-medium text-gray-900">{product.name}</td>
                                                <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-500">{product.hs_code}</td>
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
