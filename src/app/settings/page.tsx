'use client';

import { Button, PageHeader, SectionCard, StatCard } from '@/components/ui';
import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
    CbamBackupFile,
    clearLocalData,
    exportLocalBackup,
    getLocalSetting,
    importLocalBackup,
    parseBackupFile,
    seedLocalData,
} from '@/lib/local-db';
import {
    DEFAULT_SCENARIO_ASSUMPTIONS,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
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
    product_output_lines: '제품 생산라인',
    source_streams: '배출원 자료',
    precursors: '구매 전구물질',
    settings: '설정',
};

export default function SettingsPage() {
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [backupPreview, setBackupPreview] = useState<CbamBackupFile | null>(null);
    const [importContent, setImportContent] = useState<string>('');
    const [message, setMessage] = useState('');
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
    const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumptions>();

    useEffect(() => {
        setLastBackupAt(window.localStorage.getItem('cbam-local:last-backup-at') ?? undefined);
        getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY)
            .then((savedAssumptions) => setScenarioAssumptions(normalizeScenarioAssumptions(savedAssumptions)))
            .catch(() => setScenarioAssumptions(normalizeScenarioAssumptions(undefined)));
    }, []);

    const totalPreviewItems = useMemo(() => {
        if (!backupPreview) {
            return 0;
        }

        return Object.values(backupPreview.manifest.counts).reduce((sum, count) => sum + count, 0);
    }, [backupPreview]);

    const backupScenarioAssumptions = useMemo(() => {
        if (!backupPreview) {
            return undefined;
        }

        const setting = backupPreview.data.settings.find((item) => item.key === SCENARIO_ASSUMPTIONS_SETTING_KEY);
        return normalizeScenarioAssumptions(setting?.value as Partial<ScenarioAssumptions> | undefined);
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

        const parsed = parseBackupFile(importContent);
        await importLocalBackup(parsed);
        const restoredScenarioSetting = parsed.data.settings.find((item) => item.key === SCENARIO_ASSUMPTIONS_SETTING_KEY);
        setScenarioAssumptions(normalizeScenarioAssumptions(restoredScenarioSetting?.value as Partial<ScenarioAssumptions> | undefined));
        setMessage('백업을 복원했습니다. 설정 화면의 시나리오 가정값도 복원된 백업 기준으로 갱신했습니다.');
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
        setScenarioAssumptions(DEFAULT_SCENARIO_ASSUMPTIONS);
        setBackupPreview(null);
        setImportContent('');
        setMessage('로컬 데이터를 삭제하고 시작용 예시 데이터를 다시 생성했습니다. 시나리오 가정값은 기본값으로 돌아갔습니다.');
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="로컬 데이터 보호"
                title="설정 및 데이터 안전"
                description="CBAM Local은 기업 데이터를 이 브라우저의 로컬 DB에 저장합니다. 장기 보관, PC 교체, 검증 대응을 위해 .cbam 백업을 사용하세요."
            />

            {message && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    {message}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <StatCard label="서버 전송" value="없음" helper="PWA 버전은 로컬 처리" icon={ShieldCheck} tone="success" />
                <StatCard label="로컬 저장" value="IndexedDB" helper="브라우저 데이터 삭제에 주의" icon={Database} tone="info" />
                <StatCard label="마지막 백업" value={formatDateTime(lastBackupAt)} helper="중요 변경 후 백업 권장" icon={AlertTriangle} tone="warning" />
            </section>

            <ScenarioAssumptionSummary
                assumptions={scenarioAssumptions}
                description="이 가정값은 로컬 설정에 저장되며 .cbam 백업 파일에 함께 포함됩니다."
            />

            <SectionCard>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">.cbam 백업 내보내기</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            사업장, 제품, 보고기간, 생산공정, 전구물질, 설정과 향후 산정 데이터를 하나의 백업 파일로 내려받습니다.
                        </p>
                    </div>
                    <Button
                        onClick={handleExport}
                    >
                        <Download className="mr-2 h-4 w-4" />
                        백업 내보내기
                    </Button>
                </div>
            </SectionCard>

            <SectionCard>
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">.cbam 백업 가져오기</h2>
                        <p className="mt-1 text-sm text-slate-600">
                            백업 파일을 불러와 내용을 확인한 뒤 이 브라우저에 복원합니다. 복원 전 백업 파일에 포함된 시나리오 가정값도 미리 볼 수 있습니다.
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
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <FileUp className="mr-2 h-4 w-4" />
                            백업 선택
                        </Button>
                        <Button
                            type="button"
                            onClick={handleImport}
                            disabled={!backupPreview}
                        >
                            복원
                        </Button>
                    </div>
                </div>

                {backupPreview && (
                    <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <h3 className="text-sm font-semibold text-gray-900">백업 미리보기</h3>
                        <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
                            <div>
                                <dt className="text-gray-500">앱</dt>
                                <dd className="font-medium text-gray-900">
                                    {backupPreview.manifest.app_name} {backupPreview.manifest.app_version}
                                </dd>
                            </div>
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
                                <div key={store} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                                    <div className="text-gray-500">{storeLabels[store] ?? store}</div>
                                    <div className="font-semibold text-gray-900">{count}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4">
                            <ScenarioAssumptionSummary
                                assumptions={backupScenarioAssumptions}
                                description="이 백업 파일에 포함된 시나리오 가정값입니다. 복원하면 현재 로컬 설정이 이 값으로 교체됩니다."
                                mode="panel"
                            />
                        </div>
                    </div>
                )}
            </SectionCard>

            <SectionCard className="border-red-200">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-red-900">로컬 데이터 삭제</h2>
                        <p className="mt-1 text-sm text-red-700">
                            이 브라우저의 모든 CBAM Local 데이터를 삭제합니다. 보관이 필요하면 먼저 백업을 내보내세요.
                        </p>
                    </div>
                    <Button
                        type="button"
                        variant="danger"
                        onClick={handleClearData}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        데이터 삭제
                    </Button>
                </div>
            </SectionCard>
        </div>
    );
}
