import { auth } from '@/auth';
import { AiStaffCopyButton } from '@/components/admin/AiStaffCopyButton';
import { ActionItemCard, PageHeader, SectionCard, StatCard, StatusBadge } from '@/components/ui';
import { AI_STAFF_DATA_BOUNDARY, aiStaffAgents, aiStaffWorkflows, type AiStaffAgent } from '@/lib/ai-staff/agent-definitions';
import { isAllowedAdminEmail } from '@/lib/admin-auth';
import { Bot, BrainCircuit, ClipboardCheck, LockKeyhole, UserCheck } from 'lucide-react';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

const executionModeLabel = {
    manual: '수동',
    semi_auto_ready: '반자동 준비',
    auto_ready: '자동 준비',
} as const;

const teamLabel = {
    operations: '운영',
    regulation: '규정',
    product: '제품',
    customer: '고객',
    growth: '성장',
} as const;

function createOutputTemplate(agent: AiStaffAgent) {
    return [
        `# ${agent.name} 실행 결과`,
        '',
        `- 실행일: ${new Date().toISOString().slice(0, 10)}`,
        `- 실행 방식: ${executionModeLabel[agent.executionMode]}`,
        `- 담당 역할: ${agent.koreanName}`,
        '',
        '## 1. 입력 요약',
        '- ',
        '',
        '## 2. 핵심 결과',
        '- ',
        '',
        '## 3. 근거/참고',
        '- ',
        '',
        '## 4. 리스크와 확인 필요',
        '- ',
        '',
        '## 5. 대표 승인 필요',
        '- ',
        '',
        '## 6. 다음 행동',
        '- ',
        '',
        '## 데이터 경계',
        AI_STAFF_DATA_BOUNDARY.join('\n'),
    ].join('\n');
}

function createManualRunBrief(agent: AiStaffAgent) {
    return [
        `직원: ${agent.name}`,
        `역할: ${agent.role}`,
        `사용 시점: ${agent.whenToUse.join(' / ')}`,
        `입력: ${agent.inputs.join(', ')}`,
        `출력: ${agent.outputFormat}`,
        '',
        '금지사항:',
        ...agent.forbiddenData.map((item) => `- ${item}`),
        '',
        '승인 규칙:',
        ...agent.approvalRules.map((item) => `- ${item}`),
    ].join('\n');
}

