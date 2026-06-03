'use client';

import { Button, PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import {
    canUseCoreApp,
    checkFreeLicenseStatus,
    createOfflineAllowedRegistration,
    FREE_LICENSE_SETTING_KEY,
    FREE_LICENSE_TERMS_VERSION,
    isLicenseExpired,
    registerFreeLicense,
    requestFreeLicenseRecoveryCode,
    type FreeLicenseRegistration,
    verifyFreeLicenseRecoveryCode,
} from '@/lib/free-license-client';
import { getLocalSetting, setLocalSetting } from '@/lib/local-db';
import { ArrowRight, FileArchive, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';

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
        expires_at: null,
    };
}

function getStatusLabel(registration: FreeLicenseRegistration) {
    if (!registration.license_key) {
        return { label: '등록 전', tone: 'warning' as const };
    }

    if (registration.status === 'BLOCKED') {
        return { label: '사용 제한', tone: 'danger' as const };
    }

    if (isLicenseExpired(registration.expires_at)) {
        return { label: '사용기한 만료', tone: 'danger' as const };
    }

    if (registration.status === 'UNREGISTERED') {
        return { label: '승인 대기', tone: 'pending' as const };
    }

    if (registration.status === 'RECHECK_REQUIRED') {
        return { label: '재확인 필요', tone: 'warning' as const };
    }

    if (registration.status === 'OFFLINE_ALLOWED') {
        return { label: '오프라인 허용', tone: 'pending' as const };
    }

    return { label: '무료 활성', tone: 'success' as const };
}

