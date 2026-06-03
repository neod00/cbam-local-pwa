import { WorkflowGuideCard } from '@/components/WorkflowGuideCard';
import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { workflowGuideSteps } from '@/lib/workflow-guide';
import { ArrowRight, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

export default function GuidePage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="Guided Workflow"
                title="시작 가이드"
                description="CBAM Local을 처음 여는 기업 담당자가 사업장 등록부터 EU Communication Template 복사본과 .cbam 백업까지 순서대로 진행할 수 있도록 만든 작업 흐름입니다."
            />

            <SectionCard title="먼저 이것만 하세요" description="처음부터 12단계를 모두 이해할 필요는 없습니다. 아래 3개 묶음만 따라가면 전체 흐름이 자연스럽게 이어집니다.">
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-blue-800 ring-1 ring-blue-100">1</div>
                        <h2 className="mt-4 text-base font-semibold text-slate-950">기본정보 입력</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">사업장, 보고기간, 품목을 먼저 등록합니다.</p>
                        <StatusBadge tone="info">회사와 제품 기준</StatusBadge>
                    </div>
                    <div className="rounded-2xl border border-teal-100 bg-teal-50 p-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-teal-100">2</div>
                        <h2 className="mt-4 text-base font-semibold text-slate-950">배출자료 입력</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">생산공정, 배출원, 전구물질 자료를 연결합니다.</p>
                        <StatusBadge tone="pending">계산 근거</StatusBadge>
                    </div>
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-semibold text-emerald-800 ring-1 ring-emerald-100">3</div>
                        <h2 className="mt-4 text-base font-semibold text-slate-950">검토·전달</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-600">산정 결과를 확인하고 수입자 전달용 파일과 .cbam 백업을 만듭니다.</p>
                        <StatusBadge tone="success">Export와 백업</StatusBadge>
                    </div>
                </div>
            </SectionCard>

            <details className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[var(--shadow-card)]">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-base font-semibold text-slate-950">
                    <span>전체 12단계 상세 보기</span>
                    <span className="text-sm font-semibold text-teal-800 group-open:hidden">펼치기</span>
                    <span className="hidden text-sm font-semibold text-teal-800 group-open:inline">접기</span>
                </summary>
                <div className="mt-5">
                    <WorkflowGuideCard currentRoute="/guide" />
                </div>
            </details>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard title="입력자료 준비" description="사업장, 기간, 품목, 공정, 배출원, 전구물질을 순서대로 채웁니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                        <p>필수 입력과 선택/검토 항목을 구분해 입력하세요. 모르는 항목은 비워두되, 확인 필요 경고가 어떤 화면으로 이어지는지 먼저 확인합니다.</p>
                        <StatusBadge tone="info">입력 근거 우선</StatusBadge>
                    </div>
                </SectionCard>
                <SectionCard title="산정·시나리오 검토" description="CBAM 기준 SEE와 내부 검토용 total SEE를 구분합니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                        <p>Annex II direct-only 처리, 전구물질 포함 여부, SEFA·인증서 비용 지표를 한 번에 확정하지 말고 검토 근거로 사용합니다.</p>
                        <StatusBadge tone="warning">검토용 지표</StatusBadge>
                    </div>
                </SectionCard>
                <SectionCard title="Export와 백업" description="최신 EU 원본 템플릿과 회사 내부 검토 기록을 함께 관리합니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                        <p>복사본 다운로드 후 Microsoft Excel에서 공식 수식 재계산을 확인하고, 같은 시점의 .cbam 백업을 보관합니다.</p>
                        <StatusBadge tone="success">로컬 보관</StatusBadge>
                    </div>
                </SectionCard>
            </section>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                <SectionCard title="Hot Rolled Coil 리허설 기준" description="MVP 테스트는 가상 컨설턴트가 아래 흐름으로 반복 검증합니다. 실제 회사 자료는 사용하지 않습니다.">
                    <div className="space-y-3 text-sm leading-6 text-slate-600">
                        <p>
                            대표 품목은 CN 72083900 Hot Rolled Coil입니다. Rolling and finishing 공정, Natural gas combustion 배출원,
                            Purchased hot rolled coil 전구물질을 연결해 산정 결과, 인증서 비용 시나리오, Export 게이트를 확인합니다.
                        </p>
                        <Link href="/products" className="inline-flex items-center text-sm font-semibold text-teal-800 hover:text-teal-700">
                            품목 관리에서 시작
                            <ArrowRight className="ml-2 h-4 w-4" />
                        </Link>
                    </div>
                </SectionCard>

                <SectionCard title="전달 전 마지막 원칙" description="앱이 만들어 준 값은 최종 신고가 아니라 Communication Template 준비를 돕는 검토 자료입니다.">
                    <div className="space-y-3">
                        <div className="flex gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4 text-sm leading-6 text-indigo-900">
                            <FileSpreadsheet className="mt-0.5 h-5 w-5 flex-none" />
                            <p>EU 원본 템플릿의 공식 수식 셀은 덮어쓰지 않습니다. Export 복사본을 Excel에서 열어 Summary_Products 수식 결과를 확인하세요.</p>
                        </div>
                        <div className="flex gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 text-sm leading-6 text-emerald-900">
                            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none" />
                            <p>입력자료와 백업은 브라우저 로컬과 사용자가 내려받은 파일에 남습니다. 중요한 변경 후에는 .cbam 백업을 별도로 보관하세요.</p>
                        </div>
                    </div>
                </SectionCard>
            </div>

            <SectionCard title="각 단계에서 확인할 것" description="완료 여부는 단순 저장 여부가 아니라 다음 단계로 넘어갈 수 있는 검토 신호를 기준으로 봅니다.">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {workflowGuideSteps.map((step) => (
                        <div key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                                    {step.order}
                                </div>
                                <div className="min-w-0">
                                    <h2 className="break-words text-sm font-semibold text-slate-950">{step.title}</h2>
                                    <p className="mt-1 break-words text-sm leading-6 text-slate-600">{step.purpose}</p>
                                    <dl className="mt-3 space-y-2 text-xs leading-5 text-slate-600">
                                        <div>
                                            <dt className="font-semibold text-slate-800">필요 자료</dt>
                                            <dd>{step.evidence}</dd>
                                        </div>
                                        <div>
                                            <dt className="font-semibold text-slate-800">넘어가도 되는 신호</dt>
                                            <dd>{step.completionSignal}</dd>
                                        </div>
                                    </dl>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </SectionCard>
        </div>
    );
}