export default async function AiStaffPage() {
    const session = await auth();
    if (!isAllowedAdminEmail(session?.user?.email)) {
        redirect('/admin/login');
    }

    const automationReadyCount = aiStaffAgents.filter((agent) => agent.automationReady).length;
    const manualCount = aiStaffAgents.filter((agent) => agent.executionMode === 'manual').length;

    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="AI Operating System"
                title="AI 직원 운영 콘솔"
                description="배포 전 단계에서는 AI 직원을 수동으로 호출합니다. 자동 실행 API는 만들지 않았지만, 각 직원의 역할·입력·출력·승인 규칙을 구조화해 나중에 자동화로 전환할 수 있게 준비합니다."
                actions={<StatusBadge tone="pending">현재 수동 운영</StatusBadge>}
            />

            <SectionCard className="border-teal-200 bg-teal-50">
                <div className="flex gap-3 text-sm leading-6 text-teal-950">
                    <LockKeyhole className="mt-0.5 h-5 w-5 flex-none text-teal-700" />
                    <div>
                        <h2 className="font-semibold text-teal-950">운영 원칙</h2>
                        <ul className="mt-2 space-y-1">
                            {AI_STAFF_DATA_BOUNDARY.map((item) => (
                                <li key={item}>- {item}</li>
                            ))}
                        </ul>
                    </div>
                </div>
            </SectionCard>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard label="AI 직원" value={`${aiStaffAgents.length}명`} helper="대표 아래 수동 운영 조직" icon={Bot} tone="info" />
                <StatCard label="현재 실행 방식" value={`${manualCount}명 수동`} helper="API key 없이 사용 가능" icon={UserCheck} tone="success" />
                <StatCard label="자동화 준비" value={`${automationReadyCount}명`} helper="나중에 서버 API 연결 가능" icon={BrainCircuit} tone="pending" />
                <StatCard label="대표 승인" value="필수" helper="고객 발송·배포·계약 전 승인" icon={ClipboardCheck} tone="warning" />
            </div>

            <SectionCard title="실제 사용 흐름" description="지금은 관리자 페이지에서 프롬프트를 복사해 ChatGPT, Deep Research, Codex에 직접 실행하는 방식입니다.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {[
                        {
                            title: '1. 직원 선택',
                            description: '업무 성격에 맞는 AI 직원을 고르고 프롬프트를 복사합니다.',
                            status: '수동',
                        },
                        {
                            title: '2. 외부 AI에서 실행',
                            description: 'ChatGPT, Deep Research, Codex 등에 붙여넣고 결과를 받습니다.',
                            status: 'API 불필요',
                        },
                        {
                            title: '3. 대표 승인',
                            description: '고객 회신, 앱 변경, 공지, 배포는 대표가 승인한 뒤 진행합니다.',
                            status: '승인',
                        },
                    ].map((item) => (
                        <ActionItemCard
                            key={item.title}
                            title={item.title}
                            description={item.description}
                            badge={<StatusBadge tone="pending">{item.status}</StatusBadge>}
                        />
                    ))}
                </div>
            </SectionCard>

            <SectionCard title="AI 직원 9명" description="각 직원은 지금은 수동 실행이 기본입니다. 카드의 프롬프트와 출력 양식을 복사해서 필요한 순간에 호출하세요.">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    {aiStaffAgents.map((agent) => {
                        const Icon = agent.icon;

                        return (
                            <article key={agent.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100">
                                                <Icon className="h-5 w-5" />
                                            </span>
                                            <div>
                                                <h2 className="text-base font-semibold text-slate-950">{agent.name}</h2>
                                                <p className="text-xs font-medium text-slate-500">{agent.koreanName}</p>
                                            </div>
                                        </div>
                                        <p className="mt-3 text-sm leading-6 text-slate-600">{agent.title}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2 sm:justify-end">
                                        <StatusBadge tone="neutral">{teamLabel[agent.team]}</StatusBadge>
                                        <StatusBadge tone="pending">{executionModeLabel[agent.executionMode]}</StatusBadge>
                                        <StatusBadge tone={agent.automationReady ? 'success' : 'warning'}>
                                            {agent.automationReady ? '자동화 대비' : '수동 중심'}
                                        </StatusBadge>
                                    </div>
                                </div>

                                <dl className="mt-4 grid grid-cols-1 gap-3 text-sm md:grid-cols-2">
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <dt className="text-xs font-semibold text-slate-500">추천 실행 주기</dt>
                                        <dd className="mt-1 font-semibold text-slate-950">{agent.recommendedCadence}</dd>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                        <dt className="text-xs font-semibold text-slate-500">출력 형식</dt>
                                        <dd className="mt-1 text-slate-700">{agent.outputFormat}</dd>
                                    </div>
                                </dl>

                                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-950">언제 쓰나요?</h3>
                                        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                                            {agent.whenToUse.map((item) => (
                                                <li key={item}>- {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <div>
                                        <h3 className="text-sm font-semibold text-slate-950">대표 승인 규칙</h3>
                                        <ul className="mt-2 space-y-1 text-sm leading-6 text-slate-600">
                                            {agent.approvalRules.map((item) => (
                                                <li key={item}>- {item}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>

                                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm leading-6 text-amber-900">
                                    <p className="font-semibold">자동화 전제</p>
                                    <p className="mt-1">
                                        자동 실행은 아직 비활성입니다. 나중에 사용자가 늘어나면 서버 환경변수 OPENAI_API_KEY와 관리자 승인 큐를 연결해 단계적으로 켭니다.
                                    </p>
                                </div>

                                <div className="mt-4 flex flex-wrap gap-2">
                                    <AiStaffCopyButton label="프롬프트 복사" text={agent.prompt} />
                                    <AiStaffCopyButton label="출력 양식 복사" text={createOutputTemplate(agent)} />
                                    <AiStaffCopyButton label="실행 브리프 복사" text={createManualRunBrief(agent)} />
                                </div>
                            </article>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard title="운영 워크플로우" description="나중에 자동화하더라도 이 순서는 유지합니다. AI는 초안을 만들고 대표가 승인합니다.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    {aiStaffWorkflows.map((workflow) => (
                        <div key={workflow.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <h2 className="text-sm font-semibold text-slate-950">{workflow.title}</h2>
                            <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-600">
                                {workflow.steps.map((step, index) => (
                                    <li key={step} className="flex gap-2">
                                        <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-xs font-semibold text-teal-700 ring-1 ring-slate-200">
                                            {index + 1}
                                        </span>
                                        <span>{step}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
