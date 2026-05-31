'use client';

import { ScenarioAssumptionSummary } from '@/components/ScenarioAssumptionSummary';
import { Button, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import {
    CbamBackupFile,
    CBAM_LAST_BACKUP_AT_KEY,
    clearLocalData,
    exportLocalBackup,
    getBackupCompatibilityMessage,
    getLocalSetting,
    importLocalBackup,
    parseBackupFile,
    seedLocalData,
    setLocalSetting,
} from '@/lib/local-db';
import {
    DEFAULT_SCENARIO_ASSUMPTIONS,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
import { AlertTriangle, Database, Download, FileUp, KeyRound, ShieldCheck, Trash2 } from 'lucide-react';
import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react';

const FREE_LICENSE_SETTING_KEY = 'license:free-registration';

type FreeLicenseStatus = 'UNREGISTERED' | 'FREE_ACTIVE' | 'OFFLINE_ALLOWED';

interface FreeLicenseRegistration {
    email: string;
    company_name: string;
    contact_name: string;
    license_key: string;
    status: FreeLicenseStatus;
    last_checked_at?: string;
}

function formatDateTime(value?: string) {
    if (!value) {
        return '아직 기록 없음';
    }

    return new Intl.DateTimeFormat('ko-KR', {
        dateStyle: 'medium',
        timeStyle: 'short',
    }).format(new Date(value));
}

function createBackupFilename() {
    const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    return `cbam-local-backup-${stamp}.cbam`;
}

function getLicenseStatus(registration?: FreeLicenseRegistration): { label: string; helper: string; tone: 'success' | 'warning' | 'pending' } {
    if (!registration?.email || !registration.company_name || !registration.license_key) {
        return {
            label: '미등록',
            helper: '무료 라이선스 서버 연동 전 준비 상태입니다.',
            tone: 'warning',
        };
    }

    return {
        label: registration.status === 'OFFLINE_ALLOWED' ? '오프라인 사용 가능' : '무료 등록',
        helper: registration.last_checked_at ? `마지막 확인 ${formatDateTime(registration.last_checked_at)}` : '로컬 mock 등록 상태입니다.',
        tone: registration.status === 'OFFLINE_ALLOWED' ? 'pending' : 'success',
    };
}

const storeLabels: Record<string, string> = {
    installations: '사업장',
    products: '품목',
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
    const [importContent, setImportContent] = useState('');
    const [message, setMessage] = useState('');
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
    const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumptions>();
    const [licenseRegistration, setLicenseRegistration] = useState<FreeLicenseRegistration>({
        email: '',
        company_name: '',
        contact_name: '',
        license_key: '',
        status: 'UNREGISTERED',
    });

    useEffect(() => {
        setLastBackupAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY) ?? undefined);
        getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY)
            .then((savedAssumptions) => setScenarioAssumptions(normalizeScenarioAssumptions(savedAssumptions)))
            .catch(() => setScenarioAssumptions(normalizeScenarioAssumptions(undefined)));
        getLocalSetting<FreeLicenseRegistration>(FREE_LICENSE_SETTING_KEY)
            .then((savedLicense) => {
                if (savedLicense) {
                    setLicenseRegistration(savedLicense);
                }
            })
            .catch(() => undefined);
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

    const backupCompatibilityMessage = useMemo(() => {
        if (!backupPreview) {
            return '';
        }

        return getBackupCompatibilityMessage(backupPreview.manifest);
    }, [backupPreview]);

    const licenseStatus = useMemo(() => getLicenseStatus(licenseRegistration), [licenseRegistration]);

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

        window.localStorage.setItem(CBAM_LAST_BACKUP_AT_KEY, backup.manifest.exported_at);
        setLastBackupAt(backup.manifest.exported_at);
        setMessage('백업 파일을 내보냈습니다. 회사의 안전한 폴더에 보관하세요.');
    }

    async function handleLicenseSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const nextRegistration: FreeLicenseRegistration = {
            ...licenseRegistration,
            status: licenseRegistration.email && licenseRegistration.company_name && licenseRegistration.license_key
                ? 'FREE_ACTIVE'
                : 'UNREGISTERED',
            last_checked_at: new Date().toISOString(),
        };

        await setLocalSetting(FREE_LICENSE_SETTING_KEY, nextRegistration);
        setLicenseRegistration(nextRegistration);
        setMessage('무료 라이선스 정보를 로컬 설정에 저장했습니다. 현재 단계에서는 서버 검증을 수행하지 않습니다.');
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
        const restoredLicenseSetting = parsed.data.settings.find((item) => item.key === FREE_LICENSE_SETTING_KEY);
        setScenarioAssumptions(normalizeScenarioAssumptions(restoredScenarioSetting?.value as Partial<ScenarioAssumptions> | undefined));
        if (restoredLicenseSetting?.value) {
            setLicenseRegistration(restoredLicenseSetting.value as FreeLicenseRegistration);
        }
        setMessage('백업을 복원했습니다. 시나리오 가정값과 무료 라이선스 로컬 설정도 백업 기준으로 갱신했습니다.');
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
        setLicenseRegistration({
            email: '',
            company_name: '',
            contact_name: '',
            license_key: '',
            status: 'UNREGISTERED',
        });
        setBackupPreview(null);
        setImportContent('');
        setMessage('로컬 데이터를 삭제하고 시작용 예시 데이터를 다시 생성했습니다. 시나리오 가정값과 라이선스 정보는 기본 상태로 돌아갔습니다.');
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

            <SectionCard>
                <div className="flex gap-3 text-sm leading-6 text-slate-700">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
                    <div>
                        <h2 className="font-semibold text-slate-950">사용 전 확인</h2>
                        <p className="mt-1">
                            이 앱은 CBAM 산정과 제출 준비를 돕는 로컬 도구입니다. 법률 자문, 공식 검증, 최종 제출 책임을 대체하지 않습니다.
                            제출 전에는 회사 내부 검토와 필요한 경우 전문기관 검증을 함께 진행하세요.
                        </p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard
                title="무료 라이선스"
                description="무료 라이선스는 배포 관리, 공지, 업데이트 안내를 위한 준비 기능입니다. CBAM 산정 데이터, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다."
                actions={<StatusBadge tone={licenseStatus.tone}>{licenseStatus.label}</StatusBadge>}
            >
                <form onSubmit={handleLicenseSubmit} className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>이메일</span>
                            <input
                                value={licenseRegistration.email}
                                onChange={(event) => setLicenseRegistration((current) => ({ ...current, email: event.target.value }))}
                                type="email"
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                placeholder="name@company.com"
                            />
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>회사명</span>
                            <input
                                value={licenseRegistration.company_name}
                                onChange={(event) => setLicenseRegistration((current) => ({ ...current, company_name: event.target.value }))}
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                placeholder="회사명"
                            />
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>담당자명</span>
                            <input
                                value={licenseRegistration.contact_name}
                                onChange={(event) => setLicenseRegistration((current) => ({ ...current, contact_name: event.target.value }))}
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                placeholder="담당자명"
                            />
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>라이선스 키</span>
                            <input
                                value={licenseRegistration.license_key}
                                onChange={(event) => setLicenseRegistration((current) => ({ ...current, license_key: event.target.value }))}
                                className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                placeholder="FREE-..."
                            />
                        </label>
                    </div>
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm leading-6 text-teal-900 md:flex-row md:items-center md:justify-between">
                        <div className="flex gap-3">
                            <KeyRound className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                            <p>
                                {licenseStatus.helper} 실제 서버 검증, 사용자 목록, 공지/강제 업데이트 관리는 관리자 콘솔 단계에서 구현합니다.
                            </p>
                        </div>
                        <Button type="submit" className="md:flex-none">로컬 저장</Button>
                    </div>
                </form>
            </SectionCard>

            <ScenarioAssumptionSummary
                assumptions={scenarioAssumptions}
                description="이 가정값은 로컬 설정에 저장되며 .cbam 백업 파일에 함께 포함됩니다."
            />

            <SectionCard
                title=".cbam 백업 내보내기"
                description="사업장, 품목, 보고기간, 생산공정, 배출원 자료, 전구물질, 시나리오 가정값, 무료 라이선스 로컬 설정을 하나의 백업 파일로 내려받습니다."
                actions={(
                    <Button onClick={handleExport}>
                        <Download className="mr-2 h-4 w-4" />
                        백업 내보내기
                    </Button>
                )}
            >
                <p className="text-sm leading-6 text-slate-600">
                    백업 파일에는 업무 입력자료가 포함될 수 있으므로 회사 보안정책에 맞는 위치에 보관하세요.
                </p>
            </SectionCard>

            <SectionCard
                title=".cbam 백업 가져오기"
                description="백업 파일을 불러와 내용을 확인한 뒤 현재 브라우저에 복원합니다. 복원하면 현재 로컬 데이터가 백업 내용으로 교체됩니다."
                actions={(
                    <div className="flex gap-3">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".cbam,application/json"
                            className="hidden"
                            onChange={handleFileSelected}
                        />
                        <Button type="button" variant="secondary" onClick={() => fileInputRef.current?.click()}>
                            <FileUp className="mr-2 h-4 w-4" />
                            백업 선택
                        </Button>
                        <Button type="button" onClick={handleImport} disabled={!backupPreview}>
                            복원
                        </Button>
                    </div>
                )}
            >
                {backupPreview ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
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
                                <dd className="font-medium text-gray-900">v{backupPreview.manifest.format_version}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">데이터 건수</dt>
                                <dd className="font-medium text-gray-900">{totalPreviewItems}</dd>
                            </div>
                        </dl>
                        {backupCompatibilityMessage && (
                            <div className="mt-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-800">
                                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                                <p>{backupCompatibilityMessage}</p>
                            </div>
                        )}
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
                ) : (
                    <p className="text-sm leading-6 text-slate-600">
                        복원할 백업 파일을 선택하면 포함된 데이터 건수와 시나리오 가정값을 먼저 확인할 수 있습니다.
                    </p>
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
                    <Button type="button" variant="danger" onClick={handleClearData}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        데이터 삭제
                    </Button>
                </div>
            </SectionCard>
        </div>
    );
}
