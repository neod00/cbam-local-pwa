'use client';

import { useState, useEffect } from 'react';
import { createLocalItem, Installation, listLocalItems, seedLocalData } from '@/lib/local-db';
import { Plus } from 'lucide-react';

export default function InstallationsPage() {
    const [items, setItems] = useState<Installation[]>([]);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        country: 'KR',
    } satisfies Pick<Installation, 'name' | 'country'>);

    useEffect(() => {
        async function fetchInstallations() {
            await seedLocalData();
            const data = await listLocalItems('installations');
            setItems(data.sort((a, b) => b.created_at.localeCompare(a.created_at)));
        }

        fetchInstallations();
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        const installation = await createLocalItem('installations', newItem);
        setItems([installation, ...items]);
        setNewItem({ name: '', country: 'KR' });
        setShowForm(false);
    }

    return (
        <div>
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold text-gray-900">Installations</h1>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="flex items-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                    <Plus className="mr-2 h-4 w-4" />
                    Add Installation
                </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">
                Installation data stays in the browser local database for this PWA edition.
            </p>

            {showForm && (
                <div className="mt-6 rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <h2 className="mb-4 text-lg font-medium">New Installation</h2>
                    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Name</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.name}
                                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Country</label>
                            <input
                                required
                                className="mt-1 block w-full rounded-md border border-gray-300 p-2 shadow-sm"
                                value={newItem.country}
                                onChange={(e) => setNewItem({ ...newItem, country: e.target.value.toUpperCase() })}
                                maxLength={2}
                            />
                        </div>
                        <div className="md:col-span-2">
                            <button
                                type="submit"
                                className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                            >
                                Save Installation
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="mt-6 bg-white shadow overflow-hidden sm:rounded-md">
                <ul role="list" className="divide-y divide-gray-200">
                    {items.map((item) => (
                        <li key={item.id} className="px-4 py-4 sm:px-6">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-medium text-blue-600 truncate">{item.name}</p>
                                <div className="ml-2 flex-shrink-0 flex">
                                    <p className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-green-100 text-green-800">
                                        {item.country}
                                    </p>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            </div>
        </div>
    );
}
