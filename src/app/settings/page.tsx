'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
    CbamBackupFile,
    clearLocalData,
    exportLocalBackup,
    importLocalBackup,
    parseBackupFile,
    seedLocalData,
} from '@/lib/local-db';
import { AlertTriangle, Database, Download, FileUp, ShieldCheck, Trash2 } from 'lucide-react';

function formatDateTime(value?: string) {
    if (!value) {
        return 'Not yet backed up';
    }

    return new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function createBackupFilename() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return `cbam-local-backup-${stamp}.cbam`;
}

export default function SettingsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [backupPreview, setBackupPreview] = useState<CbamBackupFile | null>(null);
    const [importContent, setImportContent] = useState<string>('');
    const [message, setMessage] = useState('');
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();

    useEffect(() => {
        setLastBackupAt(window.localStorage.getItem('cbam-local:last-backup-at') ?? undefined);
    }, []);

    const totalPreviewItems = useMemo(() => {
        if (!backupPreview) {
            return 0;
        }

        return Object.values(backupPreview.manifest.counts).reduce((sum, count) => sum + count, 0);
    }, [backupPreview]);

    async function handleExport() {
        const backup = await exportLocalBackup();
        const content = JSON.stringify(backup, null, 2);
        const blob = new Blob([content], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = url;
        anchor.download = createBackupFilename();
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);

        window.localStorage.setItem('cbam-local:last-backup-at', backup.manifest.exported_at);
        setLastBackupAt(backup.manifest.exported_at);
        setMessage('Backup file exported. Store it in a secure company folder.');
    }

    async function handleFileSelected(event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) {
            return;
        }

        try {
            const content = await file.text();
            const parsed = parseBackupFile(content);
            setBackupPreview(parsed);
            setImportContent(content);
            setMessage('Backup file loaded. Review the counts before restoring.');
        } catch (error) {
            setBackupPreview(null);
            setImportContent('');
            setMessage(error instanceof Error ? error.message : 'Could not read the backup file.');
        } finally {
            event.target.value = '';
        }
    }

    async function handleImport() {
        if (!backupPreview || !importContent) {
            return;
        }

        const confirmed = window.confirm(
            'Restore this .cbam backup? This replaces all local CBAM Local data in this browser.'
        );

        if (!confirmed) {
            return;
        }

        await importLocalBackup(parseBackupFile(importContent));
        setMessage('Backup restored. Reloading local project data is recommended.');
        setBackupPreview(null);
        setImportContent('');
    }

    async function handleClearData() {
        const confirmed = window.confirm(
            'Delete all local CBAM Local data from this browser? Export a .cbam backup first if you need to keep it.'
        );

        if (!confirmed) {
            return;
        }

        await clearLocalData();
        await seedLocalData();
        setMessage('Local data was cleared and demo starter data was recreated.');
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">Settings & Data Safety</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    CBAM Local stores company data in this browser&apos;s local database. Use .cbam backups
                    for long-term retention, PC migration, and audit support.
                </p>
            </div>

            {message && (
                <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    {message}
                </div>
            )}

            <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <ShieldCheck className="h-5 w-5 text-green-600" />
                        <h2 className="text-base font-semibold text-gray-900">Server transfer</h2>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                        Production, precursor, installation, and result data are handled locally in this PWA
                        edition. Do not enter real company data into shared demo deployments.
                    </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <Database className="h-5 w-5 text-sky-600" />
                        <h2 className="text-base font-semibold text-gray-900">Local storage</h2>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                        Browser data cleanup, profile reset, or domain changes can remove local data. Keep a
                        current .cbam backup outside the browser.
                    </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-gray-900">Last backup</h2>
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-900">{formatDateTime(lastBackupAt)}</p>
                    <p className="mt-1 text-sm text-gray-600">Back up after each material data update.</p>
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Export .cbam backup</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            Download all local installations, products, reporting periods, settings, and future
                            calculation data into one portable backup file.
                        </p>
                    </div>
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        Export Backup
                    </button>
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Import .cbam backup</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            Load a backup file, review its contents, then restore it into this browser. Restore
                            replaces the current local data.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".cbam,application/json"
                            className="hidden"
                            onChange={handleFileSelected}
                        />
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                            <FileUp className="mr-2 h-4 w-4" />
                            Select Backup
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={!backupPreview}
                            className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            Restore
                        </button>
                    </div>
                </div>

                {backupPreview && (
                    <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4">
                        <h3 className="text-sm font-semibold text-gray-900">Backup preview</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div>
                                <dt className="text-gray-500">Exported</dt>
                                <dd className="font-medium text-gray-900">
                                    {formatDateTime(backupPreview.manifest.exported_at)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Format</dt>
                                <dd className="font-medium text-gray-900">
                                    v{backupPreview.manifest.format_version}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Records</dt>
                                <dd className="font-medium text-gray-900">{totalPreviewItems}</dd>
                            </div>
                        </dl>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            {Object.entries(backupPreview.manifest.counts).map(([store, count]) => (
                                <div key={store} className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <div className="text-gray-500">{store}</div>
                                    <div className="font-semibold text-gray-900">{count}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-lg border border-red-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-red-900">Clear local data</h2>
                        <p className="mt-1 text-sm text-red-700">
                            Removes all CBAM Local data from this browser. Export a backup first if this data
                            must be retained.
                        </p>
                    </div>
                    <button
                        onClick={handleClearData}
                        className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Clear Data
                    </button>
                </div>
            </section>
        </div>
    );
}
