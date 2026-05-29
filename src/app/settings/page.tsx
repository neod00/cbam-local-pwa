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
        return '아직 백업하지 않음';
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

const storeLabels: Record<string, string> = {
    installations: '사업장',
    products: '제품',
    periods: '보고기간',
    processes: '생산공정',
    precursors: '구매 전구물질',
    settings: '설정',
};

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
        setMessage('백업 파일을 내보냈습니다. 회사의 안전한 폴더에 보관하세요.');
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
            setMessage('백업 파일을 불러왔습니다. 복원 전 데이터 건수를 확인하세요.');
        } catch (error) {
            setBackupPreview(null);
            setImportContent('');
            setMessage(error instanceof Error ? error.message : '백업 파일을 읽을 수 없습니다.');
        } finally {
            event.target.value = '';
        }
    }

    async function handleImport() {
        if (!backupPreview || !importContent) {
            return;
        }

        const confirmed = window.confirm(
            '이 .cbam 백업을 복원할까요? 현재 브라우저의 모든 CBAM Local 데이터가 백업 내용으로 교체됩니다.'
        );

        if (!confirmed) {
            return;
        }

        await importLocalBackup(parseBackupFile(importContent));
        setMessage('백업을 복원했습니다. 화면을 새로고침해 로컬 데이터를 다시 불러오는 것을 권장합니다.');
        setBackupPreview(null);
        setImportContent('');
    }

    async function handleClearData() {
        const confirmed = window.confirm(
            '이 브라우저의 모든 CBAM Local 데이터를 삭제할까요? 보관이 필요하면 먼저 .cbam 백업을 내보내세요.'
        );

        if (!confirmed) {
            return;
        }

        await clearLocalData();
        await seedLocalData();
        setMessage('로컬 데이터를 삭제하고 시작용 예시 데이터를 다시 생성했습니다.');
    }

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-gray-900">설정 및 데이터 안전</h1>
                <p className="mt-2 max-w-3xl text-sm text-gray-600">
                    CBAM Local은 기업 데이터를 이 브라우저의 로컬 DB에 저장합니다. 장기 보관, PC 교체,
                    검증 대응을 위해 .cbam 백업을 사용하세요.
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
                        <h2 className="text-base font-semibold text-gray-900">서버 전송</h2>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                        생산, 전구물질, 사업장, 결과 데이터는 이 PWA 버전에서 로컬로 처리됩니다.
                        공유 데모 환경에는 실제 기업 데이터를 입력하지 마세요.
                    </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <Database className="h-5 w-5 text-sky-600" />
                        <h2 className="text-base font-semibold text-gray-900">로컬 저장</h2>
                    </div>
                    <p className="mt-3 text-sm text-gray-600">
                        브라우저 데이터 삭제, 프로필 초기화, 도메인 변경 시 로컬 데이터가 사라질 수 있습니다.
                        최신 .cbam 백업을 브라우저 밖에 보관하세요.
                    </p>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <h2 className="text-base font-semibold text-gray-900">마지막 백업</h2>
                    </div>
                    <p className="mt-3 text-sm font-medium text-gray-900">{formatDateTime(lastBackupAt)}</p>
                    <p className="mt-1 text-sm text-gray-600">중요한 데이터 변경 후에는 백업하세요.</p>
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">.cbam 백업 내보내기</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            사업장, 제품, 보고기간, 생산공정, 전구물질, 설정과 향후 산정 데이터를 하나의 백업 파일로 내려받습니다.
                        </p>
                    </div>
                    <button
                        onClick={handleExport}
                        className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                        <Download className="mr-2 h-4 w-4" />
                        백업 내보내기
                    </button>
                </div>
            </section>

            <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">.cbam 백업 가져오기</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            백업 파일을 불러와 내용을 확인한 뒤 이 브라우저에 복원합니다. 복원하면 현재 로컬 데이터가 교체됩니다.
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
                            백업 선택
                        </button>
                        <button
                            onClick={handleImport}
                            disabled={!backupPreview}
                            className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            복원
                        </button>
                    </div>
                </div>

                {backupPreview && (
                    <div className="mt-5 rounded-md border border-gray-200 bg-gray-50 p-4">
                        <h3 className="text-sm font-semibold text-gray-900">백업 미리보기</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                            <div>
                                <dt className="text-gray-500">내보낸 시각</dt>
                                <dd className="font-medium text-gray-900">
                                    {formatDateTime(backupPreview.manifest.exported_at)}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">형식</dt>
                                <dd className="font-medium text-gray-900">
                                    v{backupPreview.manifest.format_version}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">데이터 건수</dt>
                                <dd className="font-medium text-gray-900">{totalPreviewItems}</dd>
                            </div>
                        </dl>
                        <div className="mt-4 grid grid-cols-2 gap-2 text-sm md:grid-cols-4">
                            {Object.entries(backupPreview.manifest.counts).map(([store, count]) => (
                                <div key={store} className="rounded border border-gray-200 bg-white px-3 py-2">
                                    <div className="text-gray-500">{storeLabels[store] ?? store}</div>
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
                        <h2 className="text-lg font-semibold text-red-900">로컬 데이터 삭제</h2>
                        <p className="mt-1 text-sm text-red-700">
                            이 브라우저의 모든 CBAM Local 데이터를 삭제합니다. 보관이 필요하면 먼저 백업을 내보내세요.
                        </p>
                    </div>
                    <button
                        onClick={handleClearData}
                        className="inline-flex items-center justify-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        데이터 삭제
                    </button>
                </div>
            </section>
        </div>
    );
}
