'use client';

import { calculateEmission } from '@/lib/calculation-engine';
import { useState } from 'react';

export default function ResultsPage() {
    // Demo Calculation
    const demoInput = {
        output_mass_t: 1000,
        electricity_mwh: 500,
        electricity_ef: 0.47, // Korea Grid approx
        fuel_usage: [
            { amount: 200, unit: 'TJ', ef: 56.1 } // LNG approx
        ],
        precursors: [
            { see: 2.5, share: 0.1 } // 10%
        ],
        input_mass_t: 1050
    };

    const [result] = useState(() => calculateEmission(demoInput));

    return (
        <div>
            <h1 className="text-2xl font-bold text-gray-900">Calculation Results</h1>

            <div className="mt-6 rounded-lg bg-white p-6 shadow">
                <h2 className="text-lg font-medium text-gray-900 mb-4">Demo Result (Client-side Calculation)</h2>

                <dl className="grid grid-cols-1 gap-5 sm:grid-cols-4">
                    <div className="overflow-hidden rounded-lg bg-gray-50 px-4 py-5 sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">Total SEE</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{result.total_see.toFixed(3)}</dd>
                        <dd className="text-xs text-gray-400">tCO2e/t</dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-gray-50 px-4 py-5 sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">Direct SEE</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{result.direct_see.toFixed(3)}</dd>
                        <dd className="text-xs text-gray-400">tCO2e/t</dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-gray-50 px-4 py-5 sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">Indirect SEE</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{result.indirect_see.toFixed(3)}</dd>
                        <dd className="text-xs text-gray-400">tCO2e/t</dd>
                    </div>
                    <div className="overflow-hidden rounded-lg bg-gray-50 px-4 py-5 sm:p-6">
                        <dt className="truncate text-sm font-medium text-gray-500">Precursor SEE</dt>
                        <dd className="mt-1 text-3xl font-semibold text-gray-900">{result.precursor_see.toFixed(3)}</dd>
                        <dd className="text-xs text-gray-400">tCO2e/t</dd>
                    </div>
                </dl>
            </div>
        </div>
    );
}
