import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { AlertTriangle, Database, FileSpreadsheet, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const termsSections = [
    {
        title: '1. 무료 사용 범위',
        items: [
            'CBAM Local PWA 무료 베타는 기업 담당자가 브라우저 로컬 환경에서 CBAM 산정 자료를 정리하고 수입자 전달용 EU Communication Template 복사본을 준비하기 위한 업무 보조 도구입니다.',
            '무료 버전은 소스코드 공개, 재배포 허가, 상업적 전용 허가, 계산 로직 권리 이전을 의미하지 않습니다.',
            '기능, 화면, 배포 방식은 사전 공지 후 변경, 중단, 분리될 수 있습니다.',
        ],
    },
    {
        title: '2. 로컬 데이터 처리',
        items: [
            '사업장, 품목, 생산공정, 배출원 자료, 전구물질, 산정 결과는 기본적으로 사용자의 브라우저 로컬 저장소에 저장됩니다.',
            '사용자가 선택한 EU 원본 템플릿과 .cbam 백업 파일은 브라우저 안에서 처리하며, 무료 PWA의 기본 흐름에서는 운영 서버로 업로드하지 않습니다.',
            '브라우저 데이터 삭제, 기기 교체, 보안 프로그램 정리, 프로필 초기화가 발생하면 로컬 데이터가 사라질 수 있으므로 중요한 변경 후에는 .cbam 백업을 별도로 보관해야 합니다.',
        ],
    },
    {
        title: '3. EU 템플릿과 공식 자료',
        items: [
            'CBAM Local은 EU 원본 Communication template을 앱에 내장하지 않습니다.',
            '사용자는 EU 또는 공식 출처에서 받은 최신 원본 템플릿을 직접 선택해야 합니다.',
            '앱은 원본 파일 구조를 유지한 복사본에 산정 준비 데이터를 반영하는 것을 목표로 하며, Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 반드시 확인해야 합니다.',
        ],
    },
    {
        title: '4. 책임 제한',
        items: [
            'CBAM Local은 법률 자문, 관세 또는 세무 자문, 공식 검증기관 검증, 회사 내부 승인, 최종 EU 신고 책임을 대체하지 않습니다.',
            '산정 결과, Export 파일, 제출 자료의 정확성과 제출 책임은 사용자에게 있습니다.',
            '전달 또는 신고 전 최신 EU 규정, 공식 양식, 회사 내부 검토, 필요 시 전문기관 검증을 별도로 확인해야 합니다.',
        ],
    },
    {
        title: '5. 업데이트와 접근 제한',
        items: [
            '무료 PWA는 오류 수정, 보안 안내, 공식 템플릿 대응을 위해 선택, 권장, 필수 업데이트 안내를 표시할 수 있습니다.',
            '업데이트 확인은 버전과 배포 상태 확인을 위한 기능이며 CBAM 계산 데이터, EU 템플릿, .cbam 백업 파일을 수집하기 위한 기능이 아닙니다.',
            '약관 위반, 무단 재배포, 보안 위협, 악의적 자동화 사용이 확인되는 경우 무료 라이선스 또는 접근이 제한될 수 있습니다.',
        ],
    },
];

export default function TermsPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="무료 베타 고지"
                title="CBAM Local 무료 사용 약관 및 책임 고지"
                description="이 페이지는 v0.1.0-beta 배포 전 검토용 약관/고지 초안입니다. 최종 공개 전 법무 또는 운영 책임자 검토가 필요합니다."
                actions={<StatusBadge tone="warning">검토 필요</StatusBadge>}
            />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard className="lg:col-span-2">
                    <div className="flex gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 flex-none text-teal-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">핵심 원칙</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                CBAM Local은 민감한 회사 CBAM 자료를 SaaS 서버로 모으지 않는 로컬 우선 PWA입니다.
                                다만 PWA 특성상 브라우저로 전달되는 JavaScript 번들은 사용자가 확인할 수 있으므로,
                                고급 보호가 필요한 기능은 향후 Docker/on-premise 또는 별도 서버형 버전으로 분리할 수 있습니다.
                            </p>
                            <Link
                                href="/privacy"
                                className="mt-4 inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                            >
                                개인정보/데이터 처리 안내
                            </Link>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard>
                    <div className="flex gap-3">
                        <Mail className="mt-1 h-5 w-5 flex-none text-blue-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">문의</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                기능 문의, 오류 제보, 보안 제보는 아래 이메일로 보내주세요. 실제 회사 자료, EU Communication Template 작성본,
                                .cbam 백업 파일은 첨부하지 않는 것을 원칙으로 합니다.
                            </p>
                            <p className="mt-3 break-words text-sm font-semibold text-slate-950">openbrain.main@gmail.com</p>
                        </div>
                    </div>
                </SectionCard>
            </section>

            <SectionCard>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
                        <Database className="h-5 w-5 text-emerald-700" />
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">로컬 저장</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-700">입력 자료는 기본적으로 브라우저 IndexedDB에 저장됩니다.</p>
                    </div>
                    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
                        <FileSpreadsheet className="h-5 w-5 text-blue-700" />
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">Excel 재검토</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-700">Export 후 공식 Excel 수식 결과를 직접 확인해야 합니다.</p>
                    </div>
                    <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">
                        <AlertTriangle className="h-5 w-5 text-amber-700" />
                        <h2 className="mt-3 text-sm font-semibold text-slate-950">공식 검증 대체 아님</h2>
                        <p className="mt-2 text-sm leading-6 text-slate-700">법률, 세무, 검증, 최종 제출 책임은 사용자에게 있습니다.</p>
                    </div>
                </div>
            </SectionCard>

            {termsSections.map((section) => (
                <SectionCard key={section.title} title={section.title}>
                    <ul className="space-y-2 text-sm leading-6 text-slate-700">
                        {section.items.map((item) => (
                            <li key={item} className="flex gap-2">
                                <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-teal-700" />
                                <span>{item}</span>
                            </li>
                        ))}
                    </ul>
                </SectionCard>
            ))}

            <SectionCard>
                <div className="flex gap-3 text-sm leading-6 text-amber-900">
                    <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-amber-700" />
                    <div>
                        <h2 className="font-semibold text-slate-950">배포 전 확정 필요</h2>
                        <p className="mt-1">
                            이 페이지는 현재 운영 검토용 문구입니다. 서비스명, 운영자명 또는 회사명, 개인정보 처리 안내 필요 여부,
                            최종 책임 제한 문구, 약관 적용 법령과 관할은 공개 전 확정해야 합니다.
                        </p>
                    </div>
                </div>
            </SectionCard>
        </div>
    );
}
