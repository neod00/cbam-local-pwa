import { auth, signOut } from '@/auth';
import { ActionItemCard, Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { createAnnouncement, createTermsVersion, createUpdateManifest, updateLicenseUserStatus } from '@/lib/admin-actions';
import { ADMIN_ANNOUNCEMENT_SEVERITIES } from '@/lib/admin-announcement';
import { ADMIN_LICENSE_STATUSES } from '@/lib/admin-license-status';
import { ADMIN_UPDATE_POLICIES } from '@/lib/admin-update-policy';
import { isAllowedAdminEmail } from '@/lib/admin-auth';
import { getAdminConsoleData } from '@/lib/admin-console-data';
import {
    Bell,
    CheckCircle2,
    Clock3,
    Database,
    FileText,
    KeyRound,
    LogOut,
    Megaphone,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const statusTone: Record<string, 'success' | 'warning' | 'pending' | 'danger'> = {
    FREE_ACTIVE: 'success',
    RECHECK_REQUIRED: 'warning',
    OFFLINE_ALLOWED: 'pending',
    BLOCKED: 'danger',
    UNREGISTERED: 'pending',
};

const statusLabel: Record<string, string> = {
    FREE_ACTIVE: '무료 활성',
    RECHECK_REQUIRED: '재확인 필요',
    OFFLINE_ALLOWED: '오프라인 허용',
    BLOCKED: '차단',
    UNREGISTERED: '미등록',
};

const safetyChecks = [
    '관리자 콘솔은 사용자 등록, 무료 라이선스, 공지, 업데이트 정책만 관리합니다.',
    '생산량, 배출량, EU 템플릿, .cbam 백업 파일은 저장하거나 조회하지 않습니다.',
    '강제 업데이트가 필요해도 기존 .cbam 백업 경로는 막지 않습니다.',
    '라이선스 확인 실패 또는 오프라인 상태에서는 마지막 확인 결과를 기준으로 계속 사용할 수 있게 합니다.',
];

function updatePolicyLabel(policy: string) {
    const labels: Record<string, string> = {
        none: '업데이트 없음',
        optional: '선택 업데이트',
        recommended: '권장 업데이트',
        required: '강제 업데이트',
    };

    return labels[policy] ?? policy;
}

function LicenseStatusForm({ userId, currentStatus, disabled }: { userId: string; currentStatus: string; disabled: boolean }) {
    return (
        <form action={updateLicenseUserStatus} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <input type="hidden" name="user_id" value={userId} />
            <select
                name="license_status"
                defaultValue={currentStatus}
                disabled={disabled}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
            >
                {ADMIN_LICENSE_STATUSES.map((status) => (
                    <option key={status} value={status}>
                        {statusLabel[status] ?? status}
                    </option>
                ))}
            </select>
            <Button type="submit" variant="secondary" className="min-h-9 px-3 py-1.5" disabled={disabled}>
                저장
            </Button>
        </form>
    );
}

type AdminSearchParams = Record<string, string | string[] | undefined>;

function getSearchParamValue(params: AdminSearchParams, key: string) {
    const value = params[key];
    return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPage({ searchParams }: { searchParams?: Promise<AdminSearchParams> }) {
    const session = await auth();
    if (!isAllowedAdminEmail(session?.user?.email)) {
        redirect('/admin/login');
    }

    const resolvedSearchParams = searchParams ? await searchParams : {};
    const adminMessage = getSearchParamValue(resolvedSearchParams, 'admin_message');
    const adminMessageTone = getSearchParamValue(resolvedSearchParams, 'admin_message_tone');
    const data = await getAdminConsoleData();
    const isLive = data.source === 'live';

    const quickActions = [
        {
            title: '재확인 필요 사용자 처리',
            description: '장기간 라이선스 확인이 없는 사용자를 검토하고 안내 대상자를 정리합니다.',
            status: `${data.stats.recheckRequired}건`,
            tone: data.stats.recheckRequired > 0 ? 'warning' as const : 'success' as const,
        },
        {
            title: '업데이트 정책 확인',
            description: '강제 업데이트로 전환할 경우 .cbam 백업 안내 문구를 함께 확인하세요.',
            status: updatePolicyLabel(data.updatePolicy.updatePolicy),
            tone: data.updatePolicy.updatePolicy === 'required' ? 'warning' as const : 'pending' as const,
        },
        {
            title: '공지 게시 상태 점검',
            description: '게시 중인 공지의 대상 그룹과 종료일을 확인합니다.',
            status: `${data.announcements.length}건`,
            tone: data.announcements.length > 0 ? 'info' as const : 'pending' as const,
        },
    ];

    async function signOutAdmin() {
        'use server';
        await signOut({ redirectTo: '/admin/login' });
    }

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Operator Console"
                title="CBAM Local 관리자 콘솔"
                description="무료 PWA 배포, 라이선스, 공지, 업데이트 정책만 관리하는 운영자용 콘솔입니다. CBAM 산정 데이터 저장소가 아닙니다."
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={isLive ? 'success' : 'pending'}>{isLive ? 'Neon 연결됨' : '샘플 데이터'}</StatusBadge>
                        <StatusBadge tone="success">{session?.user?.email ?? '관리자 로그인'}</StatusBadge>
                        <form action={signOutAdmin}>
                            <Button type="submit" variant="secondary">
                                <LogOut className="mr-2 h-4 w-4" />
                                로그아웃
                            </Button>
                        </form>
                    </div>
                }
            />

            {adminMessage && (
                <div className={`rounded-2xl border p-4 text-sm leading-6 ${adminMessageTone === 'warning'
                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                    : 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    }`}>
                    {adminMessage}
                </div>
            )}

            <SectionCard className="border-teal-200 bg-teal-50">
                <div className="flex gap-3 text-sm leading-6 text-teal-950">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                    <div>
                        <h2 className="font-semibold text-teal-950">데이터 경계</h2>
                        <p className="mt-1">
                            무료 라이선스와 업데이트 확인에는 이메일, 회사명, 담당자명, 연락처, 앱 버전 같은 배포 관리 정보만 사용합니다.
                            생산량, 배출량, 전구물질, EU 템플릿, .cbam 백업 파일은 서버로 전송하지 않습니다.
                        </p>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="등록 사용자" value={data.stats.registeredUsers} helper="배포 관리용 연락처 기준" icon={Users} tone="info" />
                <StatCard label="활성 무료 라이선스" value={data.stats.activeFreeLicenses} helper="FREE_ACTIVE" icon={UserCheck} tone="success" />
                <StatCard label="재확인 필요" value={data.stats.recheckRequired} helper="장기 미확인 사용자" icon={Clock3} tone="warning" />
                <StatCard label="차단 상태" value={data.stats.blocked} helper="약관 위반 또는 운영 대응" icon={ShieldAlert} tone="danger" />
            </div>

            <SectionCard title="오늘 확인할 운영 작업" description="노트북과 휴대폰에서 빠르게 확인할 수 있는 관리자 우선 작업입니다.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {quickActions.map((item) => (
                        <ActionItemCard
                            key={item.title}
                            title={item.title}
                            description={item.description}
                            badge={<StatusBadge tone={item.tone}>{item.status}</StatusBadge>}
                            action={
                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" disabled>
                                    보기
                                </Button>
                            }
                        />
                    ))}
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.8fr)]">
                <SectionCard
                    id="licenses"
                    title="사용자/라이선스"
                    description="무료 배포 관리에 필요한 사용자 정보와 라이선스 상태만 확인합니다."
                    actions={
                        <StatusBadge tone={isLive ? 'success' : 'pending'}>
                            {isLive ? '상태 변경 가능' : 'Neon 연결 후 변경 가능'}
                        </StatusBadge>
                    }
                >
                    <div className="space-y-3 md:hidden">
                        {data.licenseUsers.map((user) => (
                            <div key={`${user.id}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <StatusBadge tone={statusTone[user.status] ?? 'pending'}>{statusLabel[user.status] ?? user.status}</StatusBadge>
                                        <h3 className="mt-3 break-words text-base font-semibold text-slate-950">{user.company}</h3>
                                        <p className="mt-1 break-words text-sm text-slate-600">{user.email}</p>
                                    </div>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    {[
                                        ['담당자', user.contact],
                                        ['연락처', user.phone],
                                        ['앱 버전', user.appVersion],
                                        ['마지막 확인', user.lastCheck],
                                    ].map(([label, value]) => (
                                        <div key={label} className="rounded-xl bg-slate-50 p-3">
                                            <dt className="text-xs text-slate-500">{label}</dt>
                                            <dd className="mt-1 font-medium text-slate-900">{value}</dd>
                                        </div>
                                    ))}
                                </dl>
                                <div className="mt-4">
                                    <LicenseStatusForm userId={user.id} currentStatus={user.status} disabled={!isLive} />
                                </div>
                            </div>
                        ))}
                    </div>

                    <DataTable className="hidden md:block">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    {['상태', '이메일', '회사명', '담당자', '연락처', '국가', '업종', '앱 버전', '마지막 확인', '약관', '작업'].map((heading) => (
                                        <th key={heading} className="px-4 py-4 text-left text-sm font-semibold text-slate-900">
                                            {heading}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {data.licenseUsers.map((user) => (
                                    <tr key={user.id}>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <StatusBadge tone={statusTone[user.status] ?? 'pending'}>{statusLabel[user.status] ?? user.status}</StatusBadge>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-950">{user.email}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">{user.company}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.contact}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.phone}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.country}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.industry}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.appVersion}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.lastCheck}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.terms}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                            <LicenseStatusForm userId={user.id} currentStatus={user.status} disabled={!isLive} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </DataTable>
                </SectionCard>

                <SectionCard id="updates" title="현재 업데이트 정책" description="PWA 업데이트 안내와 최소 지원 버전을 관리합니다.">
                    <dl className="space-y-3 text-sm">
                        {[
                            ['최신 버전', data.updatePolicy.latestVersion],
                            ['최소 지원 버전', data.updatePolicy.minimumSupportedVersion],
                            ['업데이트 정책', updatePolicyLabel(data.updatePolicy.updatePolicy)],
                            ['적용 시작일', data.updatePolicy.effectiveFrom],
                            ['대상 그룹', data.updatePolicy.targetAudience],
                        ].map(([label, value]) => (
                            <div key={label} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                                <dt className="text-slate-500">{label}</dt>
                                <dd className="font-semibold text-slate-950">{value}</dd>
                            </div>
                        ))}
                    </dl>
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                        강제 업데이트 정책을 게시하더라도 사용자가 먼저 .cbam 백업 안내를 확인할 수 있어야 합니다.
                    </div>
                    <form action={createUpdateManifest} className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>최신 버전</span>
                                <input
                                    name="latest_version"
                                    defaultValue={data.updatePolicy.latestVersion}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>최소 지원 버전</span>
                                <input
                                    name="minimum_supported_version"
                                    defaultValue={data.updatePolicy.minimumSupportedVersion}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                        </div>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>업데이트 정책</span>
                            <select
                                name="update_policy"
                                defaultValue={data.updatePolicy.updatePolicy}
                                disabled={!isLive}
                                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                            >
                                {ADMIN_UPDATE_POLICIES.map((policy) => (
                                    <option key={policy} value={policy}>
                                        {updatePolicyLabel(policy)}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>공지 제목</span>
                            <input
                                name="notice_title"
                                defaultValue={data.updatePolicy.noticeTitle}
                                disabled={!isLive}
                                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>공지 본문</span>
                            <textarea
                                name="notice_body"
                                defaultValue={data.updatePolicy.noticeBody}
                                disabled={!isLive}
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                        </label>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>릴리스 노트 링크</span>
                                <input
                                    name="release_notes_url"
                                    defaultValue={data.updatePolicy.releaseNotesUrl}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>적용 시작일</span>
                                <input
                                    name="effective_from"
                                    defaultValue={data.updatePolicy.effectiveFrom}
                                    disabled={!isLive}
                                    type="date"
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                        </div>
                        <input type="hidden" name="target_audience" value={data.updatePolicy.targetAudience} />
                        <Button type="submit" variant="secondary" className="w-full" disabled={!isLive}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            새 업데이트 정책 저장
                        </Button>
                    </form>
                </SectionCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SectionCard
                    id="announcements"
                    title="공지"
                    description="새 버전, 템플릿 확인 요청, 약관 변경 같은 운영 안내만 게시합니다."
                    actions={
                        <StatusBadge tone={isLive ? 'success' : 'pending'}>
                            {isLive ? '등록 가능' : 'Neon 연결 후 등록 가능'}
                        </StatusBadge>
                    }
                    className="lg:col-span-2"
                >
                    <form action={createAnnouncement} className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>공지 제목</span>
                            <input
                                name="title"
                                disabled={!isLive}
                                placeholder="예: EU 원본 템플릿 최신본 확인 요청"
                                className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                        </label>
                        <label className="space-y-1 text-sm font-semibold text-slate-700">
                            <span>공지 본문</span>
                            <textarea
                                name="body"
                                disabled={!isLive}
                                rows={3}
                                placeholder="운영 안내, 템플릿 확인 요청, 약관 변경 안내만 입력하세요."
                                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                            />
                        </label>
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>심각도</span>
                                <select
                                    name="severity"
                                    defaultValue="info"
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                >
                                    {ADMIN_ANNOUNCEMENT_SEVERITIES.map((severity) => (
                                        <option key={severity} value={severity}>
                                            {severity === 'critical' ? '긴급' : severity === 'warning' ? '주의' : '안내'}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>대상 그룹</span>
                                <input
                                    name="target_audience"
                                    defaultValue="all"
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>게시 시작일</span>
                                <input
                                    name="starts_at"
                                    type="date"
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>게시 종료일</span>
                                <input
                                    name="ends_at"
                                    type="date"
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                        </div>
                        <Button type="submit" variant="secondary" className="w-full md:w-auto" disabled={!isLive}>
                            공지 등록
                        </Button>
                    </form>

                    <div className="space-y-3">
                        {data.announcements.map((item) => (
                            <div key={item.title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex gap-3">
                                    <Megaphone className="mt-1 h-5 w-5 flex-none text-teal-700" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.body}</p>
                                        <p className="mt-1 text-xs text-slate-500">{item.period} / {item.target}</p>
                                    </div>
                                </div>
                                <StatusBadge tone={item.severity === 'warning' ? 'warning' : item.severity === 'critical' ? 'danger' : 'info'}>
                                    {item.severity === 'warning' ? '주의' : item.severity === 'critical' ? '긴급' : '안내'}
                                </StatusBadge>
                            </div>
                        ))}
                    </div>
                </SectionCard>

                <SectionCard id="terms" title="약관 버전" description="무료 사용 약관과 고지 버전을 관리합니다.">
                    <div className="space-y-3 text-sm">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <FileText className="mb-3 h-5 w-5 text-blue-700" />
                            <div className="font-semibold text-slate-950">{data.termsVersion.version}</div>
                            <p className="mt-1 text-slate-600">{data.termsVersion.title}</p>
                            <dl className="mt-3 space-y-2 text-xs text-slate-500">
                                <div className="flex justify-between gap-3">
                                    <dt>본문 URL</dt>
                                    <dd className="font-medium text-slate-700">{data.termsVersion.bodyUrl}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>적용일</dt>
                                    <dd className="font-medium text-slate-700">{data.termsVersion.effectiveFrom}</dd>
                                </div>
                                <div className="flex justify-between gap-3">
                                    <dt>필수 동의</dt>
                                    <dd className="font-medium text-slate-700">{data.termsVersion.isRequired ? '예' : '아니오'}</dd>
                                </div>
                            </dl>
                        </div>
                        <form action={createTermsVersion} className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>약관 버전</span>
                                <input
                                    name="version"
                                    defaultValue={data.termsVersion.version}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>약관 제목</span>
                                <input
                                    name="title"
                                    defaultValue={data.termsVersion.title}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <label className="space-y-1 text-sm font-semibold text-slate-700">
                                <span>본문 URL</span>
                                <input
                                    name="body_url"
                                    defaultValue={data.termsVersion.bodyUrl}
                                    disabled={!isLive}
                                    className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </label>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>적용일</span>
                                    <input
                                        name="effective_from"
                                        defaultValue={data.termsVersion.effectiveFrom}
                                        disabled={!isLive}
                                        type="date"
                                        className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                    />
                                </label>
                                <label className="space-y-1 text-sm font-semibold text-slate-700">
                                    <span>필수 동의</span>
                                    <select
                                        name="is_required"
                                        defaultValue={data.termsVersion.isRequired ? 'true' : 'false'}
                                        disabled={!isLive}
                                        className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100 disabled:bg-slate-100 disabled:text-slate-400"
                                    >
                                        <option value="true">예</option>
                                        <option value="false">아니오</option>
                                    </select>
                                </label>
                            </div>
                            <Button type="submit" variant="secondary" className="w-full" disabled={!isLive}>
                                새 약관 버전 등록
                            </Button>
                        </form>
                    </div>
                </SectionCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                <SectionCard id="security" title="감사/보안 체크" description="관리자 기능을 확장할 때마다 아래 조건을 먼저 확인합니다.">
                    <ul className="space-y-3 text-sm text-slate-700">
                        {safetyChecks.map((item) => (
                            <li key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-teal-700" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </SectionCard>

                <SectionCard title="Neon 연결 상태" description="실제 운영 데이터 연결 여부와 다음 작업을 확인합니다.">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700">
                        <div className="flex gap-3">
                            <Database className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                            <div>
                                <h3 className="font-semibold text-slate-950">
                                    {isLive ? 'Neon 데이터로 표시 중' : 'DATABASE_URL 미설정 또는 연결 실패'}
                                </h3>
                                <p className="mt-1">
                                    Neon SQL Editor에서 `db/admin/001_init.sql`을 실행하고 Vercel에 `DATABASE_URL`을 설정하면 이 화면은
                                    실제 license_users, update_manifests, announcements, terms_versions 데이터를 표시합니다.
                                    샘플 데이터 상태에서는 라이선스 상태 변경 버튼이 비활성화됩니다.
                                </p>
                            </div>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard title="라이선스/업데이트 서버로 보낼 수 있는 정보" description="운영 데이터 범위를 좁게 유지합니다.">
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    {[
                        { icon: KeyRound, title: '라이선스', body: '이메일, 회사명, 담당자명, 연락처, 국가, 업종, 약관 버전, 라이선스 상태' },
                        { icon: Bell, title: '공지', body: '공지 제목, 본문, 심각도, 대상 그룹, 게시 기간' },
                        { icon: ShieldCheck, title: '업데이트', body: '최신 버전, 최소 지원 버전, 선택/권장/강제 업데이트 정책' },
                    ].map((item) => (
                        <div key={item.title} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <item.icon className="h-5 w-5 text-teal-700" />
                            <h3 className="mt-3 text-sm font-semibold text-slate-950">{item.title}</h3>
                            <p className="mt-2 leading-6 text-slate-600">{item.body}</p>
                        </div>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
