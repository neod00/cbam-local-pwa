'use client';

import { ContactDialog } from '@/components/ContactDialog';
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
    setLocalSetting,
} from '@/lib/local-db';
import {
    FREE_LICENSE_SETTING_KEY,
    FREE_LICENSE_TERMS_VERSION,
    checkFreeLicenseStatus,
    isLicenseExpired,
    type FreeLicenseRegistration,
} from '@/lib/free-license-client';
import {
    DEFAULT_SCENARIO_ASSUMPTIONS,
    normalizeScenarioAssumptions,
    SCENARIO_ASSUMPTIONS_SETTING_KEY,
    type ScenarioAssumptions,
} from '@/lib/scenario-calculation';
import { evaluateUpdateStatus, fetchUpdateManifest, type UpdateStatus } from '@/lib/update-policy';
import { AlertTriangle, Database, Download, ExternalLink, FileUp, Mail, RefreshCw, ShieldCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';

function emptyLicenseRegistration(): FreeLicenseRegistration {
    return {
        email: '',
        company_name: '',
        contact_name: '',
        contact_phone: '',
        country: 'South Korea',
        industry: '',
        license_key: '',
        status: 'UNREGISTERED',
        accepted_terms_version: FREE_LICENSE_TERMS_VERSION,
    };
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

function getLicenseStatus(registration?: FreeLicenseRegistration): { label: string; helper: string; tone: 'success' | 'warning' | 'pending' | 'danger' } {
    if (!registration?.email || !registration.company_name || !registration.license_key) {
        return {
            label: '미등록',
            helper: '이메일, 회사명, 담당자명, 연락처를 입력해 무료 라이선스를 등록하세요.',
            tone: 'warning',
        };
    }

    if (registration.status === 'BLOCKED') {
        return {
            label: '차단',
            helper: '관리자 확인이 필요한 상태입니다. 기존 .cbam 백업은 보관하세요.',
            tone: 'danger',
        };
    }

    if (isLicenseExpired(registration.expires_at)) {
        return {
            label: '사용기한 만료',
            helper: '관리자에게 사용기한 연장을 요청하세요. 기존 .cbam 백업은 계속 사용할 수 있습니다.',
            tone: 'danger',
        };
    }

    if (registration.status === 'UNREGISTERED') {
        return {
            label: '승인 대기',
            helper: '무료 사용 등록이 접수되었습니다. 관리자 승인 후 사용할 수 있습니다.',
            tone: 'pending',
        };
    }

    if (registration.status === 'RECHECK_REQUIRED') {
        return {
            label: '재확인 필요',
            helper: registration.last_checked_at ? `마지막 확인 ${formatDateTime(registration.last_checked_at)}` : '라이선스 상태 재확인이 필요합니다.',
            tone: 'warning',
        };
    }

    if (registration.status === 'OFFLINE_ALLOWED') {
        return {
            label: '오프라인 허용',
            helper: registration.message ?? '서버 확인에 실패했지만 기존 로컬 사용과 .cbam 백업은 계속 가능합니다.',
            tone: 'pending',
        };
    }

    return {
        label: '무료 활성',
        helper: registration.last_checked_at ? `마지막 확인 ${formatDateTime(registration.last_checked_at)}` : '무료 라이선스가 등록되었습니다.',
        tone: 'success',
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
    const [isCheckingLicense, setIsCheckingLicense] = useState(false);
    const [lastBackupAt, setLastBackupAt] = useState<string | undefined>();
    const [scenarioAssumptions, setScenarioAssumptions] = useState<ScenarioAssumptions>();
    const [updateStatus, setUpdateStatus] = useState<UpdateStatus>(() => evaluateUpdateStatus());
    const [licenseRegistration, setLicenseRegistration] = useState<FreeLicenseRegistration>(() => emptyLicenseRegistration());

    useEffect(() => {
        setLastBackupAt(window.localStorage.getItem(CBAM_LAST_BACKUP_AT_KEY) ?? undefined);
        getLocalSetting<ScenarioAssumptions>(SCENARIO_ASSUMPTIONS_SETTING_KEY)
            .then((savedAssumptions) => setScenarioAssumptions(normalizeScenarioAssumptions(savedAssumptions)))
            .catch(() => setScenarioAssumptions(normalizeScenarioAssumptions(undefined)));
        getLocalSetting<FreeLicenseRegistration>(FREE_LICENSE_SETTING_KEY)
            .then((savedLicense) => {
                if (savedLicense) {
                    setLicenseRegistration({ ...emptyLicenseRegistration(), ...savedLicense });
                }
            })
            .catch(() => undefined);
        fetchUpdateManifest()
            .then((manifest) => setUpdateStatus(evaluateUpdateStatus(manifest)))
            .catch(() => setUpdateStatus(evaluateUpdateStatus()));
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
    async function saveLicenseRegistration(nextRegistration: FreeLicenseRegistration) {
        await setLocalSetting(FREE_LICENSE_SETTING_KEY, nextRegistration);
        setLicenseRegistration(nextRegistration);
    }

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

    async function handleLicenseStatusCheck() {
        setIsCheckingLicense(true);
        try {
            const checked = await checkFreeLicenseStatus(licenseRegistration);
            await saveLicenseRegistration(checked);
            setMessage('무료 라이선스 상태를 확인했습니다.');
        } catch (error) {
            const nextRegistration: FreeLicenseRegistration = {
                ...licenseRegistration,
                status: licenseRegistration.license_key ? 'OFFLINE_ALLOWED' : 'UNREGISTERED',
                message: error instanceof Error ? error.message : '라이선스 상태 확인에 실패했습니다.',
            };
            await saveLicenseRegistration(nextRegistration);
            setMessage(`${nextRegistration.message} 기존 로컬 계산, Export 준비, .cbam 백업 기능은 계속 사용할 수 있습니다.`);
        } finally {
            setIsCheckingLicense(false);
        }
    }

    async function handleUpdateCheck() {
        const manifest = await fetchUpdateManifest().catch(() => undefined);
        const nextStatus = evaluateUpdateStatus(manifest);
        setUpdateStatus(nextStatus);
        setMessage(
            nextStatus.shouldShow
                ? `업데이트 상태를 확인했습니다. 현재 v${nextStatus.currentVersion}, 최신 v${nextStatus.latestVersion}입니다.`
                : `현재 v${nextStatus.currentVersion}은 계속 사용할 수 있는 버전입니다.`
        );
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

        const currentLicenseRegistration = licenseRegistration;
        const parsed = parseBackupFile(importContent);
        await importLocalBackup(parsed);
        const restoredScenarioSetting = parsed.data.settings.find((item) => item.key === SCENARIO_ASSUMPTIONS_SETTING_KEY);
        const restoredLicenseSetting = parsed.data.settings.find((item) => item.key === FREE_LICENSE_SETTING_KEY);
        setScenarioAssumptions(normalizeScenarioAssumptions(restoredScenarioSetting?.value as Partial<ScenarioAssumptions> | undefined));
        if (restoredLicenseSetting?.value) {
            setLicenseRegistration({ ...emptyLicenseRegistration(), ...restoredLicenseSetting.value as FreeLicenseRegistration });
        } else if (currentLicenseRegistration.license_key) {
            await setLocalSetting(FREE_LICENSE_SETTING_KEY, currentLicenseRegistration);
            setLicenseRegistration(currentLicenseRegistration);
        }
        setMessage(restoredLicenseSetting?.value
            ? '백업을 복원했습니다. 시나리오 가정값과 무료 라이선스 로컬 설정도 백업 기준으로 갱신했습니다.'
            : '백업을 복원했습니다. 백업 파일에 무료 라이선스 정보가 없어 현재 브라우저의 등록 상태는 유지했습니다.');
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
        setScenarioAssumptions(DEFAULT_SCENARIO_ASSUMPTIONS);
        setLicenseRegistration(emptyLicenseRegistration());
        setBackupPreview(null);
        setImportContent('');
        setMessage('로컬 데이터를 삭제했습니다. 이제 예시 데이터 없이 빈 상태에서 다시 시작합니다.');
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="로컬 데이터 보호"
                title="설정 및 데이터 안전"
                description="CBAM Local은 기업 데이터를 브라우저 로컬 DB에 저장합니다. 장기 보관, PC 교체, 검증 대응을 위해 .cbam 백업을 사용하세요."
            />

            {message && (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                    {message}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <StatCard label="서버 전송" value="없음" helper="CBAM 입력자료는 로컬 처리" icon={ShieldCheck} tone="success" />
                <StatCard label="로컬 저장" value="IndexedDB" helper="브라우저 데이터 삭제 주의" icon={Database} tone="info" />
                <StatCard label="마지막 백업" value={formatDateTime(lastBackupAt)} helper="중요 변경 후 백업 권장" icon={AlertTriangle} tone="warning" />
            </section>

            <SectionCard>
                <div className="flex flex-col gap-4 text-sm leading-6 text-slate-700 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-600" />
                        <div>
                            <h2 className="font-semibold text-slate-950">사용 전 확인</h2>
                            <p className="mt-1">
                                이 앱은 CBAM 산정과 신고 지원자료 준비를 돕는 로컬 도구입니다. 법률 자문, 공식 검증, 최종 신고 책임을 대체하지 않습니다.
                                전달 또는 신고 전에는 회사 내부 검토와 필요한 경우 전문기관 검증을 함께 진행하세요.
                            </p>
                        </div>
                    </div>
                    <Link
                        href="/terms"
                        className="inline-flex min-h-10 flex-none items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                    >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        약관/고지 보기
                    </Link>
                </div>
            </SectionCard>

            <SectionCard
                title="로컬 사용 안전 체크리스트"
                description="무료 PWA를 실제 업무에 쓰기 전에 데이터 보관 위치와 전달 전 확인 책임을 먼저 점검하세요."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                    {[
                        {
                            icon: ShieldCheck,
                            title: '서버 전송 없음',
                            body: 'CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 무료 PWA의 라이선스/업데이트 확인 과정에서 서버로 전송하지 않습니다.',
                        },
                        {
                            icon: Database,
                            title: '브라우저 로컬 저장',
                            body: '데이터는 IndexedDB에 저장됩니다. 브라우저 데이터 삭제, PC 교체, 보안 프로그램 정리 전에 반드시 백업하세요.',
                        },
                        {
                            icon: Download,
                            title: '중요 변경 후 .cbam 백업',
                            body: '사업장, 품목, 생산공정, 전구물질, 시나리오 가정값을 수정한 뒤에는 같은 시점의 .cbam 백업을 보관하세요.',
                        },
                        {
                            icon: AlertTriangle,
                            title: '전달 전 공식 확인',
                            body: '최신 EU 원본 템플릿을 사용하고, Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인하세요.',
                        },
                    ].map((item) => (
                        <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex gap-3">
                                <item.icon className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                                <div>
                                    <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>

            <SectionCard
                title="무료 라이선스"
                description="무료 사용 등록과 기존 등록 복구는 전용 화면에서 진행합니다. 이 화면에서는 현재 브라우저의 등록 상태와 업데이트 상태만 확인합니다."
                actions={<StatusBadge tone={licenseStatus.tone}>{licenseStatus.label}</StatusBadge>}
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold text-slate-500">등록 상태</p>
                            <div className="mt-2">
                                <StatusBadge tone={licenseStatus.tone}>{licenseStatus.label}</StatusBadge>
                            </div>
                            <p className="mt-3 text-sm leading-6 text-slate-600">{licenseStatus.helper}</p>
                            {licenseRegistration.expires_at && (
                                <p className="mt-2 text-xs font-medium text-slate-500">사용기한: {licenseRegistration.expires_at}</p>
                            )}
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <p className="text-xs font-semibold text-slate-500">업데이트 상태</p>
                            <p className="mt-2 text-sm font-semibold text-slate-950">
                                현재 v{updateStatus.currentVersion} / 최신 v{updateStatus.latestVersion}
                            </p>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                {updateStatus.shouldShow ? updateStatus.title : '현재 버전은 계속 사용할 수 있습니다.'}
                            </p>
                        </div>
                        <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                            <p className="text-xs font-semibold text-teal-800">데이터 경계</p>
                            <p className="mt-2 text-sm leading-6 text-teal-900">
                                무료 라이선스와 업데이트 확인에는 배포 관리 정보만 사용됩니다. 생산량, 배출량, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다.
                            </p>
                        </div>
                    </div>
                    {licenseRegistration.license_key && (
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                            <p className="font-semibold text-slate-950">라이선스 키</p>
                            <p className="mt-1 break-all">{licenseRegistration.license_key}</p>
                            {licenseRegistration.next_check_after && (
                                <p className="mt-2 text-slate-500">다음 확인 권장 시점: {formatDateTime(licenseRegistration.next_check_after)}</p>
                            )}
                        </div>
                    )}
                    <div className="flex flex-col gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm leading-6 text-teal-900 md:flex-row md:items-center md:justify-between">
                        <p>
                            신규 등록, 승인 대기 상태 확인, 다른 브라우저에서 기존 등록 복구는 무료 사용 등록 화면에서 진행하세요.
                        </p>
                        <div className="flex flex-wrap gap-2 md:flex-none">
                            <Button type="button" variant="secondary" onClick={() => void handleLicenseStatusCheck()} disabled={isCheckingLicense || !licenseRegistration.license_key}>
                                상태 확인
                            </Button>
                            <Link href="/license">
                                <Button type="button">
                                    무료 사용 등록/복구
                                </Button>
                            </Link>
                        </div>
                    </div>
                    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700 md:flex-row md:items-center md:justify-between">
                        <p>
                            업데이트 확인은 배포 정책과 공지만 확인합니다. CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 전송하지 않습니다.
                        </p>
                        <Button type="button" variant="secondary" onClick={() => void handleUpdateCheck()} className="md:flex-none">
                            <RefreshCw className="mr-2 h-4 w-4" />
                            업데이트 상태 확인
                        </Button>
                    </div>
                </div>
            </SectionCard>

            <ScenarioAssumptionSummary
                assumptions={scenarioAssumptions}
                description="이 가정값은 로컬 설정에 저장되며 .cbam 백업 파일에 함께 포함됩니다."
            />

            <SectionCard
                title="사용·도입 문의"
                description="앱 사용, CBAM 컨설팅 지원, 기업 내부 설치, 유료 도입, 사업 제휴가 필요하면 문의폼을 보내거나 회사 메일 시스템으로 직접 문의하세요."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                    <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                        <Mail className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
                        <div>
                            <p className="font-semibold text-slate-950">등록 정보를 다시 입력하지 않습니다</p>
                            <p className="mt-1">무료 라이선스 등록 때 입력한 이메일, 회사명, 담당자명, 연락처를 문의자 정보로 사용합니다.</p>
                        </div>
                    </div>
                    <ContactDialog
                        triggerLabel="사용·도입 문의"
                        inquiryType="사용 문의"
                        subject="[CBAM Local] 사용/도입/컨설팅 문의"
                        triggerIcon={<Mail className="mr-2 h-4 w-4" />}
                        buttonClassName="inline-flex min-h-11 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-teal-900/20 transition hover:bg-teal-800"
                    />
                </div>
            </SectionCard>

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
                                description="이 백업 파일에 포함된 시나리오 가정값입니다. 복원하면 현재 로컬 설정의 값으로 교체됩니다."
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
