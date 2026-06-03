import { ActionItemCard, Button, DataTable, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import {
    Bell,
    CheckCircle2,
    Clock3,
    FileText,
    KeyRound,
    Megaphone,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
    Users,
} from 'lucide-react';

const licenseUsers = [
    {
        status: 'FREE_ACTIVE',
        email: 'manager@example.co.kr',
        company: '대한철강 주식회사',
        contact: '김지연',
        country: 'South Korea',
        industry: 'Iron and steel',
        appVersion: '0.1.0-beta',
        lastCheck: '2026-06-03 09:12',
        terms: '2026.06-beta',
    },
    {
        status: 'RECHECK_REQUIRED',
        email: 'esg-team@example.com',
        company: '한빛소재',
        contact: '박민수',
        country: 'South Korea',
        industry: 'Aluminium',
        appVersion: '0.1.0-beta',
        lastCheck: '2026-05-24 16:40',
        terms: '2026.06-beta',
    },
    {
        status: 'OFFLINE_ALLOWED',
        email: 'cbam@example.net',
        company: '동아케미칼',
        contact: '이서현',
        country: 'South Korea',
        industry: 'Fertiliser',
        appVersion: '0.1.0-beta',
        lastCheck: '2026-05-31 11:05',
        terms: '2026.06-beta',
    },
];

const statusTone: Record<string, 'success' | 'warning' | 'pending' | 'danger'> = {
    FREE_ACTIVE: 'success',
    RECHECK_REQUIRED: 'warning',
    OFFLINE_ALLOWED: 'pending',
    BLOCKED: 'danger',
};

const statusLabel: Record<string, string> = {
    FREE_ACTIVE: '무료 활성',
    RECHECK_REQUIRED: '재확인 필요',
    OFFLINE_ALLOWED: '오프라인 허용',
    BLOCKED: '차단',
};

const announcementItems = [
    {
        title: 'v0.1.0-beta 배포 안내',
        severity: 'info' as const,
        period: '2026-06-03 - 2026-06-30',
        target: '전체 사용자',
    },
    {
        title: 'EU 원본 템플릿 최신본 확인 요청',
        severity: 'warning' as const,
        period: '2026-06-10 - 2026-07-10',
        target: '철강 품목 사용자',
    },
];

const quickActions = [
    {
        title: '재확인 필요 사용자 처리',
        description: '장기간 라이선스 확인이 없는 사용자 9명을 검토하고 안내 메일 발송 대상을 정리합니다.',
        status: '9건',
        tone: 'warning' as const,
    },
    {
        title: '업데이트 정책 확인',
        description: '현재 정책은 권장 업데이트입니다. 강제 업데이트로 바꾸기 전 .cbam 백업 안내 문구를 확인하세요.',
        status: '권장',
        tone: 'pending' as const,
    },
    {
        title: '공지 게시 상태 점검',
        description: '게시 중인 공지 2건의 대상 그룹과 종료일을 확인합니다.',
        status: '2건',
        tone: 'info' as const,
    },
];

const safetyChecks = [
    '관리자 콘솔은 사용자 등록, 무료 라이선스, 공지, 업데이트 정책만 관리합니다.',
    '생산량, 배출량, EU 템플릿, .cbam 백업 파일은 저장하거나 조회하지 않습니다.',
    '강제 업데이트가 필요해도 사용자의 기존 .cbam 백업 경로는 막지 않습니다.',
    '라이선스 확인 실패 또는 오프라인 상태에서는 마지막 확인 결과를 기준으로 계속 사용할 수 있게 합니다.',
];

export default function AdminPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Operator Console"
                title="CBAM Local 관리자 콘솔"
                description="무료 PWA 배포, 라이선스, 공지, 업데이트 정책만 관리하는 운영자용 콘솔입니다. CBAM 산정 데이터 저장소가 아닙니다."
                actions={
                    <Button type="button" variant="secondary" disabled>
                        인증 연동 전
                    </Button>
                }
            />

            <SectionCard className="border-teal-200 bg-teal-50">
                <div className="flex gap-3 text-sm leading-6 text-teal-950">
                    <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                    <div>
                        <h2 className="font-semibold text-teal-950">데이터 경계</h2>
                        <p className="mt-1">
                            관리자 콘솔은 사용자 등록, 무료 라이선스, 공지, 업데이트 정책만 관리합니다. 생산량, 배출량, EU 템플릿,
                            .cbam 백업 파일은 저장하거나 조회하지 않습니다.
                        </p>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="등록 사용자" value="128" helper="배포 관리용 연락처 기준" icon={Users} tone="info" />
                <StatCard label="활성 무료 라이선스" value="112" helper="FREE_ACTIVE" icon={UserCheck} tone="success" />
                <StatCard label="재확인 필요" value="9" helper="장기 미확인 사용자" icon={Clock3} tone="warning" />
                <StatCard label="차단 상태" value="2" helper="약관 위반 또는 악용 대응" icon={ShieldAlert} tone="danger" />
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
                                    열기
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
                    description="관리자는 배포 관리용 사용자 정보와 라이선스 상태만 확인합니다."
                    actions={
                        <Button type="button" disabled>
                            무료 라이선스 발급
                        </Button>
                    }
                >
                    <div className="space-y-3 md:hidden">
                        {licenseUsers.map((user) => (
                            <div key={`${user.email}-mobile`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <StatusBadge tone={statusTone[user.status]}>{statusLabel[user.status]}</StatusBadge>
                                        <h3 className="mt-3 break-words text-base font-semibold text-slate-950">{user.company}</h3>
                                        <p className="mt-1 break-words text-sm text-slate-600">{user.email}</p>
                                    </div>
                                    <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" disabled>
                                        변경
                                    </Button>
                                </div>
                                <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-xs text-slate-500">담당자</dt>
                                        <dd className="mt-1 font-medium text-slate-900">{user.contact}</dd>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-xs text-slate-500">업종</dt>
                                        <dd className="mt-1 font-medium text-slate-900">{user.industry}</dd>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-xs text-slate-500">앱 버전</dt>
                                        <dd className="mt-1 font-medium text-slate-900">{user.appVersion}</dd>
                                    </div>
                                    <div className="rounded-xl bg-slate-50 p-3">
                                        <dt className="text-xs text-slate-500">마지막 확인</dt>
                                        <dd className="mt-1 font-medium text-slate-900">{user.lastCheck}</dd>
                                    </div>
                                </dl>
                            </div>
                        ))}
                    </div>

                    <DataTable className="hidden md:block">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">상태</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">이메일</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">회사명</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">담당자</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">국가</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">업종</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">앱 버전</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">마지막 확인</th>
                                    <th className="px-4 py-4 text-left text-sm font-semibold text-slate-900">약관</th>
                                    <th className="px-4 py-4 text-right text-sm font-semibold text-slate-900">작업</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 bg-white">
                                {licenseUsers.map((user) => (
                                    <tr key={user.email}>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm">
                                            <StatusBadge tone={statusTone[user.status]}>{statusLabel[user.status]}</StatusBadge>
                                        </td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm font-medium text-slate-950">{user.email}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-700">{user.company}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.contact}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.country}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.industry}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.appVersion}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.lastCheck}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-600">{user.terms}</td>
                                        <td className="whitespace-nowrap px-4 py-4 text-right text-sm">
                                            <div className="flex justify-end gap-2">
                                                <Button type="button" variant="secondary" className="min-h-9 px-3 py-1.5" disabled>
                                                    상태 변경
                                                </Button>
                                                <Button type="button" variant="danger" className="min-h-9 px-3 py-1.5" disabled>
                                                    차단
                                                </Button>
                                            </div>
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
                            ['최신 버전', '0.1.0-beta'],
                            ['최소 지원 버전', '0.1.0-beta'],
                            ['업데이트 정책', '권장 업데이트'],
                            ['적용 시작일', '2026-06-03'],
                            ['대상 그룹', '전체 사용자'],
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
                    <Button type="button" variant="secondary" className="mt-4 w-full" disabled>
                        <RefreshCw className="mr-2 h-4 w-4" />
                        업데이트 정책 수정
                    </Button>
                </SectionCard>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <SectionCard
                    id="announcements"
                    title="공지"
                    description="공지에는 앱 버전, 템플릿 확인 요청, 약관 변경 같은 운영 안내만 게시합니다."
                    actions={
                        <Button type="button" variant="secondary" disabled>
                            공지 등록
                        </Button>
                    }
                    className="lg:col-span-2"
                >
                    <div className="space-y-3">
                        {announcementItems.map((item) => (
                            <div key={item.title} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:flex-row md:items-center md:justify-between">
                                <div className="flex gap-3">
                                    <Megaphone className="mt-1 h-5 w-5 flex-none text-teal-700" />
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-950">{item.title}</h3>
                                        <p className="mt-1 text-sm text-slate-600">{item.period} / {item.target}</p>
                                    </div>
                                </div>
                                <StatusBadge tone={item.severity === 'warning' ? 'warning' : 'info'}>
                                    {item.severity === 'warning' ? '주의' : '안내'}
                                </StatusBadge>
                            </div>
                        ))}
                    </div>
                </SectionCard>

                <SectionCard id="terms" title="약관 버전" description="무료 사용 약관과 고지 버전을 관리합니다.">
                    <div className="space-y-3 text-sm">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                            <FileText className="mb-3 h-5 w-5 text-blue-700" />
                            <div className="font-semibold text-slate-950">2026.06-beta</div>
                            <p className="mt-1 text-slate-600">현재 무료 베타 약관</p>
                        </div>
                        <Button type="button" variant="secondary" className="w-full" disabled>
                            새 약관 버전 등록
                        </Button>
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

                <SectionCard title="다음 구현 단계" description="실제 운영 전 인증과 API 연결이 필요합니다. 화면 구조는 운영 콘솔 기준으로 유지합니다.">
                    <ol className="space-y-3 text-sm text-slate-700">
                        {[
                            '관리자 인증: Magic link 또는 Google OAuth 연결',
                            'license-api: 등록, 상태 확인, 업데이트 manifest, 공지 API 구현',
                            '관리자 DB: license_users, update_manifests, announcements, terms_versions 생성',
                            'PWA 연동: NEXT_PUBLIC_LICENSE_API_URL이 있을 때만 원격 확인 활성화',
                        ].map((item, index) => (
                            <li key={item} className="flex gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                                <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-800">
                                    {index + 1}
                                </span>
                                <span>{item}</span>
                            </li>
                        ))}
                    </ol>
                </SectionCard>
            </div>

            <SectionCard title="라이선스/업데이트 서버에 보낼 수 있는 정보" description="운영 데이터 범위를 좁게 유지합니다.">
                <div className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                    {[
                        { icon: KeyRound, title: '라이선스', body: '이메일, 회사명, 담당자명, 국가, 업종, 약관 버전, 라이선스 상태' },
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
