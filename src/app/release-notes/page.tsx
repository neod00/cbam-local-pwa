import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { CheckCircle2, Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';

const releaseHighlights = [
    '브라우저 로컬 저장 기반의 CBAM 산정 흐름',
    '사업장, 보고기간, 품목, 생산공정, 배출원 자료, 구매 전구물질 입력',
    '제품 생산라인 배분과 제품별 SEE 검토',
    'SEFA 및 CBAM 인증서 시나리오 검토',
    '사용자 업로드 EU 원본 템플릿 기반 Export 복사본 생성',
    '.cbam 백업 내보내기와 가져오기',
];

const releaseChecks = [
    '공식 EU 템플릿은 앱에 내장하지 않으며 사용자가 최신 원본을 직접 업로드합니다.',
    'CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 무료 PWA 업데이트 확인 과정에서 서버로 전송하지 않습니다.',
    'Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인해야 합니다.',
    '무료 PWA는 법률 자문, 공식 검증, 회사 내부 승인, 최종 제출 책임을 대체하지 않습니다.',
];

export default function ReleaseNotesPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="릴리스 노트"
                title="CBAM Local v0.1.0"
                description="무료 로컬 우선 PWA MVP의 현재 기능과 사용 전 확인해야 할 제한 사항입니다."
            />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard className="lg:col-span-2">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">MVP 주요 기능</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-600">
                                v0.1.0은 CBAM 대상 기업 담당자가 산정 입력, 검토, Export 준비, 백업까지 로컬에서 따라갈 수 있도록 구성한 첫 무료 PWA 버전입니다.
                            </p>
                        </div>
                        <StatusBadge tone="success">배포 준비 중</StatusBadge>
                    </div>
                    <ul className="mt-4 grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
                        {releaseHighlights.map((item) => (
                            <li key={item} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-teal-700" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </SectionCard>

                <SectionCard>
                    <h2 className="text-lg font-semibold text-slate-950">업데이트 정책</h2>
                    <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <ShieldCheck className="mt-0.5 h-5 w-5 flex-none text-emerald-700" />
                            <p>현재 버전은 강제 업데이트 없이 계속 사용할 수 있습니다.</p>
                        </div>
                        <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <Database className="mt-0.5 h-5 w-5 flex-none text-blue-700" />
                            <p>업데이트 확인은 버전 정보만 확인하며 CBAM 계산 데이터는 수집하지 않습니다.</p>
                        </div>
                    </div>
                </SectionCard>
            </section>

            <SectionCard>
                <div className="flex gap-3">
                    <FileSpreadsheet className="mt-1 h-5 w-5 flex-none text-teal-700" />
                    <div>
                        <h2 className="text-lg font-semibold text-slate-950">사용 전 확인 사항</h2>
                        <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                            {releaseChecks.map((item) => (
                                <li key={item} className="flex gap-2">
                                    <CheckCircle2 className="mt-1 h-4 w-4 flex-none text-teal-700" />
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