export default function LicensePage() {
    const [registration, setRegistration] = useState<FreeLicenseRegistration>(() => emptyLicenseRegistration());
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [recoveryEmail, setRecoveryEmail] = useState('');
    const [recoveryCode, setRecoveryCode] = useState('');
    const [isRecovering, setIsRecovering] = useState(false);
    const status = useMemo(() => getStatusLabel(registration), [registration]);
    const canEnterApp = canUseCoreApp(registration.status, registration.expires_at) && Boolean(registration.license_key);

    useEffect(() => {
        getLocalSetting<FreeLicenseRegistration>(FREE_LICENSE_SETTING_KEY)
            .then((saved) => {
                if (saved) {
                    setRegistration({ ...emptyLicenseRegistration(), ...saved });
                }
            })
            .catch(() => undefined);
    }, []);

    async function saveRegistration(nextRegistration: FreeLicenseRegistration) {
        await setLocalSetting(FREE_LICENSE_SETTING_KEY, nextRegistration);
        setRegistration(nextRegistration);
    }

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsSubmitting(true);

        const input = {
            email: registration.email,
            company_name: registration.company_name,
            contact_name: registration.contact_name,
            contact_phone: registration.contact_phone,
            country: registration.country,
            industry: registration.industry,
        };

        if (!input.email || !input.company_name || !input.contact_name || !input.contact_phone) {
            setMessage('이메일, 회사명, 담당자명, 연락처를 모두 입력하세요.');
            setIsSubmitting(false);
            return;
        }

        try {
            const nextRegistration = await registerFreeLicense(input);
            await saveRegistration(nextRegistration);
            setMessage(nextRegistration.message ?? '무료 사용 등록이 접수되었습니다. 관리자가 승인하면 사용할 수 있습니다.');
        } catch (error) {
            const offlineRegistration = createOfflineAllowedRegistration(input, registration);
            await saveRegistration(offlineRegistration);
            setMessage(`${error instanceof Error ? error.message : '무료 사용 등록에 실패했습니다.'} 기존 .cbam 백업/복원은 계속 사용할 수 있습니다.`);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleStatusCheck() {
        setIsSubmitting(true);
        try {
            const checked = await checkFreeLicenseStatus(registration);
            await saveRegistration(checked);
            setMessage('무료 라이선스 상태를 확인했습니다.');
        } catch (error) {
            setMessage(`${error instanceof Error ? error.message : '라이선스 상태 확인에 실패했습니다.'} 기존 .cbam 백업/복원은 계속 사용할 수 있습니다.`);
        } finally {
            setIsSubmitting(false);
        }
    }

    async function handleRequestRecoveryCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsRecovering(true);

        if (!recoveryEmail.trim()) {
            setMessage('복구할 이메일을 입력하세요.');
            setIsRecovering(false);
            return;
        }

        try {
            const responseMessage = await requestFreeLicenseRecoveryCode(recoveryEmail);
            setMessage(responseMessage);
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '인증코드 발송에 실패했습니다.');
        } finally {
            setIsRecovering(false);
        }
    }

    async function handleVerifyRecoveryCode(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setIsRecovering(true);

        if (!recoveryEmail.trim() || !recoveryCode.trim()) {
            setMessage('이메일과 6자리 인증코드를 입력하세요.');
            setIsRecovering(false);
            return;
        }

        try {
            const recoveredRegistration = await verifyFreeLicenseRecoveryCode({
                email: recoveryEmail,
                code: recoveryCode,
            });
            await saveRegistration(recoveredRegistration);
            setMessage(recoveredRegistration.message ?? '무료 라이선스를 복구했습니다.');
            setRecoveryCode('');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : '인증코드 확인에 실패했습니다.');
        } finally {
            setIsRecovering(false);
        }
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="무료 사용 등록"
                title="CBAM Local 시작하기"
                description="무료 배포 관리와 업데이트 안내를 위해 최소한의 사용자 정보를 등록합니다. 생산량, 배출량, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다."
            />

            {message && (
                <div className="rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm leading-6 text-teal-900">
                    {message}
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
                <SectionCard
                    title="무료 사용 등록"
                    description="일반 회원가입처럼 먼저 등록합니다. 신규 등록은 관리자 승인 후 사업장, 품목, 산정, Export 기능을 사용할 수 있습니다."
                    actions={<StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                >
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>이메일 *</span>
                                <input
                                    type="email"
                                    required
                                    value={registration.email}
                                    onChange={(event) => setRegistration((current) => ({ ...current, email: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="name@company.com"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>회사명 *</span>
                                <input
                                    required
                                    value={registration.company_name}
                                    onChange={(event) => setRegistration((current) => ({ ...current, company_name: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="회사명"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>담당자명 *</span>
                                <input
                                    required
                                    value={registration.contact_name}
                                    onChange={(event) => setRegistration((current) => ({ ...current, contact_name: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="담당자명"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>연락처 *</span>
                                <input
                                    required
                                    value={registration.contact_phone}
                                    onChange={(event) => setRegistration((current) => ({ ...current, contact_phone: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="010-0000-0000"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>국가</span>
                                <input
                                    value={registration.country}
                                    onChange={(event) => setRegistration((current) => ({ ...current, country: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="South Korea"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>업종</span>
                                <input
                                    value={registration.industry}
                                    onChange={(event) => setRegistration((current) => ({ ...current, industry: event.target.value }))}
                                    className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                    placeholder="Iron and steel"
                                />
                            </label>
                        </div>

                        {registration.license_key && (
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700">
                                <p className="font-semibold text-slate-950">라이선스 키</p>
                                <p className="mt-1 break-all">{registration.license_key}</p>
                                <p className="mt-2 text-slate-600">
                                    사용기한: {registration.expires_at ? new Date(registration.expires_at).toLocaleDateString('ko-KR') : '관리자 승인 시 설정'}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                            <Button type="submit" disabled={isSubmitting}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {isSubmitting ? '처리 중' : '무료 사용 등록'}
                            </Button>
                            <Button type="button" variant="secondary" onClick={() => void handleStatusCheck()} disabled={isSubmitting || !registration.license_key}>
                                상태 확인
                            </Button>
                            {canEnterApp && (
                                <Link href="/">
                                    <Button type="button" variant="secondary">
                                        대시보드로 이동
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </form>
                </SectionCard>

                <div className="space-y-4">
                    <SectionCard title="기존 등록자 복구" description="다른 PC, 휴대폰, 브라우저 재설치 후에는 같은 이메일로 인증코드를 받아 승인 상태를 다시 불러올 수 있습니다.">
                        <div className="space-y-3">
                            <form onSubmit={handleRequestRecoveryCode} className="space-y-3">
                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>등록했던 이메일</span>
                                    <input
                                        type="email"
                                        value={recoveryEmail}
                                        onChange={(event) => setRecoveryEmail(event.target.value)}
                                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                        placeholder="name@company.com"
                                    />
                                </label>
                                <Button type="submit" variant="secondary" className="w-full" disabled={isRecovering}>
                                    인증코드 받기
                                </Button>
                            </form>

                            <form onSubmit={handleVerifyRecoveryCode} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>6자리 인증코드</span>
                                    <input
                                        inputMode="numeric"
                                        pattern="[0-9]{6}"
                                        maxLength={6}
                                        value={recoveryCode}
                                        onChange={(event) => setRecoveryCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                                        className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm tracking-[0.3em] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
                                        placeholder="000000"
                                    />
                                </label>
                                <Button type="submit" className="w-full" disabled={isRecovering}>
                                    인증하고 라이선스 불러오기
                                </Button>
                            </form>
                        </div>
                    </SectionCard>

                    <SectionCard title="등록 전에 알아둘 점" description="무료 사용 등록은 SaaS 데이터 수집이 아니라 배포 관리 장치입니다.">
                        <div className="space-y-3 text-sm leading-6 text-slate-700">
                            <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                                <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                                <p>서버에는 이메일, 회사명, 담당자명, 연락처, 국가, 업종, 앱 버전, 라이선스 상태만 저장합니다.</p>
                            </div>
                            <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                                <FileArchive className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                                <p>생산량, 배출량, 품목/CN 산정값, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다.</p>
                            </div>
                        </div>
                    </SectionCard>

                    <SectionCard title="등록 전에도 가능한 작업" description="기존 데이터 회수 경로는 항상 열어둡니다.">
                        <div className="flex flex-wrap gap-2">
                            <Link href="/settings">
                                <Button type="button" variant="secondary">.cbam 백업/복원</Button>
                            </Link>
                            <Link href="/terms">
                                <Button type="button" variant="secondary">약관 보기</Button>
                            </Link>
                            <Link href="/privacy">
                                <Button type="button" variant="secondary">개인정보 안내</Button>
                            </Link>
                        </div>
                    </SectionCard>
                </div>
            </div>
        </div>
    );
}
