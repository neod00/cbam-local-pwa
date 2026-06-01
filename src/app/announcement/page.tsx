import { PageHeader, SectionCard, StatusBadge } from '@/components/ui';
import { AlertTriangle, CheckCircle2, Database, FileSpreadsheet, Mail, ShieldCheck } from 'lucide-react';
import Link from 'next/link';

const scopeItems = [
    '사업장과 보고기간 정리',
    'CBAM 대상 품목 및 CN 코드 관리',
    '생산공정과 제품 생산라인 배분 검토',
    '직접배출량, 간접배출량, 전구물질 SEE 검토',
    'SEFA 및 CBAM 인증서 비용 시나리오 검토',
    '최신 EU 원본 템플릿 기반 제출용 Excel 복사본 생성 준비',
    '.cbam 프로젝트 백업 내보내기와 가져오기',
];

const cautions = [
    '실제 회사자료를 공개 이슈, 이메일, 메신저에 첨부하지 마세요.',
    '.cbam 백업 파일은 회사 보안정책에 맞게 보관하세요.',
    '최신 EU 원본 템플릿과 기준자료는 사용자가 직접 확인해 업로드하세요.',
    'Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인하세요.',
    '앱의 산정값과 공식 Excel 결과가 다르면 제출 전 원인을 검토하세요.',
    '무료 PWA는 공식 검증과 최종 제출 책임을 대체하지 않습니다.',
];

export default function AnnouncementPage() {
    return (
        <div className="space-y-6">
            <PageHeader
                eyebrow="베타 배포 안내"
                title="CBAM Local PWA 무료 베타"
                description="CBAM 대상 기업 담당자가 로컬 브라우저에서 산정 자료를 정리하고 EU 제출용 Excel 복사본 생성을 준비할 수 있도록 만든 업무 보조 도구입니다."
                actions={<StatusBadge tone="warning">운영 검토 중</StatusBadge>}
            />

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard className="lg:col-span-2">
                    <div className="flex gap-3">
                        <ShieldCheck className="mt-1 h-5 w-5 flex-none text-teal-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">배포 요약</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                CBAM Local은 민감한 회사 자료가 외부 서버로 전송되는 것을 최소화하기 위해 로컬 우선 구조로 설계했습니다.
                                입력 데이터는 기본적으로 브라우저 로컬 저장소에 보관되며, 운영 서버로 업로드하지 않는 구조를 원칙으로 합니다.
                            </p>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link
                                    href="/terms"
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl bg-teal-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-teal-600"
                                >
                                    약관/고지 보기
                                </Link>
                                <Link
                                    href="/release-notes"
                                    className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                                >
                                    릴리스 노트
                                </Link>
                            </div>
                        </div>
                    </div>
                </SectionCard>

                <SectionCard>
                    <div className="flex gap-3">
                        <Mail className="mt-1 h-5 w-5 flex-none text-blue-700" />
                        <div>
                            <h2 className="text-lg font-semibold text-slate-950">문의</h2>
                            <p className="mt-2 text-sm leading-6 text-slate-600">
                                기능 문의, 오류 제보, 보안 제보는 아래 이메일로 보내주세요. 실제 회사 자료나 .cbam 백업 파일은 첨부하지 않는 것을 원칙으로 합니다.
                            </p>
                            <p className="mt-3 break-words text-sm font-semibold text-slate-950">openbrain.main@gmail.com</p>
                        </div>
                    </div>
                </SectionCard>
            </section>

            <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <SectionCard>
                    <Database className="h-5 w-5 text-emerald-700" />
                    <h2 className="mt-3 text-base font-semibold text-slate-950">데이터 보관</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        생산량, 연료 사용량, 전력 사용량, 전구물질 자료, 산정 결과는 브라우저 로컬 저장소에 보관됩니다.
                    </p>
                </SectionCard>

                <SectionCard>
                    <FileSpreadsheet className="h-5 w-5 text-blue-700" />
                    <h2 className="mt-3 text-base font-semibold text-slate-950">EU 원본 템플릿</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        앱은 EU 원본 Excel 템플릿을 내장하지 않습니다. 사용자가 보유한 최신 공식 파일을 직접 업로드해야 합니다.
                    </p>
                </SectionCard>

                <SectionCard>
                    <AlertTriangle className="h-5 w-5 text-amber-700" />
                    <h2 className="mt-3 text-base font-semibold text-slate-950">공식 제출 전 확인</h2>
                    <p className="mt-2 text-sm leading-6 text-slate-600">
                        Export 후 Microsoft Excel에서 공식 수식 재계산 결과를 확인하고, 필요 시 전문기관 검증을 별도로 진행해야 합니다.
                    </p>
                </SectionCard>
            </section>

            <SectionCard title="무료 베타에서 지원하는 업무">
                <ul className="grid grid-cols-1 gap-2 text-sm text-slate-700 md:grid-cols-2">
                    {scopeItems.map((item) => (
                        <li key={item} className="flex gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                            <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-teal-700" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>

            <SectionCard title="사용 전 주의사항">
                <ul className="space-y-2 text-sm leading-6 text-slate-700">
                    {cautions.map((item) => (
                        <li key={item} className="flex gap-2">
                            <AlertTriangle className="mt-1 h-4 w-4 flex-none text-amber-700" />
                            <span>{item}</span>
                        </li>
                    ))}
                </ul>
            </SectionCard>
        </div>
    );
}
