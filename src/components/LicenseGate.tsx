'use client';

import { Button, SectionCard, StatusBadge } from '@/components/ui';
import {
    canUseCoreApp,
    checkFreeLicenseStatus,
    FREE_LICENSE_SETTING_KEY,
    isLicenseBlocked,
    isLicenseExpired,
    isLicenseGateOpenRoute,
    type FreeLicenseRegistration,
} from '@/lib/free-license-client';
import { getLocalSetting, setLocalSetting } from '@/lib/local-db';
import { AlertTriangle, FileArchive, KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';

type GateState =
    | { status: 'loading' }
    | { status: 'open' }
    | { status: 'locked'; reason: 'unregistered' | 'pending' | 'expired' | 'blocked'; registration?: FreeLicenseRegistration };

function getGateState(pathname: string, registration?: FreeLicenseRegistration): GateState {
    if (isLicenseGateOpenRoute(pathname)) {
        return { status: 'open' };
    }

    if (isLicenseBlocked(registration?.status)) {
        return { status: 'locked', reason: 'blocked', registration };
    }

    if (isLicenseExpired(registration?.expires_at)) {
        return { status: 'locked', reason: 'expired', registration };
    }

    if (canUseCoreApp(registration?.status, registration?.expires_at) && registration?.license_key) {
        return { status: 'open' };
    }

    if (registration?.license_key && registration.status === 'UNREGISTERED') {
        return { status: 'locked', reason: 'pending', registration };
    }

    return { status: 'locked', reason: 'unregistered', registration };
}

function shouldRefreshLicenseStatus(registration?: FreeLicenseRegistration) {
    if (!registration?.license_key) {
        return false;
    }

    if (registration.status === 'UNREGISTERED' || registration.status === 'BLOCKED') {
        return true;
    }

    if (isLicenseExpired(registration.expires_at)) {
        return true;
    }

    if (!registration.next_check_after) {
        return true;
    }

    const nextCheckAt = new Date(registration.next_check_after);
    return Number.isNaN(nextCheckAt.getTime()) || nextCheckAt.getTime() <= Date.now();
}

function LockedLicensePanel({ reason, registration }: { reason: 'unregistered' | 'pending' | 'expired' | 'blocked'; registration?: FreeLicenseRegistration }) {
    const isBlocked = reason === 'blocked';
    const isExpired = reason === 'expired';
    const isPending = reason === 'pending';
    const badgeLabel = isBlocked ? '사용 제한' : isExpired ? '사용기한 만료' : isPending ? '승인 대기' : '무료 라이선스 필요';
    const title = isBlocked
        ? '관리자 확인이 필요한 라이선스 상태입니다.'
        : isExpired
            ? '무료 라이선스 사용기한이 만료되었습니다.'
            : isPending
                ? '무료 사용 등록이 접수되었습니다. 관리자 승인 후 사용할 수 있습니다.'
                : '무료 사용 등록 후 관리자 승인을 받으면 업무 기능을 사용할 수 있습니다.';
    const description = isBlocked
        ? '현재 라이선스가 차단 상태입니다. 사업장, 품목, 산정, Export 같은 핵심 기능은 잠시 제한됩니다.'
        : isExpired
            ? '관리자에게 사용기한 연장을 요청하세요. 기존 .cbam 백업/복원 경로는 계속 열려 있습니다.'
            : isPending
                ? '등록 정보는 관리자 콘솔에 표시됩니다. 승인되면 이 화면의 상태 확인 버튼으로 사용 가능 상태를 갱신하세요.'
                : '무료 배포 관리를 위해 이메일, 회사명, 담당자명, 연락처만 등록합니다. 등록 전에는 사업장, 품목, 산정, Export 기능을 사용할 수 없습니다.';

    return (
        <div className="mx-auto max-w-4xl space-y-5">
            <SectionCard className={isBlocked ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}>
                <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
                    <div className="flex gap-3">
                        <div className={`flex h-11 w-11 flex-none items-center justify-center rounded-2xl ${isBlocked ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                            {isBlocked ? <AlertTriangle className="h-5 w-5" /> : <KeyRound className="h-5 w-5" />}
                        </div>
                        <div>
                            <StatusBadge tone={isBlocked ? 'danger' : 'warning'}>
                                {badgeLabel}
                            </StatusBadge>
                            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">
                                {title}
                            </h2>
                            <p className="mt-3 text-sm leading-6 text-slate-700">
                                {description}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <Link href="/license">
                            <Button>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {isBlocked || isPending || isExpired ? '상태 확인하기' : '무료 사용 등록'}
                            </Button>
                        </Link>
                        <Link href="/guide">
                            <Button variant="secondary">시작 가이드</Button>
                        </Link>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <SectionCard title="항상 가능한 작업" description="라이선스 상태와 관계없이 데이터 회수 경로는 열어둡니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-700">
                        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <FileArchive className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                            <div>
                                <h3 className="font-semibold text-slate-950">.cbam 백업/복원</h3>
                                <p className="mt-1">기존 로컬 데이터는 설정 화면에서 백업하거나 복원할 수 있습니다.</p>
                            </div>
                        </div>
                        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                            <div>
                                <h3 className="font-semibold text-slate-950">약관과 개인정보 안내</h3>
                                <p className="mt-1">무료 라이선스 등록 전에 데이터 경계와 책임 안내를 확인할 수 있습니다.</p>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="서버로 보내지 않는 정보" description="라이선스 확인은 배포 관리 목적의 최소 정보만 사용합니다.">
                    <ul className="space-y-2 text-sm leading-6 text-slate-700">
                        <li>생산량, 배출량, 품목/CN 산정값은 전송하지 않습니다.</li>
                        <li>EU 템플릿, Export 파일, .cbam 백업 파일은 전송하지 않습니다.</li>
                        <li>라이선스 상태가 차단되어도 기존 데이터 백업 경로는 유지합니다.</li>
                        {registration?.message && <li className="font-medium text-slate-950">최근 메시지: {registration.message}</li>}
                    </ul>
                </SectionCard>
            </div>
        </div>
    );
}

function EnforcedLicenseGate({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const [gateState, setGateState] = useState<GateState>({ status: 'loading' });

    useEffect(() => {
        let cancelled = false;

        getLocalSetting<FreeLicenseRegistration>(FREE_LICENSE_SETTING_KEY)
            .then(async (registration) => {
                let nextRegistration = registration;

                if (registration && shouldRefreshLicenseStatus(registration)) {
                    try {
                        nextRegistration = await checkFreeLicenseStatus(registration);
                        await setLocalSetting(FREE_LICENSE_SETTING_KEY, nextRegistration);
                    } catch {
                        nextRegistration = registration;
                    }
                }

                if (!cancelled) {
                    setGateState(getGateState(pathname, nextRegistration));
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setGateState(getGateState(pathname));
                }
            });

        return () => {
            cancelled = true;
        };
    }, [pathname]);

    if (gateState.status === 'loading') {
        return (
            <SectionCard>
                <div className="text-sm font-medium text-slate-600">무료 라이선스 상태를 확인하고 있습니다.</div>
            </SectionCard>
        );
    }

    if (gateState.status === 'locked') {
        return <LockedLicensePanel reason={gateState.reason} registration={gateState.registration} />;
    }

    return children;
}

export default function LicenseGate({
    children,
    enforce = false,
}: {
    children: ReactNode;
    enforce?: boolean;
}) {
    if (!enforce) {
        return children;
    }

    return <EnforcedLicenseGate>{children}</EnforcedLicenseGate>;
}
