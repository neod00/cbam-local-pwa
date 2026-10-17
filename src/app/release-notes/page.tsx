import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { CheckCircle2, Database, FileSpreadsheet, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const releaseHighlights = [
    '브라우저 로컬 저장 기반의 CBAM 산정 흐름 — 회사 자료는 서버로 보내지 않습니다',
    '활동자료 엑셀 서식(사업장·제품·공정·연료·구매 강재 등 13개 시트)을 채워 올리면 산정 지도 1~6단계가 한 번에 채워집니다',
    '품번 목록을 CN 코드별 제품·공정으로 묶고, 강종 구성이 다른 CN은 「합침」과 「나눔」 중 고를 수 있습니다(2025/2547 제4조 8항)',
    '공용 전력·연료·보일러 열을 공정별로 나누는 도구와 귀속·할당 점검',
    '외주 열처리·코팅의 연료·전기 몫 입력(EU Q&A 4.31: 우리 공정에서 한 것으로 계산)',
    '구매 강재의 공급사 값·검증 여부와 EU 공식 기본값(2026/1740 정정판) 대체',
    '산정 지도·대화 두 가지 입력 방식, 할 일 화면, 제출 화면',
    '산정 보고서·모니터링 계획 초안(Word), EU Communication 엑셀 복사본, 전달 패키지(zip)',
    '.cbam 프로젝트 파일 저장·열기와 백업 내보내기·가져오기',
];

const releaseChecks = [
    '공식 EU 템플릿은 앱에 내장하지 않으며 사용자가 최신 원본을 직접 업로드합니다.',
    'CBAM 입력자료, EU 템플릿, .cbam 백업 파일은 무료 PWA 업데이트 확인 과정에서 서버로 전송하지 않습니다.',
    'Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인해야 합니다.',
    '무료 PWA는 법률 자문, 공식 검증, 회사 내부 승인, 최종 제출 책임을 대체하지 않습니다.',
    '지원 범위는 철강 제품입니다. 한 프로젝트는 한 해, 한 사업장 단위이며 사업장이 여럿이면 사업장마다 프로젝트를 따로 만듭니다.',
    '외주처의 전기(간접배출)는 국내(같은 나라 전력망) 외주처만 받습니다. 해외 외주처의 전기는 검증인과 처리 방식을 따로 정하세요.',
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
                        <Link
                            href="/terms"
                            className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                        >
                            무료 약관 및 책임 고지 보기
                        </Link>
                        <Link
                            href="/announcement"
                            className="ml-0 mt-2 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 sm:ml-2"
                        >
                            베타 배포 안내 보기
                        </Link>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
