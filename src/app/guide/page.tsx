import { SeeFlowDiagram } from '@/components/SeeFlowDiagram';
import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { ArrowRight, BarChart3, FileSpreadsheet, Package, ShieldCheck, Upload } from 'lucide-react';
import Link from 'next/link';

const quickSteps = [
    {
        title: '품목과 CN 코드',
        description: '먼저 CBAM 대상 품목을 등록하고 CN 8자리만 맞춥니다.',
        href: '/products',
        icon: Package,
        tone: 'info' as const,
        badge: '1',
    },
    {
        title: '고지서/배출량 입력',
        description: '공정 하나를 선택해 전기, 연료, 원료 사용량을 입력합니다.',
        href: '/source-streams',
        icon: Upload,
        tone: 'pending' as const,
        badge: '2',
    },
    {
        title: '검증 후 보고서',
        description: '경고를 해결한 뒤 EU Communication 파일을 만듭니다.',
        href: '/results',
        icon: ShieldCheck,
        tone: 'success' as const,
        badge: '3',
    },
];

export default function GuidePage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Guided Workflow"
                title="시작 가이드"
                description="처음에는 모든 규정과 입력표를 보지 말고, 아래 3단계만 따라가세요."
            />

            <SectionCard
                title="처음에는 이것만 하세요"
                description="가장 중요한 입력 순서만 남겼습니다. 각 카드를 누르면 해당 화면으로 이동합니다."
            >
                <div className="grid gap-3 lg:grid-cols-3">
                    {quickSteps.map((step) => {
                        const Icon = step.icon;

                        return (
                            <Link
                                key={step.title}
                                href={step.href}
                                className="group rounded-2xl border border-slate-200 bg-slate-50 p-5 transition hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white hover:shadow-sm"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-emerald-800 ring-1 ring-slate-200">
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <StatusBadge tone={step.tone}>{step.badge}단계</StatusBadge>
                                </div>
                                <h2 className="mt-4 text-base font-bold text-slate-950">{step.title}</h2>
                                <p className="mt-2 text-sm leading-6 text-slate-600">{step.description}</p>
                                <div className="mt-4 inline-flex items-center text-sm font-bold text-emerald-800">
                                    이동하기
                                    <ArrowRight className="ml-2 h-4 w-4 transition group-hover:translate-x-0.5" />
                                </div>
                            </Link>
                        );
                    })}
                </div>
            </SectionCard>

            <SectionCard
                title="배출량은 이렇게 계산돼요"
                description="제품 1톤당 배출량(SEE)이 만들어지는 3가지 길입니다. 각 상자를 누르면 해당 화면으로 이동합니다."
            >
                <SeeFlowDiagram />
            </SectionCard>

            <section className="grid gap-4 lg:grid-cols-2">
                <SectionCard title="입력 전에 준비할 자료" description="아래 자료가 있으면 대부분의 화면을 바로 채울 수 있습니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                        <div className="flex gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-4 text-blue-950">
                            <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-none" />
                            <p>전기·가스·연료 고지서, 생산량 집계표, 제품명과 CN 코드 후보를 준비합니다.</p>
                        </div>
                        <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-emerald-950">
                            <BarChart3 className="mt-0.5 h-5 w-5 flex-none" />
                            <p>처음에는 대표 품목과 대표 공정 하나만 입력해 흐름을 확인하는 것이 좋습니다.</p>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard title="막히면 어디를 봐야 하나요?" description="오류 메시지보다 먼저 아래 순서로 확인하세요.">
                    <ol className="space-y-3 text-sm leading-6 text-slate-600">
                        <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <span className="font-bold text-slate-950">1. 품목:</span> CN 코드가 8자리인지 확인
                        </li>
                        <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <span className="font-bold text-slate-950">2. 공정:</span> 생산량과 제품이 연결됐는지 확인
                        </li>
                        <li className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <span className="font-bold text-slate-950">3. 배출원:</span> 사용량, 단위, 배출계수 출처 확인
                        </li>
                    </ol>
                </SectionCard>
            </section>

        </div>
    );
}
