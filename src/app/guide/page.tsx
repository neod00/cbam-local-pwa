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

            <SectionCard
                title="초보자 시작 기준"
                description="이 앱은 고로·전기로·제강까지 직접 운영하는 대형 제철소보다, 강재·코일·선재·후판 등을 사서 강선, 용접재료, 강관, STS 평판, 파스너로 가공하는 중소·중견 철강사를 우선 대상으로 합니다."
            >
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
                    <div className="rounded-2xl border border-teal-100 bg-teal-50 p-4">
                        <StatusBadge tone="info">1단계</StatusBadge>
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">제품군과 CN부터 고르기</h2>
                        <p className="mt-2 text-xs leading-5 text-slate-600">제품명만 입력하기보다 제품군과 세부제품을 먼저 선택하면 앱이 CN 후보와 대상/비대상 주의사항을 좁혀줍니다.</p>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                        <StatusBadge tone="pending">2단계</StatusBadge>
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">대표 공정 하나로 시작하기</h2>
                        <p className="mt-2 text-xs leading-5 text-slate-600">처음부터 모든 SKU를 나누지 말고 대표 제품과 대표 공정으로 시작한 뒤, 필요할 때 복제해서 치수·강종만 바꾸세요.</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                        <StatusBadge tone="warning">범위 확인</StatusBadge>
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">제강 일관공정은 간단 모드 밖</h2>
                        <p className="mt-2 text-xs leading-5 text-slate-600">용선·제강·전기로·고로 등 다공정 물질수지가 큰 회사는 이 앱의 초보자 흐름보다 전문 산정 검토가 먼저 필요합니다.</p>
                    </div>
                </div>
            </SectionCard>

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

            <SectionCard title="배출량 산정 5단계" description="PDF 산정방법의 큰 흐름은 CN 확인, 경계 설정, 활동자료 수집, 배분, 제품별 배출량 계산입니다. 앱 메뉴도 이 순서로 따라가면 됩니다.">
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-5">
                    {[
                        ['1', 'CN 코드 확인', '품목 관리에서 제품군과 CN 8자리를 확인합니다.', '/products'],
                        ['2', '산정경계 설정', '생산공정에서 포함·제외 공정과 생산경로를 정리합니다.', '/processes'],
                        ['3', '활동자료 수집', '배출원과 전구물질 화면에서 연료, 원료, 전력, 공급사 자료를 입력합니다.', '/source-streams'],
                        ['4', '제품별 배분', '한 공정에서 여러 제품이 나오면 제품 생산라인 배분 합계를 맞춥니다.', '/processes'],
                        ['5', 'SEE 확인·전달', '산정 결과를 확인하고 Export 패키지와 백업을 만듭니다.', '/results'],
                    ].map(([step, title, description, href]) => (
                        <Link key={step} href={href} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 transition hover:border-teal-200 hover:bg-teal-50">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-sm font-semibold text-teal-800 ring-1 ring-teal-100">{step}</div>
                            <h2 className="mt-3 text-sm font-semibold text-slate-950">{title}</h2>
                            <p className="mt-2 text-xs leading-5 text-slate-600">{description}</p>
                        </Link>
                    ))}
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
